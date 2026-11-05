import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import {
  MockFleet,
  MockDriver,
  MockVehicle,
  MockRoute,
  MockCheckpoint,
  MockReroute,
  RerouteMode,
  WhatIfParams,
  VehicleDigitalTwinData,
  FleetTwinStatus,
  DEFAULT_WHAT_IF_PARAMS,
} from '@nexus-ways/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { PredictionService } from './prediction/prediction.service';
import { RerouteEngine } from './rerouting/reroute-engine';
import {
  MOCK_FLEETS_DATA,
  MOCK_DRIVERS_DATA,
  MOCK_ROUTES_DATA,
  MOCK_CHECKPOINTS_DATA,
  MOCK_VEHICLES_DATA,
  SEED_BATCH_ID,
} from './seed/mock-seed-data';

@Injectable()
export class FleetTwinService {
  private readonly logger = new Logger(FleetTwinService.name);
  private readonly rerouteEngine: RerouteEngine;

  // In-memory fallback stores
  private inMemoryFleets: MockFleet[] = [];
  private inMemoryDrivers: MockDriver[] = [];
  private inMemoryRoutes: MockRoute[] = [];
  private inMemoryCheckpoints: MockCheckpoint[] = [];
  private inMemoryVehicles: MockVehicle[] = [];
  private inMemoryReroutes: Map<string, MockReroute> = new Map();
  private lastSeededAt: string = new Date().toISOString();
  private isPurged = false;

  constructor(
    @Optional() private readonly supabaseService: SupabaseService,
    private readonly predictionService: PredictionService,
    @Optional() private readonly rerouteEngineInjected?: RerouteEngine,
  ) {
    this.rerouteEngine = rerouteEngineInjected || new RerouteEngine();
    this.initializeInMemory();
  }

  private initializeInMemory() {
    const now = new Date().toISOString();
    this.inMemoryFleets = MOCK_FLEETS_DATA.map((f) => ({ ...f, created_at: now }));
    this.inMemoryDrivers = MOCK_DRIVERS_DATA.map((d) => ({ ...d, created_at: now }));
    this.inMemoryRoutes = MOCK_ROUTES_DATA.map((r) => ({ ...r, created_at: now }));
    this.inMemoryCheckpoints = MOCK_CHECKPOINTS_DATA.map((c) => ({ ...c, created_at: now }));
    this.inMemoryVehicles = MOCK_VEHICLES_DATA.map((v) => ({ ...v, created_at: now }));
    this.isPurged = false;
    this.lastSeededAt = now;
  }

  public isEnabled(): boolean {
    return process.env.FLEET_TWIN_ENABLED !== 'false';
  }

  /**
   * Get feature flag and mock lifecycle status.
   */
  async getStatus(): Promise<FleetTwinStatus> {
    const enabled = this.isEnabled();
    const expiry = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const fleets = await this.getFleets();
    const vehicles = await this.getAllVehicles();

    return {
      enabled,
      mock_expires_at: expiry,
      is_expired: false,
      total_fleets: fleets.length,
      total_vehicles: vehicles.length,
      last_seeded_at: this.lastSeededAt,
    };
  }

  /**
   * Get all mock fleets.
   */
  async getFleets(): Promise<MockFleet[]> {
    if (this.isPurged) return [];

    if (this.supabaseService?.client) {
      try {
        const { data, error } = await this.supabaseService.client
          .from('mock_fleets')
          .select('*')
          .eq('is_mock', true)
          .order('name');
        if (!error && data && data.length > 0) {
          return data as MockFleet[];
        }
      } catch (err) {
        this.logger.debug('Database mock_fleets query failed, falling back to memory');
      }
    }
    return this.inMemoryFleets;
  }

  /**
   * Get all mock vehicles.
   */
  async getAllVehicles(): Promise<MockVehicle[]> {
    if (this.isPurged) return [];

    if (this.supabaseService?.client) {
      try {
        const { data, error } = await this.supabaseService.client
          .from('mock_vehicles')
          .select('*, driver:mock_drivers(*), route:mock_routes(*), fleet:mock_fleets(*)')
          .eq('is_mock', true);
        if (!error && data && data.length > 0) {
          return data as MockVehicle[];
        }
      } catch (err) {
        this.logger.debug('Database mock_vehicles query failed, falling back to memory');
      }
    }

    return this.inMemoryVehicles.map((v) => this.populateVehicleInMemory(v));
  }

