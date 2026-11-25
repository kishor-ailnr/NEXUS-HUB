import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useUserLocationStore } from '../userLocationStore';

describe('useUserLocationStore', () => {
  beforeEach(() => {
    useUserLocationStore.getState().clearLocation();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    useUserLocationStore.getState().clearLocation();
  });

  it('starts in idle state with null coordinates and null address', () => {
    const state = useUserLocationStore.getState();
    expect(state.status).toBe('idle');
    expect(state.coordinates).toBeNull();
    expect(state.address).toBeNull();
  });

  it('detects location and reverse geocodes coordinates into human-readable address', async () => {
    // Mock navigator.geolocation
    const mockGeolocation = {
      getCurrentPosition: vi.fn().mockImplementation((success) => {
        success({
          coords: {
            latitude: 11.0168,
            longitude: 76.9558,
            accuracy: 18,
            altitude: null,
            speed: null,
            heading: null,
          },
          timestamp: 1670000000000,
        });
      }),
      watchPosition: vi.fn().mockReturnValue(123),
      clearWatch: vi.fn(),
    };

    vi.stubGlobal('navigator', { geolocation: mockGeolocation });

    // Mock fetch for reverse geocoding
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          formatted: 'Coimbatore, Tamil Nadu',
          city: 'Coimbatore',
          state: 'Tamil Nadu',
          country: 'India',
        }),
      }),
    );

    await useUserLocationStore.getState().requestLocation(true);

    const state = useUserLocationStore.getState();
    expect(state.status).toBe('detected');
    expect(state.coordinates?.latitude).toBeCloseTo(11.0168);
    expect(state.coordinates?.longitude).toBeCloseTo(76.9558);
    expect(state.address?.formatted).toBe('Coimbatore, Tamil Nadu');
  });

  it('handles permission denied error cleanly with permission_denied status', async () => {
    const mockGeolocation = {
      getCurrentPosition: vi.fn().mockImplementation((_success, error) => {
        error({
          code: 1, // PERMISSION_DENIED
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: 'User denied Geolocation',
        });
      }),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };

    vi.stubGlobal('navigator', { geolocation: mockGeolocation });

    await useUserLocationStore.getState().requestLocation(true);

    const state = useUserLocationStore.getState();
    expect(state.status).toBe('permission_denied');
    expect(state.coordinates).toBeNull();
    expect(state.error).toContain('denied');
  });

  it('handles position unavailable error with unavailable status', async () => {
    const mockGeolocation = {
      getCurrentPosition: vi.fn().mockImplementation((_success, error) => {
        error({
          code: 2, // POSITION_UNAVAILABLE
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: 'Position unavailable',
        });
      }),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };

    vi.stubGlobal('navigator', { geolocation: mockGeolocation });

    await useUserLocationStore.getState().requestLocation(true);

    const state = useUserLocationStore.getState();
    expect(state.status).toBe('unavailable');
  });

  it('detects low accuracy coordinates when accuracy exceeds 5000 meters', async () => {
    const mockGeolocation = {
      getCurrentPosition: vi.fn().mockImplementation((success) => {
        success({
          coords: {
            latitude: 19.076,
            longitude: 72.8777,
            accuracy: 8500, // > 5000m
            altitude: null,
            speed: null,
            heading: null,
          },
          timestamp: 1670000000000,
        });
      }),
      watchPosition: vi.fn().mockReturnValue(456),
      clearWatch: vi.fn(),
    };

    vi.stubGlobal('navigator', { geolocation: mockGeolocation });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ formatted: 'Mumbai, Maharashtra' }),
      }),
    );

    await useUserLocationStore.getState().requestLocation(true);

    const state = useUserLocationStore.getState();
    expect(state.status).toBe('accuracy_low');
    expect(state.coordinates?.accuracy).toBe(8500);
  });

  it('increments focusTrigger when triggerFocusMap is called', () => {
    const initial = useUserLocationStore.getState().focusTrigger;
    useUserLocationStore.getState().triggerFocusMap();
    expect(useUserLocationStore.getState().focusTrigger).toBe(initial + 1);
  });

  it('clears location watchers and resets state on clearLocation', () => {
    const clearWatchMock = vi.fn();
    vi.stubGlobal('navigator', {
      geolocation: {
        clearWatch: clearWatchMock,
      },
    });

    useUserLocationStore.setState({
      status: 'detected',
      coordinates: { latitude: 10, longitude: 20, accuracy: 10, timestamp: 1 },
      address: { formatted: 'Test City' },
      watchId: 789,
    });

    useUserLocationStore.getState().clearLocation();

    const state = useUserLocationStore.getState();
    expect(state.status).toBe('idle');
    expect(state.coordinates).toBeNull();
    expect(state.address).toBeNull();
    expect(state.watchId).toBeNull();
    expect(clearWatchMock).toHaveBeenCalledWith(789);
  });
});

