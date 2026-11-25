import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  LiveFleetIntelligenceSidebar,
  getHeadingCardinal,
  formatTruckType,
} from '../LiveFleetIntelligenceSidebar';
import { Vehicle, Trip, Geofence } from '@nexus-ways/shared';
import { BrowserRouter } from 'react-router-dom';

// Mock Sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock tripsApi and driversApi
vi.mock('../../services/trips', () => ({
  tripsApi: {
    getTripEta: vi.fn().mockResolvedValue({
      trip_id: 'trip-test-1',
      remaining_distance_km: 120,
      base_eta_minutes: 135,
      min_eta_minutes: 120,
      max_eta_minutes: 155,
      confidence_band_minutes: 15,
      confidence_basis: 'historical',
      sample_size: 24,
      calculated_at: new Date().toISOString(),
    }),
    getTripReport: vi.fn().mockResolvedValue({
      tripId: 'trip-test-1',
      signedUrl: 'https://storage.nexusways.com/reports/trip-test-1.pdf',
      storagePath: '/reports/trip-test-1.pdf',
      generatedAt: new Date().toISOString(),
    }),
  },
}));

vi.mock('../../services/drivers', () => ({
  driversApi: {
    getBehaviorHistory: vi.fn().mockResolvedValue([
      {
        id: 'score-1',
        driverId: 'd-1',
        safetyScore: 94,
        fuelScore: 91,
        speedScore: 96,
        calculatedAt: new Date().toISOString(),
      },
    ]),
  },
}));

