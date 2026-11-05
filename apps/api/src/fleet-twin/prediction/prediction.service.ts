import { Injectable, Logger } from '@nestjs/common';
import {
  MockPredictionEvent,
  MockVehicle,
  MockRoute,
  MockCheckpoint,
  MockDriver,
  WhatIfParams,
  DEFAULT_WHAT_IF_PARAMS,
  PredictionEventType,
  PredictionEventSeverity,
} from '@nexus-ways/shared';
import { WeatherProvider, MockWeatherProvider } from './providers/weather.provider';
import { TrafficProvider, MockTrafficProvider } from './providers/traffic.provider';
import { TollProvider, MockTollProvider } from './providers/toll.provider';

export interface PredictionAnalysis {
  events: MockPredictionEvent[];
  totalDelayMinutes: number;
  plannedEta: string;
  predictedEta: string;
  onTimeProbability: number;
  riskScore: number;
  topDelayCauses: { cause: string; minutes: number }[];
  driverFatiguePct: number;
}

@Injectable()
export class PredictionService {
  private readonly logger = new Logger(PredictionService.name);
  private readonly weather: WeatherProvider;
  private readonly traffic: TrafficProvider;
  private readonly toll: TollProvider;

  constructor(
    weather?: WeatherProvider,
    traffic?: TrafficProvider,
    toll?: TollProvider,
  ) {
    this.weather = weather || new MockWeatherProvider();
    this.traffic = traffic || new MockTrafficProvider();
    this.toll = toll || new MockTollProvider();
  }

