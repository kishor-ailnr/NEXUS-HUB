import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FleetMapView } from '../components/FleetMapView';
import { ProtectedRoute } from '../../../components/ProtectedRoute';
import { Login } from '../../../pages/Login';
import { useAuthStore } from '../../../store/authStore';

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
}

vi.mock('leaflet', () => {
  const polyline = () => ({ addTo: () => polyline(), on: () => polyline(), bindPopup: () => polyline() });
  const marker = () => ({ addTo: () => marker(), on: () => marker(), bindPopup: () => marker() });
  const mapObj = {
    setView: () => mapObj,
    fitBounds: () => mapObj,
    invalidateSize: () => mapObj,
    remove: () => {},
    zoomIn: () => {},
    zoomOut: () => {},
  };
  return {
    default: {
      map: () => mapObj,
      tileLayer: () => ({ addTo: () => ({ on: () => {} }) }),
      layerGroup: () => ({ addTo: () => ({ clearLayers: () => {} }), clearLayers: () => {} }),
      latLngBounds: () => ({ extend: () => {}, isValid: () => false }),
      polyline,
      marker,
      divIcon: () => ({}),
    },
  };
});

describe('Digital Twin FleetMapView & RBAC Route Protection', () => {
  const vehicle: any = {
    id: 'veh-1',
    registration_number: 'TN-38-FF-2345',
    current_lat: 12.9165,
    current_lng: 79.1325,
    speed_kmh: 62,
    progress_pct: 45,
  };

  const route: any = {
    id: 'route-1',
    name: 'Chennai -> Bengaluru',
    corridor: 'NH 48 Primary Expressway',
    total_distance_km: 346,
    osrm_geometry: {
      coordinates: [
        [80.2707, 13.0827],
        [79.1325, 12.9165],
        [77.5946, 12.9716],
      ],
    },
  };

  const reroute: any = {
    id: 'rr-1',
    recommended_route_name: 'NH 75 Northern Freight Corridor',
    time_saved_minutes: 28,
    new_eta: new Date(Date.now() + 180 * 60000).toISOString(),
    original_metrics: {
      remaining_distance_km: 190,
      predicted_travel_time_minutes: 210,
      expected_eta: new Date(Date.now() + 210 * 60000).toISOString(),
      traffic_delay_minutes: 32,
    },
    alternate_metrics: {
      remaining_distance_km: 185,
      predicted_travel_time_minutes: 182,
      expected_eta: new Date(Date.now() + 182 * 60000).toISOString(),
    },
    alternate_waypoints: [
      [12.9165, 79.1325],
      [13.2172, 79.1003],
      [12.9716, 77.5946],
    ],
    alternate_candidates: [
      {
        id: 'cand-1',
        name: 'NH 75 Northern Freight Corridor',
        distance_km: 185,
        duration_minutes: 182,
        toll_cost_inr: 420,
        fuel_cost_inr: 5180,
        risk_score: 18,
        is_recommended: true,
        waypoints: [
          [12.9165, 79.1325],
          [12.9716, 77.5946],
        ],
      },
      {
        id: 'cand-2',
        name: 'NE 5 Expressway Bypass',
        distance_km: 198,
        duration_minutes: 195,
        toll_cost_inr: 650,
        fuel_cost_inr: 5400,
        risk_score: 15,
        is_recommended: false,
        waypoints: [
          [12.9165, 79.1325],
          [12.9716, 77.5946],
        ],
      },
    ],
  };

  it('shows active BLUE and one recommended GREEN route by default, hides extra options until expanded, and supports X close & Accept', () => {
    const onCloseAlternative = vi.fn();
    const onAcceptAlternative = vi.fn();

    render(
      <FleetMapView
        vehicle={vehicle}
        route={route}
        checkpoints={[]}
        previewReroute={reroute}
        canAuthorizeReroute={true}
        onCloseAlternative={onCloseAlternative}
        onAcceptAlternative={onAcceptAlternative}
      />,
    );

    expect(screen.getAllByText('NH 48 Primary Expressway').length).toBeGreaterThan(0);
    expect(screen.getByText('NH 75 Northern Freight Corridor')).toBeDefined();
    expect(screen.queryByText('NE 5 Expressway Bypass')).toBeNull();

    fireEvent.click(screen.getByText(/Show More Options/i));
    expect(screen.getByText('NE 5 Expressway Bypass')).toBeDefined();

    fireEvent.click(screen.getByTestId('close-alternate-route-btn'));
    expect(onCloseAlternative).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Accept Route'));
    expect(onAcceptAlternative).toHaveBeenCalledWith('rr-1', 'cand-1');
  });

  it('ProtectedRoute redirects driver away from admin-only Digital Twin routes', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: 'drv-u1',
        email: 'driver@nexus.in',
        fullName: 'Driver One',
        role: 'driver',
        orgId: 'org-1',
        organization: {
          id: 'org-1',
          name: 'NEXUS Org',
          mode: 'roadways',
          country: 'India',
          state: 'TN',
          district: 'Chennai',
          address: 'Hub',
        },
      },
    });

    render(
      <MemoryRouter initialEntries={['/roadways/fleet-twin']}>
        <Routes>
          <Route
            path="/roadways/fleet-twin"
            element={
              <ProtectedRoute allowedRoles={['manager', 'operator']}>
                <div>Admin Twin Console</div>
              </ProtectedRoute>
            }
          />
          <Route path="/roadways/dashboard" element={<div>Driver Dashboard Redirect</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Admin Twin Console')).toBeNull();
    expect(screen.getByText('Driver Dashboard Redirect')).toBeDefined();
  });

  it('Login page renders explicit ADMIN and DRIVER role selection buttons', () => {
    useAuthStore.setState({ isAuthenticated: false, isLoading: false, user: null });
    render(
      <MemoryRouter initialEntries={['/roadways/login']}>
        <Routes>
          <Route path="/:mode/login" element={<Login />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('role-select-admin')).toBeDefined();
    expect(screen.getByTestId('role-select-driver')).toBeDefined();
  });
});
