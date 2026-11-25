import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Vehicle, Trip, Geofence, GhostPositionPayload } from '@nexus-ways/shared';
import { Maximize2, Crosshair, X, Filter, Navigation, ZoomIn, Route } from 'lucide-react';
import { useUserLocationStore } from '../store/userLocationStore';
import { useMapCameraStore } from '../store/mapCameraStore';
import { calculateRouteProgress } from '../utils/routeProgress';

// Configurable Street-Level Zoom for detailed vehicle, road, and intersection visibility
const STREET_LEVEL_ZOOM = 16;

// Calculate visible horizontal offset in pixels when the right sidebar/drawer is open
function calculateVisibleCenterOffset(map: L.Map): [number, number] {
  try {
    const container = map.getContainer ? map.getContainer() : null;
    if (!container || typeof document === 'undefined') return [0, 0];
    const mapRect = container.getBoundingClientRect ? container.getBoundingClientRect() : null;
    if (!mapRect || mapRect.width === 0) return [0, 0];

    // Check if the right-side fleet vehicle/trip details sidebar is open and visible
    const rightPanel = document.querySelector('[data-testid="fleet-vehicle-details-sidebar"]') as HTMLElement | null;
    let rightOverlap = 0;
    if (rightPanel) {
      const panelRect = rightPanel.getBoundingClientRect ? rightPanel.getBoundingClientRect() : null;
      if (panelRect && panelRect.width > 0) {
        const overlapStart = Math.max(mapRect.left, panelRect.left);
        const overlapEnd = Math.min(mapRect.right, panelRect.right);
        if (overlapEnd > overlapStart) {
          rightOverlap = overlapEnd - overlapStart;
        }
      }
    }

    // If the panel covers more than 80% of the map (e.g. mobile modal), don't offset
    if (rightOverlap <= 0 || rightOverlap >= mapRect.width * 0.8) {
      return [0, 0];
    }

    // Offset in pixels: shift map center right by (rightOverlap / 2)
    // so marker is positioned at the exact visual center of the visible unoccluded area
    const offsetX = rightOverlap / 2;
    return [offsetX, 0];
  } catch {
    return [0, 0];
  }
}

// Convert target coordinates into a sidebar-aware center coordinate
function getSidebarAwareLatLng(
  map: L.Map,
  targetLatLng: [number, number],
  zoom?: number
): [number, number] {
  try {
    const [offsetX, offsetY] = calculateVisibleCenterOffset(map);
    if (offsetX === 0 && offsetY === 0) {
      return targetLatLng;
    }
    const currentZoom = zoom !== undefined ? zoom : map.getZoom ? map.getZoom() : STREET_LEVEL_ZOOM;
    if (map.project && map.unproject && L.point && L.latLng) {
      const point = map.project(L.latLng(targetLatLng[0], targetLatLng[1]), currentZoom);
      const offsetPoint = L.point(point.x + offsetX, point.y + offsetY);
      const offsetLatLng = map.unproject(offsetPoint, currentZoom);
      return [offsetLatLng.lat, offsetLatLng.lng];
    }
  } catch {
    // fallback
  }
  return targetLatLng;
}

interface RoadwaysMapProps {
  vehicles: Vehicle[];
  activeTrips: Trip[];
  geofences: Geofence[];
  ghostPositions?: Record<string, GhostPositionPayload>;
  selectedVehicleId?: string | null;
  onSelectVehicle?: (vehicle: Vehicle) => void;
  onClearSelection?: () => void;
  onOpenLiveDetails?: (vehicle: Vehicle) => void;
  className?: string;
}

function buildMarkerHtml(v: Vehicle, isSelected: boolean): string {
  const isTwin = (v as any).is_twin;
  const twinStatus = (v as any).twin_status;

  let markerColor = '#10b981'; // Green for active / en_route
  let statusLabel: string = v.status;

  if (twinStatus) {
    if (twinStatus === 'delayed') {
      markerColor = '#f59e0b'; // Amber
      statusLabel = 'delayed';
    } else if (twinStatus === 'resting') {
      markerColor = '#3b82f6'; // Blue
      statusLabel = 'resting';
    } else if (twinStatus === 'idle') {
      markerColor = '#64748b'; // Slate
      statusLabel = 'idle';
    } else {
      markerColor = '#10b981'; // Green en_route
      statusLabel = 'en route';
    }
  } else if (v.status === 'maintenance') {
    markerColor = '#f43f5e';
  } else if (v.status === 'idle') {
    markerColor = '#64748b';
  }

  const isConvoy = !!v.convoy_name;
  const borderColor = isConvoy ? '#8b5cf6' : isSelected ? '#0284c7' : '#ffffff';

  return `
    <div style="
      position: relative;
      background: ${markerColor};
      border: 2px solid ${borderColor};
      width: ${isSelected ? '28px' : '22px'};
      height: ${isSelected ? '28px' : '22px'};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      cursor: pointer;
      transition: transform 0.2s;
    ">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
        <path d="M15 18H9"/>
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
        <circle cx="17" cy="18" r="2"/>
        <circle cx="7" cy="18" r="2"/>
      </svg>
      ${
        twinStatus === 'en_route' || v.status === 'active'
          ? `<span style="position: absolute; top: -3px; right: -3px; width: 8px; height: 8px; background: #22c55e; border-radius: 50%; border: 1.5px solid white;"></span>`
          : ''
      }
    </div>
  `;
}