  /**
   * Deterministic 48-hour future timeline generator.
   */
  async generate48hTimeline(
    vehicle: MockVehicle,
    route: MockRoute,
    checkpoints: MockCheckpoint[],
    driver: MockDriver,
    whatIf: WhatIfParams = DEFAULT_WHAT_IF_PARAMS,
    seedClock?: Date,
  ): Promise<PredictionAnalysis> {
    const baseTime = seedClock ? new Date(seedClock) : new Date();
    const sortedCheckpoints = [...checkpoints].sort((a, b) => a.sequence_order - b.sequence_order);

    const events: MockPredictionEvent[] = [];
    const totalDist = route.total_distance_km || 800;
    const currentDist = (vehicle.progress_pct / 100) * totalDist;
    const avgSpeed = Math.max(30, vehicle.speed_kmh || 52);

    let cumulativeDrivingHours = driver.hours_driven_today || 2.5;
    let lastRestStopHour = 0;

    // Upcoming checkpoints
    const upcomingCheckpoints = sortedCheckpoints.filter(
      (cp) => cp.distance_from_start_km >= currentDist - 15,
    );

    // 1. Checkpoint-based events
    for (const cp of upcomingCheckpoints) {
      const remainingKm = Math.max(0, cp.distance_from_start_km - currentDist);
      const hoursToCp = remainingKm / avgSpeed;

      if (hoursToCp > 48) continue; // Outside 48h horizon

      const eventTime = new Date(baseTime.getTime() + hoursToCp * 3600 * 1000);
      const seed = this.hashSeed(vehicle.id + cp.id + eventTime.toDateString());

      // Weather forecast at checkpoint
      const wx = await this.weather.getWeatherForecast(
        cp.latitude,
        cp.longitude,
        eventTime,
        whatIf.rain_severity_multiplier,
      );

      if (wx.speedReductionPct > 15 || wx.condition === 'heavy_rain' || wx.condition === 'ghat_mist') {
        const delayMin = Math.round((cp.avg_halt_minutes + 25) * (wx.speedReductionPct / 30) * whatIf.rain_severity_multiplier);
        events.push({
          id: `pred-wx-${vehicle.id}-${cp.id}`,
          vehicle_id: vehicle.id,
          timestamp: eventTime.toISOString(),
          hours_from_now: Math.round(hoursToCp * 10) / 10,
          checkpoint_id: cp.id,
          location_name: cp.name,
          latitude: cp.latitude,
          longitude: cp.longitude,
          event_type: 'weather',
          description: wx.description,
          delay_minutes: delayMin,
          confidence_pct: Math.round(82 + (seed % 15)),
          severity: wx.speedReductionPct > 35 ? 'high' : 'medium',
          details: { condition: wx.condition, precipitationMm: wx.precipitationMm, visibilityKm: wx.visibilityKm },
          is_mock: true,
          seed_batch_id: vehicle.seed_batch_id || 'seed-default',
          created_at: new Date().toISOString(),
        });
      }

      // Toll plaza queue simulation
      if (cp.type === 'toll_plaza') {
        const toll = await this.toll.getTollStatus(cp.name, eventTime, whatIf.toll_strike_hours);
        if (toll.expectedWaitMinutes > 8 || whatIf.toll_strike_hours > 0) {
          const sev: PredictionEventSeverity = toll.expectedWaitMinutes > 60 ? 'critical' : toll.expectedWaitMinutes > 25 ? 'high' : 'medium';
          events.push({
            id: `pred-toll-${vehicle.id}-${cp.id}`,
            vehicle_id: vehicle.id,
            timestamp: eventTime.toISOString(),
            hours_from_now: Math.round(hoursToCp * 10) / 10,
            checkpoint_id: cp.id,
            location_name: cp.name,
            latitude: cp.latitude,
            longitude: cp.longitude,
            event_type: 'toll_delay',
            description: toll.description,
            delay_minutes: toll.expectedWaitMinutes,
            confidence_pct: Math.round(88 + (seed % 10)),
            severity: sev,
            details: { queueLength: toll.fastagQueueLengthVehicles, tollFeeInr: toll.tollFeeInr },
            is_mock: true,
            seed_batch_id: vehicle.seed_batch_id || 'seed-default',
            created_at: new Date().toISOString(),
          });
        }
      }

      // City Bypass / Border Checkpost Traffic
      if (cp.type === 'city_bypass' || cp.type === 'border_checkpost') {
        const tr = await this.traffic.getTrafficStatus(cp.latitude, cp.longitude, eventTime, true);
        if (tr.delayMinutes > 12) {
          events.push({
            id: `pred-tr-${vehicle.id}-${cp.id}`,
            vehicle_id: vehicle.id,
            timestamp: eventTime.toISOString(),
            hours_from_now: Math.round(hoursToCp * 10) / 10,
            checkpoint_id: cp.id,
            location_name: cp.name,
            latitude: cp.latitude,
            longitude: cp.longitude,
            event_type: 'traffic',
            description: tr.description,
            delay_minutes: tr.delayMinutes,
            confidence_pct: Math.round(78 + (seed % 18)),
            severity: tr.congestionLevel === 'gridlock' ? 'critical' : tr.congestionLevel === 'heavy' ? 'high' : 'medium',
            details: { congestionLevel: tr.congestionLevel, avgSpeedKmh: tr.averageSpeedKmh },
            is_mock: true,
            seed_batch_id: vehicle.seed_batch_id || 'seed-default',
            created_at: new Date().toISOString(),
          });
        }
      }

      // Ghat Slowdown
      if (cp.type === 'ghat_section') {
        const ghatDelay = Math.round(35 + (seed % 30));
        events.push({
          id: `pred-ghat-${vehicle.id}-${cp.id}`,
          vehicle_id: vehicle.id,
          timestamp: eventTime.toISOString(),
          hours_from_now: Math.round(hoursToCp * 10) / 10,
          checkpoint_id: cp.id,
          location_name: cp.name,
          latitude: cp.latitude,
          longitude: cp.longitude,
          event_type: 'ghat_slowdown',
          description: `Steep gradient and hairpin curves (${cp.name}); commercial multi-axle speed restricted to 25 km/h`,
          delay_minutes: ghatDelay,
          confidence_pct: 92,
          severity: 'medium',
          details: { gradient: '7%', hairpinCurves: 14 },
          is_mock: true,
          seed_batch_id: vehicle.seed_batch_id || 'seed-default',
          created_at: new Date().toISOString(),
        });
      }

      // Fuel Stop Check
      if (cp.type === 'fuel_station') {
        events.push({
          id: `pred-fuel-${vehicle.id}-${cp.id}`,
          vehicle_id: vehicle.id,
          timestamp: eventTime.toISOString(),
          hours_from_now: Math.round(hoursToCp * 10) / 10,
          checkpoint_id: cp.id,
          location_name: cp.name,
          latitude: cp.latitude,
          longitude: cp.longitude,
          event_type: 'fuel_check',
          description: `Scheduled commercial diesel refuel and tire pressure telemetry check at ${cp.name}`,
          delay_minutes: 20,
          confidence_pct: 95,
          severity: 'low',
          details: { fuelType: vehicle.fuel_type || 'Diesel', estimatedLiters: 180 },
          is_mock: true,
          seed_batch_id: vehicle.seed_batch_id || 'seed-default',
          created_at: new Date().toISOString(),
        });
      }

      // Rest Break Check
      cumulativeDrivingHours += hoursToCp - lastRestStopHour;
      if (cp.type === 'rest_stop' || cumulativeDrivingHours >= 4.5) {
        const isNightHalt = eventTime.getHours() >= 23 || eventTime.getHours() <= 4 || cumulativeDrivingHours >= 8.5;
        const breakMins = isNightHalt ? 360 : 45; // 6-hour night rest or 45-min break
        events.push({
          id: `pred-rest-${vehicle.id}-${cp.id}`,
          vehicle_id: vehicle.id,
          timestamp: eventTime.toISOString(),
          hours_from_now: Math.round(hoursToCp * 10) / 10,
          checkpoint_id: cp.id,
          location_name: cp.name,
          latitude: cp.latitude,
          longitude: cp.longitude,
          event_type: 'driver_break',
          description: isNightHalt
            ? `Mandatory 6-hour night rest halt (Ministry of Road Transport & Highways guidelines) at ${cp.name}`
            : `Mandatory 45-minute continuous driving rest break at ${cp.name}`,
          delay_minutes: breakMins,
          confidence_pct: 96,
          severity: isNightHalt ? 'medium' : 'low',
          details: { driverName: driver.name, hoursDriven: Math.round(cumulativeDrivingHours * 10) / 10 },
          is_mock: true,
          seed_batch_id: vehicle.seed_batch_id || 'seed-default',
          created_at: new Date().toISOString(),
        });
        cumulativeDrivingHours = 0;
        lastRestStopHour = hoursToCp;
      }
    }

    // 2. What-If Breakdown injection
    if (whatIf.breakdown_hours > 0) {
      const breakdownTime = new Date(baseTime.getTime() + 2.5 * 3600 * 1000);
      events.push({
        id: `pred-breakdown-${vehicle.id}`,
        vehicle_id: vehicle.id,
        timestamp: breakdownTime.toISOString(),
        hours_from_now: 2.5,
        location_name: 'Highway Shoulder En-Route',
        latitude: vehicle.current_lat + 0.05,
        longitude: vehicle.current_lng + 0.05,
        event_type: 'inspection',
        description: `What-If Simulation: Unplanned mechanical breakdown (${whatIf.breakdown_hours}h emergency roadside repair)`,
        delay_minutes: Math.round(whatIf.breakdown_hours * 60),
        confidence_pct: 100,
        severity: 'critical',
        details: { fault: 'Coolant hose rupture & pressure drop', simulatedHours: whatIf.breakdown_hours },
        is_mock: true,
        seed_batch_id: vehicle.seed_batch_id || 'seed-default',
        created_at: new Date().toISOString(),
      });
    }

    // Sort events by timestamp
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Aggregate metrics
    const totalDelayMinutes = events.reduce((sum, e) => sum + e.delay_minutes, 0);

    const plannedEtaDate = route.planned_eta ? new Date(route.planned_eta) : new Date(baseTime.getTime() + (route.base_duration_hours || 16) * 3600 * 1000);
    const predictedEtaDate = new Date(plannedEtaDate.getTime() + totalDelayMinutes * 60 * 1000);

    // On-time probability calculation (decays with delay)
    let onTimeProbability = 95;
    if (totalDelayMinutes > 300) onTimeProbability = 18;
    else if (totalDelayMinutes > 180) onTimeProbability = 38;
    else if (totalDelayMinutes > 90) onTimeProbability = 62;
    else if (totalDelayMinutes > 45) onTimeProbability = 78;
    else if (totalDelayMinutes > 15) onTimeProbability = 88;

    // Top delay causes
    const causeMap = new Map<string, number>();
    for (const e of events) {
      const label = this.formatEventLabel(e.event_type);
      causeMap.set(label, (causeMap.get(label) || 0) + e.delay_minutes);
    }
    const topDelayCauses = Array.from(causeMap.entries())
      .map(([cause, minutes]) => ({ cause, minutes }))
      .sort((a, b) => b.minutes - a.minutes);

    // Risk score: 0 to 100
    const delayRisk = Math.min(50, (totalDelayMinutes / 240) * 50);
    const weatherRisk = events.some((e) => e.event_type === 'weather' && e.severity === 'high') ? 20 : 5;
    const breakRisk = driver.rest_hours_compliance === 'violation' ? 25 : driver.rest_hours_compliance === 'warning' ? 12 : 0;
    const riskScore = Math.min(100, Math.round(delayRisk + weatherRisk + breakRisk));

    // Driver fatigue: percentage based on continuous hours
    const driverFatiguePct = Math.min(100, Math.round((driver.hours_driven_today / driver.max_daily_hours) * 100));

    return {
      events,
      totalDelayMinutes,
      plannedEta: plannedEtaDate.toISOString(),
      predictedEta: predictedEtaDate.toISOString(),
      onTimeProbability,
      riskScore,
      topDelayCauses,
      driverFatiguePct,
    };
  }

  private formatEventLabel(type: PredictionEventType): string {
    switch (type) {
      case 'weather':
        return 'Adverse Weather / Rain';
      case 'toll_delay':
        return 'FASTag Toll Queues';
      case 'traffic':
        return 'City Ring Road Bottleneck';
      case 'driver_break':
        return 'Driver Mandatory Rest';
      case 'fuel_check':
        return 'Scheduled Refueling';
      case 'ghat_slowdown':
        return 'Mountain Ghat Descent';
      case 'inspection':
        return 'Mechanical / RTO Inspection';
      default:
        return 'En-Route Delay';
    }
  }

  private hashSeed(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}

