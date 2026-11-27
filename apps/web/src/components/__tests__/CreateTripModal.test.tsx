import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { CreateTripModal } from '../CreateTripModal';
import { VehicleSidebar } from '../VehicleSidebar';
import { Vehicle, Driver, DispatchPreviewResponse } from '@nexus-ways/shared';

const mockPreviewDispatch = vi.fn();
const mockDispatchTrip = vi.fn();
const mockGetAvailableVehicles = vi.fn();
const mockGetEligibleDrivers = vi.fn();
const mockGetAvailability = vi.fn();

vi.mock('../../services/trips', () => ({
  tripsService: {
    previewDispatch: (...args: any[]) => mockPreviewDispatch(...args),
    dispatchTrip: (...args: any[]) => mockDispatchTrip(...args),
    getHistory: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../services/vehicles', () => ({
  vehiclesService: {
    getAvailableVehicles: (...args: any[]) => mockGetAvailableVehicles(...args),
    getResourceAvailability: (...args: any[]) => mockGetAvailability(...args),
    archiveVehicle: vi.fn(),
    retireVehicle: vi.fn(),
  },
}));

vi.mock('../../services/drivers', () => ({
  driversService: {
    getEligibleDrivers: (...args: any[]) => mockGetEligibleDrivers(...args),
  },
}));

vi.mock('../../features/fleet-twin', () => ({
  fleetTwinApi: {
    getStatus: vi.fn().mockResolvedValue({ enabled: false }),
  },
}));

const sampleVehicles: Vehicle[] = [
  {
    id: 'veh-idle-1',
    org_id: 'org-1',
    registration_number: 'TN-38-FF-2345',
    vehicle_type: 'Heavy Truck',
    status: 'idle',
    capacity_kg: 18000,
    created_at: new Date().toISOString(),
  },
];

const sampleDrivers: Driver[] = [
  {
    id: 'drv-avail-1',
    org_id: 'org-1',
    user_id: 'u-1',
    license_number: 'TN3820200012345',
    phone: '+91 98765 43210',
    status: 'available',
    created_at: new Date().toISOString(),
    user: { id: 'u-1', full_name: 'Karthik Rajan', email: 'karthik@nexus.in' },
  },
];

const samplePreview: DispatchPreviewResponse = {
  originLabel: 'Chennai, Tamil Nadu',
  destinationLabel: 'Bengaluru, Karnataka',
  originCoords: { lat: 13.0827, lng: 80.2707 },
  destinationCoords: { lat: 12.9716, lng: 77.5946 },
  distanceKm: 346,
  durationMinutes: 360,
  plannedEtaIso: new Date(Date.now() + 360 * 60000).toISOString(),
  predictedEtaIso: new Date(Date.now() + 375 * 60000).toISOString(),
  tollEstimateInr: 1450,
  riskScore: 20,
  weatherSummary: 'Clear',
  trafficSummary: 'Moderate',
  routeGeometry: {
    routing_source: 'osrm',
    coordinates: [
      [80.2707, 13.0827],
      [79.1325, 12.9165],
      [77.5946, 12.9716],
    ],
    distance_km: 346,
    duration_minutes: 360,
  },
  recommendedCheckpoints: [
    {
      id: 'cp-1',
      label: 'Sriperumbudur Toll Plaza',
      type: 'toll_plaza',
      lat: 12.96,
      lng: 79.94,
      distanceFromPrevKm: 42,
      cumulativeDistanceKm: 42,
      plannedArrivalIso: new Date(Date.now() + 45 * 60000).toISOString(),
      reason: 'FASTag toll corridor checkpoint',
    },
    {
      id: 'cp-2',
      label: 'Krishnagiri Highway Fuel Hub',
      type: 'fuel_station',
      lat: 12.52,
      lng: 78.21,
      distanceFromPrevKm: 168,
      cumulativeDistanceKm: 210,
      plannedArrivalIso: new Date(Date.now() + 220 * 60000).toISOString(),
      reason: 'Refueling & DEF inspection interval',
    },
  ],
  validationErrors: [],
};

describe('CreateTripModal 3-Step Dispatch Wizard & VehicleSidebar Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreviewDispatch.mockResolvedValue(samplePreview);
    mockGetAvailableVehicles.mockResolvedValue([
      { ...sampleVehicles[0], eligible: true },
    ]);
    mockGetEligibleDrivers.mockResolvedValue([
      { ...sampleDrivers[0], eligible: true },
    ]);
    mockGetAvailability.mockResolvedValue({
      totalVehicles: 1,
      availableVehicles: 1,
      onTripVehicles: 0,
      maintenanceVehicles: 0,
      archivedVehicles: 0,
      retiredVehicles: 0,
      totalDrivers: 1,
      availableDrivers: 1,
      onTripDrivers: 0,
      offDutyDrivers: 0,
    });
    mockDispatchTrip.mockResolvedValue({
      id: 'trip-dispatched-1',
      org_id: 'org-1',
      vehicle_id: 'veh-idle-1',
      driver_id: 'drv-avail-1',
      origin_label: 'Chennai',
      destination_label: 'Bengaluru',
      status: 'in_transit',
      distance_km: 346,
      eta_minutes: 360,
      created_at: new Date().toISOString(),
    });
  });

  it('completes the 3-step Dispatch Wizard flow and submits dispatchTrip', async () => {
    const onTripCreated = vi.fn();
    const onClose = vi.fn();

    render(
      <CreateTripModal
        isOpen={true}
        onClose={onClose}
        vehicles={sampleVehicles}
        drivers={sampleDrivers}
        onTripCreated={onTripCreated}
      />,
    );

    // Step 1: Fill origin & destination
    const originInput = screen.getByPlaceholderText(/Chennai/i);
    const destInput = screen.getByPlaceholderText(/Bengaluru/i);
    fireEvent.change(originInput, { target: { value: 'Chennai' } });
    fireEvent.change(destInput, { target: { value: 'Bengaluru' } });

    const nextBtn = screen.getByRole('button', { name: /Calculate Route & Checkpoints/i });
    fireEvent.click(nextBtn);

    // Step 2: Wait for previewDispatch results
    await waitFor(() => {
      expect(mockPreviewDispatch).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Sriperumbudur Toll Plaza/i)).toBeDefined();
    });

    const step3Btn = screen.getByRole('button', { name: /Select Vehicle & Driver/i });
    fireEvent.click(step3Btn);

    // Step 3: Wait for eligible vehicles & drivers and submit
    await waitFor(() => {
      expect(screen.getAllByText(/TN-38-FF-2345/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Karthik Rajan/i).length).toBeGreaterThan(0);
    });

    const dispatchSubmitBtn = screen.getByRole('button', { name: /Confirm & Dispatch Fleet/i });
    fireEvent.click(dispatchSubmitBtn);

    await waitFor(() => {
      expect(mockDispatchTrip).toHaveBeenCalledTimes(1);
      expect(onTripCreated).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('renders Dispatch Fleet and Trip History buttons in VehicleSidebar for managers', () => {
    const onOpenDispatch = vi.fn();
    render(
      <BrowserRouter>
        <VehicleSidebar
          vehicles={sampleVehicles}
          drivers={sampleDrivers}
          selectedVehicleId={null}
          onSelectVehicle={vi.fn()}
          onVehicleCreated={vi.fn()}
          onCreateTrip={vi.fn()}
          onOpenDispatch={onOpenDispatch}
          currentUserRole="manager"
        />
      </BrowserRouter>,
    );

    const dispatchBtn = screen.getByTestId('dispatch-fleet-button');
    const historyBtn = screen.getByTestId('trip-history-button');
    const deleteBtn = screen.getByTestId('delete-vehicle-button');
    expect(dispatchBtn).toBeDefined();
    expect(historyBtn).toBeDefined();
    expect(deleteBtn).toBeDefined();

    fireEvent.click(dispatchBtn);
    expect(onOpenDispatch).toHaveBeenCalledTimes(1);
  });
});
