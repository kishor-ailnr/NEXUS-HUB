import { describe, it, expect, beforeEach } from 'vitest';
import { useMapCameraStore } from '../mapCameraStore';

describe('useMapCameraStore', () => {
  beforeEach(() => {
    useMapCameraStore.getState().resetCameraState();
  });

  it('initializes with ROUTE_OVERVIEW, null fleet, isFollowingFleet false, and isUserLocationVisible false', () => {
    const state = useMapCameraStore.getState();
    expect(state.focusType).toBe('ROUTE_OVERVIEW');
    expect(state.selectedFleetId).toBeNull();
    expect(state.isFollowingFleet).toBe(false);
    expect(state.isUserLocationVisible).toBe(false);
    expect(state.activeMapSelection).toEqual({ type: 'NONE' });
    expect(state.userFocusTrigger).toBe(0);
    expect(state.fleetFocusTrigger).toBe(0);
  });

  it('transitions to SELECTED_FLEET and hides user location when focusOnFleet is called', () => {
    useMapCameraStore.getState().focusOnFleet('truck-101');
    const state = useMapCameraStore.getState();
    expect(state.focusType).toBe('SELECTED_FLEET');
    expect(state.selectedFleetId).toBe('truck-101');
    expect(state.isFollowingFleet).toBe(true);
    expect(state.isUserLocationVisible).toBe(false);
    expect(state.activeMapSelection).toEqual({ type: 'SELECTED_FLEET', fleetId: 'truck-101' });
    expect(state.fleetFocusTrigger).toBe(1);
  });

  it('transitions to USER_LOCATION and makes user location visible when focusOnUser is called', () => {
    // Select fleet first
    useMapCameraStore.getState().focusOnFleet('truck-101');
    expect(useMapCameraStore.getState().focusType).toBe('SELECTED_FLEET');
    expect(useMapCameraStore.getState().isUserLocationVisible).toBe(false);

    // Switch to user location
    useMapCameraStore.getState().focusOnUser();
    const state = useMapCameraStore.getState();
    expect(state.focusType).toBe('USER_LOCATION');
    expect(state.isFollowingFleet).toBe(false);
    expect(state.isUserLocationVisible).toBe(true);
    expect(state.activeMapSelection).toEqual({ type: 'USER_LOCATION' });
    expect(state.userFocusTrigger).toBe(1);
  });

  it('hides user location immediately when selecting a fleet after viewing user location', () => {
    useMapCameraStore.getState().focusOnUser();
    expect(useMapCameraStore.getState().isUserLocationVisible).toBe(true);

    useMapCameraStore.getState().focusOnFleet('truck-505');
    const state = useMapCameraStore.getState();
    expect(state.isUserLocationVisible).toBe(false);
    expect(state.focusType).toBe('SELECTED_FLEET');
    expect(state.selectedFleetId).toBe('truck-505');
  });

  it('hides user location when closeUserLocationView is called', () => {
    useMapCameraStore.getState().focusOnUser();
    expect(useMapCameraStore.getState().isUserLocationVisible).toBe(true);

    useMapCameraStore.getState().closeUserLocationView();
    const state = useMapCameraStore.getState();
    expect(state.isUserLocationVisible).toBe(false);
    expect(state.activeMapSelection).toEqual({ type: 'NONE' });
    expect(state.focusType).toBe('ROUTE_OVERVIEW');
  });

  it('transitions to MANUAL_MAP and disables following on manual user drag/zoom', () => {
    useMapCameraStore.getState().focusOnFleet('truck-202');
    expect(useMapCameraStore.getState().isFollowingFleet).toBe(true);

    useMapCameraStore.getState().setManualInteraction();
    const state = useMapCameraStore.getState();
    expect(state.focusType).toBe('MANUAL_MAP');
    expect(state.isFollowingFleet).toBe(false);
    expect(state.selectedFleetId).toBe('truck-202');
  });

  it('restores fleet following when toggleFollowFleet(true) is clicked in manual mode', () => {
    useMapCameraStore.getState().focusOnFleet('truck-303');
    useMapCameraStore.getState().setManualInteraction();
    expect(useMapCameraStore.getState().isFollowingFleet).toBe(false);

    useMapCameraStore.getState().toggleFollowFleet(true);
    const state = useMapCameraStore.getState();
    expect(state.focusType).toBe('SELECTED_FLEET');
    expect(state.isFollowingFleet).toBe(true);
    expect(state.selectedFleetId).toBe('truck-303');
  });

  it('transitions to ROUTE_OVERVIEW and clears fleet selection when clearFleetSelection is called', () => {
    useMapCameraStore.getState().focusOnFleet('truck-404');
    useMapCameraStore.getState().clearFleetSelection();
    const state = useMapCameraStore.getState();
    expect(state.focusType).toBe('ROUTE_OVERVIEW');
    expect(state.selectedFleetId).toBeNull();
    expect(state.isFollowingFleet).toBe(false);
    expect(state.overviewFocusTrigger).toBe(1);
  });

  it('increments fleetRecenterTrigger and sets focusType to SELECTED_FLEET when recenterFleet is called', () => {
    useMapCameraStore.getState().focusOnFleet('truck-101');
    useMapCameraStore.getState().setManualInteraction();
    expect(useMapCameraStore.getState().isFollowingFleet).toBe(false);

    useMapCameraStore.getState().recenterFleet();
    const state = useMapCameraStore.getState();
    expect(state.focusType).toBe('SELECTED_FLEET');
    expect(state.isFollowingFleet).toBe(true);
    expect(state.fleetRecenterTrigger).toBe(1);
  });

  it('increments routeFitTrigger and sets focusType to ROUTE_OVERVIEW when fitEntireRoute is called', () => {
    useMapCameraStore.getState().focusOnFleet('truck-101');
    useMapCameraStore.getState().fitEntireRoute();
    const state = useMapCameraStore.getState();
    expect(state.focusType).toBe('ROUTE_OVERVIEW');
    expect(state.isFollowingFleet).toBe(false);
    expect(state.routeFitTrigger).toBe(1);
    // Fleet remains selected
    expect(state.selectedFleetId).toBe('truck-101');
  });
});