  /**
   * Get vehicles belonging to a specific fleet.
   */
  async getVehiclesByFleet(fleetId: string): Promise<MockVehicle[]> {
    const vehicles = await this.getAllVehicles();
    return vehicles.filter((v) => v.fleet_id === fleetId);
  }

  /**
   * Get single vehicle by ID.
   */
  async getVehicleById(vehicleId: string): Promise<MockVehicle> {
    const vehicles = await this.getAllVehicles();
    const found = vehicles.find((v) => v.id === vehicleId);
    if (!found) {
      throw new NotFoundException(`Vehicle with ID ${vehicleId} not found`);
    }
    return found;
  }

  /**
   * Get checkpoints for a vehicle's route.
   */
  async getCheckpointsByVehicle(vehicleId: string): Promise<MockCheckpoint[]> {
    const vehicle = await this.getVehicleById(vehicleId);
    return this.getCheckpointsByRoute(vehicle.route_id);
  }

  async getCheckpointsByRoute(routeId: string): Promise<MockCheckpoint[]> {
    if (this.isPurged) return [];

    if (this.supabaseService?.client) {
      try {
        const { data, error } = await this.supabaseService.client
          .from('mock_checkpoints')
          .select('*')
          .eq('route_id', routeId)
          .order('sequence_order');
        if (!error && data && data.length > 0) {
          return data as MockCheckpoint[];
        }
      } catch (err) {
        this.logger.debug('Database mock_checkpoints query failed, falling back to memory');
      }
    }

    return this.inMemoryCheckpoints
      .filter((c) => c.route_id === routeId)
      .sort((a, b) => a.sequence_order - b.sequence_order);
  }

  /**
   * Full Vehicle Digital Twin Hero Aggregation.
   */
  async getVehicleDigitalTwin(
    vehicleId: string,
    whatIf: WhatIfParams = DEFAULT_WHAT_IF_PARAMS,
  ): Promise<VehicleDigitalTwinData> {
    const vehicle = await this.getVehicleById(vehicleId);
    const driver = vehicle.driver || this.inMemoryDrivers.find((d) => d.id === vehicle.driver_id)!;
    const fleet = vehicle.fleet || this.inMemoryFleets.find((f) => f.id === vehicle.fleet_id)!;
    const route = vehicle.route || this.inMemoryRoutes.find((r) => r.id === vehicle.route_id)!;
    const checkpoints = await this.getCheckpointsByRoute(vehicle.route_id);

    // Current checkpoint vs next checkpoint based on progress
    const totalDist = route.total_distance_km || 800;
    const currentDist = (vehicle.progress_pct / 100) * totalDist;
    const passed = checkpoints.filter((cp) => cp.distance_from_start_km <= currentDist);
    const currentCheckpoint = passed.length > 0 ? passed[passed.length - 1] : checkpoints[0] || null;
    const nextCheckpoint = checkpoints.find((cp) => cp.distance_from_start_km > currentDist) || null;

    // Timeline analysis
    const analysis = await this.predictionService.generate48hTimeline(
      vehicle,
      route,
      checkpoints,
      driver,
      whatIf,
    );

    // Active reroute recommendation
    const activeReroute = this.inMemoryReroutes.get(vehicleId) || null;

    return {
      vehicle,
      driver,
      fleet,
      route,
      checkpoints,
      current_progress_pct: vehicle.progress_pct,
      simulated_clock: new Date().toISOString(),
      current_checkpoint: currentCheckpoint,
      next_checkpoint: nextCheckpoint,
      timeline: analysis.events,
      planned_eta: analysis.plannedEta,
      predicted_eta: analysis.predictedEta,
      total_predicted_delay_minutes: analysis.totalDelayMinutes,
      on_time_probability: analysis.onTimeProbability,
      risk_score: analysis.riskScore,
      top_delay_causes: analysis.topDelayCauses,
      driver_fatigue_pct: analysis.driverFatiguePct,
      active_reroute: activeReroute,
      what_if: whatIf,
    };
  }

