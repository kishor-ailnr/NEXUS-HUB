import { Injectable, Inject, Optional } from '@nestjs/common';
import { RerouteMode, WhatIfParams } from '@nexus-ways/shared';
import { CorridorGraph, GraphEdge, INDIAN_CORRIDOR_GRAPHS } from './graph';
import { WeatherProvider, MockWeatherProvider } from '../prediction/providers/weather.provider';
import { TrafficProvider, MockTrafficProvider } from '../prediction/providers/traffic.provider';
import { TollProvider, MockTollProvider } from '../prediction/providers/toll.provider';
import { WEATHER_PROVIDER, TRAFFIC_PROVIDER, TOLL_PROVIDER } from '../tokens';

export interface ReroutePlanInput {
  corridorKey: string;
  startNodeId: string;
  endNodeId: string;
  departureTime: Date;
  deadlineTime: Date;
  mode: RerouteMode;
  driverHoursDrivenToday: number;
  whatIf?: WhatIfParams;
  weatherProvider?: WeatherProvider;
  trafficProvider?: TrafficProvider;
  tollProvider?: TollProvider;
}

export interface TraversalStep {
  edge: GraphEdge;
  arrivalTime: Date;
  departureTime: Date;
  durationMinutes: number;
  tollWaitMinutes: number;
  trafficDelayMinutes: number;
  weatherDelayMinutes: number;
  restBreakMinutes: number;
  tollCostInr: number;
  fuelCostInr: number;
}

export interface RouteOption {
  edges: GraphEdge[];
  steps: TraversalStep[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
  totalTollCostInr: number;
  totalFuelCostInr: number;
  eta: Date;
  riskScore: number; // 0 - 100
  meetingDeadlineProb: number;
}

export interface RerouteRecommendation {
  originalRoute: RouteOption;
  recommendedRoute: RouteOption;
  hasImprovement: boolean;
  mode: RerouteMode;
  timeSavedMinutes: number;
  extraDistanceKm: number;
  fuelCostDeltaInr: number;
  tollCostDeltaInr: number;
  riskScoreDelta: number;
  newEta: string;
  meetingDeadlineProb: number;
  routeWaypoints: [number, number][];
  alternateCorridorName: string;
  reason: string;
  triggerCheckpointName: string;
  triggerTime: string;
}

@Injectable()
export class RerouteEngine {
  private readonly weather: WeatherProvider;
  private readonly traffic: TrafficProvider;
  private readonly toll: TollProvider;

  constructor(
    @Optional() @Inject(WEATHER_PROVIDER) weather?: WeatherProvider,
    @Optional() @Inject(TRAFFIC_PROVIDER) traffic?: TrafficProvider,
    @Optional() @Inject(TOLL_PROVIDER) toll?: TollProvider,
  ) {
    this.weather = weather || new MockWeatherProvider();
    this.traffic = traffic || new MockTrafficProvider();
    this.toll = toll || new MockTollProvider();
  }

