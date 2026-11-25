import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VehicleSidebar } from '../VehicleSidebar';
import { Vehicle, Driver } from '@nexus-ways/shared';
import { BrowserRouter } from 'react-router-dom';

vi.mock('../../features/fleet-twin', () => ({
  fleetTwinApi: {
    getStatus: vi.fn().mockResolvedValue({ enabled: false }),
  },
}));

describe('VehicleSidebar - Fleet Registry Header Alignment and UI Refinement', () => {
  const mockVehicles: Vehicle[] = [
    {
      id: 'v-side-1',
      org_id: 'org-test',
      registration_number: 'MH-12-REG-101',
      vehicle_type: 'Heavy Truck',
      status: 'active',
      latest_gps: {
        id: 'gps-1',
        trip_id: 'trip-1',
        vehicle_id: 'v-side-1',
        lat: 19.1,
        lng: 72.8,
        speed_kmh: 45,
        recorded_at: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    },
    {
      id: 'v-side-2',
      org_id: 'org-test',
      registration_number: 'MH-12-REG-102',
      vehicle_type: '20ft_container',
      status: 'idle',
      created_at: new Date().toISOString(),
    },
  ];

  const mockDrivers: Driver[] = [
    {
      id: 'd-1',
      org_id: 'org-test',
      user_id: 'u-1',
      license_number: 'DL-IND-001',
      phone: '+91 98765 00000',
      status: 'available',
      created_at: new Date().toISOString(),
      user: {
        id: 'u-1',
        full_name: 'Amit Sharma',
        email: 'amit@example.com',
      },
    },
  ];

  it('renders the first row with Fleet icon, Fleet Registry heading, and unit count badge', () => {
    render(
      <BrowserRouter>
        <VehicleSidebar
          vehicles={mockVehicles}
          drivers={mockDrivers}
          selectedVehicleId={null}
          onSelectVehicle={vi.fn()}
          onVehicleCreated={vi.fn()}
          onCreateTrip={vi.fn()}
          currentUserRole="manager"
        />
      </BrowserRouter>,
    );

    // Fleet Registry Title
    const title = screen.getByText('Fleet Registry');
    expect(title).toBeDefined();
    expect(title.className).toContain('whitespace-nowrap');

    // Units count badge
    expect(screen.getByText('2 Units')).toBeDefined();
  });

  it('renders the second row with Add Driver and Add Vehicle action buttons in a balanced grid', () => {
    render(
      <BrowserRouter>
        <VehicleSidebar
          vehicles={mockVehicles}
          drivers={mockDrivers}
          selectedVehicleId={null}
          onSelectVehicle={vi.fn()}
          onVehicleCreated={vi.fn()}
          onCreateTrip={vi.fn()}
          currentUserRole="manager"
        />
      </BrowserRouter>,
    );

    const addDriverBtn = screen.getByTestId('add-driver-button');
    const addVehicleBtn = screen.getByTestId('add-vehicle-button');

    expect(addDriverBtn).toBeDefined();
    expect(addVehicleBtn).toBeDefined();

    // Verify button text
    expect(screen.getByText('Add Driver')).toBeDefined();
    expect(screen.getByText('Add Vehicle')).toBeDefined();

    // Verify both buttons have matching height class (h-8) and equal width
    expect(addDriverBtn.className).toContain('h-8');
    expect(addVehicleBtn.className).toContain('h-8');
    expect(addDriverBtn.className).toContain('w-full');
    expect(addVehicleBtn.className).toContain('w-full');
  });

  it('opens Add Driver modal when Add Driver button is clicked', () => {
    render(
      <BrowserRouter>
        <VehicleSidebar
          vehicles={mockVehicles}
          drivers={mockDrivers}
          selectedVehicleId={null}
          onSelectVehicle={vi.fn()}
          onVehicleCreated={vi.fn()}
          onCreateTrip={vi.fn()}
          currentUserRole="manager"
        />
      </BrowserRouter>,
    );

    const addDriverBtn = screen.getByTestId('add-driver-button');
    fireEvent.click(addDriverBtn);

    // Modal opens showing "Register Fleet Driver"
    expect(screen.getByText('Register Fleet Driver')).toBeDefined();
  });

  it('opens Add Vehicle modal when Add Vehicle button is clicked', () => {
    render(
      <BrowserRouter>
        <VehicleSidebar
          vehicles={mockVehicles}
          drivers={mockDrivers}
          selectedVehicleId={null}
          onSelectVehicle={vi.fn()}
          onVehicleCreated={vi.fn()}
          onCreateTrip={vi.fn()}
          currentUserRole="manager"
        />
      </BrowserRouter>,
    );

    const addVehicleBtn = screen.getByTestId('add-vehicle-button');
    fireEvent.click(addVehicleBtn);

    // Modal opens showing "Add Vehicle to Fleet"
    expect(screen.getByText('Add Vehicle to Fleet')).toBeDefined();
  });

  it('does not display manager action buttons when user role is not manager', () => {
    render(
      <BrowserRouter>
        <VehicleSidebar
          vehicles={mockVehicles}
          drivers={mockDrivers}
          selectedVehicleId={null}
          onSelectVehicle={vi.fn()}
          onVehicleCreated={vi.fn()}
          onCreateTrip={vi.fn()}
          currentUserRole="driver"
        />
      </BrowserRouter>,
    );

    expect(screen.queryByTestId('add-driver-button')).toBeNull();
    expect(screen.queryByTestId('add-vehicle-button')).toBeNull();
    expect(screen.getByText('Fleet Registry')).toBeDefined();
  });
});