  /**
   * Calculate Optimal Reroute on Alternate Indian Corridors.
   */
  async calculateReroute(
    vehicleId: string,
    mode: RerouteMode = 'balanced',
    whatIf: WhatIfParams = DEFAULT_WHAT_IF_PARAMS,
  ): Promise<MockReroute> {
    const vehicle = await this.getVehicleById(vehicleId);
    const route = vehicle.route || this.inMemoryRoutes.find((r) => r.id === vehicle.route_id)!;
    const checkpoints = await this.getCheckpointsByRoute(vehicle.route_id);
    const driver = vehicle.driver || this.inMemoryDrivers.find((d) => d.id === vehicle.driver_id)!;

    // Map corridor key
    const corridorKey = this.resolveCorridorKey(route.name, route.corridor);
    const startNodeId = this.resolveStartNode(corridorKey, vehicle.progress_pct);
    const endNodeId = this.resolveEndNode(corridorKey);

    const rec = await this.rerouteEngine.computeOptimalReroute({
      corridorKey,
      startNodeId,
      endNodeId,
      departureTime: new Date(),
      deadlineTime: new Date(Date.now() + 18 * 3600 * 1000),
      mode,
      driverHoursDrivenToday: driver.hours_driven_today,
      whatIf,
    });

    const mockReroute: MockReroute = {
      id: `reroute-${vehicle.id}-${Date.now()}`,
      vehicle_id: vehicle.id,
      original_route_id: route.id,
      recommended_route_name: rec.alternateCorridorName,
      mode,
      time_saved_minutes: rec.timeSavedMinutes,
      extra_distance_km: rec.extraDistanceKm,
      fuel_cost_delta_inr: rec.fuelCostDeltaInr,
      toll_cost_delta_inr: rec.tollCostDeltaInr,
      risk_score_delta: rec.riskScoreDelta,
      new_eta: rec.newEta,
      meeting_deadline_prob: rec.meetingDeadlineProb,
      route_waypoints: rec.routeWaypoints,
      alternate_corridor: rec.alternateCorridorName,
      reason: rec.reason,
      trigger_checkpoint_name: rec.triggerCheckpointName,
      trigger_time: rec.triggerTime,
      accepted: false,
      is_mock: true,
      seed_batch_id: vehicle.seed_batch_id || SEED_BATCH_ID,
      created_at: new Date().toISOString(),
    };

    this.inMemoryReroutes.set(vehicle.id, mockReroute);
    return mockReroute;
  }

  /**
   * Accept Reroute Recommendation.
   */
  async acceptReroute(vehicleId: string, rerouteId?: string): Promise<{ success: boolean; reroute: MockReroute }> {
    const existing = this.inMemoryReroutes.get(vehicleId);
    if (!existing) {
      throw new NotFoundException(`No active reroute found for vehicle ${vehicleId}`);
    }

    existing.accepted = true;
    this.inMemoryReroutes.set(vehicleId, existing);

    // Update vehicle status in memory
    const vIndex = this.inMemoryVehicles.findIndex((v) => v.id === vehicleId);
    if (vIndex !== -1) {
      this.inMemoryVehicles[vIndex].status = 'en_route';
    }

    if (this.supabaseService?.client) {
      try {
        await this.supabaseService.client.from('mock_reroutes').upsert([existing]);
      } catch (err) {
        this.logger.debug('Failed to persist accepted reroute in db, kept in memory');
      }
    }

    return { success: true, reroute: existing };
  }

  /**
   * Revert Reroute to Original Corridor.
   */
  async revertReroute(vehicleId: string): Promise<{ success: boolean }> {
    this.inMemoryReroutes.delete(vehicleId);

    if (this.supabaseService?.client) {
      try {
        await this.supabaseService.client.from('mock_reroutes').delete().eq('vehicle_id', vehicleId);
      } catch (err) {
        this.logger.debug('Failed to delete reroute in db, removed from memory');
      }
    }

    return { success: true };
  }

