import {
  Vehicle,
  CreateVehicleDto,
  UpdateVehicleDto,
  EligibleVehicleItem,
  ResourceAvailabilitySummary,
} from '@nexus-ways/shared';
import { apiFetch } from '../lib/api';

export const vehiclesService = {
  async getVehicles(search?: string): Promise<Vehicle[]> {
    const endpoint = search ? `/vehicles?search=${encodeURIComponent(search)}` : '/vehicles';
    return apiFetch<Vehicle[]>(endpoint, { method: 'GET' });
  },

  async getAvailableVehicles(cargoWeightKg?: number): Promise<EligibleVehicleItem[]> {
    const q = cargoWeightKg ? `?cargoWeightKg=${cargoWeightKg}` : '';
    return apiFetch<EligibleVehicleItem[]>(`/vehicles/available${q}`, { method: 'GET' });
  },

  async getAvailabilitySummary(): Promise<ResourceAvailabilitySummary> {
    return apiFetch<ResourceAvailabilitySummary>('/vehicles/availability', { method: 'GET' });
  },

  async archiveVehicle(id: string): Promise<{ success: boolean; archived: boolean }> {
    return apiFetch<{ success: boolean; archived: boolean }>(`/vehicles/${id}/archive`, {
      method: 'POST',
    });
  },

  async retireVehicle(id: string): Promise<Vehicle> {
    return apiFetch<Vehicle>(`/vehicles/${id}/retire`, {
      method: 'POST',
    });
  },

  async getVehicle(id: string): Promise<Vehicle> {
    return apiFetch<Vehicle>(`/vehicles/${id}`, { method: 'GET' });
  },

  async createVehicle(dto: CreateVehicleDto): Promise<Vehicle> {
    return apiFetch<Vehicle>('/vehicles', {
      method: 'POST',
      data: dto,
    });
  },

  async updateVehicle(id: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    return apiFetch<Vehicle>(`/vehicles/${id}`, {
      method: 'PATCH',
      data: dto,
    });
  },

  async deleteVehicle(id: string): Promise<{ success: boolean }> {
    return apiFetch<{ success: boolean }>(`/vehicles/${id}`, {
      method: 'DELETE',
    });
  },
};