function buildPopupHtml(v: Vehicle): string {
  const isTwin = (v as any).is_twin;
  const twinStatus = (v as any).twin_status;
  const gps = v.latest_gps;
  const speed = gps?.speed_kmh || 0;

  let markerColor = '#10b981';
  let statusLabel: string = v.status;
  if (twinStatus) {
    if (twinStatus === 'delayed') {
      markerColor = '#f59e0b';
      statusLabel = 'delayed';
    } else if (twinStatus === 'resting') {
      markerColor = '#3b82f6';
      statusLabel = 'resting';
    } else if (twinStatus === 'idle') {
      markerColor = '#64748b';
      statusLabel = 'idle';
    } else {
      markerColor = '#10b981';
      statusLabel = 'en route';
    }
  } else if (v.status === 'maintenance') {
    markerColor = '#f43f5e';
  } else if (v.status === 'idle') {
    markerColor = '#64748b';
  }

  const routeDesc =
    (v as any).route_short_name ||
    (v.active_trip
      ? `${v.active_trip.origin_label} &rarr; ${v.active_trip.destination_label}`
      : 'Base Depot');
  const nextCp = (v as any).next_checkpoint_name;
  const truckType = (v as any).truck_type_label || v.vehicle_type;

  return `
    <div style="font-family: sans-serif; min-width: 220px; padding: 2px;">
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 6px;">
        <strong style="font-size: 13px; color: #0f172a; font-family: monospace;">${v.registration_number}</strong>
        <span style="font-size: 10px; text-transform: uppercase; background: ${markerColor}20; color: ${markerColor}; font-weight: bold; padding: 2px 6px; border-radius: 4px; border: 1px solid ${markerColor}40;">
          ${statusLabel}
        </span>
      </div>
      <div style="font-size: 11px; color: #475569; line-height: 1.5;">
        <div><strong>Driver:</strong> ${v.driver?.user?.full_name || v.driver?.license_number || 'Unassigned'}</div>
        <div><strong>Type:</strong> ${truckType}</div>
        <div><strong>Route:</strong> ${routeDesc}</div>
        <div><strong>Live Speed:</strong> <span style="font-weight: 600; color: #0284c7;">${speed} km/h</span></div>
        ${nextCp ? `<div><strong>Next:</strong> <span style="font-weight: 600; color: #334155;">${nextCp}</span></div>` : ''}
        <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
          <button
            type="button"
            class="nexus-live-details-btn"
            data-action="live-details"
            data-vehicle-id="${v.id}"
            style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: #0f172a; color: white; border-radius: 6px; font-weight: 600; font-size: 11px; border: none; cursor: pointer; text-decoration: none;"
          >
            <span>LIVE DETAILS</span>
            <span>&rarr;</span>
          </button>
          ${
            isTwin
              ? `<a
                   href="/roadways/fleet-twin/${v.id}"
                   style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: #0284c7; color: white; border-radius: 6px; font-weight: 600; text-decoration: none; font-size: 11px;"
                 >
                   Inspect Twin &rarr;
                 </a>`
              : ''
          }
        </div>
        <div style="margin-top: 4px; font-size: 9px; color: #94a3b8; text-align: right;">
          [Live Telemetry]
        </div>
      </div>
    </div>
  `;
}