  /**
   * Seed mock tables idempotently.
   */
  async seedData(): Promise<{ success: boolean; seeded_batch_id: string; counts: Record<string, number> }> {
    this.initializeInMemory();

    const counts = {
      fleets: MOCK_FLEETS_DATA.length,
      drivers: MOCK_DRIVERS_DATA.length,
      routes: MOCK_ROUTES_DATA.length,
      checkpoints: MOCK_CHECKPOINTS_DATA.length,
      vehicles: MOCK_VEHICLES_DATA.length,
    };

    if (this.supabaseService?.client) {
      try {
        const now = new Date().toISOString();
        await this.supabaseService.client.from('mock_fleets').upsert(
          MOCK_FLEETS_DATA.map((f) => ({ ...f, created_at: now })),
          { onConflict: 'id' },
        );
        await this.supabaseService.client.from('mock_drivers').upsert(
          MOCK_DRIVERS_DATA.map((d) => ({ ...d, created_at: now })),
          { onConflict: 'id' },
        );
        await this.supabaseService.client.from('mock_routes').upsert(
          MOCK_ROUTES_DATA.map((r) => ({ ...r, created_at: now })),
          { onConflict: 'id' },
        );
        await this.supabaseService.client.from('mock_checkpoints').upsert(
          MOCK_CHECKPOINTS_DATA.map((c) => ({ ...c, created_at: now })),
          { onConflict: 'id' },
        );
        await this.supabaseService.client.from('mock_vehicles').upsert(
          MOCK_VEHICLES_DATA.map((v) => ({ ...v, created_at: now })),
          { onConflict: 'id' },
        );
        this.logger.log(`Idempotent mock database seed succeeded: batch ${SEED_BATCH_ID}`);
      } catch (err) {
        this.logger.warn(`Database seed encountered error (in-memory seed active): ${err}`);
      }
    }

    return {
      success: true,
      seeded_batch_id: SEED_BATCH_ID,
      counts,
    };
  }

  /**
   * Purge all mock data.
   */
  async purgeData(): Promise<{ success: boolean; message: string }> {
    this.inMemoryFleets = [];
    this.inMemoryDrivers = [];
    this.inMemoryRoutes = [];
    this.inMemoryCheckpoints = [];
    this.inMemoryVehicles = [];
    this.inMemoryReroutes.clear();
    this.isPurged = true;

    if (this.supabaseService?.client) {
      try {
        await this.supabaseService.client.from('mock_reroutes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await this.supabaseService.client.from('mock_predictions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await this.supabaseService.client.from('mock_vehicles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await this.supabaseService.client.from('mock_checkpoints').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await this.supabaseService.client.from('mock_routes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await this.supabaseService.client.from('mock_drivers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await this.supabaseService.client.from('mock_fleets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        this.logger.log('Database mock data purged successfully');
      } catch (err) {
        this.logger.warn(`Database purge partial or failed: ${err}`);
      }
    }

    return {
      success: true,
      message: 'All mock fleet twin data successfully purged.',
    };
  }

  // --- Helpers ---
  private populateVehicleInMemory(vehicle: MockVehicle): MockVehicle {
    const driver = this.inMemoryDrivers.find((d) => d.id === vehicle.driver_id);
    const route = this.inMemoryRoutes.find((r) => r.id === vehicle.route_id);
    const fleet = this.inMemoryFleets.find((f) => f.id === vehicle.fleet_id);
    return {
      ...vehicle,
      driver,
      route,
      fleet,
    };
  }

  private resolveCorridorKey(name: string, corridor: string): string {
    const text = `${name} ${corridor}`.toLowerCase();
    if (text.includes('chennai') || text.includes('bengaluru') || text.includes('bangalore') || text.includes('nh 48') || text.includes('nh 44')) {
      return 'chennai-bengaluru';
    }
    if (text.includes('mumbai') || text.includes('pune') || text.includes('expressway')) {
      return 'mumbai-pune-bengaluru';
    }
    if (text.includes('delhi') || text.includes('jaipur') || text.includes('ahmedabad')) {
      return 'delhi-jaipur-ahmedabad';
    }
    return 'chennai-bengaluru';
  }

  private resolveStartNode(corridorKey: string, progressPct: number): string {
    if (progressPct < 25) return 'chennai';
    if (progressPct < 55) return 'sriperumbudur';
    return 'ranipet';
  }

  private resolveEndNode(corridorKey: string): string {
    return 'bengaluru';
  }
}
