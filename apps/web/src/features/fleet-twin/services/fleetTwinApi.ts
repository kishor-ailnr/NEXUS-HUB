import { apiFetch } from '../../../lib/api';
import {
  MockFleet,
  MockVehicle,
  MockCheckpoint,
  MockReroute,
  RerouteMode,
  WhatIfParams,
  VehicleDigitalTwinData,
  FleetTwinStatus,
  FleetTwinOverview,
} from '@nexus-ways/shared';

// In-memory client caches with TTL (time-to-live)
const twinCache = new Map<string, { data: VehicleDigitalTwinData; expiresAt: number }>();
const inFlightTwins = new Map<string, Promise<VehicleDigitalTwinData>>();

let allVehiclesCache: { data: MockVehicle[]; expiresAt: number } | null = null;
let inFlightVehicles: Promise<MockVehicle[]> | null = null;

let overviewCache: { data: FleetTwinOverview; expiresAt: number } | null = null;
let inFlightOverview: Promise<FleetTwinOverview> | null = null;

function getTwinCacheKey(id: string, whatIf?: WhatIfParams): string {
  const r = whatIf?.rain_severity_multiplier ?? 1.0;
  const t = whatIf?.toll_strike_hours ?? 0;
  const b = whatIf?.breakdown_hours ?? 0;
  const c = whatIf?.traffic_congestion_multiplier ?? 1.0;
  return `${id}:${r}:${t}:${b}:${c}`;
}

