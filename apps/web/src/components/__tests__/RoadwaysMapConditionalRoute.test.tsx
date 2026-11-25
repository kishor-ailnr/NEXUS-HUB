import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RoadwaysMap } from '../RoadwaysMap';
import { useMapCameraStore } from '../../store/mapCameraStore';
import { useUserLocationStore } from '../../store/userLocationStore';
import { Vehicle, Trip } from '@nexus-ways/shared';

// Spy on Leaflet calls
const polylineCalls: any[] = [];
const circleCalls: any[] = [];
const markerCalls: any[] = [];
const bindPopupCalls: string[] = [];
let layerGroupAddCount = 0;
let layerGroupClearCount = 0;

vi.mock('leaflet', () => {
  const mapMock = {
    setView: vi.fn().mockReturnThis(),
    fitBounds: vi.fn().mockReturnThis(),
    flyTo: vi.fn().mockReturnThis(),
    panTo: vi.fn().mockReturnThis(),
    getZoom: vi.fn().mockReturnValue(12),
    project: vi.fn((latLng: any, zoom: number) => ({ x: 500, y: 500 })),
    unproject: vi.fn((point: any, zoom: number) => ({ lat: 19.10, lng: 72.88 })),
    getContainer: vi.fn(() => ({
      getBoundingClientRect: () => ({ left: 0, right: 1000, top: 0, bottom: 600, width: 1000, height: 600 }),
    })),
    remove: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    invalidateSize: vi.fn(),
  };

  const layerGroupMock: any = {
    addTo: vi.fn().mockReturnThis(),
    clearLayers: vi.fn(() => {
      layerGroupClearCount++;
      return layerGroupMock;
    }),
    addLayer: vi.fn((layer: any) => {
      layerGroupAddCount++;
      return layerGroupMock;
    }),
    removeLayer: vi.fn(),
  };

  return {
    default: {
      map: vi.fn(() => mapMock),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      layerGroup: vi.fn(() => layerGroupMock),
      circle: vi.fn((coords, options) => {
        circleCalls.push({ coords, options });
        return {
          bindTooltip: vi.fn(),
          setLatLng: vi.fn(),
          setRadius: vi.fn(),
        };
      }),
      polyline: vi.fn((latLngs, options) => {
        polylineCalls.push({ latLngs, options });
        return {
          bindTooltip: vi.fn(),
          setLatLngs: vi.fn(),
        };
      }),
      circleMarker: vi.fn(() => ({ bindTooltip: vi.fn() })),
      marker: vi.fn((coords, options) => {
        markerCalls.push({ coords, options });
        return {
          addTo: vi.fn().mockReturnThis(),
          bindPopup: vi.fn((html: string) => {
            bindPopupCalls.push(html);
            return { setContent: vi.fn() };
          }),
          openPopup: vi.fn().mockReturnThis(),
          setLatLng: vi.fn().mockReturnThis(),
          getPopup: vi.fn(() => ({ setContent: vi.fn() })),
          on: vi.fn().mockReturnThis(),
        };
      }),
      divIcon: vi.fn((opts) => opts),
      point: vi.fn((x: number, y: number) => ({ x, y })),
      latLng: vi.fn((lat: number, lng: number) => ({ lat, lng })),
      latLngBounds: vi.fn(() => ({
        extend: vi.fn(),
        isValid: vi.fn(() => true),
      })),
    },
  };
});

