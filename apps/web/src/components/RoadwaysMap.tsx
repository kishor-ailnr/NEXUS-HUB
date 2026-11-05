import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Vehicle, Trip, Geofence, GhostPositionPayload } from '@nexus-ways/shared';

interface RoadwaysMapProps {
  vehicles: Vehicle[];
  activeTrips: Trip[];
  geofences: Geofence[];
  ghostPositions?: Record<string, GhostPositionPayload>;
  selectedVehicleId?: string | null;
  onSelectVehicle?: (vehicle: Vehicle) => void;
  className?: string;
}

export const RoadwaysMap: React.FC<RoadwaysMapProps> = ({
  vehicles,
  activeTrips,
  geofences,
  ghostPositions = {},
  selectedVehicleId,
  onSelectVehicle,
  className = '',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const ghostGroupRef = useRef<L.LayerGroup | null>(null);
  const routesGroupRef = useRef<L.LayerGroup | null>(null);
  const geofencesGroupRef = useRef<L.LayerGroup | null>(null);

  // 1. Initialize Leaflet Map with invalidateSize triggers
  useEffect(() => {
    if (!mapContainerRef.current) return;

    try {
      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [19.076, 72.8777], // Mumbai default
          zoom: 7,
          zoomControl: true,
          attributionControl: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
        }).addTo(map);

        routesGroupRef.current = L.layerGroup().addTo(map);
        geofencesGroupRef.current = L.layerGroup().addTo(map);
        ghostGroupRef.current = L.layerGroup().addTo(map);
        markersGroupRef.current = L.layerGroup().addTo(map);

        mapInstanceRef.current = map;

        // Ensure full container dimension calculation
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
        mapInstanceRef.current?.invalidateSize?.();
      }
    };
    window.addEventListener('resize', handleWindowResize);

    // Resize observer for layout changes if available
    let resizeObserver: any = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current?.invalidateSize?.();
        }
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      if (resizeObserver) resizeObserver.disconnect();
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          // ignore
        }
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 2. Render Geofences
  useEffect(() => {
    if (!mapInstanceRef.current || !geofencesGroupRef.current) return;

    geofencesGroupRef.current.clearLayers();

    geofences.forEach((gf) => {
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
  }, [geofences]);

  // 3. Render Routes and Checkpoints
  useEffect(() => {
    if (!mapInstanceRef.current || !routesGroupRef.current) return;

    // Clear existing
    routesGroupRef.current.clearLayers();

    // If a vehicle is selected, highlight its route with prominence
    const targetTrips = selectedVehicleId
      ? activeTrips.filter((t) => t.vehicle_id === selectedVehicleId)
      : activeTrips;

    // If nothing found for selected vehicle, show all active trips
    const tripsToRender = targetTrips.length > 0 ? targetTrips : activeTrips;

    tripsToRender.forEach((trip) => {
      if (trip.status !== 'in_transit' && trip.status !== 'planned') return;
      const isSelected = selectedVehicleId === trip.vehicle_id;

      // Draw route polyline if coordinates available
      if (trip.route_geometry?.coordinates && trip.route_geometry.coordinates.length > 0) {
        const latLngs: [number, number][] = trip.route_geometry.coordinates.map((c) => [c[1], c[0]]);

        const isOsrm = trip.route_geometry.routing_source === 'osrm';
        const polyline = L.polyline(latLngs, {
          color: isSelected ? '#0284c7' : isOsrm ? '#3b82f6' : '#f59e0b',
          weight: isSelected ? 5 : 3.5,
          opacity: isSelected ? 0.95 : 0.6,
          dashArray: isOsrm || isSelected ? undefined : '6, 6',
        });

        polyline.bindTooltip(
          `<strong>${trip.origin_label} &rarr; ${trip.destination_label}</strong><br/>` +
          `Distance: ${trip.distance_km || 0} km | Route: ${isOsrm ? 'OSRM Highway' : 'Corridor'}`,
          { sticky: true },
        );

        routesGroupRef.current?.addLayer(polyline);
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
  }, [activeTrips, selectedVehicleId]);

  // 4. Render Digital Twin Ghost Markers
  useEffect(() => {
    if (!mapInstanceRef.current || !ghostGroupRef.current) return;

    ghostGroupRef.current.clearLayers();

    Object.values(ghostPositions).forEach((ghost) => {
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
  }, [ghostPositions]);

  // 5. Render Real Vehicle Markers
  useEffect(() => {
    if (!mapInstanceRef.current || !markersGroupRef.current) return;

    markersGroupRef.current.clearLayers();
    const map = mapInstanceRef.current;
    const bounds = L.latLngBounds([]);

    vehicles.forEach((v) => {
      const gps = v.latest_gps;
      const lat = gps?.lat || v.active_trip?.origin_lat || 19.076;
      const lng = gps?.lng || v.active_trip?.origin_lng || 72.8777;

      bounds.extend([lat, lng]);

      const isSelected = selectedVehicleId === v.id;
      const isTwin = (v as any).is_twin;
      const twinStatus = (v as any).twin_status;

      // Status color resolution
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
      const speed = gps?.speed_kmh || 0;
      const borderColor = isConvoy ? '#8b5cf6' : isSelected ? '#0284c7' : '#ffffff';

      const customIcon = L.divIcon({
        className: 'vehicle-marker',
        html: `
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
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([lat, lng], { icon: customIcon });

      const routeDesc =
        (v as any).route_short_name ||
        (v.active_trip
          ? `${v.active_trip.origin_label} &rarr; ${v.active_trip.destination_label}`
          : 'Base Depot');
      const nextCp = (v as any).next_checkpoint_name;
      const truckType = (v as any).truck_type_label || v.vehicle_type;

      const popupHtml = `
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
            ${
              isTwin
                ? `<div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #f1f5f9; text-align: right;">
                    <a href="/roadways/fleet-twin/${v.id}" style="display: inline-block; padding: 4px 10px; background: #0284c7; color: white; border-radius: 6px; font-weight: 600; text-decoration: none; font-size: 11px;">
                      Inspect Twin &rarr;
                    </a>
                   </div>`
                : ''
            }
            <div style="margin-top: 4px; font-size: 9px; color: #94a3b8; text-align: right;">
              [Live Telemetry]
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);

      marker.on('click', () => {
        if (onSelectVehicle) onSelectVehicle(v);
      });

      markersGroupRef.current?.addLayer(marker);

      if (isSelected) {
        marker.openPopup();
        map.setView([lat, lng], Math.max(map.getZoom(), 11), { animate: true });
      }
    });

    if (bounds.isValid() && vehicles.length > 0 && !selectedVehicleId) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
    }
  }, [vehicles, selectedVehicleId, onSelectVehicle]);

  return (
    <div
      className={`relative w-full h-[550px] min-h-[550px] rounded-xl overflow-hidden border border-slate-200/90 shadow-xs bg-slate-50 ${className}`}
      data-testid="roadways-live-map"
    >
      <div ref={mapContainerRef} className="w-full h-full min-h-[550px] z-0" style={{ width: '100%', height: '100%' }} />

      {/* Floating Simulation Engine Badge - Positioned at top-left next to controls to NEVER overlap the sidebar */}
      <div className="absolute top-3 left-14 z-10 bg-white/95 backdrop-blur-md text-slate-800 px-3 py-1.5 rounded-lg shadow-sm border border-slate-200/90 flex items-center gap-2 text-xs font-medium">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="font-semibold text-emerald-700">Roadways Live Simulation</span>
        <span className="text-[10px] text-slate-500 border-l border-slate-200 pl-2 font-mono">OSRM + Telemetry</span>
      </div>

      {/* Floating Legend */}
      <div className="absolute bottom-3 left-3 z-10 bg-white/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-sm border border-slate-200/90 text-[11px] text-slate-700 flex flex-wrap items-center gap-3">
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
          <span className="w-3 h-0.5 bg-blue-600"></span>
          <span>OSRM Route</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border border-dashed border-blue-500 bg-blue-100"></span>
          <span>Geofence</span>
        </div>
      </div>
    </div>
  );
};