export const fleetTwinApi = {
  /**
   * Synchronous cache reader for instant component hydration.
   * Enables zero-spinner navigation when returning to or switching between twins.
   */
  getCachedVehicleDigitalTwin(
    id: string,
    whatIf?: WhatIfParams,
  ): VehicleDigitalTwinData | null {
    const key = getTwinCacheKey(id, whatIf);
    const entry = twinCache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.data;
    }
    return null;
  },

  /**
   * Preload digital twin data when user hovers or hovers near a vehicle row.
   */
  preloadVehicleDigitalTwin(id: string, whatIf?: WhatIfParams): void {
    const key = getTwinCacheKey(id, whatIf);
    const entry = twinCache.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      // Fire in background quietly
      fleetTwinApi.getVehicleDigitalTwin(id, whatIf).catch(() => {});
    }
  },

  getCachedAllVehicles(): MockVehicle[] | null {
    if (allVehiclesCache && allVehiclesCache.expiresAt > Date.now()) {
      return allVehiclesCache.data;
    }
    return null;
  },

  preloadAllVehicles(): void {
    if (!allVehiclesCache || allVehiclesCache.expiresAt <= Date.now()) {
      fleetTwinApi.getAllVehicles().catch(() => {});
    }
  },

  async getOverview(): Promise<FleetTwinOverview> {
    const now = Date.now();
    if (overviewCache && overviewCache.expiresAt > now) {
      return overviewCache.data;
    }
    if (inFlightOverview) {
      return inFlightOverview;
    }

    inFlightOverview = (async () => {
      try {
        const data = await apiFetch<FleetTwinOverview>('/api/fleet-twin/overview', { method: 'GET' });
        overviewCache = { data, expiresAt: Date.now() + 10_000 };
        return data;
      } catch (err) {
        return {
          enabled: false,
          timestamp: new Date().toISOString(),
          simulated_clock: new Date().toISOString(),
          totals: {
            active_vehicles: 0,
            total_fleet: 0,
            active_alerts: 0,
            average_speed_kmh: 0,
            arrived_today: 0,
            departed_today: 0,
          },
          vehicles: [],
          alerts: [],
        };
      } finally {
        inFlightOverview = null;
      }
    })();

    return inFlightOverview;
  },

  async getStatus(): Promise<FleetTwinStatus> {
    try {
      return await apiFetch<FleetTwinStatus>('/api/fleet-twin/status', { method: 'GET' });
    } catch (err) {
      return {
        enabled: false,
        is_expired: false,
        total_fleets: 0,
        total_vehicles: 0,
      };
    }
  },

  async getFleets(): Promise<MockFleet[]> {
    return apiFetch<MockFleet[]>('/api/fleet-twin/fleets', { method: 'GET' });
  },

  async getVehiclesByFleet(fleetId: string): Promise<MockVehicle[]> {
    return apiFetch<MockVehicle[]>(`/api/fleet-twin/fleets/${fleetId}/vehicles`, { method: 'GET' });
  },

  async getAllVehicles(forceRefresh = false): Promise<MockVehicle[]> {
    const now = Date.now();
    if (!forceRefresh && allVehiclesCache && allVehiclesCache.expiresAt > now) {
      return allVehiclesCache.data;
    }
    if (inFlightVehicles) {
      return inFlightVehicles;
    }

    inFlightVehicles = (async () => {
      try {
        const data = await apiFetch<MockVehicle[]>('/api/fleet-twin/vehicles', { method: 'GET' });
        allVehiclesCache = { data, expiresAt: Date.now() + 15_000 };
        return data;
      } finally {
        inFlightVehicles = null;
      }
    })();

    return inFlightVehicles;
  },

  async getVehicleById(id: string): Promise<MockVehicle> {
    return apiFetch<MockVehicle>(`/api/fleet-twin/vehicles/${id}`, { method: 'GET' });
  },

  async getCheckpointsByVehicle(id: string): Promise<MockCheckpoint[]> {
    return apiFetch<MockCheckpoint[]>(`/api/fleet-twin/vehicles/${id}/checkpoints`, { method: 'GET' });
  },

  async getVehicleDigitalTwin(
    id: string,
    whatIf?: WhatIfParams,
    forceRefresh = false,
  ): Promise<VehicleDigitalTwinData> {
    const key = getTwinCacheKey(id, whatIf);
    const now = Date.now();

    if (!forceRefresh) {
      const cached = twinCache.get(key);
      if (cached && cached.expiresAt > now) {
        return cached.data;
      }
      const pending = inFlightTwins.get(key);
      if (pending) {
        return pending;
      }
    }

    const params = new URLSearchParams();
    if (whatIf?.rain_severity_multiplier !== undefined) {
      params.append('rain_severity_multiplier', String(whatIf.rain_severity_multiplier));
    }
    if (whatIf?.toll_strike_hours !== undefined) {
      params.append('toll_strike_hours', String(whatIf.toll_strike_hours));
    }
    if (whatIf?.breakdown_hours !== undefined) {
      params.append('breakdown_hours', String(whatIf.breakdown_hours));
    }

    const queryStr = params.toString() ? `?${params.toString()}` : '';

    const promise = (async () => {
      try {
        const data = await apiFetch<VehicleDigitalTwinData>(
          `/api/fleet-twin/vehicles/${id}/prediction${queryStr}`,
          { method: 'GET' },
        );
        twinCache.set(key, { data, expiresAt: Date.now() + 30_000 });
        return data;
      } finally {
        inFlightTwins.delete(key);
      }
    })();

    inFlightTwins.set(key, promise);
    return promise;
  },

  async calculateReroute(
    id: string,
    mode: RerouteMode = 'balanced',
    whatIf?: WhatIfParams,
  ): Promise<MockReroute> {
    // Invalidate twin cache for this vehicle on new calculation
    for (const key of twinCache.keys()) {
      if (key.startsWith(`${id}:`)) twinCache.delete(key);
    }
    return apiFetch<MockReroute>(`/api/fleet-twin/vehicles/${id}/reroute`, {
      method: 'POST',
      data: { mode, whatIf },
    });
  },

  async acceptReroute(
    id: string,
    rerouteId?: string,
  ): Promise<{ success: boolean; reroute: MockReroute }> {
    for (const key of twinCache.keys()) {
      if (key.startsWith(`${id}:`)) twinCache.delete(key);
    }
    allVehiclesCache = null;
    return apiFetch<{ success: boolean; reroute: MockReroute }>(
      `/api/fleet-twin/vehicles/${id}/reroute/accept`,
      {
        method: 'POST',
        data: { rerouteId },
      },
    );
  },

  async revertReroute(id: string): Promise<{ success: boolean }> {
    for (const key of twinCache.keys()) {
      if (key.startsWith(`${id}:`)) twinCache.delete(key);
    }
    allVehiclesCache = null;
    return apiFetch<{ success: boolean }>(`/api/fleet-twin/vehicles/${id}/reroute/revert`, {
      method: 'POST',
    });
  },

  async seedMockData(): Promise<{
    success: boolean;
    seeded_batch_id: string;
    counts: Record<string, number>;
  }> {
    twinCache.clear();
    allVehiclesCache = null;
    overviewCache = null;
    return apiFetch('/api/fleet-twin/seed', { method: 'POST' });
  },

  async purgeMockData(): Promise<{ success: boolean; message: string }> {
    twinCache.clear();
    allVehiclesCache = null;
    overviewCache = null;
    return apiFetch('/api/fleet-twin/mock', { method: 'DELETE' });
  },
};
