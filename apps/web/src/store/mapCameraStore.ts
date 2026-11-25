import { create } from 'zustand';

export type CameraFocusType =
  | 'ROUTE_OVERVIEW'
  | 'SELECTED_FLEET'
  | 'USER_LOCATION'
  | 'MANUAL_MAP';

export type ActiveMapSelection =
  | { type: 'NONE' }
  | { type: 'USER_LOCATION' }
  | { type: 'SELECTED_FLEET'; fleetId: string };

export interface MapCameraState {
  focusType: CameraFocusType;
  selectedFleetId: string | null;
  isFollowingFleet: boolean;
  isUserLocationVisible: boolean;
  activeMapSelection: ActiveMapSelection;

  // Discrete action triggers (incremented when explicit action happens)
  userFocusTrigger: number;
  fleetFocusTrigger: number;
  fleetRecenterTrigger: number;
  routeFitTrigger: number;
  overviewFocusTrigger: number;

  // Actions
  focusOnFleet: (fleetId: string) => void;
  recenterFleet: () => void;
  fitEntireRoute: () => void;
  focusOnUser: () => void;
  closeUserLocationView: () => void;
  focusOnOverview: () => void;
  setManualInteraction: () => void;
  toggleFollowFleet: (follow?: boolean) => void;
  clearFleetSelection: () => void;
  resetCameraState: () => void;
}

export const useMapCameraStore = create<MapCameraState>((set) => ({
  focusType: 'ROUTE_OVERVIEW',
  selectedFleetId: null,
  isFollowingFleet: false,
  isUserLocationVisible: false,
  activeMapSelection: { type: 'NONE' },
  userFocusTrigger: 0,
  fleetFocusTrigger: 0,
  fleetRecenterTrigger: 0,
  routeFitTrigger: 0,
  overviewFocusTrigger: 0,

  focusOnFleet: (fleetId: string) =>
    set((state) => ({
      focusType: 'SELECTED_FLEET',
      selectedFleetId: fleetId,
      isFollowingFleet: true,
      isUserLocationVisible: false, // Hide user marker when selecting a fleet
      activeMapSelection: { type: 'SELECTED_FLEET', fleetId },
      fleetFocusTrigger: state.fleetFocusTrigger + 1,
    })),

  recenterFleet: () =>
    set((state) => ({
      focusType: 'SELECTED_FLEET',
      isFollowingFleet: true,
      fleetRecenterTrigger: state.fleetRecenterTrigger + 1,
    })),

  fitEntireRoute: () =>
    set((state) => ({
      focusType: 'ROUTE_OVERVIEW',
      isFollowingFleet: false,
      routeFitTrigger: state.routeFitTrigger + 1,
    })),

  focusOnUser: () =>
    set((state) => ({
      focusType: 'USER_LOCATION',
      isFollowingFleet: false,
      isUserLocationVisible: true, // Only show user location marker on explicit user request
      activeMapSelection: { type: 'USER_LOCATION' },
      userFocusTrigger: state.userFocusTrigger + 1,
    })),

  closeUserLocationView: () =>
    set((state) => ({
      focusType: 'ROUTE_OVERVIEW',
      isFollowingFleet: false,
      isUserLocationVisible: false,
      activeMapSelection: { type: 'NONE' },
      overviewFocusTrigger: state.overviewFocusTrigger + 1,
    })),

  focusOnOverview: () =>
    set((state) => ({
      focusType: 'ROUTE_OVERVIEW',
      selectedFleetId: null,
      isFollowingFleet: false,
      isUserLocationVisible: false,
      activeMapSelection: { type: 'NONE' },
      overviewFocusTrigger: state.overviewFocusTrigger + 1,
    })),

  setManualInteraction: () =>
    set((state) => {
      if (state.focusType === 'MANUAL_MAP') return state;
      return {
        focusType: 'MANUAL_MAP',
        isFollowingFleet: false,
      };
    }),

  toggleFollowFleet: (follow) =>
    set((state) => {
      const willFollow = follow !== undefined ? follow : !state.isFollowingFleet;
      return {
        isFollowingFleet: willFollow,
        focusType: willFollow ? 'SELECTED_FLEET' : 'MANUAL_MAP',
        fleetRecenterTrigger: willFollow ? state.fleetRecenterTrigger + 1 : state.fleetRecenterTrigger,
      };
    }),

  clearFleetSelection: () =>
    set((state) => ({
      focusType: 'ROUTE_OVERVIEW',
      selectedFleetId: null,
      isFollowingFleet: false,
      isUserLocationVisible: false,
      activeMapSelection: { type: 'NONE' },
      overviewFocusTrigger: state.overviewFocusTrigger + 1,
    })),

  resetCameraState: () =>
    set({
      focusType: 'ROUTE_OVERVIEW',
      selectedFleetId: null,
      isFollowingFleet: false,
      isUserLocationVisible: false,
      activeMapSelection: { type: 'NONE' },
      userFocusTrigger: 0,
      fleetFocusTrigger: 0,
      fleetRecenterTrigger: 0,
      routeFitTrigger: 0,
      overviewFocusTrigger: 0,
    }),
}));