  /**
   * Time-dependent route simulation along a sequence of highway edges.
   */
  async evaluateEdgeSequence(
    edges: GraphEdge[],
    startTime: Date,
    initialDriverHours = 0,
    whatIf?: WhatIfParams,
  ): Promise<RouteOption> {
    let currentTime = new Date(startTime.getTime());
    let accumulatedDistance = 0;
    let accumulatedTolls = 0;
    let accumulatedFuel = 0;
    let hoursDrivenContinuously = initialDriverHours;
    const steps: TraversalStep[] = [];
    let cumulativeRisk = 15;

    for (const edge of edges) {
      accumulatedDistance += edge.distanceKm;
      accumulatedTolls += edge.tollCostInr;

      // Fuel cost: ~28 INR per KM for commercial 32ft freight trucks
      const fuelCost = Math.round(edge.distanceKm * 28);
      accumulatedFuel += fuelCost;

      // 1. Weather Impact at this edge's arrival time
      const midPoint = edge.waypoints[Math.floor(edge.waypoints.length / 2)] || [13.0, 80.0];
      const weatherForecast = await this.weather.getWeatherForecast(
        midPoint[0],
        midPoint[1],
        currentTime,
        whatIf?.rain_severity_multiplier || 1.0,
      );

      // Effective driving speed with weather penalty
      const effectiveSpeed = Math.max(
        25,
        edge.baseSpeedKmh * (1 - weatherForecast.speedReductionPct / 100),
      );
      const baseDriveMinutes = Math.round((edge.distanceKm / effectiveSpeed) * 60);

      // Weather delay relative to clear base speed
      const nominalMinutes = Math.round((edge.distanceKm / edge.baseSpeedKmh) * 60);
      const weatherDelayMinutes = Math.max(0, baseDriveMinutes - nominalMinutes);

      // 2. Traffic Congestion
      const trafficStatus = await this.traffic.getTrafficStatus(
        midPoint[0],
        midPoint[1],
        currentTime,
        Boolean(edge.isCityBypass),
      );
      const trafficDelayMinutes = trafficStatus.delayMinutes;

      // 3. Toll Plaza Clearance
      let tollWaitMinutes = 0;
      if (edge.tollPlazaName) {
        const tollStatus = await this.toll.getTollStatus(
          edge.tollPlazaName,
          currentTime,
          whatIf?.toll_strike_hours || 0,
        );
        tollWaitMinutes = tollStatus.expectedWaitMinutes;
      }

      // 4. Driver Mandatory Rest Check (after 4.5 hours continuous driving, 30 min break required)
      let restBreakMinutes = 0;
      hoursDrivenContinuously += (baseDriveMinutes + trafficDelayMinutes) / 60;
      if (hoursDrivenContinuously >= 4.5) {
        restBreakMinutes = 35; // Tea / lunch halt
        hoursDrivenContinuously = 0;
      }

      // 5. What-if breakdown addition
      const breakdownMinutes = (whatIf?.breakdown_hours || 0) * 60;

      const totalEdgeDurationMinutes =
        baseDriveMinutes +
        trafficDelayMinutes +
        tollWaitMinutes +
        restBreakMinutes +
        (steps.length === 0 ? breakdownMinutes : 0);

      const departureTime = new Date(currentTime.getTime() + totalEdgeDurationMinutes * 60000);

      steps.push({
        edge,
        arrivalTime: new Date(currentTime.getTime()),
        departureTime,
        durationMinutes: totalEdgeDurationMinutes,
        tollWaitMinutes,
        trafficDelayMinutes,
        weatherDelayMinutes,
        restBreakMinutes,
        tollCostInr: edge.tollCostInr,
        fuelCostInr: fuelCost,
      });

      // Risk accumulation
      if (weatherForecast.condition !== 'clear') cumulativeRisk += 12;
      if (trafficStatus.congestionLevel === 'heavy' || trafficStatus.congestionLevel === 'gridlock') cumulativeRisk += 15;
      if (edge.hasGhatSection) cumulativeRisk += 18;

      currentTime = departureTime;
    }

    const totalDurationMinutes = Math.round(
      (currentTime.getTime() - startTime.getTime()) / 60000,
    );

    return {
      edges,
      steps,
      totalDistanceKm: accumulatedDistance,
      totalDurationMinutes,
      totalTollCostInr: accumulatedTolls,
      totalFuelCostInr: accumulatedFuel,
      eta: currentTime,
      riskScore: Math.min(95, cumulativeRisk),
      meetingDeadlineProb: 92,
    };
  }

