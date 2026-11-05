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

export const fleetTwinApi = {
  async getOverview(): Promise<FleetTwinOverview> {
    try {
      return await apiFetch<FleetTwinOverview>('/api/fleet-twin/overview', { method: 'GET' });
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
    }
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

  async getAllVehicles(): Promise<MockVehicle[]> {
    return apiFetch<MockVehicle[]>('/api/fleet-twin/vehicles', { method: 'GET' });
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
  ): Promise<VehicleDigitalTwinData> {
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
    return apiFetch<VehicleDigitalTwinData>(`/api/fleet-twin/vehicles/${id}/prediction${queryStr}`, {
      method: 'GET',
    });
  },

  async calculateReroute(
    id: string,
    mode: RerouteMode = 'balanced',
    whatIf?: WhatIfParams,
  ): Promise<MockReroute> {
    return apiFetch<MockReroute>(`/api/fleet-twin/vehicles/${id}/reroute`, {
      method: 'POST',
      data: { mode, whatIf },
    });
  },

  async acceptReroute(
    id: string,
    rerouteId?: string,
  ): Promise<{ success: boolean; reroute: MockReroute }> {
    return apiFetch<{ success: boolean; reroute: MockReroute }>(
      `/api/fleet-twin/vehicles/${id}/reroute/accept`,
      {
        method: 'POST',
        data: { rerouteId },
      },
    );
  },

  async revertReroute(id: string): Promise<{ success: boolean }> {
    return apiFetch<{ success: boolean }>(`/api/fleet-twin/vehicles/${id}/reroute/revert`, {
      method: 'POST',
    });
  },

  async seedMockData(): Promise<{
    success: boolean;
    seeded_batch_id: string;
    counts: Record<string, number>;
  }> {
    return apiFetch('/api/fleet-twin/seed', { method: 'POST' });
  },

  async purgeMockData(): Promise<{ success: boolean; message: string }> {
    return apiFetch('/api/fleet-twin/mock', { method: 'DELETE' });
  },
};