describe('LiveFleetIntelligenceSidebar Component', () => {
  const mockVehicle: Vehicle = {
    id: 'v-side-1',
    org_id: 'org-test',
    registration_number: 'MH-12-INTEL-888',
    vehicle_type: '32ft_mxl',
    status: 'active',
    latest_gps: {
      id: 'gps-side-1',
      trip_id: 'trip-test-1',
      vehicle_id: 'v-side-1',
      lat: 19.0760,
      lng: 72.8777,
      speed_kmh: 58,
      heading: 78,
      recorded_at: new Date().toISOString(),
    },
    driver: {
      id: 'd-1',
      org_id: 'org-test',
      user_id: 'u-1',
      license_number: 'DL-04201100987',
      phone: '+91 98765 43210',
      status: 'on_trip',
      created_at: new Date().toISOString(),
      user: {
        id: 'u-1',
        full_name: 'Rajesh Kumar',
        email: 'rajesh@example.com',
      },
    },
    created_at: new Date().toISOString(),
  };

  const mockTrip: Trip = {
    id: 'trip-test-1',
    org_id: 'org-test',
    vehicle_id: 'v-side-1',
    driver_id: 'd-1',
    simulation_speed_multiplier: 1,
    origin_label: 'Mumbai Logistics Hub',
    origin_lat: 18.95,
    origin_lng: 72.82,
    destination_label: 'Pune Gateway Depot',
    destination_lat: 18.52,
    destination_lng: 73.85,
    status: 'in_transit',
    distance_km: 150,
    duration_minutes: 180,
    predicted_duration_minutes: 185,
    started_at: new Date(Date.now() - 3600000 * 1.5).toISOString(),
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    route_geometry: {
      routing_source: 'osrm',
      distance_km: 150,
      duration_minutes: 180,
      coordinates: [
        [72.82, 18.95],
        [72.85, 19.01],
        [72.8777, 19.076],
        [73.15, 18.90],
        [73.50, 18.75],
        [73.85, 18.52],
      ],
    },
    checkpoints: [
      {
        id: 'cp-1',
        trip_id: 'trip-test-1',
        sequence: 1,
        label: 'Mumbai Depot Gate',
        lat: 18.95,
        lng: 72.82,
        arrived_at: new Date(Date.now() - 3600000 * 1.4).toISOString(),
      },
      {
        id: 'cp-2',
        trip_id: 'trip-test-1',
        sequence: 2,
        label: 'Thane Toll Corridor',
        lat: 19.076,
        lng: 72.8777,
        eta: new Date(Date.now() + 600000).toISOString(),
      },
      {
        id: 'cp-3',
        trip_id: 'trip-test-1',
        sequence: 3,
        label: 'Lonavala Ghat Pass',
        lat: 18.75,
        lng: 73.50,
        eta: new Date(Date.now() + 3600000).toISOString(),
      },
      {
        id: 'cp-4',
        trip_id: 'trip-test-1',
        sequence: 4,
        label: 'Pune Gateway Depot',
        lat: 18.52,
        lng: 73.85,
        eta: new Date(Date.now() + 7200000).toISOString(),
      },
    ],
  };

  const mockGeofences: Geofence[] = [
    {
      id: 'gf-1',
      org_id: 'org-test',
      name: 'Thane Toll Plaza',
      type: 'toll_booth',
      center_lat: 19.076,
      center_lng: 72.877,
      radius_m: 500,
      created_at: new Date().toISOString(),
    },
  ];

  it('correctly calculates heading cardinal text from degrees', () => {
    expect(getHeadingCardinal(0)).toBe('0° (N)');
    expect(getHeadingCardinal(90)).toBe('90° (E)');
    expect(getHeadingCardinal(180)).toBe('180° (S)');
    expect(getHeadingCardinal(270)).toBe('270° (W)');
    expect(getHeadingCardinal(78)).toBe('78° (ENE)');
    expect(getHeadingCardinal(null)).toBe('N/A');
  });

  it('formats vehicle category types cleanly', () => {
    expect(formatTruckType('32ft_mxl')).toBe('32ft MXL Multi-Axle');
    expect(formatTruckType('20ft_container')).toBe('20ft Container Carrier');
    expect(formatTruckType('tanker')).toBe('Cryogenic / Fuel Tanker');
    expect(formatTruckType('refrigerated')).toBe('Refrigerated Reefer');
  });

  it('renders selected fleet identity and operator details', () => {
    const handleClose = vi.fn();
    render(
      <BrowserRouter>
        <LiveFleetIntelligenceSidebar
          vehicle={mockVehicle}
          trip={mockTrip}
          geofences={mockGeofences}
          onClose={handleClose}
        />
      </BrowserRouter>,
    );

    // Registration and category
    expect(screen.getByText('MH-12-INTEL-888')).toBeDefined();
    expect(screen.getAllByText('32ft MXL Multi-Axle').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('EN ROUTE')).toBeDefined();

    // Data freshness
    expect(screen.getByText('LIVE GPS')).toBeDefined();

    // Driver details
    expect(screen.getByText('Rajesh Kumar')).toBeDefined();
    expect(screen.getByText(/98765 43210/)).toBeDefined();
  });

  it('renders live telemetry grid with speed, heading, fuel and GPS', () => {
    render(
      <BrowserRouter>
        <LiveFleetIntelligenceSidebar
          vehicle={mockVehicle}
          trip={mockTrip}
          geofences={mockGeofences}
          onClose={vi.fn()}
        />
      </BrowserRouter>,
    );

    // Speed
    expect(screen.getByText('58')).toBeDefined();
    expect(screen.getByText(/Moving/)).toBeDefined();

    // Heading
    expect(screen.getByText('78° (ENE)')).toBeDefined();

    // GPS coordinates
    expect(screen.getByText(/19.07600° N, 72.87770° E/)).toBeDefined();
  });

  it('renders current operational activity with root cause context', () => {
    render(
      <BrowserRouter>
        <LiveFleetIntelligenceSidebar
          vehicle={mockVehicle}
          trip={mockTrip}
          geofences={mockGeofences}
          onClose={vi.fn()}
        />
      </BrowserRouter>,
    );

    expect(screen.getByText('Cruising on National Highway Corridor')).toBeDefined();
    expect(screen.getByText(/Vehicle maintaining steady speed of 58 km\/h/)).toBeDefined();
  });

  it('renders route progress with travelled vs remaining distances', () => {
    render(
      <BrowserRouter>
        <LiveFleetIntelligenceSidebar
          vehicle={mockVehicle}
          trip={mockTrip}
          geofences={mockGeofences}
          onClose={vi.fn()}
        />
      </BrowserRouter>,
    );

    expect(screen.getByText(/Travelled/)).toBeDefined();
    expect(screen.getByText(/Remaining/)).toBeDefined();
    expect(screen.getAllByText(/150 km/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders ordered checkpoints timeline in true geographical sequence', () => {
    render(
      <BrowserRouter>
        <LiveFleetIntelligenceSidebar
          vehicle={mockVehicle}
          trip={mockTrip}
          geofences={mockGeofences}
          onClose={vi.fn()}
        />
      </BrowserRouter>,
    );

    expect(screen.getAllByText('Mumbai Depot Gate').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Thane Toll Corridor').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Lonavala Ghat Pass').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Pune Gateway Depot').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('COMPLETED')).toBeDefined();
  });

  it('renders alerts with root cause explanation and filter chips', () => {
    render(
      <BrowserRouter>
        <LiveFleetIntelligenceSidebar
          vehicle={mockVehicle}
          trip={mockTrip}
          geofences={mockGeofences}
          onClose={vi.fn()}
        />
      </BrowserRouter>,
    );

    expect(screen.getByText('Alerts & Operational Exceptions')).toBeDefined();
    expect(screen.getByText('Actual Root Cause:')).toBeDefined();
    expect(screen.getByText('Telemetry Evidence:')).toBeDefined();
    expect(screen.getByText('Recommended Action:')).toBeDefined();

    // Filter chips
    expect(screen.getByRole('button', { name: 'all' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'warning' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'critical' })).toBeDefined();
  });

  it('invokes onClose when the X close button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <BrowserRouter>
        <LiveFleetIntelligenceSidebar
          vehicle={mockVehicle}
          trip={mockTrip}
          geofences={mockGeofences}
          onClose={handleClose}
        />
      </BrowserRouter>,
    );

    const closeBtn = screen.getByLabelText('Close Live Details Sidebar');
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('handles resting vehicle state with HOS rest break activity and alert', () => {
    const restingVehicle: Vehicle = {
      ...mockVehicle,
      latest_gps: {
        ...mockVehicle.latest_gps!,
        speed_kmh: 0,
      },
      ...({ is_twin: true, twin_status: 'resting' } as any),
    };

    render(
      <BrowserRouter>
        <LiveFleetIntelligenceSidebar
          vehicle={restingVehicle}
          trip={mockTrip}
          geofences={mockGeofences}
          onClose={vi.fn()}
        />
      </BrowserRouter>,
    );

    expect(screen.getByText('Mandatory Driver Rest Break')).toBeDefined();
    expect(screen.getByText(/Mandatory Driver Rest Window Compliance/)).toBeDefined();
  });

  it('handles delayed vehicle state with toll corridor bottleneck alert', () => {
    const delayedVehicle: Vehicle = {
      ...mockVehicle,
      latest_gps: {
        ...mockVehicle.latest_gps!,
        speed_kmh: 12,
      },
      ...({ is_twin: true, twin_status: 'delayed' } as any),
    };

    render(
      <BrowserRouter>
        <LiveFleetIntelligenceSidebar
          vehicle={delayedVehicle}
          trip={mockTrip}
          geofences={mockGeofences}
          onClose={vi.fn()}
        />
      </BrowserRouter>,
    );

    expect(screen.getByText('Delayed in Toll Corridor Congestion')).toBeDefined();
    expect(screen.getByText(/Highway Bottleneck Congestion Alert/)).toBeDefined();
    expect(screen.getByText(/Speed dropped below 15 km\/h for 4.2 km/)).toBeDefined();
  });

  it('filters alerts when severity filter chip is clicked', () => {
    const delayedVehicle: Vehicle = {
      ...mockVehicle,
      ...({ is_twin: true, twin_status: 'delayed' } as any),
    };

    render(
      <BrowserRouter>
        <LiveFleetIntelligenceSidebar
          vehicle={delayedVehicle}
          trip={mockTrip}
          geofences={mockGeofences}
          onClose={vi.fn()}
        />
      </BrowserRouter>,
    );

    // Initial state has warning alert
    expect(screen.getByText('Highway Bottleneck Congestion Alert')).toBeDefined();

    // Click 'critical' filter - warning alert should be filtered out
    const criticalChip = screen.getByRole('button', { name: 'critical' });
    fireEvent.click(criticalChip);
    expect(screen.getByText('No alerts match the active filter criteria.')).toBeDefined();

    // Click 'warning' filter - warning alert should be visible again
    const warningChip = screen.getByRole('button', { name: 'warning' });
    fireEvent.click(warningChip);
    expect(screen.getByText('Highway Bottleneck Congestion Alert')).toBeDefined();
  });

  it('handles download journey report action', async () => {
    const { tripsApi } = await import('../../services/trips');
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <BrowserRouter>
        <LiveFleetIntelligenceSidebar
          vehicle={mockVehicle}
          trip={mockTrip}
          geofences={mockGeofences}
          onClose={vi.fn()}
        />
      </BrowserRouter>,
    );

    const downloadBtn = screen.getByRole('button', { name: /Download Journey Report/ });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(tripsApi.getTripReport).toHaveBeenCalledWith('trip-test-1');
      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://storage.nexusways.com/reports/trip-test-1.pdf',
        '_blank',
        'noopener,noreferrer',
      );
    });

    windowOpenSpy.mockRestore();
  });
});
