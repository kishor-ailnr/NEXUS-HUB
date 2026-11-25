import { create } from 'zustand';
import { useMapCameraStore } from './mapCameraStore';

export type LocationStatus =
  | 'idle'
  | 'detecting'
  | 'detected'
  | 'permission_denied'
  | 'unavailable'
  | 'accuracy_low'
  | 'geocoding_failed';

export interface UserCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number; // in meters
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  timestamp: number;
}

export interface UserAddress {
  formatted: string; // e.g. "Coimbatore, Tamil Nadu"
  locality?: string;
  city?: string;
  district?: string;
  state?: string;
  country?: string;
  rawDisplayName?: string;
}

export interface UserLocationState {
  status: LocationStatus;
  coordinates: UserCoordinates | null;
  address: UserAddress | null;
  error: string | null;
  focusTrigger: number;
  watchId: number | null;
  isWatching: boolean;
  isPermissionModalOpen: boolean;

  // Actions
  initLocation: () => void;
  requestLocation: (forcePrompt?: boolean) => Promise<void>;
  startWatching: () => void;
  stopWatching: () => void;
  triggerFocusMap: () => void;
  clearLocation: () => void;
  setPermissionModalOpen: (open: boolean) => void;
  setManualCoordinates: (coords: UserCoordinates) => Promise<void>;
}

// In-memory cache of reverse geocoded positions to prevent hammering API
const addressCache = new Map<string, { address: UserAddress; timestamp: number }>();

function getCacheKey(lat: number, lng: number): string {
  // ~100m grid cell resolution
  return `${lat.toFixed(3)}_${lng.toFixed(3)}`;
}

/**
 * Perform reverse geocoding via OpenStreetMap Nominatim with backend fallback
 */
