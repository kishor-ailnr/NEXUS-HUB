import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserLocationBadge } from '../UserLocationBadge';
import { useUserLocationStore } from '../../store/userLocationStore';

describe('<UserLocationBadge />', () => {
  beforeEach(() => {
    useUserLocationStore.getState().clearLocation();
  });

  it('renders "Location not yet available" with data-testid="location-placeholder" when idle', () => {
    useUserLocationStore.setState({ status: 'idle' });

    render(
      <MemoryRouter>
        <UserLocationBadge />
      </MemoryRouter>,
    );

    const badge = screen.getByTestId('location-placeholder');
    expect(badge).toHaveTextContent('Location not yet available');
  });

  it('renders "Detecting location..." when state is detecting', () => {
    useUserLocationStore.setState({ status: 'detecting' });

    render(
      <MemoryRouter>
        <UserLocationBadge />
      </MemoryRouter>,
    );

    const badge = screen.getByTestId('location-placeholder');
    expect(badge).toHaveTextContent('Detecting location...');
  });

  it('renders readable location like "Coimbatore, Tamil Nadu" when detected', () => {
    useUserLocationStore.setState({
      status: 'detected',
      coordinates: { latitude: 11.0168, longitude: 76.9558, accuracy: 20, timestamp: 1 },
      address: { formatted: 'Coimbatore, Tamil Nadu', city: 'Coimbatore', state: 'Tamil Nadu' },
    });

    render(
      <MemoryRouter>
        <UserLocationBadge />
      </MemoryRouter>,
    );

    const badge = screen.getByTestId('location-placeholder');
    expect(badge).toHaveTextContent('Coimbatore, Tamil Nadu');
  });

  it('renders "Location permission denied" when user denied permission', () => {
    useUserLocationStore.setState({ status: 'permission_denied' });

    render(
      <MemoryRouter>
        <UserLocationBadge />
      </MemoryRouter>,
    );

    const badge = screen.getByTestId('location-placeholder');
    expect(badge).toHaveTextContent('Location permission denied');
  });

  it('renders "Location unavailable" when location services are unavailable', () => {
    useUserLocationStore.setState({ status: 'unavailable' });

    render(
      <MemoryRouter>
        <UserLocationBadge />
      </MemoryRouter>,
    );

    const badge = screen.getByTestId('location-placeholder');
    expect(badge).toHaveTextContent('Location unavailable');
  });

  it('renders "Location accuracy low" when GPS accuracy is low', () => {
    useUserLocationStore.setState({
      status: 'accuracy_low',
      coordinates: { latitude: 19.076, longitude: 72.8777, accuracy: 9000, timestamp: 1 },
      address: { formatted: 'Mumbai, Maharashtra' },
    });

    render(
      <MemoryRouter>
        <UserLocationBadge />
      </MemoryRouter>,
    );

    const badge = screen.getByTestId('location-placeholder');
    expect(badge).toHaveTextContent('Mumbai, Maharashtra');
    expect(badge).toHaveTextContent('±9km');
  });

  it('renders coordinates when geocoding fails', () => {
    useUserLocationStore.setState({
      status: 'geocoding_failed',
      coordinates: { latitude: 11.017, longitude: 76.956, accuracy: 30, timestamp: 1 },
      address: null,
    });

    render(
      <MemoryRouter>
        <UserLocationBadge />
      </MemoryRouter>,
    );

    const badge = screen.getByTestId('location-placeholder');
    expect(badge).toHaveTextContent('11.017°, 76.956°');
  });

  it('triggers focus map when clicking on detected location badge', () => {
    useUserLocationStore.setState({
      status: 'detected',
      coordinates: { latitude: 11.0168, longitude: 76.9558, accuracy: 20, timestamp: 1 },
      address: { formatted: 'Coimbatore, Tamil Nadu' },
    });

    const triggerSpy = vi.spyOn(useUserLocationStore.getState(), 'triggerFocusMap');

    render(
      <MemoryRouter initialEntries={['/roadways/dashboard']}>
        <UserLocationBadge />
      </MemoryRouter>,
    );

    const badge = screen.getByTestId('location-placeholder');
    fireEvent.click(badge);

    expect(triggerSpy).toHaveBeenCalled();
  });

  it('opens permission modal when clicking badge while permission is denied', () => {
    useUserLocationStore.setState({ status: 'permission_denied' });
    const modalSpy = vi.spyOn(useUserLocationStore.getState(), 'setPermissionModalOpen');

    render(
      <MemoryRouter>
        <UserLocationBadge />
      </MemoryRouter>,
    );

    const badge = screen.getByTestId('location-placeholder');
    fireEvent.click(badge);

    expect(modalSpy).toHaveBeenCalledWith(true);
  });
});

