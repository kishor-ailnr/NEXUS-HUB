import { create } from 'zustand';
import {
  DashboardStats,
  SystemStatus,
  NotificationItem,
  Vehicle,
  Driver,
  Trip,
  Geofence,
  ConvoyGroup,
} from '@nexus-ways/shared';
import { dashboardService } from '../services/dashboard';
import { notificationsService } from '../services/notifications';
import { vehiclesService } from '../services/vehicles';
import { driversService } from '../services/drivers';
import { tripsService } from '../services/trips';
import { geofencesService } from '../services/geofences';
import { convoysService } from '../services/convoys';

export interface DashboardDataState {
  // Statistics & System health
  stats: DashboardStats | null;
  systemStatus: SystemStatus | null;
  notifications: NotificationItem[];
  unreadCount: number;
  networkLatency: { latencyMs: number; quality: 'Good' | 'Fair' | 'Poor' } | null;

  // Roadways operational entities
  vehicles: Vehicle[];
  drivers: Driver[];
  trips: Trip[];
  geofences: Geofence[];
  convoys: ConvoyGroup[];

  // Selected state (preserved across navigation to/from Digital Twin)
  selectedVehicleId: string | null;
  selectedTrip: Trip | null;
  isLiveDetailsOpen: boolean;

  // Caching metadata
  lastFetchedAt: number;
  isLoading: boolean;
  isBackgroundRefreshing: boolean;

  // Actions
  fetchDashboardData: (mode?: string, force?: boolean) => Promise<void>;
  setSelectedVehicleId: (id: string | null) => void;
  setSelectedTrip: (trip: Trip | null) => void;
  setIsLiveDetailsOpen: (open: boolean) => void;
  setVehicles: (vehicles: Vehicle[] | ((prev: Vehicle[]) => Vehicle[])) => void;
  setDrivers: (drivers: Driver[] | ((prev: Driver[]) => Driver[])) => void;
  setTrips: (trips: Trip[] | ((prev: Trip[]) => Trip[])) => void;
  setNotifications: (notifications: NotificationItem[] | ((prev: NotificationItem[]) => NotificationItem[])) => void;
  setUnreadCount: (count: number | ((prev: number) => number)) => void;
  updateVehiclePosition: (vehicleId: string, lat: number, lng: number, speed?: number) => void;
  invalidateCache: () => void;
}

let activeFetchPromise: Promise<void> | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds fresh window

export const useDashboardDataStore = create<DashboardDataState>((set, get) => ({
  stats: null,
  systemStatus: null,
  notifications: [],
  unreadCount: 0,
  networkLatency: null,
  vehicles: [],
  drivers: [],
  trips: [],
  geofences: [],
  convoys: [],
  selectedVehicleId: null,
  selectedTrip: null,
  isLiveDetailsOpen: false,
  lastFetchedAt: 0,
  isLoading: true,
  isBackgroundRefreshing: false,

  setSelectedVehicleId: (id: string | null) => set({ selectedVehicleId: id }),
  setSelectedTrip: (trip: Trip | null) => set({ selectedTrip: trip }),
  setIsLiveDetailsOpen: (open: boolean) => set({ isLiveDetailsOpen: open }),
  setVehicles: (vehicles) =>
    set((state) => ({
      vehicles: typeof vehicles === 'function' ? vehicles(state.vehicles) : vehicles,
    })),
  setDrivers: (drivers) =>
    set((state) => ({
      drivers: typeof drivers === 'function' ? drivers(state.drivers) : drivers,
    })),
  setTrips: (trips) =>
    set((state) => ({
      trips: typeof trips === 'function' ? trips(state.trips) : trips,
    })),
  setNotifications: (notifications) =>
    set((state) => ({
      notifications: typeof notifications === 'function' ? notifications(state.notifications) : notifications,
    })),
  setUnreadCount: (count) =>
    set((state) => ({
      unreadCount: typeof count === 'function' ? count(state.unreadCount) : count,
    })),

  updateVehiclePosition: (vehicleId: string, lat: number, lng: number, speed?: number) => {
    set((state) => ({
      vehicles: state.vehicles.map((v) =>
        v.id === vehicleId
          ? {
              ...v,
              latest_gps: {
                id: v.latest_gps?.id || `live-${Date.now()}`,
                vehicle_id: vehicleId,
                trip_id: v.latest_gps?.trip_id || '',
                lat,
                lng,
                speed_kmh: speed !== undefined ? speed : (v.latest_gps?.speed_kmh ?? 0),
                heading: v.latest_gps?.heading ?? 0,
                recorded_at: new Date().toISOString(),
              },
            }
          : v,
      ),
    }));
  },

  invalidateCache: () => set({ lastFetchedAt: 0 }),

  fetchDashboardData: async (mode = 'roadways', force = false) => {
    const state = get();
    const now = Date.now();
    const hasData = state.stats !== null && state.vehicles.length > 0;
    const isFresh = now - state.lastFetchedAt < CACHE_TTL_MS;

    // Return immediately if fresh and not forced
    if (hasData && isFresh && !force) {
      if (state.isLoading) set({ isLoading: false });
      return;
    }

    // Reuse in-flight request if another component or effect is already loading
    if (activeFetchPromise) {
      return activeFetchPromise;
    }

    // If we already have data, refresh quietly in background without full-screen loading flash
    if (hasData) {
      set({ isBackgroundRefreshing: true });
    } else {
      set({ isLoading: true });
    }

    activeFetchPromise = (async () => {
      try {
        const isRoadways = mode === 'roadways';

        const [statsData, statusData, notifsData, countData, latency] = await Promise.all([
          dashboardService.getStats().catch(() => null),
          dashboardService.getSystemStatus().catch(() => null),
          notificationsService.getNotifications().catch(() => []),
          notificationsService.getUnreadCount().catch(() => 0),
          dashboardService.measureClientLatency().catch(() => null),
        ]);

        let vList: Vehicle[] = state.vehicles;
        let dList: Driver[] = state.drivers;
        let tList: Trip[] = state.trips;
        let gList: Geofence[] = state.geofences;
        let cList: ConvoyGroup[] = state.convoys;

        if (isRoadways) {
          const [fVehicles, fDrivers, fTrips, fGeofences, fConvoys] = await Promise.all([
            vehiclesService.getVehicles().catch(() => []),
            driversService.getDrivers().catch(() => []),
            tripsService.getTrips().catch(() => []),
            geofencesService.getGeofences().catch(() => []),
            convoysService.getConvoys().catch(() => []),
          ]);

          if (fVehicles.length > 0) vList = fVehicles;
          if (fDrivers.length > 0) dList = fDrivers;
          if (fTrips.length > 0) tList = fTrips;
          if (fGeofences.length > 0) gList = fGeofences;
          if (fConvoys.length > 0) cList = fConvoys;
        }

        set({
          stats: statsData || state.stats,
          systemStatus: statusData || state.systemStatus,
          notifications: notifsData,
          unreadCount: countData,
          networkLatency: latency || state.networkLatency,
          vehicles: vList,
          drivers: dList,
          trips: tList,
          geofences: gList,
          convoys: cList,
          lastFetchedAt: Date.now(),
          isLoading: false,
          isBackgroundRefreshing: false,
        });
      } catch (err) {
        // Safe fallback - keep existing data
        set({
          isLoading: false,
          isBackgroundRefreshing: false,
        });
      } finally {
        activeFetchPromise = null;
      }
    })();

    return activeFetchPromise;
  },
}));