describe('RoadwaysMap - Conditional User Location & Route Colorization', () => {
  const mockVehicles: Vehicle[] = [
    {
      id: 'v-test-1',
      org_id: 'org-1',
      registration_number: 'MH-12-ROAD-101',
      vehicle_type: 'Heavy Truck',
      status: 'active',
      latest_gps: {
        id: 'gps-1',
        trip_id: 'trip-1',
        vehicle_id: 'v-test-1',
        lat: 19.10,
        lng: 72.88,
        speed_kmh: 55,
        recorded_at: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    },
  ];

  const mockTrips: Trip[] = [
    {
      id: 'trip-1',
      org_id: 'org-1',
      vehicle_id: 'v-test-1',
      driver_id: 'd-1',
      simulation_speed_multiplier: 1,
      status: 'in_transit',
      origin_label: 'Mumbai Depot',
      destination_label: 'Pune Hub',
      origin_lat: 19.00,
      origin_lng: 72.85,
      destination_lat: 19.20,
      destination_lng: 72.95,
      distance_km: 30,
      route_geometry: {
        routing_source: 'osrm',
        distance_km: 30,
        duration_minutes: 45,
        coordinates: [
          [72.85, 19.00],
          [72.88, 19.10],
          [72.95, 19.20],
        ],
      },
      created_at: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    polylineCalls.length = 0;
    circleCalls.length = 0;
    markerCalls.length = 0;
    layerGroupAddCount = 0;
    layerGroupClearCount = 0;

    // Reset MapCameraStore & UserLocationStore
    useMapCameraStore.setState({
      focusType: 'ROUTE_OVERVIEW',
      activeMapSelection: { type: 'NONE' },
      isUserLocationVisible: false,
      selectedFleetId: null,
      isFollowingFleet: false,
      userFocusTrigger: 0,
      fleetFocusTrigger: 0,
      overviewFocusTrigger: 0,
    });

    useUserLocationStore.setState({
      status: 'detected',
      coordinates: {
        latitude: 19.076,
        longitude: 72.8777,
        accuracy: 20,
        timestamp: Date.now(),
      },
      address: {
        formatted: 'Mumbai, Maharashtra',
        city: 'Mumbai',
        state: 'Maharashtra',
      },
    });
  });

  it('State A: Does NOT render user location marker on initial load when isUserLocationVisible is false', () => {
    render(
      <RoadwaysMap
        vehicles={mockVehicles}
        activeTrips={mockTrips}
        geofences={[]}
      />
    );

    // Initial state: isUserLocationVisible is false
    expect(useMapCameraStore.getState().isUserLocationVisible).toBe(false);

    // Check that no user location marker with className 'current-user-location-marker' was created
    const userMarkerCreation = markerCalls.find(
      (m) => m.options?.icon?.className === 'current-user-location-marker'
    );
    expect(userMarkerCreation).toBeUndefined();

    // Check legend does NOT show "You (Here)"
    expect(screen.queryByText(/You \(Mumbai\)/)).not.toBeInTheDocument();
  });

  it('State B: Renders user location marker when user clicks "My Location"', () => {
    render(
      <RoadwaysMap
        vehicles={mockVehicles}
        activeTrips={mockTrips}
        geofences={[]}
      />
    );

    // Click My Location button
    const myLocationBtn = screen.getByRole('button', { name: /My Location/i });
    act(() => {
      fireEvent.click(myLocationBtn);
    });

    expect(useMapCameraStore.getState().isUserLocationVisible).toBe(true);
    expect(useMapCameraStore.getState().activeMapSelection).toEqual({ type: 'USER_LOCATION' });

    // User marker created
    const userMarkerCreation = markerCalls.find(
      (m) => m.options?.icon?.className === 'current-user-location-marker'
    );
    expect(userMarkerCreation).toBeDefined();

    // User location pill is visible with Close button
    expect(screen.getByText(/User Location:/i)).toBeInTheDocument();
    expect(screen.getByText(/Close Location View/i)).toBeInTheDocument();

    // Legend now shows "You (Mumbai)"
    expect(screen.getByText(/You \(Mumbai\)/)).toBeInTheDocument();
  });

  it('State C: Immediately hides user location marker when a fleet is selected', () => {
    const { rerender } = render(
      <RoadwaysMap
        vehicles={mockVehicles}
        activeTrips={mockTrips}
        geofences={[]}
      />
    );

    // First open user location
    act(() => {
      useMapCameraStore.getState().focusOnUser();
    });
    expect(useMapCameraStore.getState().isUserLocationVisible).toBe(true);

    // Now select a fleet
    rerender(
      <RoadwaysMap
        vehicles={mockVehicles}
        activeTrips={mockTrips}
        geofences={[]}
        selectedVehicleId="v-test-1"
      />
    );

    expect(useMapCameraStore.getState().isUserLocationVisible).toBe(false);
    expect(useMapCameraStore.getState().activeMapSelection).toEqual({
      type: 'SELECTED_FLEET',
      fleetId: 'v-test-1',
    });

    // Close location view button should disappear
    expect(screen.queryByText(/Close Location View/i)).not.toBeInTheDocument();
    // Fleet filter indicator should be visible
    expect(screen.getByText(/Fleet Filter:/i)).toBeInTheDocument();
  });

  it('State D: Hides user location marker when user clicks "Close Location View"', () => {
    render(
      <RoadwaysMap
        vehicles={mockVehicles}
        activeTrips={mockTrips}
        geofences={[]}
      />
    );

    // Open user location
    const myLocationBtn = screen.getByRole('button', { name: /My Location/i });
    act(() => {
      fireEvent.click(myLocationBtn);
    });
    expect(screen.getByText(/Close Location View/i)).toBeInTheDocument();

    // Click Close Location View
    const closeBtn = screen.getByRole('button', { name: /Close Location View/i });
    act(() => {
      fireEvent.click(closeBtn);
    });

    expect(useMapCameraStore.getState().isUserLocationVisible).toBe(false);
    expect(useMapCameraStore.getState().activeMapSelection).toEqual({ type: 'NONE' });
    expect(screen.queryByText(/Close Location View/i)).not.toBeInTheDocument();
  });

  it('Part 2: Real-time route colorization splits route into emerald green (#10b981) for completed and blue for remaining', () => {
    render(
      <RoadwaysMap
        vehicles={mockVehicles}
        activeTrips={mockTrips}
        geofences={[]}
        selectedVehicleId="v-test-1"
      />
    );

    // Check polylines generated
    const greenPolyline = polylineCalls.find((p) => p.options?.color === '#10b981');
    const bluePolyline = polylineCalls.find((p) => p.options?.color === '#0284c7');

    expect(greenPolyline).toBeDefined();
    expect(bluePolyline).toBeDefined();

    // Completed polyline starts at origin
    expect(greenPolyline.latLngs[0]).toEqual([19.00, 72.85]);

    // Legend displays both Travelled Route and Remaining Route
    expect(screen.getByText(/Travelled Route/i)).toBeInTheDocument();
    expect(screen.getByText(/Remaining Route/i)).toBeInTheDocument();
  });

  it('Selected Fleet Camera: Automatically zooms to street level (zoom 16) on fleet selection', async () => {
    const { default: L } = await import('leaflet');
    const mapInstance = L.map({} as any);

    render(
      <RoadwaysMap
        vehicles={mockVehicles}
        activeTrips={mockTrips}
        geofences={[]}
        selectedVehicleId="v-test-1"
      />
    );

    // Should call map.flyTo with street-level zoom (16)
    expect(mapInstance.flyTo).toHaveBeenCalledWith(
      expect.anything(),
      16,
      expect.objectContaining({ duration: 0.8 })
    );

    // Fleet actions are available
    expect(screen.getByRole('button', { name: /Street Level/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fit Route/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recenter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Following/i })).toBeInTheDocument();
  });

  it('Selected Fleet Camera: Fit Route triggers fitBounds for the entire route', async () => {
    const { default: L } = await import('leaflet');
    const mapInstance = L.map({} as any);

    render(
      <RoadwaysMap
        vehicles={mockVehicles}
        activeTrips={mockTrips}
        geofences={[]}
        selectedVehicleId="v-test-1"
      />
    );

    const fitRouteBtn = screen.getByRole('button', { name: /Fit Route/i });
    act(() => {
      fireEvent.click(fitRouteBtn);
    });

    expect(mapInstance.fitBounds).toHaveBeenCalled();
    expect(useMapCameraStore.getState().focusType).toBe('ROUTE_OVERVIEW');
    expect(useMapCameraStore.getState().isFollowingFleet).toBe(false);
  });

  it('Selected Fleet Camera: Recenter preserves user current zoom', async () => {
    const { default: L } = await import('leaflet');
    const mapInstance = L.map({} as any);
    vi.mocked(mapInstance.getZoom).mockReturnValue(14); // User had zoomed to 14

    render(
      <RoadwaysMap
        vehicles={mockVehicles}
        activeTrips={mockTrips}
        geofences={[]}
        selectedVehicleId="v-test-1"
      />
    );

    const recenterBtn = screen.getByRole('button', { name: /Recenter/i });
    act(() => {
      fireEvent.click(recenterBtn);
    });

    // Should flyTo with user's current zoom (14)
    expect(mapInstance.flyTo).toHaveBeenCalledWith(
      expect.anything(),
      14,
      expect.objectContaining({ duration: 0.5 })
    );
    expect(useMapCameraStore.getState().isFollowingFleet).toBe(true);
  });

  it('Selected Fleet Camera: Smoothly pans on live GPS update without resetting zoom', async () => {
    const { default: L } = await import('leaflet');
    const mapInstance = L.map({} as any);
    vi.mocked(mapInstance.getZoom).mockReturnValue(15);

    const { rerender } = render(
      <RoadwaysMap
        vehicles={mockVehicles}
        activeTrips={mockTrips}
        geofences={[]}
        selectedVehicleId="v-test-1"
      />
    );

    // Initial select causes flyTo to 16
    expect(mapInstance.flyTo).toHaveBeenCalled();

    // Now a live GPS update arrives
    const updatedVehicles = [
      {
        ...mockVehicles[0],
        latest_gps: {
          ...mockVehicles[0].latest_gps!,
          lat: 19.105,
          lng: 72.885,
        },
      },
    ];

    rerender(
      <RoadwaysMap
        vehicles={updatedVehicles}
        activeTrips={mockTrips}
        geofences={[]}
        selectedVehicleId="v-test-1"
      />
    );

    // panTo should be called with animate true
    expect(mapInstance.panTo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ animate: true })
    );
  });

  it('enhances marker popup with LIVE DETAILS button and preserves Inspect Twin link', () => {
    bindPopupCalls.length = 0;
    const twinVehicle: Vehicle = {
      ...mockVehicles[0],
      id: 'v-twin-1',
      ...({ is_twin: true, twin_status: 'en_route' } as any),
    };

    render(
      <RoadwaysMap
        vehicles={[twinVehicle]}
        activeTrips={mockTrips}
        geofences={[]}
        selectedVehicleId="v-twin-1"
      />
    );

    expect(bindPopupCalls.length).toBeGreaterThan(0);
    const popupHtml = bindPopupCalls.find((h) => h.includes('LIVE DETAILS'));
    expect(popupHtml).toBeDefined();
    expect(popupHtml).toContain('data-action="live-details"');
    expect(popupHtml).toContain('data-vehicle-id="v-twin-1"');
    expect(popupHtml).toContain('Inspect Twin &rarr;');
  });

  it('triggers onOpenLiveDetails and custom event when live details action is invoked', () => {
    const handleOpenLiveDetails = vi.fn();
    const eventSpy = vi.fn();
    window.addEventListener('nexus:open-live-details', eventSpy);

    const { container } = render(
      <RoadwaysMap
        vehicles={mockVehicles}
        activeTrips={mockTrips}
        geofences={[]}
        onOpenLiveDetails={handleOpenLiveDetails}
      />
    );

    // Simulate clicking a popup button inside map container
    const mapContainer = screen.getByTestId('roadways-map-container');
    const button = document.createElement('button');
    button.setAttribute('data-action', 'live-details');
    button.setAttribute('data-vehicle-id', 'v-test-1');
    mapContainer.appendChild(button);

    fireEvent.click(button);

    expect(handleOpenLiveDetails).toHaveBeenCalledWith(mockVehicles[0]);
    expect(eventSpy).toHaveBeenCalled();

    window.removeEventListener('nexus:open-live-details', eventSpy);
  });
});
