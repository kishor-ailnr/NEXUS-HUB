import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Truck,
  Clock,
  Compass,
  Layers,
  ChevronRight,
  ShieldAlert,
  Fuel,
  Coffee,
  Map as MapIcon,
  List,
  AlertTriangle,
  Sparkles,
  GitFork,
  Merge,
  Flag,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crosshair,
  RefreshCw,
  CheckCircle2,
  Gauge,
  Activity,
  Navigation,
  Route as RouteIcon,
  CloudRain,
  Car,
  Wrench,
  DollarSign,
  Info,
} from 'lucide-react';
import {
  MockCheckpoint,
  MockRoute,
  MockVehicle,
  MockReroute,
  RouteProblem,
  AlternateCandidateRoute,
  CHECKPOINT_TYPE_LABELS,
  getOsrmAlternateCorridor,
} from '@nexus-ways/shared';

interface FleetMapViewProps {
  vehicle: MockVehicle;
  route: MockRoute;
  checkpoints: MockCheckpoint[];
  activeReroute?: MockReroute | null;
  previewReroute?: MockReroute | null;
}

/**
 * Robust Coordinate Normalizer
 * In India: Latitude is ~8° to 38°N, Longitude is ~68° to 98°E.
 * GeoJSON LineStrings from OSRM store coordinates as [longitude, latitude] ([lng, lat]).
 * Leaflet strictly expects [latitude, longitude] ([lat, lng]).
 * If first number is > 50 (i.e. longitude), this swaps to [lat, lng].
 */
function normalizeLatLng(coord: [number, number]): [number, number] {
  if (!Array.isArray(coord) || coord.length < 2) return [12.9716, 77.5946];
  const [a, b] = coord;
  if (typeof a !== 'number' || typeof b !== 'number' || isNaN(a) || isNaN(b)) {
    return [12.9716, 77.5946];
  }
  // Check if [lng, lat] (lng > 50 and lat < 45 in India)
  if (a > 50 && b < 45) {
    return [b, a];
  }
  return [a, b];
}

function normalizeLatLngArray(coords: [number, number][]): [number, number][] {
  if (!Array.isArray(coords)) return [];
  return coords.map(normalizeLatLng).filter((pt) => !isNaN(pt[0]) && !isNaN(pt[1]));
}

/**
 * Helper to smoothly connect an alternate route polyline from the vehicle position
 * or the designated divergence point along the road network.
 */
function buildConnectingAlternatePath(
  rawWaypoints: [number, number][],
  vehPos: [number, number],
  divPt: [number, number] | null,
  allBaseCoords: [number, number][],
  splitIdx: number,
): [number, number][] {
  const normWaypoints = normalizeLatLngArray(rawWaypoints);
  if (normWaypoints.length === 0) return [];
  const firstAltPt = normWaypoints[0];
  const distToFirst = Math.hypot(vehPos[0] - firstAltPt[0], vehPos[1] - firstAltPt[1]);

  if (distToFirst > 0.04) {
    const effectiveDiv = divPt || firstAltPt;
    const divIdx = allBaseCoords.findIndex(
      (pt) => Math.hypot(pt[0] - effectiveDiv[0], pt[1] - effectiveDiv[1]) < 0.035,
    );
    if (divIdx > splitIdx) {
      const connectingRoad = allBaseCoords.slice(splitIdx - 1, divIdx + 1);
      return [...connectingRoad, ...normWaypoints];
    } else {
      return [vehPos, ...normWaypoints];
    }
  }
  return [vehPos, ...normWaypoints];
}

