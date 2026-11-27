import {
  Trip,
  CreateTripDto,
  AddCheckpointDto,
  SavedRoute,
  TripEtaResponse,
  DispatchPreviewRequest,
  DispatchPreviewResponse,
  DispatchTripRequest,
  TripCompletionReport,
} from '@nexus-ways/shared';
import { apiFetch } from '../lib/api';

export const tripsService = {
  async getTrips(): Promise<Trip[]> {
    return apiFetch<Trip[]>('/trips', { method: 'GET' });
  },

  async previewDispatch(req: DispatchPreviewRequest): Promise<DispatchPreviewResponse> {
    return apiFetch<DispatchPreviewResponse>('/trips/preview-dispatch', {
      method: 'POST',
      data: req,
    });
  },

  async dispatchTrip(req: DispatchTripRequest): Promise<Trip> {
    return apiFetch<Trip>('/trips/dispatch', {
      method: 'POST',
      data: req,
    });
  },

  async completeTrip(tripId: string, note?: string): Promise<{ trip: Trip; report: TripCompletionReport }> {
    return apiFetch<{ trip: Trip; report: TripCompletionReport }>(`/trips/${tripId}/complete`, {
      method: 'POST',
      data: { note },
    });
  },

  async getCompletionReport(tripId: string): Promise<TripCompletionReport> {
    return apiFetch<TripCompletionReport>(`/trips/${tripId}/completion-report`, {
      method: 'GET',
    });
  },

  async getTripHistory(filters?: {
    vehicleId?: string;
    driverId?: string;
    status?: string;
    search?: string;
    from?: string;
    to?: string;
  }): Promise<Trip[]> {
    const params = new URLSearchParams();
    if (filters?.vehicleId) params.append('vehicleId', filters.vehicleId);
    if (filters?.driverId) params.append('driverId', filters.driverId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.from) params.append('from', filters.from);
    if (filters?.to) params.append('to', filters.to);
    const q = params.toString();
    return apiFetch<Trip[]>(q ? `/trips/history?${q}` : '/trips/history', { method: 'GET' });
  },

  async getTrip(id: string): Promise<Trip> {
    return apiFetch<Trip>(`/trips/${id}`, { method: 'GET' });
  },

  async getTripEta(id: string): Promise<TripEtaResponse> {
    return apiFetch<TripEtaResponse>(`/trips/${id}/eta`, { method: 'GET' });
  },

  async getSavedRoutes(origin?: string, destination?: string): Promise<SavedRoute[]> {
    const params = new URLSearchParams();
    if (origin) params.append('origin', origin);
    if (destination) params.append('destination', destination);

    const query = params.toString();
    const endpoint = query ? `/trips/saved-routes?${query}` : '/trips/saved-routes';
    return apiFetch<SavedRoute[]>(endpoint, { method: 'GET' }).catch(() => []);
  },

  async createTrip(dto: CreateTripDto): Promise<Trip> {
    return apiFetch<Trip>('/trips', {
      method: 'POST',
      data: dto,
    });
  },

  async addCheckpoint(tripId: string, dto: AddCheckpointDto): Promise<Trip> {
    return apiFetch<Trip>(`/trips/${tripId}/checkpoints`, {
      method: 'PATCH',
      data: dto,
    });
  },

  async updateStatus(tripId: string, status: 'planned' | 'in_transit' | 'completed' | 'cancelled'): Promise<Trip> {
    return apiFetch<Trip>(`/trips/${tripId}/status`, {
      method: 'PATCH',
      data: { status },
    });
  },

  async getTripReport(tripId: string): Promise<{ tripId: string; signedUrl: string; storagePath: string; fileSizeBytes?: number; generatedAt: string }> {
    return apiFetch<{ tripId: string; signedUrl: string; storagePath: string; fileSizeBytes?: number; generatedAt: string }>(`/trips/${tripId}/report`, {
      method: 'GET',
    });
  },
};

export const tripsApi = tripsService;