  /**
   * Evaluates all candidate paths on the corridor graph and selects optimal route based on chosen mode.
   */
  async computeOptimalReroute(input: ReroutePlanInput): Promise<RerouteRecommendation> {
    const corridorKey = input.corridorKey.toLowerCase() in INDIAN_CORRIDOR_GRAPHS
      ? input.corridorKey.toLowerCase()
      : 'chennai-bengaluru';

    const graph = INDIAN_CORRIDOR_GRAPHS[corridorKey];

    // Primary route edges (NH 48 primary alignment)
    const primaryEdges = graph.edges.filter((e) => e.id.startsWith('nh48_'));
    const primaryOption = await this.evaluateEdgeSequence(
      primaryEdges,
      input.departureTime,
      input.driverHoursDrivenToday,
      input.whatIf,
    );

    // Alternate candidate 1: Northern Freight Corridor (NH 75 / Chittoor / Kolar)
    const altEdges1 = [
      graph.edges.find((e) => e.id === 'nh48_p1')!,
      graph.edges.find((e) => e.id === 'nh75_alt1')!,
      graph.edges.find((e) => e.id === 'nh75_alt2')!,
      graph.edges.find((e) => e.id === 'nh75_alt3')!,
      graph.edges.find((e) => e.id === 'nh75_alt4')!,
    ].filter(Boolean);

    // Alternate candidate 2: Greenfield Expressway Bypass (via NE 5 direct)
    const altEdges2 = [
      graph.edges.find((e) => e.id === 'nh48_p1')!,
      graph.edges.find((e) => e.id === 'ne5_direct')!,
      graph.edges.find((e) => e.id === 'nh75_alt4')!,
    ].filter(Boolean);

    const option1 = await this.evaluateEdgeSequence(
      altEdges1,
      input.departureTime,
      input.driverHoursDrivenToday,
      input.whatIf,
    );

    const option2 = await this.evaluateEdgeSequence(
      altEdges2,
      input.departureTime,
      input.driverHoursDrivenToday,
      input.whatIf,
    );

    // Rank options based on requested optimization mode
    const candidates = [primaryOption, option1, option2];

    const scored = candidates.map((opt) => {
      let score = 0;
      const totalCost = opt.totalFuelCostInr + opt.totalTollCostInr;
      const hours = opt.totalDurationMinutes / 60;

      switch (input.mode) {
        case 'fastest':
          score = opt.totalDurationMinutes * 1.5 + opt.riskScore * 0.2;
          break;
        case 'cheapest':
          score = totalCost * 0.05 + opt.totalDurationMinutes * 0.2;
          break;
        case 'safest':
          score = opt.riskScore * 2.5 + opt.totalDurationMinutes * 0.5;
          break;
        case 'balanced':
        default:
          score = opt.totalDurationMinutes * 0.7 + totalCost * 0.02 + opt.riskScore * 0.4;
          break;
      }
      return { option: opt, score };
    });

    scored.sort((a, b) => a.score - b.score);
    const chosen = scored[0].option;

    // Build unified waypoints array
    const waypoints: [number, number][] = [];
    for (const edge of chosen.edges) {
      for (const pt of edge.waypoints) {
        waypoints.push(pt);
      }
    }

    const timeSavedMinutes = Math.max(0, primaryOption.totalDurationMinutes - chosen.totalDurationMinutes);
    const extraDistanceKm = Math.round((chosen.totalDistanceKm - primaryOption.totalDistanceKm) * 10) / 10;
    const fuelCostDeltaInr = chosen.totalFuelCostInr - primaryOption.totalFuelCostInr;
    const tollCostDeltaInr = chosen.totalTollCostInr - primaryOption.totalTollCostInr;
    const riskScoreDelta = chosen.riskScore - primaryOption.riskScore;

    // Deadline probability calculation
    const deadlineDiffMs = input.deadlineTime.getTime() - chosen.eta.getTime();
    const deadlineMarginMinutes = deadlineDiffMs / 60000;
    let meetingProb = 95;
    if (deadlineMarginMinutes < 0) {
      meetingProb = Math.max(10, Math.round(50 + deadlineMarginMinutes * 0.5));
    } else if (deadlineMarginMinutes < 60) {
      meetingProb = Math.round(75 + deadlineMarginMinutes * 0.3);
    }

    primaryOption.meetingDeadlineProb = Math.min(
      95,
      Math.max(10, Math.round(85 + (input.deadlineTime.getTime() - primaryOption.eta.getTime()) / 120000)),
    );
    chosen.meetingDeadlineProb = meetingProb;

    const hasImprovement = chosen !== primaryOption && (timeSavedMinutes > 15 || riskScoreDelta < -10 || tollCostDeltaInr < -100);

    let reason = 'Optimal balanced route utilizing multi-lane freight corridor with standard FASTag automated clearance.';
    if (chosen.edges.some((e) => e.id.includes('nh75'))) {
      reason = 'Bypasses Krishnagiri Ghat bottlenecks and Hosur urban toll queues via NH 75 Northern Freight Corridor.';
    } else if (chosen.edges.some((e) => e.id.includes('ne5'))) {
      reason = 'Access-controlled greenfield expressway providing high sustained cruising speed and minimal congestion.';
    }

    return {
      originalRoute: primaryOption,
      recommendedRoute: chosen,
      hasImprovement,
      mode: input.mode,
      timeSavedMinutes: hasImprovement ? timeSavedMinutes : 0,
      extraDistanceKm: hasImprovement ? extraDistanceKm : 0,
      fuelCostDeltaInr: hasImprovement ? fuelCostDeltaInr : 0,
      tollCostDeltaInr: hasImprovement ? tollCostDeltaInr : 0,
      riskScoreDelta: hasImprovement ? riskScoreDelta : 0,
      newEta: chosen.eta.toISOString(),
      meetingDeadlineProb: meetingProb,
      routeWaypoints: waypoints,
      alternateCorridorName: chosen.edges[1]?.corridorName || 'NH 48 Primary Expressway',
      reason,
      triggerCheckpointName: primaryEdges[1]?.tollPlazaName || 'Walajapet Toll Plaza',
      triggerTime: new Date(input.departureTime.getTime() + 90 * 60000).toISOString(),
    };
  }
}