export const RoadwaysMap: React.FC<RoadwaysMapProps> = ({
  vehicles,
  activeTrips,
  geofences,
  ghostPositions = {},
  selectedVehicleId,
  onSelectVehicle,
  onClearSelection,
  onOpenLiveDetails,
  className = '',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const ghostGroupRef = useRef<L.LayerGroup | null>(null);
  const routesGroupRef = useRef<L.LayerGroup | null>(null);
  const geofencesGroupRef = useRef<L.LayerGroup | null>(null);
  const userLocationGroupRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userAccuracyCircleRef = useRef<L.Circle | null>(null);

  // User Location Store subscription (coordinates & address only for rendering marker)
  const { coordinates: userCoords, address: userAddress } = useUserLocationStore();

  // Centralized Map Camera Focus Manager
  const {
    focusType,
    activeMapSelection,
    isUserLocationVisible,
    selectedFleetId: cameraSelectedFleetId,
    isFollowingFleet,
    userFocusTrigger,
    fleetFocusTrigger,
    fleetRecenterTrigger,
    routeFitTrigger,
    overviewFocusTrigger,
    focusOnFleet,
    recenterFleet,
    fitEntireRoute,
    focusOnUser,
    closeUserLocationView,
    focusOnOverview,
    setManualInteraction,
    toggleFollowFleet,
  } = useMapCameraStore();

  // Track marker instances in place to prevent layout thrashing and DOM recreation
  const vehicleMarkersRef = useRef<Map<string, { marker: L.Marker; lastLat: number; lastLng: number }>>(new Map());

  // Track monotonic travelled progress (in km) per vehicle/trip to filter GPS noise
  const fleetProgressMapRef = useRef<Map<string, { tripId?: string; progressKm: number }>>(new Map());

  // Track auto-view lifecycle to permanently fix zoom reset
  const initialFitDoneRef = useRef(false);
  const lastHandledSelectionRef = useRef<string | null | undefined>(undefined);
  const lastHandledUserFocusRef = useRef(0);
  const lastHandledFleetFocusRef = useRef(0);
  const lastHandledFleetRecenterRef = useRef(0);
  const lastHandledRouteFitRef = useRef(0);
  const lastHandledOverviewRef = useRef(0);
  const lastFollowedCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const isProgrammaticMoveRef = useRef(false);

  // Sync selectedVehicleId prop changes from parent (e.g. Fleet Registry click) into Centralized Camera Store
  useEffect(() => {
    if (selectedVehicleId) {
      if (cameraSelectedFleetId !== selectedVehicleId) {
        focusOnFleet(selectedVehicleId);
      }
    } else if (cameraSelectedFleetId) {
      focusOnOverview();
    }
  }, [selectedVehicleId, cameraSelectedFleetId, focusOnFleet, focusOnOverview]);

  // Selected vehicle reference
  const selectedVehicle = useMemo(() => {
    if (!selectedVehicleId) return null;
    return vehicles.find((v) => v.id === selectedVehicleId) || null;
  }, [vehicles, selectedVehicleId]);

  // Filtered views based on individual fleet selection (Scenario A vs B/C)
  const displayedVehicles = useMemo(() => {
    if (!selectedVehicleId) return vehicles;
    return vehicles.filter((v) => v.id === selectedVehicleId);
  }, [vehicles, selectedVehicleId]);

  const displayedTrips = useMemo(() => {
    if (!selectedVehicleId) return activeTrips;
    return activeTrips.filter((t) => t.vehicle_id === selectedVehicleId);
  }, [activeTrips, selectedVehicleId]);

  const displayedGhosts = useMemo(() => {
    if (!selectedVehicleId) return ghostPositions;
    return ghostPositions[selectedVehicleId]
      ? { [selectedVehicleId]: ghostPositions[selectedVehicleId] }
      : {};
  }, [ghostPositions, selectedVehicleId]);

  const displayedGeofences = useMemo(() => {
    if (!selectedVehicleId) return geofences;
    if (displayedTrips.length === 0) return geofences;
    const trip = displayedTrips[0];
    const v = displayedVehicles[0];
    const vLat = v?.latest_gps?.lat || 0;
    const vLng = v?.latest_gps?.lng || 0;
    const filtered = geofences.filter((gf) => {
      const distToV = Math.hypot(gf.center_lat - vLat, gf.center_lng - vLng);
      const distToOrigin =
        trip.origin_lat != null && trip.origin_lng != null
          ? Math.hypot(gf.center_lat - trip.origin_lat, gf.center_lng - trip.origin_lng)
          : 999;
      const distToDest =
        trip.destination_lat != null && trip.destination_lng != null
          ? Math.hypot(gf.center_lat - trip.destination_lat, gf.center_lng - trip.destination_lng)
          : 999;
      return distToV < 0.6 || distToOrigin < 0.6 || distToDest < 0.6;
    });
    return filtered.length > 0 ? filtered : geofences;
  }, [geofences, selectedVehicleId, displayedTrips, displayedVehicles]);

  // 1. Initialize Leaflet Map with standard public OpenStreetMap & InvalidateSize Triggers
  useEffect(() => {
    if (!mapContainerRef.current) return;

    let handleManualContainerInteraction: (() => void) | null = null;
    const container = mapContainerRef.current;

    try {
      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [19.076, 72.8777], // Mumbai default
          zoom: 7,
          zoomControl: true,
          attributionControl: false,
          scrollWheelZoom: true,
          doubleClickZoom: true,
          touchZoom: true,
          boxZoom: true,
          keyboard: true,
        });

        // Standard OpenStreetMap public tile endpoint (Free, 100% no API key required)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        routesGroupRef.current = L.layerGroup().addTo(map);
        geofencesGroupRef.current = L.layerGroup().addTo(map);
        ghostGroupRef.current = L.layerGroup().addTo(map);
        markersGroupRef.current = L.layerGroup().addTo(map);
        userLocationGroupRef.current = L.layerGroup().addTo(map);

        mapInstanceRef.current = map;

        // Centralized Camera Management: Detect manual user pan/zoom to switch focus to MANUAL_MAP
        if (map.on) {
          map.on('dragstart', () => {
            if (!isProgrammaticMoveRef.current) {
              setManualInteraction();
            }
          });
          map.on('zoomstart', () => {
            if (!isProgrammaticMoveRef.current) {
              setManualInteraction();
            }
          });
          map.on('moveend', () => {
            setTimeout(() => {
              isProgrammaticMoveRef.current = false;
            }, 150);
          });
        }

        handleManualContainerInteraction = () => {
          if (!isProgrammaticMoveRef.current) {
            setManualInteraction();
          }
        };
        container.addEventListener('wheel', handleManualContainerInteraction, { passive: true });
        container.addEventListener('touchmove', handleManualContainerInteraction, { passive: true });

        // Invalidate map size after container mounts
        setTimeout(() => map?.invalidateSize?.(), 50);
        setTimeout(() => map?.invalidateSize?.(), 200);
        setTimeout(() => map?.invalidateSize?.(), 500);
      }
    } catch (e) {
      console.error('Error initializing map:', e);
    }

    // Resize handler for browser window changes
    const handleWindowResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize?.();
      }
    };
    window.addEventListener('resize', handleWindowResize);

    // Resize observer for layout and container dimensions
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize?.();
        }
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      if (handleManualContainerInteraction) {
        container.removeEventListener('wheel', handleManualContainerInteraction);
        container.removeEventListener('touchmove', handleManualContainerInteraction);
      }
      if (resizeObserver) resizeObserver.disconnect();
      if (mapInstanceRef.current) {
        try {
          if (mapInstanceRef.current.off) {
            mapInstanceRef.current.off('dragstart');
            mapInstanceRef.current.off('zoomstart');
            mapInstanceRef.current.off('moveend');
          }
          mapInstanceRef.current.remove();
        } catch {
          // ignore
        }
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Delegated click listener on map container for interactive popup buttons (e.g. LIVE DETAILS)
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const handleContainerClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-action="live-details"]');
      if (target) {
        const vId = target.getAttribute('data-vehicle-id');
        if (vId) {
          const matched = vehicles.find((v) => v.id === vId);
          if (matched) {
            if (onSelectVehicle) onSelectVehicle(matched);
            if (onOpenLiveDetails) onOpenLiveDetails(matched);
            window.dispatchEvent(
              new CustomEvent('nexus:open-live-details', { detail: { vehicleId: vId } }),
            );
          }
        }
      }
    };

    container.addEventListener('click', handleContainerClick);
    return () => {
      container.removeEventListener('click', handleContainerClick);
    };
  }, [vehicles, onSelectVehicle, onOpenLiveDetails]);

  // 2. Render Geofences (filtered when fleet is selected)
  useEffect(() => {
    if (!mapInstanceRef.current || !geofencesGroupRef.current) return;

    geofencesGroupRef.current.clearLayers();

    displayedGeofences.forEach((gf) => {
      const circle = L.circle([gf.center_lat, gf.center_lng], {
        radius: gf.radius_m,
        color: '#3b82f6',
        fillColor: '#93c5fd',
        fillOpacity: 0.2,
        weight: 1.5,
        dashArray: '4, 4',
      });

      circle.bindTooltip(`<strong>${gf.name}</strong> (${gf.type})<br/>Radius: ${gf.radius_m}m`, {
        permanent: false,
        direction: 'top',
      });

      geofencesGroupRef.current?.addLayer(circle);
    });
  }, [displayedGeofences]);

  // 3. Render Routes and Checkpoints (with Real-Time Travelled Route Colorization)
  useEffect(() => {
    if (!mapInstanceRef.current || !routesGroupRef.current) return;

    routesGroupRef.current.clearLayers();

    displayedTrips.forEach((trip) => {
      if (trip.status !== 'in_transit' && trip.status !== 'planned' && trip.status !== 'completed') return;
      const isSelected = selectedVehicleId === trip.vehicle_id;

      // Draw route polylines if coordinates available
      if (trip.route_geometry?.coordinates && trip.route_geometry.coordinates.length > 0) {
        const fullLatLngs: [number, number][] = trip.route_geometry.coordinates.map((c) => [c[1], c[0]]);
        const isOsrm = trip.route_geometry.routing_source === 'osrm';
        const remainingColor = isSelected ? '#0284c7' : isOsrm ? '#2563eb' : '#f59e0b';

        // Check if trip is completed -> 100% emerald green
        if (trip.status === 'completed') {
          const completedPolyline = L.polyline(fullLatLngs, {
            color: '#10b981',
            weight: isSelected ? 5.5 : 4.0,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
          });
          completedPolyline.bindTooltip(
            `<strong>${trip.origin_label} &rarr; ${trip.destination_label}</strong><br/>` +
            `<span style="color: #10b981; font-weight: bold;">● Completed Trip</span> (${trip.distance_km || 0} km)<br/>` +
            `Route: ${isOsrm ? 'OSRM Highway Network (OpenStreetMap)' : 'Fallback Route'}`,
            { sticky: true },
          );
          routesGroupRef.current?.addLayer(completedPolyline);
        } else if (trip.status === 'planned') {
          // Trip planned -> 100% future / remaining route color
          const plannedPolyline = L.polyline(fullLatLngs, {
            color: remainingColor,
            weight: isSelected ? 5.5 : 3.5,
            opacity: isSelected ? 0.95 : 0.75,
            dashArray: isOsrm || isSelected ? undefined : '6, 6',
            lineCap: 'round',
            lineJoin: 'round',
          });
          plannedPolyline.bindTooltip(
            `<strong>${trip.origin_label} &rarr; ${trip.destination_label}</strong><br/>` +
            `Distance: ${trip.distance_km || 0} km | Route: ${isOsrm ? 'OSRM Highway Network (OpenStreetMap)' : 'Fallback Route'}`,
            { sticky: true },
          );
          routesGroupRef.current?.addLayer(plannedPolyline);
        } else {
          // trip.status === 'in_transit' -> Real-Time Dynamic Colorization
          const matchingVehicle = vehicles.find((v) => v.id === trip.vehicle_id);
          const vGps = matchingVehicle?.latest_gps;

          if (vGps && vGps.lat && vGps.lng && fullLatLngs.length >= 2) {
            // Retrieve or initialize monotonic progress for this trip
            const progressEntry = fleetProgressMapRef.current.get(trip.vehicle_id);
            const prevProgress = (progressEntry && progressEntry.tripId === trip.id) ? progressEntry.progressKm : 0;

            const progress = calculateRouteProgress(fullLatLngs, vGps.lat, vGps.lng, prevProgress);
            fleetProgressMapRef.current.set(trip.vehicle_id, {
              tripId: trip.id,
              progressKm: progress.travelledDistanceKm,
            });

            // 1. Completed / Travelled Segment (Emerald Green #10b981)
            if (progress.travelledCoordinates.length >= 2) {
              const travelledPolyline = L.polyline(progress.travelledCoordinates, {
                color: '#10b981',
                weight: isSelected ? 5.5 : 4.0,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              });
              travelledPolyline.bindTooltip(
                `<strong>${trip.origin_label} &rarr; ${trip.destination_label}</strong><br/>` +
                `<span style="color: #10b981; font-weight: bold;">● Completed / Travelled:</span> ${progress.travelledDistanceKm.toFixed(1)} km (${Math.round(progress.progressPercent)}%)<br/>` +
                `Route: ${isOsrm ? 'OSRM Highway Network (OpenStreetMap)' : 'Fallback Route'}`,
                { sticky: true },
              );
              routesGroupRef.current?.addLayer(travelledPolyline);
            }

            // 2. Remaining / Future Segment (Theme Color #0284c7 / #2563eb / #f59e0b)
            if (progress.remainingCoordinates.length >= 2) {
              const remainingPolyline = L.polyline(progress.remainingCoordinates, {
                color: remainingColor,
                weight: isSelected ? 5.5 : 3.5,
                opacity: isSelected ? 0.95 : 0.75,
                dashArray: isOsrm || isSelected ? undefined : '6, 6',
                lineCap: 'round',
                lineJoin: 'round',
              });
              remainingPolyline.bindTooltip(
                `<strong>${trip.origin_label} &rarr; ${trip.destination_label}</strong><br/>` +
                `<span style="color: ${isSelected ? '#0284c7' : '#2563eb'}; font-weight: bold;">● Remaining:</span> ${progress.remainingDistanceKm.toFixed(1)} km<br/>` +
                `Route: ${isOsrm ? 'OSRM Highway Network (OpenStreetMap)' : 'Fallback Route'}`,
                { sticky: true },
              );
              routesGroupRef.current?.addLayer(remainingPolyline);
            }
          } else {
            // Fallback if GPS not yet received: full route in theme color
            const polyline = L.polyline(fullLatLngs, {
              color: remainingColor,
              weight: isSelected ? 5.5 : 3.5,
              opacity: isSelected ? 0.95 : 0.75,
              dashArray: isOsrm || isSelected ? undefined : '6, 6',
              lineCap: 'round',
              lineJoin: 'round',
            });
            polyline.bindTooltip(
              `<strong>${trip.origin_label} &rarr; ${trip.destination_label}</strong><br/>` +
              `Distance: ${trip.distance_km || 0} km | Route: ${isOsrm ? 'OSRM Highway Network (OpenStreetMap)' : 'Fallback Route'}`,
              { sticky: true },
            );
            routesGroupRef.current?.addLayer(polyline);
          }
        }
      }

      // Draw checkpoints
      if (trip.checkpoints && trip.checkpoints.length > 0) {
        trip.checkpoints.forEach((cp, idx) => {
          const cpMarker = L.circleMarker([cp.lat, cp.lng], {
            radius: isSelected ? 6 : 4,
            color: isSelected ? '#0369a1' : '#1e293b',
            fillColor: isSelected ? '#38bdf8' : '#f8fafc',
            fillOpacity: 1,
            weight: 2,
          });

          cpMarker.bindTooltip(`Checkpoint ${idx + 1}: ${cp.label}`, { direction: 'top' });
          routesGroupRef.current?.addLayer(cpMarker);
        });
      }
    });
  }, [displayedTrips, selectedVehicleId, vehicles]);

  // 4. Render Digital Twin Ghost Markers (filtered when fleet is selected)
  useEffect(() => {
    if (!mapInstanceRef.current || !ghostGroupRef.current) return;

    ghostGroupRef.current.clearLayers();

    Object.values(displayedGhosts).forEach((ghost) => {
      const isBehind = ghost.status === 'behind';
      const isAhead = ghost.status === 'ahead';
      const statusColor = isBehind ? '#f43f5e' : isAhead ? '#06b6d4' : '#10b981';

      const ghostIcon = L.divIcon({
        className: 'ghost-twin-marker',
        html: `
          <div style="
            position: relative;
            background: rgba(6, 182, 212, 0.25);
            border: 2px dashed ${statusColor};
            width: 26px;
            height: 26px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #06b6d4;
            box-shadow: 0 0 10px rgba(6, 182, 212, 0.4);
            animation: pulse 2s infinite;
          ">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/>
            </svg>
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const marker = L.marker([ghost.ghostLat, ghost.ghostLng], { icon: ghostIcon });

      const deviationText = isBehind
        ? `${ghost.deviationMinutes} min behind schedule`
        : isAhead
        ? `${Math.abs(ghost.deviationMinutes)} min ahead of schedule`
        : 'On schedule';

      const popupHtml = `
        <div style="font-family: sans-serif; min-width: 200px; padding: 2px;">
          <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: #0891b2; font-size: 12px;">Digital Twin (Ghost)</strong>
            <span style="font-size: 10px; color: ${statusColor}; font-weight: bold; text-transform: uppercase;">${ghost.status}</span>
          </div>
          <div style="font-size: 11px; color: #334155; line-height: 1.4;">
            <div style="margin-top: 4px; padding: 4px; background: #f8fafc; border-radius: 4px; border: 1px solid #e2e8f0;">
              <strong>Live Schedule Variance:</strong><br/>
              <span style="color: ${statusColor}; font-weight: 600; font-size: 12px;">${deviationText}</span>
            </div>
            <div style="margin-top: 6px; font-size: 9px; color: #94a3b8; text-align: right;">
              [Derived Digital Twin]
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      ghostGroupRef.current?.addLayer(marker);
    });
  }, [displayedGhosts]);

  // 5. Render Vehicle Markers with Smooth In-Place Updates & Isolated Zoom State
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = markersGroupRef.current;
    if (!map || !group) return;

    const currentMarkerMap = vehicleMarkersRef.current;
    const activeIds = new Set<string>();

    // Detect if selection transitioned (Scenario B / C / D)
    const selectionTransitioned = selectedVehicleId !== lastHandledSelectionRef.current;
    if (selectionTransitioned) {
      group.clearLayers();
      currentMarkerMap.clear();
      lastHandledSelectionRef.current = selectedVehicleId;
    }

    displayedVehicles.forEach((v) => {
      activeIds.add(v.id);
      const gps = v.latest_gps;
      const lat = gps?.lat || v.active_trip?.origin_lat || 19.076;
      const lng = gps?.lng || v.active_trip?.origin_lng || 72.8777;
      const isSelected = selectedVehicleId === v.id;

      const markerEntry = currentMarkerMap.get(v.id);

      if (!markerEntry) {
        // Create new marker instance
        const icon = L.divIcon({
          className: 'vehicle-marker',
          html: buildMarkerHtml(v, isSelected),
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const marker = L.marker([lat, lng], { icon });
        marker.bindPopup(buildPopupHtml(v));

        marker.on('click', () => {
          if (onSelectVehicle) onSelectVehicle(v);
          if (selectedVehicleId === v.id) {
            focusOnFleet(v.id);
          }
        });

        group.addLayer(marker);
        currentMarkerMap.set(v.id, { marker, lastLat: lat, lastLng: lng });

        if (isSelected && selectionTransitioned) {
          setTimeout(() => {
            if (marker.openPopup) marker.openPopup();
          }, 150);
        }
      } else {
        // In-place update: smooth coordinate adjustment without resetting viewport or popups
        const { marker, lastLat, lastLng } = markerEntry;
        if (lastLat !== lat || lastLng !== lng) {
          if (marker.setLatLng) {
            marker.setLatLng([lat, lng]);
          }
          markerEntry.lastLat = lat;
          markerEntry.lastLng = lng;
        }

        // Update popup content cleanly
        if ((marker as any).getPopup && (marker as any).getPopup()) {
          const popup = (marker as any).getPopup();
          if (popup.setContent) {
            popup.setContent(buildPopupHtml(v));
          }
        }
      }
    });

    // Remove any markers no longer in the filtered set
    for (const [id, entry] of currentMarkerMap.entries()) {
      if (!activeIds.has(id)) {
        group.removeLayer(entry.marker);
        currentMarkerMap.delete(id);
      }
    }

    // STRICT VIEWPORT MANAGEMENT:
    // Initial Load Only: Fit bounds ONCE so the user sees the national network.
    if (!initialFitDoneRef.current && displayedVehicles.length > 0) {
      const bounds = L.latLngBounds([]);
      displayedVehicles.forEach((v) => {
        const gps = v.latest_gps;
        const lat = gps?.lat || v.active_trip?.origin_lat || 19.076;
        const lng = gps?.lng || v.active_trip?.origin_lng || 72.8777;
        bounds.extend([lat, lng]);
      });
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
        initialFitDoneRef.current = true;
      }
    }
    // Note: On ongoing telemetry ticks, fitBounds() is NEVER called,
    // leaving user-selected zoom, center, and pan 100% stable.
  }, [displayedVehicles, selectedVehicleId, onSelectVehicle]);

  // 6. Render Current User Location Marker & Accuracy Circle (In-Place Marker Updates)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!userLocationGroupRef.current) {
      userLocationGroupRef.current = L.layerGroup().addTo(map);
    }
    const group = userLocationGroupRef.current;

    // CONDITIONAL VISIBILITY: Only show user location marker when user explicitly requests it
    if (!isUserLocationVisible || !userCoords) {
      group.clearLayers();
      userMarkerRef.current = null;
      userAccuracyCircleRef.current = null;
      return;
    }

    const { latitude, longitude, accuracy } = userCoords;
    const radiusMeters = Math.max(15, accuracy || 25);

    const popupContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 210px; padding: 3px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 6px;">
          <span style="font-weight: 700; color: #1d4ed8; font-size: 12px; display: flex; align-items: center; gap: 5px;">
            <span style="width: 7px; height: 7px; border-radius: 50%; background: #2563eb;"></span>
            Your Current Location
          </span>
          <span style="font-size: 9px; background: #dbeafe; color: #1e40af; font-weight: 700; padding: 2px 5px; border-radius: 4px; text-transform: uppercase;">
            Live GPS
          </span>
        </div>
        <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
          ${userAddress?.formatted || 'Detected Device Position'}
        </div>
        <div style="font-size: 11px; color: #475569; line-height: 1.5; background: #f8fafc; padding: 5px 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <div><strong>Coordinates:</strong> <span style="font-family: monospace; color: #0f172a;">${latitude.toFixed(4)}° N, ${longitude.toFixed(4)}° E</span></div>
          <div><strong>GPS Accuracy:</strong> <span style="color: #059669; font-weight: 600;">&plusmn;${Math.round(accuracy)} meters</span></div>
          ${userAddress?.district ? `<div><strong>District:</strong> ${userAddress.district}</div>` : ''}
          ${userAddress?.state ? `<div><strong>State:</strong> ${userAddress.state}</div>` : ''}
        </div>
        <div style="margin-top: 6px; font-size: 9px; color: #94a3b8; text-align: right;">
          [Logged-in User Device]
        </div>
      </div>
    `;

    if (!userMarkerRef.current) {
      // First-time layer creation
      const circle = L.circle([latitude, longitude], {
        radius: radiusMeters,
        color: '#2563eb',
        fillColor: '#3b82f6',
        fillOpacity: 0.12,
        weight: 1.5,
        dashArray: '3, 4',
      });
      group.addLayer(circle);
      userAccuracyCircleRef.current = circle;

      const userIcon = L.divIcon({
        className: 'current-user-location-marker',
        html: `
          <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; pointer-events: auto;">
            <div style="
              position: absolute;
              width: 34px;
              height: 34px;
              border-radius: 50%;
              background: rgba(37, 99, 235, 0.28);
              box-shadow: 0 0 12px rgba(37, 99, 235, 0.5);
              animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
            "></div>
            <div style="
              position: relative;
              width: 24px;
              height: 24px;
              border-radius: 50%;
              background: #2563eb;
              border: 2.5px solid #ffffff;
              box-shadow: 0 2px 8px rgba(0,0,0,0.35);
              display: flex;
              align-items: center;
              justify-content: center;
              color: #ffffff;
              cursor: pointer;
            ">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker([latitude, longitude], { icon: userIcon, zIndexOffset: 1000 });
      marker.bindPopup(popupContent);
      group.addLayer(marker);
      userMarkerRef.current = marker;
    } else {
      // In-place marker coordinate update: updates marker smoothly without moving map camera
      userMarkerRef.current.setLatLng([latitude, longitude]);
      if (userAccuracyCircleRef.current) {
        userAccuracyCircleRef.current.setLatLng([latitude, longitude]);
        userAccuracyCircleRef.current.setRadius(radiusMeters);
      }
      userMarkerRef.current.getPopup()?.setContent(popupContent);
    }
  }, [isUserLocationVisible, userCoords, userAddress]);

  // Camera Focus: Center on User Location ONLY on explicit user gesture
  useEffect(() => {
    if (userFocusTrigger === 0 || userFocusTrigger === lastHandledUserFocusRef.current) return;
    lastHandledUserFocusRef.current = userFocusTrigger;

    const map = mapInstanceRef.current;
    if (!map || !userCoords) return;

    map.flyTo([userCoords.latitude, userCoords.longitude], 15, {
      duration: 1.0,
    });
    setTimeout(() => {
      userMarkerRef.current?.openPopup();
    }, 500);
  }, [userFocusTrigger, userCoords]);

  // Camera Focus: Center on Selected Fleet with Street-Level Zoom on explicit selection
  useEffect(() => {
    if (fleetFocusTrigger === 0 || fleetFocusTrigger === lastHandledFleetFocusRef.current) return;
    lastHandledFleetFocusRef.current = fleetFocusTrigger;

    const map = mapInstanceRef.current;
    if (!map || !selectedVehicle) return;

    const gps = selectedVehicle.latest_gps;
    const lat = gps?.lat || selectedVehicle.active_trip?.origin_lat || 19.076;
    const lng = gps?.lng || selectedVehicle.active_trip?.origin_lng || 72.8777;

    const targetZoom = STREET_LEVEL_ZOOM; // Detailed street-level zoom (16)
    const center = getSidebarAwareLatLng(map, [lat, lng], targetZoom);
    isProgrammaticMoveRef.current = true;
    map.flyTo(center, targetZoom, { duration: 0.8 });
    setTimeout(() => {
      const markerEntry = vehicleMarkersRef.current.get(selectedVehicle.id);
      markerEntry?.marker.openPopup();
    }, 300);
  }, [fleetFocusTrigger, selectedVehicle]);

  // Camera Recenter: Recenter on Selected Fleet preserving user's chosen zoom level
  useEffect(() => {
    if (fleetRecenterTrigger === 0 || fleetRecenterTrigger === lastHandledFleetRecenterRef.current) return;
    lastHandledFleetRecenterRef.current = fleetRecenterTrigger;

    const map = mapInstanceRef.current;
    if (!map || !selectedVehicle) return;

    const gps = selectedVehicle.latest_gps;
    const lat = gps?.lat || selectedVehicle.active_trip?.origin_lat || 19.076;
    const lng = gps?.lng || selectedVehicle.active_trip?.origin_lng || 72.8777;

    const currentZoom = map.getZoom ? map.getZoom() : STREET_LEVEL_ZOOM;
    const center = getSidebarAwareLatLng(map, [lat, lng], currentZoom);
    isProgrammaticMoveRef.current = true;
    map.flyTo(center, currentZoom, { duration: 0.5 });
    setTimeout(() => {
      const markerEntry = vehicleMarkersRef.current.get(selectedVehicle.id);
      markerEntry?.marker.openPopup();
    }, 250);
  }, [fleetRecenterTrigger, selectedVehicle]);

  // Camera Fit Route: Adjust viewport to display complete origin-to-destination route
  useEffect(() => {
    if (routeFitTrigger === 0 || routeFitTrigger === lastHandledRouteFitRef.current) return;
    lastHandledRouteFitRef.current = routeFitTrigger;

    const map = mapInstanceRef.current;
    if (!map || !selectedVehicle) return;

    const trip = displayedTrips.find((t) => t.vehicle_id === selectedVehicle.id);
    if (!trip) return;

    const bounds = L.latLngBounds([]);
    if (trip.route_geometry?.coordinates && trip.route_geometry.coordinates.length > 0) {
      trip.route_geometry.coordinates.forEach((c) => bounds.extend([c[1], c[0]]));
    } else {
      if (trip.origin_lat != null && trip.origin_lng != null) bounds.extend([trip.origin_lat, trip.origin_lng]);
      if (trip.destination_lat != null && trip.destination_lng != null) bounds.extend([trip.destination_lat, trip.destination_lng]);
      if (selectedVehicle.latest_gps?.lat && selectedVehicle.latest_gps?.lng) {
        bounds.extend([selectedVehicle.latest_gps.lat, selectedVehicle.latest_gps.lng]);
      }
    }

    if (bounds.isValid()) {
      const [offsetX] = calculateVisibleCenterOffset(map);
      isProgrammaticMoveRef.current = true;
      map.fitBounds(bounds, {
        paddingTopLeft: [50, 50],
        paddingBottomRight: [Math.max(50, offsetX * 2 + 50), 50],
        maxZoom: 15,
      });
    }
  }, [routeFitTrigger, selectedVehicle, displayedTrips]);

  // Camera Follow: Controlled follow for selected fleet when live GPS updates arrive
  useEffect(() => {
    if (focusType !== 'SELECTED_FLEET' || !isFollowingFleet || !selectedVehicle) return;
    const map = mapInstanceRef.current;
    if (!map) return;

    const gps = selectedVehicle.latest_gps;
    if (!gps || !gps.lat || !gps.lng) return;

    const prev = lastFollowedCoordsRef.current;
    if (prev && prev.lat === gps.lat && prev.lng === gps.lng) {
      // Vehicle is stationary (resting at dhaba, stopped at depot) -> stay on location, no panTo
      return;
    }
    lastFollowedCoordsRef.current = { lat: gps.lat, lng: gps.lng };

    // Smoothly pan camera to track moving fleet while strictly preserving the current zoom level
    const currentZoom = map.getZoom ? map.getZoom() : STREET_LEVEL_ZOOM;
    const center = getSidebarAwareLatLng(map, [gps.lat, gps.lng], currentZoom);
    isProgrammaticMoveRef.current = true;
    map.panTo(center, { animate: true, duration: 0.8 });
  }, [selectedVehicle?.latest_gps, focusType, isFollowingFleet]);

  // Camera Focus: Overview bounds across all active fleets
  useEffect(() => {
    if (overviewFocusTrigger === 0 || overviewFocusTrigger === lastHandledOverviewRef.current) return;
    lastHandledOverviewRef.current = overviewFocusTrigger;

    const map = mapInstanceRef.current;
    if (!map || vehicles.length === 0) return;

    const bounds = L.latLngBounds([]);
    vehicles.forEach((v) => {
      const gps = v.latest_gps;
      const lat = gps?.lat || v.active_trip?.origin_lat || 19.076;
      const lng = gps?.lng || v.active_trip?.origin_lng || 72.8777;
      bounds.extend([lat, lng]);
    });
    if (bounds.isValid()) {
      isProgrammaticMoveRef.current = true;
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
    }
  }, [overviewFocusTrigger, vehicles]);

  // Action: Center camera on user's current location (explicit user gesture)
  const handleCenterOnUser = useCallback(() => {
    focusOnUser();
  }, [focusOnUser]);

  // Action: Close user location view and hide user marker
  const handleCloseUserLocation = useCallback(() => {
    closeUserLocationView();
  }, [closeUserLocationView]);

  // Action A: Zoom into selected fleet at street level (16x)
  const handleFocusStreetLevel = useCallback(() => {
    if (selectedVehicle) {
      focusOnFleet(selectedVehicle.id);
    }
  }, [selectedVehicle, focusOnFleet]);

  // Action B: Fit entire route into viewport
  const handleFitSelectedRoute = useCallback(() => {
    fitEntireRoute();
  }, [fitEntireRoute]);

  // Action C: Toggle camera follow mode
  const handleToggleFollow = useCallback(
    (follow?: boolean) => {
      toggleFollowFleet(follow);
    },
    [toggleFollowFleet],
  );

  // Action D: Center camera on currently selected fleet preserving chosen zoom level
  const handleRecenterSelected = useCallback(() => {
    recenterFleet();
  }, [recenterFleet]);

  // Action: Reset/Fit map to all available vehicles
  const handleFitAllOverview = useCallback(() => {
    focusOnOverview();
  }, [focusOnOverview]);

  // Action: Return to all fleets view
  const handleShowAllFleets = useCallback(() => {
    if (onClearSelection) {
      onClearSelection();
    } else if (onSelectVehicle && selectedVehicle) {
      onSelectVehicle(selectedVehicle);
    }
    focusOnOverview();
  }, [onClearSelection, onSelectVehicle, selectedVehicle, focusOnOverview]);

  return (
    <div
      className={`relative w-full h-full min-h-0 flex-1 rounded-xl overflow-hidden border border-slate-200/90 shadow-xs bg-slate-50 flex flex-col ${className}`}
      data-testid="roadways-live-map"
    >
      {/* Leaflet Map Canvas */}
      <div
        ref={mapContainerRef}
        data-testid="roadways-map-container"
        className="w-full h-full min-h-0 flex-1 z-0"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Floating Top Header: Live Simulation & Individual Fleet Filtering Controls */}
      <div className="absolute top-3 left-14 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left Side: Simulation Badge & Active Filter State */}
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          {/* Simulation Badge */}
          <div className="bg-white/95 backdrop-blur-md text-slate-800 px-3 py-1.5 rounded-lg shadow-sm border border-slate-200/90 flex items-center gap-2 text-xs font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-emerald-700">Roadways Live Simulation</span>
            <span className="text-[10px] text-slate-500 border-l border-slate-200 pl-2 font-mono">
              OSRM + Telemetry
            </span>
          </div>

          {/* Individual Fleet Filter Status Pill */}
          {selectedVehicle ? (
            <div className="bg-blue-50/95 backdrop-blur-md text-blue-900 px-3 py-1.5 rounded-lg shadow-sm border border-blue-200 flex flex-wrap items-center gap-2 text-xs font-medium animate-in fade-in duration-150">
              <Filter className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-blue-600 font-semibold">Fleet Filter:</span>
              <span className="font-mono font-bold text-slate-900">
                {selectedVehicle.registration_number}
              </span>
              <span className="text-[10px] text-blue-700 font-mono hidden md:inline">
                ({(selectedVehicle as any).truck_type_label || selectedVehicle.vehicle_type})
              </span>

              {/* Action C: Follow Status Indicator / Toggle */}
              {isFollowingFleet ? (
                <button
                  onClick={() => handleToggleFollow(false)}
                  className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded font-semibold border border-emerald-300 transition-colors cursor-pointer"
                  title="Camera is actively following this vehicle's live GPS movements. Click to pause camera follow"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Following</span>
                </button>
              ) : (
                <button
                  onClick={() => handleToggleFollow(true)}
                  className="inline-flex items-center gap-1 text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-900 px-2 py-0.5 rounded font-semibold border border-amber-300 transition-colors cursor-pointer"
                  title="Manual map mode active. Click to resume automatic following"
                >
                  <Crosshair className="w-2.5 h-2.5 text-amber-700" />
                  <span>Follow Selected Fleet</span>
                </button>
              )}

              {/* Action A: Street-Level Zoom (16x) */}
              <button
                onClick={handleFocusStreetLevel}
                className="px-2 py-0.5 rounded bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 font-semibold text-[10px] flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                title="Zoom into street-level (16x) view showing surrounding roads and intersections"
              >
                <ZoomIn className="w-3 h-3 text-blue-600" />
                <span>Street Level</span>
              </button>

              {/* Action B: Fit Entire Route */}
              <button
                onClick={handleFitSelectedRoute}
                className="px-2 py-0.5 rounded bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 font-semibold text-[10px] flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                title="Adjust viewport to display complete origin-to-destination route"
              >
                <Route className="w-3 h-3 text-blue-600" />
                <span>Fit Route</span>
              </button>

              {/* Action D: Re-center on Selected Vehicle (preserves zoom) */}
              <button
                onClick={handleRecenterSelected}
                className="px-2 py-0.5 rounded bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 font-semibold text-[10px] flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                title="Center camera on selected vehicle while retaining your chosen zoom"
              >
                <Crosshair className="w-3 h-3 text-blue-600" />
                <span>Recenter</span>
              </button>

              {/* Show All Fleets (Scenario D) */}
              <button
                onClick={handleShowAllFleets}
                className="ml-1 px-2 py-0.5 rounded bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 font-semibold text-[10px] flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                title="Clear filter and restore all fleets overview"
              >
                <X className="w-3 h-3" />
                <span>All Fleets</span>
              </button>
            </div>
          ) : isUserLocationVisible && userCoords ? (
            <div className="bg-blue-50/95 backdrop-blur-md text-blue-900 px-3 py-1.5 rounded-lg shadow-sm border border-blue-200 flex items-center gap-2 text-xs font-medium animate-in fade-in duration-150">
              <Navigation className="w-3.5 h-3.5 text-blue-600 fill-blue-600/20" />
              <span className="text-blue-600 font-semibold">User Location:</span>
              <span className="font-bold text-slate-900">
                {userAddress?.formatted || 'Your Position'}
              </span>
              <button
                onClick={handleCloseUserLocation}
                className="ml-1 px-2 py-0.5 rounded bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 font-semibold text-[10px] flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                title="Close location view and hide user marker"
              >
                <X className="w-3 h-3" />
                <span>Close Location View</span>
              </button>
            </div>
          ) : (
            <div className="bg-white/90 backdrop-blur-md text-slate-700 px-2.5 py-1.5 rounded-lg shadow-xs border border-slate-200/80 flex items-center gap-1.5 text-xs font-medium hidden sm:flex">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-slate-500">Showing:</span>
              <span className="font-bold text-slate-800">All {vehicles.length} Fleets Active</span>
            </div>
          )}
        </div>

        {/* Right Side: Quick Map View Controls */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {userCoords && (
            <button
              onClick={handleCenterOnUser}
              className={`px-2.5 py-1.5 rounded-lg backdrop-blur-md border text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer ${
                isUserLocationVisible
                  ? 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
                  : 'bg-white/95 hover:bg-blue-50/80 border-blue-200 text-blue-700'
              }`}
              title={`Center camera on your current GPS location: ${userAddress?.formatted || 'Your Position'}`}
            >
              <Navigation
                className={`w-3.5 h-3.5 ${
                  isUserLocationVisible ? 'text-white fill-white/20' : 'text-blue-600 fill-blue-600/20'
                }`}
              />
              <span className="hidden sm:inline">My Location</span>
            </button>
          )}

          <button
            onClick={handleFitAllOverview}
            className="px-2.5 py-1.5 rounded-lg bg-white/95 hover:bg-slate-100 backdrop-blur-md border border-slate-200/90 text-slate-700 text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            title="Fit view to all active fleet positions across the national network"
          >
            <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden sm:inline">Fit Overview</span>
          </button>
        </div>
      </div>

      {/* Floating Legend (Positioned bottom-left, keeping bottom-right completely clear for AI Assistant) */}
      <div className="absolute bottom-3 left-3 z-10 bg-white/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-sm border border-slate-200/90 text-[11px] text-slate-700 flex flex-wrap items-center gap-3">
        {isUserLocationVisible && userCoords && (
          <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600 border border-white"></span>
            </span>
            <span className="font-bold text-blue-800">You ({userAddress?.city || 'Here'})</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span>Live Vehicle</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-cyan-500 bg-cyan-100"></span>
          <span className="font-medium text-cyan-800">Digital Twin (Ghost)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 border border-purple-700"></span>
          <span>Convoy</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-1 bg-emerald-500 rounded"></span>
          <span className="font-semibold text-emerald-700">Travelled Route</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-1 bg-blue-600 rounded"></span>
          <span>Remaining Route</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border border-dashed border-blue-500 bg-blue-100"></span>
          <span>Geofence</span>
        </div>
      </div>
    </div>
  );
};