async function fetchReverseGeocode(lat: number, lng: number): Promise<UserAddress | null> {
  const cacheKey = getCacheKey(lat, lng);
  const cached = addressCache.get(cacheKey);
  const oneHourMs = 3600 * 1000;
  if (cached && Date.now() - cached.timestamp < oneHourMs) {
    return cached.address;
  }

  // 1. Try backend reverse geocoding endpoint
  try {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    const resp = await fetch(`${apiBase}/geocoding/reverse?lat=${lat}&lng=${lng}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.formatted) {
        addressCache.set(cacheKey, { address: data, timestamp: Date.now() });
        return data;
      }
    }
  } catch {
    // Fall back to direct Nominatim reverse lookup
  }

  // 2. Direct OpenStreetMap Nominatim Reverse API
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', lat.toString());
    url.searchParams.set('lon', lng.toString());
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('accept-language', 'en');

    const resp = await fetch(url.toString(), {
      headers: {
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (resp.ok) {
      const data = await resp.json();
      const addr = data.address || {};
      const locality =
        addr.city ||
        addr.town ||
        addr.village ||
        addr.suburb ||
        addr.neighbourhood ||
        addr.county ||
        addr.municipality ||
        '';
      const district = addr.state_district || addr.county || '';
      const state = addr.state || '';
      const country = addr.country || 'India';

      let formatted = '';
      if (locality && state) {
        formatted = `${locality}, ${state}`;
      } else if (locality && country) {
        formatted = `${locality}, ${country}`;
      } else if (state && country) {
        formatted = `${state}, ${country}`;
      } else if (data.display_name) {
        formatted = data.display_name.split(',').slice(0, 2).join(',').trim();
      } else {
        formatted = `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(3)}° ${lng >= 0 ? 'E' : 'W'}`;
      }

      const addressResult: UserAddress = {
        formatted,
        locality: locality || undefined,
        city: addr.city || addr.town || undefined,
        district: district || undefined,
        state: state || undefined,
        country: country || undefined,
        rawDisplayName: data.display_name,
      };

      addressCache.set(cacheKey, { address: addressResult, timestamp: Date.now() });
      return addressResult;
    }
  } catch {
    // Both failed
  }

  return null;
}

export const useUserLocationStore = create<UserLocationState>((set, get) => ({
  status: 'idle',
  coordinates: null,
  address: null,
  error: null,
  focusTrigger: 0,
  watchId: null,
  isWatching: false,
  isPermissionModalOpen: false,

  initLocation: () => {
    // If already in a non-idle status, don't overwrite
    if (get().status !== 'idle') {
      return;
    }
    // Check if browser supports geolocation
    if (typeof window === 'undefined' || !navigator || !navigator.geolocation) {
      return;
    }

    // Auto-request location transparently
    get().requestLocation(false);
  },

  requestLocation: async (_forcePrompt = false): Promise<void> => {
    if (typeof window === 'undefined' || !navigator || !navigator.geolocation) {
      set({ status: 'unavailable', error: 'Geolocation is not supported' });
      return;
    }

    set({ status: 'detecting', error: null });

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
    };

    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const coords: UserCoordinates = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude,
            speed: pos.coords.speed,
            heading: pos.coords.heading,
            timestamp: pos.timestamp || Date.now(),
          };

          // Determine if accuracy is low (> 5km)
          const isAccuracyLow = coords.accuracy > 5000;

          // Fetch reverse geocoded human-readable location
          const address = await fetchReverseGeocode(coords.latitude, coords.longitude);

          set({
            status: isAccuracyLow
              ? 'accuracy_low'
              : address
                ? 'detected'
                : 'geocoding_failed',
            coordinates: coords,
            address: address || {
              formatted: `${Math.abs(coords.latitude).toFixed(3)}° ${coords.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(coords.longitude).toFixed(3)}° ${coords.longitude >= 0 ? 'E' : 'W'}`,
            },
            error: null,
          });

          // Start watching for movement
          get().startWatching();
          resolve();
        },
        (err) => {
          let newStatus: LocationStatus = 'unavailable';
          let errMsg = 'Location detection unavailable';

          if (err.code === err.PERMISSION_DENIED) {
            newStatus = 'permission_denied';
            errMsg = 'Location permission was denied in browser settings';
          } else if (err.code === err.TIMEOUT) {
            newStatus = 'unavailable';
            errMsg = 'Location request timed out. Retrying with network location...';
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            newStatus = 'unavailable';
            errMsg = 'Current position unavailable';
          }

          set({
            status: newStatus,
            error: errMsg,
          });
          resolve();
        },
        options,
      );
    });
  },

  startWatching: () => {
    if (typeof window === 'undefined' || !navigator || !navigator.geolocation) {
      return;
    }

    if (get().watchId !== null) {
      return; // Already watching
    }

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 15000,
    };

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const currentCoords = get().coordinates;
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        const newAcc = pos.coords.accuracy;

        // Check if movement is significant (> 25m) to avoid thrashing
        if (currentCoords) {
          const dLat = (newLat - currentCoords.latitude) * 111000;
          const dLng =
            (newLng - currentCoords.longitude) *
            111000 *
            Math.cos((newLat * Math.PI) / 180);
          const distanceMeters = Math.hypot(dLat, dLng);

          if (distanceMeters < 25 && Math.abs(newAcc - currentCoords.accuracy) < 20) {
            return; // Ignore microscopic jitter
          }
        }

        const coords: UserCoordinates = {
          latitude: newLat,
          longitude: newLng,
          accuracy: newAcc,
          altitude: pos.coords.altitude,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: pos.timestamp || Date.now(),
        };

        const isAccuracyLow = coords.accuracy > 5000;
        const address = await fetchReverseGeocode(coords.latitude, coords.longitude);

        set({
          status: isAccuracyLow
            ? 'accuracy_low'
            : address
              ? 'detected'
              : 'geocoding_failed',
          coordinates: coords,
          address: address || get().address,
          error: null,
        });
      },
      (_err) => {
        // Soft error in watchPosition, preserve existing location if available
      },
      options,
    );

    set({ watchId, isWatching: true });
  },

  stopWatching: () => {
    const { watchId } = get();
    if (watchId !== null && typeof window !== 'undefined' && navigator && navigator.geolocation) {
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {
        // ignore
      }
    }
    set({ watchId: null, isWatching: false });
  },

  triggerFocusMap: () => {
    set((state) => ({ focusTrigger: state.focusTrigger + 1 }));
    useMapCameraStore.getState().focusOnUser();
  },

  clearLocation: () => {
    get().stopWatching();
    set({
      status: 'idle',
      coordinates: null,
      address: null,
      error: null,
      focusTrigger: 0,
    });
  },

  setPermissionModalOpen: (open: boolean) => {
    set({ isPermissionModalOpen: open });
  },

  setManualCoordinates: async (coords: UserCoordinates) => {
    set({ status: 'detecting' });
    const address = await fetchReverseGeocode(coords.latitude, coords.longitude);
    set({
      status: address ? 'detected' : 'geocoding_failed',
      coordinates: coords,
      address: address || {
        formatted: `${Math.abs(coords.latitude).toFixed(3)}° ${coords.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(coords.longitude).toFixed(3)}° ${coords.longitude >= 0 ? 'E' : 'W'}`,
      },
      error: null,
    });
  },
}));

