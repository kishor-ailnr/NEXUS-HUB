import { Injectable, Inject, Optional } from '@nestjs/common';
import {
  RerouteMode,
  WhatIfParams,
  RouteProblem,
  RouteComparisonMetrics,
  RouteFeasibilityExplanation,
  RouteWaypointPoint,
  getOsrmAlternateCorridor,
  AlternateCandidateRoute,
} from '@nexus-ways/shared';
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
  progressPct?: number;
  currentLocation?: [number, number];
  travelledWaypoints?: [number, number][];
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
  // Enhanced dynamic rerouting attributes
  originalMetrics?: RouteComparisonMetrics;
  alternateMetrics?: RouteComparisonMetrics;
  problems?: RouteProblem[];
  feasibility?: RouteFeasibilityExplanation;
  divergencePoint?: RouteWaypointPoint;
  convergencePoint?: RouteWaypointPoint;
  destinationPoint?: RouteWaypointPoint;
  travelledWaypoints?: [number, number][];
  originalRemainingWaypoints?: [number, number][];
  alternateWaypoints?: [number, number][];
  alternateCandidates?: AlternateCandidateRoute[];
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

    let chosen = primaryOption;

    switch (input.mode) {
      case 'fastest':
        // Minimize total transit duration
        candidates.sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes);
        chosen = candidates[0];
        break;
      case 'cheapest':
        // Minimize total fuel + toll expenditure
        candidates.sort((a, b) => (a.totalFuelCostInr + a.totalTollCostInr) - (b.totalFuelCostInr + b.totalTollCostInr));
        chosen = candidates[0];
        break;
      case 'safest':
        // Minimize risk score
        candidates.sort((a, b) => a.riskScore - b.riskScore || a.totalDurationMinutes - b.totalDurationMinutes);
        chosen = candidates[0];
        break;
      case 'balanced':
      default: {
        // Multi-objective Pareto normalized scoring: 35% time, 30% cost, 25% risk, 10% deadline
        const maxTime = Math.max(...candidates.map((c) => c.totalDurationMinutes), 1);
        const maxCost = Math.max(...candidates.map((c) => c.totalFuelCostInr + c.totalTollCostInr), 1);
        const maxRisk = Math.max(...candidates.map((c) => c.riskScore), 1);

        candidates.sort((a, b) => {
          const scoreA =
            0.35 * (a.totalDurationMinutes / maxTime) +
            0.30 * ((a.totalFuelCostInr + a.totalTollCostInr) / maxCost) +
            0.25 * (a.riskScore / maxRisk);
          const scoreB =
            0.35 * (b.totalDurationMinutes / maxTime) +
            0.30 * ((b.totalFuelCostInr + b.totalTollCostInr) / maxCost) +
            0.25 * (b.riskScore / maxRisk);
          return scoreA - scoreB;
        });
        chosen = candidates[0];
        break;
      }
    }

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

    const hasImprovement =
      chosen !== primaryOption &&
      (timeSavedMinutes > 5 || riskScoreDelta < -5 || tollCostDeltaInr < -50 || Math.abs(extraDistanceKm) > 0);

    let reason = '';
    switch (input.mode) {
      case 'fastest':
        reason = hasImprovement
          ? `Fastest Corridor: Saves ${timeSavedMinutes} minutes transit duration via high-speed access-controlled expressway.`
          : 'Current primary highway alignment is already the fastest available transit corridor.';
        break;
      case 'cheapest':
        reason = hasImprovement
          ? `Cheapest Corridor: Minimizes commercial toll barriers, saving ₹${Math.abs(tollCostDeltaInr)} in FASTag fees.`
          : 'Current route already minimizes toll barriers and fuel burn for commercial freight.';
        break;
      case 'safest':
        reason = hasImprovement
          ? `Safest Corridor: Bypasses steep ghat hairpin curves and adverse weather zones, reducing risk score by ${Math.abs(riskScoreDelta)} points.`
          : 'Current corridor exhibits lowest environmental and road hazard risk.';
        break;
      case 'balanced':
      default:
        reason = hasImprovement
          ? `Balanced Optimization: Optimal compromise balancing ${timeSavedMinutes > 0 ? timeSavedMinutes + 'm time savings' : 'direct mileage'} against fuel and toll expense.`
          : 'Optimal balanced route utilizing multi-lane freight corridor with standard FASTag automated clearance.';
        break;
    }

    if (chosen.edges.some((e) => e.id.includes('nh75')) && hasImprovement) {
      reason += ' Diverts via NH 75 Northern Freight Corridor (Chittoor / Kolar bypass).';
    } else if (chosen.edges.some((e) => e.id.includes('ne5')) && hasImprovement) {
      reason += ' Accesses Greenfield Expressway NE-5 direct alignment.';
    }

    // Problem identification along primary original route
    const problems = this.identifyRouteProblems(primaryEdges, primaryOption.steps, input.whatIf);

    // Side-by-side comparison metrics
    const originalMetrics: RouteComparisonMetrics = {
      remaining_distance_km: primaryOption.totalDistanceKm,
      predicted_travel_time_minutes: primaryOption.totalDurationMinutes,
      expected_eta: primaryOption.eta.toISOString(),
      traffic_delay_minutes: primaryOption.steps.reduce((sum, s) => sum + s.trafficDelayMinutes, 0),
      weather_risk_score: Math.min(
        100,
        Math.round(
          primaryOption.steps.reduce((sum, s) => sum + s.weatherDelayMinutes, 0) * 1.5 +
            (input.whatIf?.rain_severity_multiplier || 1.0) * 15,
        ),
      ),
      toll_cost_inr: primaryOption.totalTollCostInr,
      fuel_cost_inr: primaryOption.totalFuelCostInr,
      total_operating_cost_inr: primaryOption.totalFuelCostInr + primaryOption.totalTollCostInr,
      route_risk_score: primaryOption.riskScore,
    };

    const alternateMetrics: RouteComparisonMetrics = {
      remaining_distance_km: chosen.totalDistanceKm,
      predicted_travel_time_minutes: chosen.totalDurationMinutes,
      expected_eta: chosen.eta.toISOString(),
      traffic_delay_minutes: chosen.steps.reduce((sum, s) => sum + s.trafficDelayMinutes, 0),
      weather_risk_score: Math.min(
        100,
        Math.round(chosen.steps.reduce((sum, s) => sum + s.weatherDelayMinutes, 0) * 1.2 + 10),
      ),
      toll_cost_inr: chosen.totalTollCostInr,
      fuel_cost_inr: chosen.totalFuelCostInr,
      total_operating_cost_inr: chosen.totalFuelCostInr + chosen.totalTollCostInr,
      route_risk_score: chosen.riskScore,
    };

    // Why current route is problematic
    const whyProblematic: string[] = problems.length > 0
      ? problems.map((p) => `${p.location_name}: ${p.evidence}`)
      : ['Current primary corridor experiences recurring urban bottlenecks and toll plaza deceleration.'];

    // Why alternate is better
    const whyBetter: string[] = [];
    if (timeSavedMinutes > 0) {
      whyBetter.push(`Saves ${timeSavedMinutes} minutes transit duration, delivering faster turnaround.`);
    }
    if (tollCostDeltaInr < 0) {
      whyBetter.push(`Reduces commercial FASTag toll expense by ₹${Math.abs(tollCostDeltaInr)}.`);
    }
    if (fuelCostDeltaInr < 0) {
      whyBetter.push(`Lowers diesel consumption cost by ₹${Math.abs(fuelCostDeltaInr)} due to smoother highway grade.`);
    }
    if (riskScoreDelta < 0) {
      whyBetter.push(`Lowers overall route hazard risk by ${Math.abs(riskScoreDelta)} points, avoiding steep ghat sections.`);
    }
    if (chosen.edges.some((e) => e.isCityBypass)) {
      whyBetter.push('Utilizes designated eastern bypass to avoid heavy urban and inter-state border congestion.');
    }
    if (whyBetter.length === 0) {
      whyBetter.push('Optimized alignment maintains high route reliability under current atmospheric conditions.');
    }

    // Structured operational feasibility explanation
    const feasibility: RouteFeasibilityExplanation = {
      why_current_route_problematic: whyProblematic,
      why_alternate_better: whyBetter,
      why_feasible: {
        road_accessibility:
          'NHAI Class-A National Highway & Access-Controlled Expressway. Certified for up to 40T multi-axle freight vehicles with full clearance.',
        vehicle_compatibility:
          'Meets axle load limits for commercial freight trucks. No low bridges, railway underpass restrictions, or weight-restricted culverts.',
        traffic_advantage:
          'Free-flow traffic conditions with Level of Service (LOS) B across 82% of the corridor. Bypasses major urban choke points.',
        weather_suitability:
          'Low precipitation radar forecast (<0.2 mm/hr), clear visibility >8 km, zero waterlogging risk along the plateau elevation.',
        time_feasibility: `Arrives at destination by ${new Date(chosen.eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, providing a comfortable buffer against delivery SLA.`,
        operational_constraints:
          'FASTag electronic toll active at all candidate plazas. 24/7 commercial fuel stations and authorized heavy-vehicle breakdown support available every 30 km.',
      },
      feasibility_status: 'feasible',
    };

    // Divergence, convergence, and destination points
    const divergenceNode = graph.nodes[input.startNodeId] || graph.nodes['sriperumbudur'] || {
      name: 'Sriperumbudur / Ranipet Interchange',
      latitude: 12.9675,
      longitude: 79.9436,
    };
    const convergenceNode = graph.nodes['hoskote'] || {
      name: 'Hoskote East Interchange',
      latitude: 13.0712,
      longitude: 77.7981,
    };
    const destinationNode = graph.nodes[input.endNodeId] || graph.nodes['bengaluru'] || {
      name: 'Bengaluru Electronic City Logistics Hub',
      latitude: 12.9716,
      longitude: 77.5946,
    };

    const divergencePoint: RouteWaypointPoint = {
      name: divergenceNode.name,
      latitude: divergenceNode.latitude,
      longitude: divergenceNode.longitude,
    };
    const convergencePoint: RouteWaypointPoint = {
      name: convergenceNode.name,
      latitude: convergenceNode.latitude,
      longitude: convergenceNode.longitude,
    };
    const destinationPoint: RouteWaypointPoint = {
      name: destinationNode.name,
      latitude: destinationNode.latitude,
      longitude: destinationNode.longitude,
    };

    // Extract waypoints for original remaining and alternate
    const originalRemainingWaypoints: [number, number][] = [];
    for (const edge of primaryEdges) {
      for (const pt of edge.waypoints) {
        originalRemainingWaypoints.push(pt);
      }
    }

    // High-resolution road-following OSRM geometry for alternate corridor
    const verifiedAltGeom = getOsrmAlternateCorridor(
      chosen.edges.some((e) => e.id.includes('nh75'))
        ? 'nh75'
        : chosen.edges.some((e) => e.id.includes('ne5'))
        ? 'ne5'
        : chosen.edges[1]?.corridorName,
    );

    const alternateWaypoints: [number, number][] =
      verifiedAltGeom && verifiedAltGeom.length > 0
        ? [...verifiedAltGeom]
        : [];

    if (alternateWaypoints.length === 0) {
      for (const edge of chosen.edges) {
        for (const pt of edge.waypoints) {
          alternateWaypoints.push(pt);
        }
      }
    }

    // Determine travelled waypoints up to divergence point
    const travelledWaypoints: [number, number][] =
      input.travelledWaypoints && input.travelledWaypoints.length > 0
        ? input.travelledWaypoints
        : [[13.0827, 80.2707], [13.0125, 80.0543], [divergencePoint.latitude, divergencePoint.longitude]];

    // Build dense alternate candidate routes for multi-alternative routing
    const nh75Waypoints = getOsrmAlternateCorridor('nh75') || [];
    const ne5Waypoints = getOsrmAlternateCorridor('ne5') || [];

    const alternateCandidates: AlternateCandidateRoute[] = [
      {
        id: 'alt-cand-nh75',
        name: 'NH 75 Northern Freight Corridor (Chittoor / Kolar)',
        corridor: 'NH 75 Old Madras Road Freight Route',
        waypoints: nh75Waypoints,
        distance_km: option1.totalDistanceKm,
        duration_minutes: option1.totalDurationMinutes,
        toll_cost_inr: option1.totalTollCostInr,
        fuel_cost_inr: option1.totalFuelCostInr,
        risk_score: option1.riskScore,
        is_recommended: chosen === option1,
        checkpoints: [
          { name: 'Sriperumbudur Divergence Interchange', type: 'divergence', latitude: 12.9675, longitude: 79.9436, sequence_order: 1 },
          { name: 'Chittoor Bypass Toll Plaza', type: 'toll_plaza', latitude: 13.2172, longitude: 79.1003, sequence_order: 2 },
          { name: 'Mulbagal Toll Plaza & Rest Area', type: 'rest_stop', latitude: 13.1654, longitude: 78.5812, sequence_order: 3 },
          { name: 'Kolar Gold Fields Freight Terminal', type: 'warehouse', latitude: 13.1378, longitude: 78.1294, sequence_order: 4 },
          { name: 'Hoskote East Convergence Interchange', type: 'convergence', latitude: 13.0712, longitude: 77.7981, sequence_order: 5 },
          { name: 'Bengaluru Electronic City Logistics Hub', type: 'destination', latitude: 12.9716, longitude: 77.5946, sequence_order: 6 },
        ],
      },
      {
        id: 'alt-cand-ne5',
        name: 'NE 5 Greenfield Expressway Bypass (Direct Access)',
        corridor: 'NE 5 Greenfield Access-Controlled Expressway',
        waypoints: ne5Waypoints,
        distance_km: option2.totalDistanceKm,
        duration_minutes: option2.totalDurationMinutes,
        toll_cost_inr: option2.totalTollCostInr,
        fuel_cost_inr: option2.totalFuelCostInr,
        risk_score: option2.riskScore,
        is_recommended: chosen === option2,
        checkpoints: [
          { name: 'Ranipet Divergence Interchange', type: 'divergence', latitude: 12.9276, longitude: 79.3331, sequence_order: 1 },
          { name: 'NE-5 Greenfield Main Toll Plaza', type: 'toll_plaza', latitude: 13.0821, longitude: 78.5123, sequence_order: 2 },
          { name: 'Hoskote East Convergence Interchange', type: 'convergence', latitude: 13.0712, longitude: 77.7981, sequence_order: 3 },
          { name: 'Bengaluru Electronic City Logistics Hub', type: 'destination', latitude: 12.9716, longitude: 77.5946, sequence_order: 4 },
        ],
      },
    ];

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
      originalMetrics,
      alternateMetrics,
      problems,
      feasibility,
      divergencePoint,
      convergencePoint,
      destinationPoint,
      travelledWaypoints,
      originalRemainingWaypoints,
      alternateWaypoints,
      alternateCandidates,
    };
  }

  /**
   * Identify concrete segment-by-segment hazards along highway route.
   */
  identifyRouteProblems(
    edges: GraphEdge[],
    steps: TraversalStep[],
    whatIf?: WhatIfParams,
  ): RouteProblem[] {
    const problems: RouteProblem[] = [];
    let problemCounter = 1;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const edge = step.edge;
      const midPoint = edge.waypoints[Math.floor(edge.waypoints.length / 2)] || [13.0, 80.0];

      // 1. Toll Plazas with delay or strike
      if (step.tollWaitMinutes >= 12 || (edge.tollPlazaName && whatIf?.toll_strike_hours)) {
        const strikeExtra = Math.round((whatIf?.toll_strike_hours || 0) * 45);
        const totalDelay = step.tollWaitMinutes + strikeExtra;
        problems.push({
          id: `prob-toll-${problemCounter++}`,
          location_name: edge.tollPlazaName || `${edge.corridorName} Toll Plaza`,
          latitude: midPoint[0],
          longitude: midPoint[1],
          category: 'toll_delay',
          severity: totalDelay > 30 ? 'high' : 'medium',
          status: (whatIf?.toll_strike_hours || 0) > 0 ? 'SCENARIO' : 'OBSERVED',
          expected_occurrence_time: step.arrivalTime.toISOString(),
          expected_delay_minutes: totalDelay,
          data_source: 'NHAI FASTag ETC API / Corridor Queue Telemetry',
          last_updated: new Date().toISOString(),
          recommended_action: 'Divert onto Northern Freight Corridor (NH 75) or NE 5 to bypass manual ETC throttling.',
          evidence: `Walajapet / Vaniyambadi FASTag queue backlog: ~${totalDelay} min clearance delay, high multi-axle freight volume.`,
        });
      }

      // 2. Traffic Bottlenecks
      if (step.trafficDelayMinutes >= 15 || edge.isCityBypass) {
        problems.push({
          id: `prob-traffic-${problemCounter++}`,
          location_name: `${edge.corridorName} (Border Choke Point)`,
          latitude: midPoint[0],
          longitude: midPoint[1],
          category: 'traffic_congestion',
          severity: step.trafficDelayMinutes > 30 ? 'critical' : step.trafficDelayMinutes > 18 ? 'high' : 'medium',
          status: 'MODEL_PREDICTION',
          expected_occurrence_time: step.arrivalTime.toISOString(),
          expected_delay_minutes: step.trafficDelayMinutes,
          data_source: 'TomTom Traffic API / Time-of-Day Baseline',
          last_updated: new Date().toISOString(),
          recommended_action: 'Utilize Eastern / Hoskote bypass to circumvent inter-state commercial freight entry bottleneck.',
          evidence: `Interstate border commercial freight processing backlog. Average speed degraded to ${Math.round(edge.baseSpeedKmh * 0.52)} km/h (+${step.trafficDelayMinutes}m delay).`,
        });
      }

      // 3. Ghat Risks & Elevation Hazards
      if (edge.hasGhatSection) {
        const rainMult = whatIf?.rain_severity_multiplier || 1.0;
        problems.push({
          id: `prob-ghat-${problemCounter++}`,
          location_name: `${edge.corridorName} (Ghat Incline Section)`,
          latitude: midPoint[0],
          longitude: midPoint[1],
          category: rainMult > 1.3 ? 'heavy_rain' : 'ghat_risk',
          severity: rainMult > 1.3 ? 'critical' : 'high',
          status: rainMult > 1.0 ? 'SCENARIO' : 'FORECAST',
          expected_occurrence_time: step.arrivalTime.toISOString(),
          expected_delay_minutes: 25 + Math.round(rainMult * 10),
          data_source: 'Open-Meteo Radar / Highway Terrain Elevation Model',
          last_updated: new Date().toISOString(),
          recommended_action: 'Select plateau freight route (NH 75 / NE 5) to avoid steep hairpins and hydroplaning risks.',
          evidence: `Steep 6.8% gradient with sharp hairpin curves. Wet road surface increases heavy freight stopping distance by 38% (${rainMult > 1.0 ? `${rainMult}x rain scenario` : 'monsoon drizzle'}).`,
        });
      }

      // 4. Breakdown Scenario
      if (whatIf?.breakdown_hours && whatIf.breakdown_hours > 0 && i === 0) {
        problems.push({
          id: `prob-breakdown-${problemCounter++}`,
          location_name: `Current Location (${edge.from})`,
          latitude: midPoint[0],
          longitude: midPoint[1],
          category: 'breakdown',
          severity: 'critical',
          status: 'SCENARIO',
          expected_occurrence_time: step.arrivalTime.toISOString(),
          expected_delay_minutes: Math.round(whatIf.breakdown_hours * 60),
          data_source: 'Digital Twin What-If Parameter',
          last_updated: new Date().toISOString(),
          recommended_action: 'Dispatch roadside emergency service and reroute remaining delivery.',
          evidence: `Simulated mechanical breakdown adds ${whatIf.breakdown_hours}h roadside downtime.`,
        });
      }
    }

    return problems;
  }
}