export const FleetMapView: React.FC<FleetMapViewProps> = ({
  vehicle,
  route,
  checkpoints,
  activeReroute,
  previewReroute,
}) => {
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<MockCheckpoint | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'checkpoints'>('map');
  const [selectedProblem, setSelectedProblem] = useState<RouteProblem | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  // Map state
  const [tileError, setTileError] = useState(false);
  const [tileSourceIndex, setTileSourceIndex] = useState(0);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);

  const effectiveReroute = previewReroute || activeReroute;
  const isAccepted = Boolean(activeReroute?.accepted);
  const isPreview = Boolean(previewReroute && !activeReroute?.accepted);

  const totalDist = route.total_distance_km || 354;
  const currentDist = (vehicle.progress_pct / 100) * totalDist;
  const remainingDist = Math.max(0, totalDist - currentDist);

  // Tile Providers: OpenStreetMap primary, CartoDB Voyager fallback
  const tileProviders = [
    {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxZoom: 19,
      subdomains: ['a', 'b', 'c'],
      name: 'OpenStreetMap Standard',
    },
    {
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      maxZoom: 19,
      subdomains: ['a', 'b', 'c', 'd'],
      name: 'CartoDB Voyager',
    },
  ];

  // Derive and normalize raw coordinates for base route
  const rawCoords: [number, number][] =
    route.osrm_geometry &&
    Array.isArray(route.osrm_geometry.coordinates) &&
    route.osrm_geometry.coordinates.length > 0
      ? route.osrm_geometry.coordinates
      : [
          [80.2707, 13.0827], // Chennai
          [80.0543, 13.0125],
          [79.9436, 12.9675], // Sriperumbudur
          [79.3331, 12.9276], // Ranipet
          [79.1325, 12.9165], // Vellore
          [78.7166, 12.7904], // Ambur
          [78.2137, 12.5186], // Krishnagiri
          [77.8253, 12.7409], // Hosur
          [77.5946, 12.9716], // Bengaluru
        ];

  const allCoords = normalizeLatLngArray(rawCoords);
  const splitIdx = Math.max(1, Math.min(allCoords.length, Math.round((vehicle.progress_pct / 100) * allCoords.length)));
  const vehiclePos = normalizeLatLng([vehicle.current_lat, vehicle.current_lng]);

  // 1. Travelled Route: Dense, verified OSRM roadway geometry from origin up to current vehicle position
  const travelledCoords: [number, number][] =
    allCoords.length > 0
      ? [...allCoords.slice(0, splitIdx), vehiclePos]
      : [vehiclePos];

  // 2. Original Remaining Route: Dense, verified OSRM roadway geometry from vehicle position to destination hub
  const remainingOriginalCoords: [number, number][] =
    allCoords.length > 0
      ? [vehiclePos, ...allCoords.slice(splitIdx)]
      : [vehiclePos];

  // 3. Alternate Candidates & Reroute Paths
  const candidates: AlternateCandidateRoute[] = effectiveReroute?.alternate_candidates || [];

  // Active candidate: user-selected or system recommended
  const activeCandidate: AlternateCandidateRoute | null =
    (selectedCandidateId && candidates.find((c) => c.id === selectedCandidateId)) ||
    candidates.find((c) => c.is_recommended) ||
    candidates[0] ||
    null;

  // Secondary candidate(s) for multi-alternative comparison
  const secondaryCandidates: AlternateCandidateRoute[] = candidates.filter(
    (c) => c.id !== activeCandidate?.id,
  );

  const divergencePos: [number, number] | null = effectiveReroute?.divergence_point
    ? normalizeLatLng([
        effectiveReroute.divergence_point.latitude,
        effectiveReroute.divergence_point.longitude,
      ])
    : null;

  const problems = effectiveReroute?.problems || [];

  // 4. Primary Recommended Alternate Route Coordinates
  let primaryAlternateCoords: [number, number][] = [];
  if (effectiveReroute) {
    const rawAltWaypoints =
      activeCandidate?.waypoints && activeCandidate.waypoints.length > 10
        ? activeCandidate.waypoints
        : effectiveReroute.alternate_waypoints && effectiveReroute.alternate_waypoints.length > 10
        ? effectiveReroute.alternate_waypoints
        : getOsrmAlternateCorridor(
            activeCandidate?.corridor ||
              effectiveReroute.alternate_corridor ||
              effectiveReroute.recommended_route_name,
          ) ||
          effectiveReroute.alternate_waypoints ||
          effectiveReroute.route_waypoints ||
          [];

    primaryAlternateCoords = buildConnectingAlternatePath(
      rawAltWaypoints,
      vehiclePos,
      divergencePos,
      allCoords,
      splitIdx,
    );
  }

  // 5. Secondary Candidate Coordinates
  const secondaryRoutePaths: { candidate: AlternateCandidateRoute; coords: [number, number][] }[] =
    useMemo(() => {
      return secondaryCandidates
        .map((cand) => {
          const raw =
            cand.waypoints && cand.waypoints.length > 10
              ? cand.waypoints
              : getOsrmAlternateCorridor(cand.corridor || cand.name) || cand.waypoints || [];
          const coords = buildConnectingAlternatePath(
            raw,
            vehiclePos,
            divergencePos,
            allCoords,
            splitIdx,
          );
          return { candidate: cand, coords };
        })
        .filter((item) => item.coords.length > 1);
    }, [secondaryCandidates, vehiclePos, divergencePos, allCoords, splitIdx]);

  // Center on fleet
  const handleCenterFleet = useCallback(() => {
    if (mapInstanceRef.current && vehiclePos) {
      mapInstanceRef.current.setView(vehiclePos, 12, { animate: true });
    }
  }, [vehiclePos]);

  // Fit bounds to entire route
  const handleFitRoute = useCallback(() => {
    if (mapInstanceRef.current && boundsRef.current && boundsRef.current.isValid()) {
      mapInstanceRef.current.fitBounds(boundsRef.current, {
        padding: [35, 35],
        maxZoom: 14,
        animate: true,
      });
    }
  }, []);

  // Zoom In / Out
  const handleZoomIn = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomIn();
  };
  const handleZoomOut = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomOut();
  };

  // Switch to fallback tile layer
  const handleSwitchTileLayer = () => {
    setTileSourceIndex((prev) => (prev + 1) % tileProviders.length);
    setTileError(false);
  };

  // 1. Initialize Map once on mount
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      try {
        const map = L.map(mapContainerRef.current, {
          zoomControl: false,
          attributionControl: false,
        }).setView(vehiclePos, 9);

        const currentProvider = tileProviders[tileSourceIndex];
        const tileLayer = L.tileLayer(currentProvider.url, {
          maxZoom: currentProvider.maxZoom,
          subdomains: currentProvider.subdomains,
        }).addTo(map);

        tileLayer.on('tileerror', () => {
          setTileError(true);
        });

        tileLayer.on('load', () => {
          setTileError(false);
        });

        const layerGroup = L.layerGroup().addTo(map);

        mapInstanceRef.current = map;
        layerGroupRef.current = layerGroup;
      } catch (e) {
        return;
      }
    }

    const ro = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    ro.observe(mapContainerRef.current);

    return () => {
      ro.disconnect();
    };
  }, [tileSourceIndex]);

  // 2. Unmount cleanup
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 3. InvalidateSize when switching tabs or window resizing
  useEffect(() => {
    if (activeTab === 'map' && mapInstanceRef.current) {
      const timer = setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
          if (boundsRef.current && boundsRef.current.isValid()) {
            mapInstanceRef.current.fitBounds(boundsRef.current, {
              padding: [35, 35],
              maxZoom: 14,
            });
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  // 4. Update Polylines, Markers, Checkpoints, Hazards, and Overlays
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    const bounds = L.latLngBounds([]);

    // -------------------------------------------------------------
    // LAYER 1: Completed Travelled Route (Emerald Green solid line)
    // -------------------------------------------------------------
    if (travelledCoords.length > 1) {
      L.polyline(travelledCoords, {
        color: '#10b981',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layerGroup);
      travelledCoords.forEach((pt) => bounds.extend(pt));
    }

    // -------------------------------------------------------------
    // LAYER 2: Original Remaining Route (Blue line, dashed if reroute active/preview)
    // -------------------------------------------------------------
    if (remainingOriginalCoords.length > 1) {
      L.polyline(remainingOriginalCoords, {
        color: '#2563eb',
        weight: 4.5,
        opacity: 0.85,
        dashArray: effectiveReroute ? '6, 6' : undefined,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layerGroup);
      remainingOriginalCoords.forEach((pt) => bounds.extend(pt));
    }

    // -------------------------------------------------------------
    // LAYER 3: Additional Alternate Candidate Routes (Cyan dashed line)
    // -------------------------------------------------------------
    secondaryRoutePaths.forEach(({ candidate: cand, coords }) => {
      if (coords.length > 1) {
        const poly = L.polyline(coords, {
          color: '#0891b2',
          weight: 4,
          opacity: 0.8,
          dashArray: '5, 5',
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(layerGroup);

        poly.on('click', () => setSelectedCandidateId(cand.id));

        poly.bindPopup(`
          <div style="font-family: inherit; font-size: 12px; line-height: 1.45; min-width: 220px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
              <strong style="color: #0e7490; font-size: 13px;">${cand.name}</strong>
              <span style="font-size: 10px; background-color: #cffafe; color: #0891b2; font-weight: bold; padding: 2px 6px; border-radius: 4px;">Candidate</span>
            </div>
            <div>Distance: <strong>${cand.distance_km} km</strong></div>
            <div>Duration: <strong>${Math.floor(cand.duration_minutes / 60)}h ${cand.duration_minutes % 60}m</strong></div>
            <div>Toll: <strong>₹${cand.toll_cost_inr}</strong> • Fuel: <strong>₹${cand.fuel_cost_inr}</strong></div>
            <div>Risk Score: <strong>${cand.risk_score}/100</strong></div>
            <div style="margin-top: 6px; font-size: 11px; color: #0891b2; font-weight: bold; cursor: pointer;">
              Click candidate pill below map to select this route.
            </div>
          </div>
        `);

        coords.forEach((pt) => bounds.extend(pt));
      }
    });

    // -------------------------------------------------------------
    // LAYER 4: Recommended / Active Alternate Route (Bold Green Line)
    // -------------------------------------------------------------
    if (primaryAlternateCoords.length > 1) {
      const altPoly = L.polyline(primaryAlternateCoords, {
        color: '#059669',
        weight: 5.5,
        opacity: 0.95,
        dashArray: isAccepted ? undefined : '8, 8',
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layerGroup);

      const altName =
        activeCandidate?.name ||
        effectiveReroute?.alternate_corridor ||
        effectiveReroute?.recommended_route_name ||
        'Recommended Alternate Route';
      const altDist =
        activeCandidate?.distance_km ||
        effectiveReroute?.alternate_metrics?.remaining_distance_km ||
        342;
      const altDur =
        activeCandidate?.duration_minutes ||
        effectiveReroute?.alternate_metrics?.predicted_travel_time_minutes ||
        342;

      altPoly.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; line-height: 1.45; min-width: 230px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <strong style="color: #065f46; font-size: 13px;">${altName}</strong>
            <span style="font-size: 10px; background-color: #d1fae5; color: #065f46; font-weight: bold; padding: 2px 6px; border-radius: 4px;">
              ${isAccepted ? 'ACTIVE REROUTE' : activeCandidate?.is_recommended ? 'RECOMMENDED' : 'SELECTED'}
            </span>
          </div>
          <div>Distance: <strong>${altDist} km</strong></div>
          <div>Duration: <strong>${Math.floor(altDur / 60)}h ${altDur % 60}m</strong></div>
          <div>Toll: <strong>₹${activeCandidate?.toll_cost_inr || effectiveReroute?.alternate_metrics?.toll_cost_inr || 485}</strong></div>
          <div>Risk Score: <strong>${activeCandidate?.risk_score || effectiveReroute?.alternate_metrics?.route_risk_score || 22}/100</strong></div>
          <div style="margin-top: 6px; font-size: 11px; color: #059669; font-weight: 500;">
            Follows verified high-capacity corridor avoiding bottleneck zones.
          </div>
        </div>
      `);

      primaryAlternateCoords.forEach((pt) => bounds.extend(pt));
    }

    // -------------------------------------------------------------
    // LAYER 5: Traffic Congestion Segments & Bottleneck Road Polylines
    // -------------------------------------------------------------
    problems.forEach((prob) => {
      const isTraffic =
        prob.category === 'traffic_congestion' ||
        prob.category === 'highway_incident' ||
        prob.category === 'road_closure' ||
        prob.expected_delay_minutes >= 10;
      if (isTraffic && allCoords.length > 5) {
        // Find nearest coordinate in the base route
        let closestIdx = -1;
        let minDist = Infinity;
        for (let i = 0; i < allCoords.length; i++) {
          const d = Math.hypot(allCoords[i][0] - prob.latitude, allCoords[i][1] - prob.longitude);
          if (d < minDist) {
            minDist = d;
            closestIdx = i;
          }
        }

        // Draw a congested segment slice around the bottleneck
        if (minDist < 0.12 && closestIdx !== -1) {
          const segStart = Math.max(0, closestIdx - 7);
          const segEnd = Math.min(allCoords.length, closestIdx + 8);
          const congestedSlice = allCoords.slice(segStart, segEnd);

          if (congestedSlice.length > 1) {
            const congPoly = L.polyline(congestedSlice, {
              color: '#e11d48',
              weight: 7,
              opacity: 0.85,
              dashArray: '4, 4',
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(layerGroup);

            congPoly.bindPopup(`
              <div style="font-family: inherit; font-size: 12px; line-height: 1.4; max-width: 240px;">
                <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #e11d48;"></span>
                  <strong style="color: #9f1239; font-size: 13px;">Congested Road Segment</strong>
                </div>
                <div style="font-weight: 600; color: #0f172a;">${prob.location_name}</div>
                <div style="font-size: 11px; color: #475569; margin-top: 2px;">${prob.evidence}</div>
                <div style="margin-top: 4px; font-weight: bold; color: #e11d48; font-size: 11px;">
                  +${prob.expected_delay_minutes} min delay • ${prob.status}
                </div>
              </div>
            `);
          }
        }
      }
    });

    // -------------------------------------------------------------
    // LAYER 6: Origin & Destination Hub Markers
    // -------------------------------------------------------------
    // Origin Terminal
    if (allCoords.length > 0) {
      const originPos = allCoords[0];
      const originIcon = L.divIcon({
        className: 'origin-marker-pin',
        html: `
          <div style="background-color: #334155; width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.25); display: flex; align-items: center; justify-content: center; color: white;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const originMarker = L.marker(originPos, { icon: originIcon, zIndexOffset: 700 }).addTo(layerGroup);
      originMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; line-height: 1.4;">
          <strong style="color: #334155; font-size: 13px;">Origin Terminal</strong><br/>
          <span>${route.origin_city || 'Origin Freight Port'}</span>
        </div>
      `);
      bounds.extend(originPos);
    }

    // Destination Terminal
    const destRawPos: [number, number] = [
      effectiveReroute?.destination_point?.latitude ||
        allCoords[allCoords.length - 1]?.[0] ||
        12.9716,
      effectiveReroute?.destination_point?.longitude ||
        allCoords[allCoords.length - 1]?.[1] ||
        77.5946,
    ];
    const destPos = normalizeLatLng(destRawPos);
    const destIcon = L.divIcon({
      className: 'dest-marker-pin',
      html: `
        <div style="background-color: #10b981; width: 30px; height: 30px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(16,185,129,0.4); display: flex; align-items: center; justify-content: center; color: white;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
          </svg>
        </div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    const destMarker = L.marker(destPos, { icon: destIcon, zIndexOffset: 700 }).addTo(layerGroup);
    destMarker.bindPopup(`
      <div style="font-family: inherit; font-size: 12px; line-height: 1.4;">
        <strong style="color: #065f46; font-size: 13px;">Destination Hub</strong><br/>
        <span>${effectiveReroute?.destination_point?.name || route.destination_city || 'Destination Hub'}</span>
      </div>
    `);
    bounds.extend(destPos);

    // -------------------------------------------------------------
    // LAYER 7: Checkpoints along Original Route (Circular Badges)
    // -------------------------------------------------------------
    checkpoints.forEach((cp, idx) => {
      const cpPos = normalizeLatLng([cp.latitude, cp.longitude]);
      const isPassed = cp.distance_from_start_km <= currentDist;
      const isCurrent =
        Math.abs(cp.distance_from_start_km - currentDist) <= 25 ||
        (isPassed &&
          (idx === checkpoints.length - 1 ||
            checkpoints[idx + 1].distance_from_start_km > currentDist));

      const bgColor = isPassed ? '#10b981' : isCurrent ? '#2563eb' : '#64748b';
      const textColor = 'white';

      const cpIcon = L.divIcon({
        className: 'cp-marker-pin',
        html: `
          <div style="background-color: ${bgColor}; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.25); display: flex; align-items: center; justify-content: center; color: ${textColor}; font-weight: bold; font-size: 10px; cursor: pointer;">
            ${idx + 1}
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const cpMarker = L.marker(cpPos, { icon: cpIcon, zIndexOffset: 650 }).addTo(layerGroup);
      cpMarker.on('click', () => setSelectedCheckpoint(cp));
      cpMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; line-height: 1.4; min-width: 180px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
            <strong style="color: #0f172a; font-size: 12px;">#${idx + 1} ${cp.name}</strong>
            <span style="font-size: 10px; text-transform: uppercase; font-weight: bold; color: ${bgColor};">
              ${isPassed ? 'PASSED' : isCurrent ? 'CURRENT' : 'UPCOMING'}
            </span>
          </div>
          <div style="font-size: 11px; color: #64748b;">${CHECKPOINT_TYPE_LABELS[cp.type] || cp.type} • ${cp.distance_from_start_km} km</div>
          <div style="margin-top: 4px; font-size: 11px; color: #334155;">
            Arrival: <strong>+${cp.planned_arrival_minutes}m</strong> • Halt: <strong>${cp.avg_halt_minutes}m</strong>
          </div>
        </div>
      `);
      bounds.extend(cpPos);
    });

    // -------------------------------------------------------------
    // LAYER 8: Checkpoints along Alternate Route (Diamond Badges)
    // -------------------------------------------------------------
    const altCheckpoints = activeCandidate?.checkpoints || [];
    altCheckpoints.forEach((acp, idx) => {
      const acpPos = normalizeLatLng([acp.latitude, acp.longitude]);
      const diamondIcon = L.divIcon({
        className: 'alt-cp-marker-pin',
        html: `
          <div style="transform: rotate(45deg); background-color: #059669; width: 22px; height: 22px; border-radius: 4px; border: 2px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; cursor: pointer;">
            <span style="transform: rotate(-45deg); color: white; font-weight: bold; font-size: 9px;">A${idx + 1}</span>
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const acpMarker = L.marker(acpPos, { icon: diamondIcon, zIndexOffset: 660 }).addTo(layerGroup);
      acpMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; line-height: 1.4; min-width: 190px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
            <strong style="color: #065f46; font-size: 12px;">Alternate CP: ${acp.name}</strong>
            <span style="font-size: 10px; background-color: #d1fae5; color: #065f46; font-weight: bold; padding: 1px 4px; border-radius: 3px;">A${idx + 1}</span>
          </div>
          <div style="font-size: 11px; color: #475569;">${CHECKPOINT_TYPE_LABELS[acp.type as keyof typeof CHECKPOINT_TYPE_LABELS] || acp.type}</div>
          <div style="margin-top: 3px; font-size: 11px; color: #065f46; font-weight: 600;">
            ${acp.planned_arrival_minutes ? `Planned Arrival: +${acp.planned_arrival_minutes}m` : `Sequence: #${idx + 1}`}
          </div>
        </div>
      `);
      bounds.extend(acpPos);
    });

    // -------------------------------------------------------------
    // LAYER 9: Divergence Point Marker (if reroute exists)
    // -------------------------------------------------------------
    if (divergencePos) {
      const divIcon = L.divIcon({
        className: 'div-marker-pin',
        html: `
          <div style="background-color: #f59e0b; width: 32px; height: 32px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(245,158,11,0.5); display: flex; align-items: center; justify-content: center; color: white;">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"/><path d="M12 12v3"/>
            </svg>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const divMarker = L.marker(divergencePos, { icon: divIcon, zIndexOffset: 850 }).addTo(layerGroup);
      divMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; line-height: 1.45; min-width: 220px;">
          <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #f59e0b;"></span>
            <strong style="color: #b45309; font-size: 13px;">Route Divergence Point</strong>
          </div>
          <div style="font-weight: 600; color: #0f172a;">${effectiveReroute?.divergence_point?.name || 'Highway Divergence Interchange'}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 3px;">
            Vehicles transition from original corridor onto alternate route at this junction.
          </div>
        </div>
      `);
      bounds.extend(divergencePos);
    }

    // -------------------------------------------------------------
    // LAYER 10: Convergence Point Marker (if reroute exists)
    // -------------------------------------------------------------
    if (effectiveReroute?.convergence_point) {
      const convPos = normalizeLatLng([
        effectiveReroute.convergence_point.latitude,
        effectiveReroute.convergence_point.longitude,
      ]);
      const convIcon = L.divIcon({
        className: 'conv-marker-pin',
        html: `
          <div style="background-color: #8b5cf6; width: 32px; height: 32px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(139,92,246,0.5); display: flex; align-items: center; justify-content: center; color: white;">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M4 15h7a3 3 0 0 0 3-3V4"/><path d="m8 19 4-4-4-4"/><circle cx="14" cy="4" r="2"/>
            </svg>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const convMarker = L.marker(convPos, { icon: convIcon, zIndexOffset: 850 }).addTo(layerGroup);
      convMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; line-height: 1.45; min-width: 220px;">
          <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #8b5cf6;"></span>
            <strong style="color: #6d28d9; font-size: 13px;">Route Convergence Point</strong>
          </div>
          <div style="font-weight: 600; color: #0f172a;">${effectiveReroute.convergence_point.name || 'Highway Convergence Interchange'}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 3px;">
            Alternate corridor merges into primary metropolitan arterial approach.
          </div>
        </div>
      `);
      bounds.extend(convPos);
    }

    // -------------------------------------------------------------
    // LAYER 11: Hazard, Traffic Bottleneck & Restriction Markers
    // -------------------------------------------------------------
    problems.forEach((prob) => {
      const probPos = normalizeLatLng([prob.latitude, prob.longitude]);
      const isCritical = prob.severity === 'critical';
      const isHigh = prob.severity === 'high';
      const bgColor = isCritical ? '#e11d48' : isHigh ? '#ea580c' : '#d97706';

      // Category specific icon SVG
      let iconSvg = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      `;
      if (
        prob.category === 'traffic_congestion' ||
        prob.category === 'highway_incident' ||
        prob.category === 'road_closure'
      ) {
        iconSvg = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>
          </svg>
        `;
      } else if (
        prob.category === 'heavy_rain' ||
        prob.category === 'fog_low_visibility'
      ) {
        iconSvg = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>
          </svg>
        `;
      }

      const hazardIcon = L.divIcon({
        className: 'hazard-marker-pin',
        html: `
          <div style="background-color: ${bgColor}; width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; cursor: pointer;">
            ${iconSvg}
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const hazardMarker = L.marker(probPos, { icon: hazardIcon, zIndexOffset: 780 }).addTo(layerGroup);
      hazardMarker.on('click', () => setSelectedProblem(prob));

      hazardMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; line-height: 1.45; min-width: 230px; max-width: 270px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px;">
            <strong style="color: #9f1239; font-size: 13px;">${prob.location_name}</strong>
            <span style="font-size: 10px; background-color: #ffe4e6; color: #e11d48; font-weight: bold; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">
              ${prob.severity}
            </span>
          </div>
          <div style="font-size: 11px; color: #475569; margin-top: 2px;">${prob.evidence}</div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 6px; padding-top: 4px; border-top: 1px solid #f1f5f9;">
            <span style="font-weight: bold; color: #e11d48; font-size: 11px;">+${prob.expected_delay_minutes} min delay</span>
            <span style="font-size: 10px; background-color: #f1f5f9; color: #475569; padding: 1px 5px; border-radius: 3px; font-weight: 500;">${prob.status}</span>
          </div>
        </div>
      `);
      bounds.extend(probPos);
    });

    // -------------------------------------------------------------
    // LAYER 12: Live Fleet Vehicle Marker
    // -------------------------------------------------------------
    const vehicleIcon = L.divIcon({
      className: 'vehicle-map-pin',
      html: `
        <div style="background-color: #2563eb; width: 36px; height: 36px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 4px 12px rgba(37,99,235,0.5); display: flex; align-items: center; justify-content: center; color: white;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 17h4V5H2v12h3"/>
            <polygon points="14,5 18,9 18,17 14,17"/>
            <circle cx="7.5" cy="17.5" r="2.5"/>
            <circle cx="17.5" cy="17.5" r="2.5"/>
          </svg>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    const vMarker = L.marker(vehiclePos, { icon: vehicleIcon, zIndexOffset: 1000 }).addTo(layerGroup);
    vMarker.bindPopup(`
      <div style="font-family: inherit; font-size: 12px; line-height: 1.45;">
        <strong style="color: #0f172a; font-size: 13px;">${vehicle.registration_number}</strong><br/>
        Speed: <strong>${vehicle.speed_kmh} km/h</strong><br/>
        Progress: <strong>${vehicle.progress_pct.toFixed(1)}% Completed</strong><br/>
        <span style="font-size: 11px; color: #64748b;">${route.corridor || 'Highway Corridor'}</span>
      </div>
    `);
    bounds.extend(vehiclePos);

    boundsRef.current = bounds;

    // Fit bounds smoothly to view
    if (bounds.isValid()) {
      try {
        map.fitBounds(bounds, { padding: [35, 35], maxZoom: 14 });
      } catch (e) {
        // Safe fallback
      }
    }
  }, [
    vehicle,
    route,
    effectiveReroute,
    isAccepted,
    activeCandidate,
    secondaryRoutePaths,
    travelledCoords,
    remainingOriginalCoords,
    primaryAlternateCoords,
    checkpoints,
  ]);

  return (
    <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-5 shadow-sm text-slate-900 flex flex-col flex-1 min-h-[560px]">
      {/* Top Header with Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 mb-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-blue-600" />
          <div>
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>Corridor Telemetry & Dual-Route Map</span>
              {isAccepted && (
                <span className="px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold">
                  ACCEPTED ACTIVE
                </span>
              )}
              {isPreview && (
                <span className="px-2 py-0.2 rounded-full bg-blue-100 text-blue-800 border border-blue-300 text-[10px] font-bold">
                  PREVIEWING
                </span>
              )}
            </h4>
            <p className="text-xs text-slate-500">{route.corridor || route.name}</p>
          </div>
        </div>

        {/* View Toggle Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
          <button
            onClick={() => setActiveTab('map')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'map'
                ? 'bg-blue-600 text-white shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>Interactive Map</span>
          </button>
          <button
            onClick={() => setActiveTab('checkpoints')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'checkpoints'
                ? 'bg-blue-600 text-white shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Checkpoints ({checkpoints.length})</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: INTERACTIVE PREDICTIVE DUAL-ROUTE MAP VIEW         */}
      {/* ========================================================= */}
      <div className={activeTab === 'map' ? 'flex-1 min-h-0 flex flex-col space-y-3' : 'hidden'}>
        {/* 1. Geographical Map Viewport (Unobstructed, full container) */}
        <div className="relative flex-1 min-h-[390px] w-full rounded-xl overflow-hidden border border-slate-200 shadow-inner flex flex-col">
          {/* Leaflet Map DOM Element */}
          <div ref={mapContainerRef} className="w-full flex-1 min-h-[390px] z-0 bg-slate-100" />

          {/* Tile Load Error / Fallback Banner */}
          {tileError && (
            <div className="absolute top-3 left-3 right-14 z-[400] bg-amber-50/95 backdrop-blur-md border border-amber-300 rounded-lg p-2.5 shadow-md flex items-center justify-between gap-2 text-xs text-amber-900">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Tile network blip on {tileProviders[tileSourceIndex].name}.</span>
              </div>
              <button
                onClick={handleSwitchTileLayer}
                className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] cursor-pointer flex items-center gap-1 shadow-xs"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Switch Tile Mirror</span>
              </button>
            </div>
          )}

          {/* Custom Map Controls Overlay (Top Right) */}
          <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1.5">
            <button
              onClick={handleZoomIn}
              title="Zoom In"
              className="w-8 h-8 rounded-lg bg-white/95 hover:bg-white border border-slate-200 text-slate-700 shadow-sm flex items-center justify-center cursor-pointer transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              title="Zoom Out"
              className="w-8 h-8 rounded-lg bg-white/95 hover:bg-white border border-slate-200 text-slate-700 shadow-sm flex items-center justify-center cursor-pointer transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleFitRoute}
              title="Fit Full Route"
              className="w-8 h-8 rounded-lg bg-white/95 hover:bg-white border border-slate-200 text-slate-700 shadow-sm flex items-center justify-center cursor-pointer transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleCenterFleet}
              title="Focus Live Fleet"
              className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 shadow-sm flex items-center justify-center cursor-pointer transition-colors"
            >
              <Crosshair className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Candidate Selection Strip (when multiple alternate options exist) */}
        {candidates.length > 0 && (
          <div className="bg-slate-50/90 border border-slate-200/90 rounded-xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
            <div className="flex items-center gap-1.5 text-slate-600 font-semibold text-[11px]">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Route Options:</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {candidates.map((cand) => {
                const isSelected = activeCandidate?.id === cand.id;
                return (
                  <button
                    key={cand.id}
                    onClick={() => setSelectedCandidateId(cand.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {cand.is_recommended && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-300"></span>
                    )}
                    <span>{cand.name}</span>
                    <span
                      className={`text-[10px] font-mono ${
                        isSelected ? 'text-emerald-100' : 'text-slate-500'
                      }`}
                    >
                      ({cand.distance_km} km • {Math.floor(cand.duration_minutes / 60)}h{' '}
                      {cand.duration_minutes % 60}m)
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Comprehensive Route Legend – Below the Map (Reflecting ALL 11 Layers) */}
        <div className="bg-slate-50/90 border border-slate-200/90 rounded-xl px-4 py-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs shrink-0 select-none">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* 1. Travelled Route */}
            <span className="flex items-center gap-1.5 font-medium text-slate-700">
              <span className="w-3.5 h-1.5 bg-[#10b981] rounded-full inline-block" />
              <span>Travelled</span>
            </span>

            {/* 2. Original Route */}
            <span className="flex items-center gap-1.5 font-medium text-slate-700">
              <span className="w-3.5 h-1.5 bg-[#2563eb] rounded-full inline-block" />
              <span>Original Route</span>
            </span>

            {/* 3. Recommended Alternate Route */}
            {effectiveReroute && (
              <span className="flex items-center gap-1.5 font-bold text-emerald-800">
                <span className="w-3.5 h-1.5 bg-[#059669] rounded-full inline-block" />
                <span>Recommended Alternate</span>
              </span>
            )}

            {/* 4. Additional Candidates */}
            {secondaryCandidates.length > 0 && (
              <span className="flex items-center gap-1.5 font-medium text-cyan-700">
                <span className="w-3.5 h-1.5 border-b-2 border-dashed border-[#0891b2] inline-block" />
                <span>Alternate Candidate</span>
              </span>
            )}

            {/* 5. Live Fleet Position */}
            <span className="flex items-center gap-1.5 font-medium text-blue-700">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block ring-2 ring-blue-300" />
              <span>Fleet Truck</span>
            </span>

            {/* 6. Divergence Point */}
            {divergencePos && (
              <span className="flex items-center gap-1.5 text-amber-700 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-xs" />
                <span>Divergence</span>
              </span>
            )}

            {/* 7. Convergence Point */}
            {effectiveReroute?.convergence_point && (
              <span className="flex items-center gap-1.5 text-purple-700 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block shadow-xs" />
                <span>Convergence</span>
              </span>
            )}

            {/* 8. Destination Terminal */}
            <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
              <Flag className="w-3 h-3 text-emerald-600" />
              <span>Destination</span>
            </span>

            {/* 9. Checkpoints */}
            <span className="flex items-center gap-1.5 text-slate-700 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" />
              <span>Checkpoints</span>
            </span>

            {/* 10. Traffic Congestion Road Segment */}
            <span className="flex items-center gap-1.5 text-rose-700 font-medium">
              <span className="w-3.5 h-1.5 bg-[#e11d48] rounded-full inline-block" />
              <span>Congested Road</span>
            </span>

            {/* 11. Predicted Hazards */}
            {problems.length > 0 && (
              <span className="flex items-center gap-1.5 text-rose-700 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                <span>Hazards ({problems.length})</span>
              </span>
            )}
          </div>

          <div className="text-[11px] text-slate-500 font-medium hidden sm:inline-block">
            Corridor:{' '}
            <span className="text-slate-700 font-semibold">{route.corridor || 'Highway Network'}</span>
          </div>
        </div>

        {/* 4. Journey Information – Below the Legend */}
        <div className="bg-white border border-slate-200/90 rounded-xl px-4 py-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            {/* Current Speed */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                <Gauge className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Current Speed</div>
                <div className="text-xs font-mono font-bold text-slate-900">{vehicle.speed_kmh} km/h</div>
              </div>
            </div>

            {/* Journey Completion */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <Activity className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Completion</div>
                <div className="text-xs font-mono font-bold text-slate-900">{vehicle.progress_pct.toFixed(1)}% Completed</div>
              </div>
            </div>

            {/* Distance Split */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
                <Navigation className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Distance</div>
                <div className="text-xs font-mono font-semibold text-slate-700">
                  {currentDist.toFixed(0)} km / {totalDist.toFixed(0)} km ({remainingDist.toFixed(0)} km remaining)
                </div>
              </div>
            </div>
          </div>

          {/* Route Status Badge */}
          <div className="flex items-center gap-2">
            {isAccepted ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Active Alternate Route</span>
              </span>
            ) : isPreview ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[11px]">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Previewing Alternate</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-medium text-[11px]">
                <RouteIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>Original Transit Path</span>
              </span>
            )}
          </div>
        </div>

        {/* 5. Clicked Problem Detail Strip */}
        {selectedProblem && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs space-y-1 shrink-0 animate-in fade-in duration-200">
            <div className="flex items-center justify-between font-bold text-rose-950">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                <span>{selectedProblem.location_name}</span>
                <span className="text-[10px] bg-rose-200/70 text-rose-800 px-1.5 py-0.2 rounded font-normal uppercase">
                  {selectedProblem.status}
                </span>
              </span>
              <span className="font-mono text-rose-700 font-bold">
                +{selectedProblem.expected_delay_minutes} min delay
              </span>
            </div>
            <p className="text-slate-700 text-[11px] leading-relaxed">{selectedProblem.evidence}</p>
            <div className="text-[10px] text-slate-600 font-medium">
              Recommendation: {selectedProblem.recommended_action}
            </div>
          </div>
        )}

        {/* 6. Clicked Checkpoint Detail Strip */}
        {selectedCheckpoint && (
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs space-y-1 shrink-0 animate-in fade-in duration-200">
            <div className="flex items-center justify-between font-bold text-blue-950">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                <span>{selectedCheckpoint.name}</span>
                <span className="text-[10px] bg-blue-200/70 text-blue-800 px-1.5 py-0.2 rounded font-normal uppercase">
                  {CHECKPOINT_TYPE_LABELS[selectedCheckpoint.type] || selectedCheckpoint.type}
                </span>
              </span>
              <span className="font-mono text-blue-700 font-semibold text-[11px]">
                {selectedCheckpoint.distance_from_start_km} km from start
              </span>
            </div>
            <div className="text-[11px] text-slate-600">
              Planned arrival: +{selectedCheckpoint.planned_arrival_minutes} min • Expected halt:{' '}
              {selectedCheckpoint.avg_halt_minutes} min
            </div>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* TAB 2: COMPACT CHECKPOINTS & JOURNEY TIMELINE VIEW        */}
      {/* Clean vertical layout: Summary -> Progress Bar -> List    */}
      {/* ========================================================= */}
      <div
        className={activeTab === 'checkpoints' ? 'flex-1 min-h-0 flex flex-col space-y-3.5' : 'hidden'}
      >
        {/* 1. Journey Progress Header Summary (Top) */}
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Transit Progress
            </div>
            <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
              {Math.round(currentDist)} km{' '}
              <span className="text-slate-400 font-normal">/ {Math.round(totalDist)} km</span>
            </div>
          </div>

          <div className="text-center">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Remaining
            </div>
            <div className="font-mono font-bold text-blue-700 text-sm mt-0.5">
              {Math.round(remainingDist)} km
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Status
            </div>
            <div className="font-mono font-bold text-emerald-700 text-sm mt-0.5">
              {vehicle.progress_pct.toFixed(1)}% Completed
            </div>
          </div>
        </div>

        {/* 2. Visual Progress Bar (Immediately below Summary) */}
        <div className="relative px-3 pt-3 pb-1 shrink-0">
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200 relative">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-blue-500 to-indigo-600 transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, vehicle.progress_pct))}%` }}
            />
          </div>

          {/* Vehicle Position Pin */}
          <div
            className="absolute -top-1 transform -translate-x-1/2 flex flex-col items-center z-10 transition-all duration-500"
            style={{ left: `${Math.min(96, Math.max(4, vehicle.progress_pct))}%` }}
          >
            <div className="p-1 rounded-full bg-blue-600 text-white shadow-md shadow-blue-500/30 animate-bounce">
              <Truck className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-mono font-bold text-blue-700 mt-1 bg-white px-1.5 py-0.2 rounded border border-blue-200 shadow-xs">
              {vehicle.speed_kmh} km/h
            </span>
          </div>
        </div>

        {/* 3. Checkpoint Cards List (Starts immediately below progress bar) */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1.5 scrollbar-thin scrollbar-thumb-slate-200">
          {checkpoints.map((cp, idx) => {
            const isPassed = cp.distance_from_start_km <= currentDist;
            const isCurrent =
              Math.abs(cp.distance_from_start_km - currentDist) <= 25 ||
              (isPassed &&
                (idx === checkpoints.length - 1 ||
                  checkpoints[idx + 1].distance_from_start_km > currentDist));
            const isSelected = selectedCheckpoint?.id === cp.id;

            return (
              <div
                key={cp.id}
                onClick={() => setSelectedCheckpoint(cp)}
                className={`p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center justify-between ${
                  isCurrent
                    ? 'bg-blue-50/90 border-blue-300 shadow-xs ring-1 ring-blue-200'
                    : isSelected
                    ? 'bg-indigo-50 border-indigo-300 shadow-xs'
                    : 'bg-slate-50/80 border-slate-200/80 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[11px] font-bold shrink-0 ${
                      isPassed
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                        : isCurrent
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {isPassed ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 line-clamp-1">{cp.name}</div>
                    <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                      <span className="capitalize">{CHECKPOINT_TYPE_LABELS[cp.type] || cp.type}</span>
                      <span>•</span>
                      <span className="font-mono">{cp.distance_from_start_km} km</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-mono text-[11px] font-semibold text-slate-800">
                    +{cp.planned_arrival_minutes}m
                  </div>
                  {cp.avg_halt_minutes > 0 ? (
                    <div className="text-[10px] font-medium text-amber-700">
                      Halt ~{cp.avg_halt_minutes}m
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400">Pass-through</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 4. Selected Checkpoint Footer Card */}
        {selectedCheckpoint && (
          <div className="p-3 rounded-xl bg-slate-50 border border-blue-200 text-xs space-y-1 shadow-xs shrink-0 animate-in fade-in duration-150">
            <div className="flex items-center justify-between font-bold text-blue-900">
              <span>{selectedCheckpoint.name}</span>
              <span className="font-mono text-slate-500 text-[11px]">
                {selectedCheckpoint.latitude.toFixed(4)}, {selectedCheckpoint.longitude.toFixed(4)}
              </span>
            </div>
            <div className="text-slate-600 text-[11px]">
              Distance from origin: {selectedCheckpoint.distance_from_start_km} km • Expected halt:{' '}
              {selectedCheckpoint.avg_halt_minutes} min • Sequence #{selectedCheckpoint.sequence_order}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
