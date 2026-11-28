import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Vehicle,
  Trip,
  OrgMode,
  Train,
  TrainMovement,
  Aircraft,
  FlightMovement,
  Vessel,
  VoyageMovement,
} from '@nexus-ways/shared';
import { useAuthStore } from '../store/authStore';
import { vehiclesService } from '../services/vehicles';
import { tripsService } from '../services/trips';
import { fleetTwinApi } from '../features/fleet-twin';
import { apiFetch } from '../lib/api';
import { railwaysService } from '../services/railways';
import { airwaysService } from '../services/airways';
import { seawaysService } from '../services/seaways';
import {
  socketService,
  LiveGpsPayload,
  LiveRailTelemetryPayload,
  LiveFlightTelemetryPayload,
  LiveVesselTelemetryPayload,
} from '../services/socket';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Truck,
  TrainFront,
  Plane,
  Ship,
  Anchor,
  LogOut,
  MapPin,
  Navigation,
  Radio,
  Clock,
  CheckCircle2,
  AlertTriangle,
  User,
  ShieldCheck,
  Home,
  Zap,
  Layers,
  Compass,
  Gauge,
  ArrowUpRight,
  Package,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toast } from 'sonner';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export const DriverDashboard: React.FC = () => {
  const { mode } = useParams<{ mode: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const currentMode = (mode || user?.organization?.mode || 'roadways') as OrgMode;
  const isRailways = currentMode === 'railways';
  const isAirways = currentMode === 'airways';
  const isSeaways = currentMode === 'seaways';

  // Roadways State
  const [assignedVehicle, setAssignedVehicle] = useState<Vehicle | null>(null);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [liveGps, setLiveGps] = useState<LiveGpsPayload | null>(null);

  // Railways State
  const [assignedTrain, setAssignedTrain] = useState<Train | null>(null);
  const [activeMovement, setActiveMovement] = useState<TrainMovement | null>(null);
  const [liveRail, setLiveRail] = useState<LiveRailTelemetryPayload | null>(null);

  // Airways State
  const [assignedAircraft, setAssignedAircraft] = useState<Aircraft | null>(null);
  const [activeFlightMovement, setActiveFlightMovement] = useState<FlightMovement | null>(null);
  const [liveFlight, setLiveFlight] = useState<LiveFlightTelemetryPayload | null>(null);

  // Seaways State
  const [assignedVessel, setAssignedVessel] = useState<Vessel | null>(null);
  const [activeVoyageMovement, setActiveVoyageMovement] = useState<VoyageMovement | null>(null);
  const [liveSea, setLiveSea] = useState<LiveVesselTelemetryPayload | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [tripActionBusy, setTripActionBusy] = useState(false);
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentDesc, setIncidentDesc] = useState('');
  const [incidentBusy, setIncidentBusy] = useState(false);
  const [routeChangeBanner, setRouteChangeBanner] = useState<string | null>(null);
  const [driverTwinSummary, setDriverTwinSummary] = useState<any | null>(null);
  const [tripEtaInfo, setTripEtaInfo] = useState<any | null>(null);
  const [computedSpeedKmh, setComputedSpeedKmh] = useState<number>(0);

  const assignedVehicleIdRef = useRef<string | null>(null);
  const prevGpsRef = useRef<LiveGpsPayload | null>(null);
  const extraMarkersRef = useRef<L.LayerGroup | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDriverData() {
      try {
        setIsLoading(true);

        if (isSeaways) {
          const [vessels, movements] = await Promise.all([
            seawaysService.getVessels().catch(() => []),
            seawaysService.getMovements().catch(() => []),
          ]);

          if (!isMounted) return;

          // Find active voyage for this master/crew
          const myMovement =
            movements.find(
              (m) =>
                m.master?.user?.id === user?.id ||
                m.master?.user_id === user?.id,
            ) ||
            movements.find((m) => m.status === 'in_transit' || m.status === 'planned') ||
            movements[0] ||
            null;

          setActiveVoyageMovement(myMovement);

          if (myMovement) {
            setAssignedVessel(myMovement.vessel || null);
          } else if (vessels.length > 0) {
            setAssignedVessel(vessels[0]);
          }
        } else if (isAirways) {
          const [aircraftList, movements] = await Promise.all([
            airwaysService.getAircraft().catch(() => []),
            airwaysService.getMovements().catch(() => []),
          ]);

          if (!isMounted) return;

          // Find active flight for this pilot
          const myFlight =
            movements.find(
              (m) =>
                m.pilot?.user?.id === user?.id ||
                m.pilot?.user_id === user?.id,
            ) ||
            movements.find((m) => m.status === 'in_transit' || m.status === 'planned') ||
            movements[0] ||
            null;

          setActiveFlightMovement(myFlight);

          if (myFlight) {
            setAssignedAircraft(myFlight.aircraft || null);
          } else if (aircraftList.length > 0) {
            setAssignedAircraft(aircraftList[0]);
          }
        } else if (isRailways) {
          const [trains, movements] = await Promise.all([
            railwaysService.getTrains().catch(() => []),
            railwaysService.getMovements().catch(() => []),
          ]);

          if (!isMounted) return;

          // Find active movement for this loco pilot
          const myMovement =
            movements.find(
              (m) =>
                m.loco_pilot?.user?.id === user?.id ||
                m.loco_pilot?.user_id === user?.id,
            ) ||
            movements.find((m) => m.status === 'in_transit' || m.status === 'planned') ||
            movements[0] ||
            null;

          setActiveMovement(myMovement);

          if (myMovement) {
            setAssignedTrain(myMovement.train || null);
          } else if (trains.length > 0) {
            setAssignedTrain(trains[0]);
          }
        } else {
          // Roadways
          const [vehicles, trips] = await Promise.all([
            vehiclesService.getVehicles().catch(() => []),
            tripsService.getTrips().catch(() => []),
          ]);

          if (!isMounted) return;

          const myVehicle =
            vehicles.find(
              (v) =>
                v.driver?.user?.id === user?.id ||
                v.driver?.user_id === user?.id ||
                v.assigned_driver_id === user?.id,
            ) || null;

          setAssignedVehicle(myVehicle);
          assignedVehicleIdRef.current = myVehicle?.id || null;

          if (myVehicle) {
            const trip = trips.find(
              (t) =>
                t.vehicle_id === myVehicle.id &&
                (t.status === 'in_transit' || t.status === 'planned'),
            );
            setActiveTrip(trip || null);

            const etaFn = (tripsService as any).getTripEta || (tripsService as any).getEta;
            if (trip && typeof etaFn === 'function') {
              etaFn(trip.id).then((etaRes: any) => {
                if (isMounted) setTripEtaInfo(etaRes);
              }).catch(() => {});
            }

            if (typeof fleetTwinApi?.getVehicleDigitalTwin === 'function') {
              fleetTwinApi
                .getVehicleDigitalTwin(myVehicle.id)
                .then((twin) => {
                  if (isMounted) setDriverTwinSummary(twin);
                })
                .catch(() => {
                  if (isMounted) setDriverTwinSummary(null);
                });
            }

            if (myVehicle.latest_gps) {
              const initialGps: LiveGpsPayload = {
                tripId: trip?.id || '',
                vehicleId: myVehicle.id,
                driverId: user?.id || '',
                lat: myVehicle.latest_gps.lat,
                lng: myVehicle.latest_gps.lng,
                speed_kmh: Number(myVehicle.latest_gps.speed_kmh || 0),
                heading: myVehicle.latest_gps.heading || 0,
                recorded_at: myVehicle.latest_gps.recorded_at,
              };
              setLiveGps(initialGps);
              prevGpsRef.current = initialGps;
              setComputedSpeedKmh(Math.max(0, Math.round(initialGps.speed_kmh)));
            }
          }
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadDriverData();

    // Periodic sync fallback every 15s
    const syncInterval = setInterval(() => {
      if (!isRailways && !isAirways && !isSeaways) {
        loadDriverData();
      }
    }, 15000);

    // Connect to WebSocket for live telemetry (using ref to avoid stale closure!)
    socketService.connect(
      (notif) => {
        if (notif?.title?.toLowerCase().includes('route updated')) {
          setRouteChangeBanner(`${notif.title}: ${notif.body}`);
          loadDriverData();
        }
      },
      undefined,
      (gps) => {
        const targetVehId = assignedVehicleIdRef.current;
        if (targetVehId && gps.vehicleId === targetVehId) {
          // Speed calculation with spike filtering (>135 km/h ignored)
          let speed = typeof gps.speed_kmh === 'number' && Number.isFinite(gps.speed_kmh) ? gps.speed_kmh : 0;
          if (speed <= 0 && prevGpsRef.current) {
            const dtHours =
              (new Date(gps.recorded_at).getTime() - new Date(prevGpsRef.current.recorded_at).getTime()) /
              3600000;
            if (dtHours > 0.0002) {
              const dist = haversineKm(prevGpsRef.current.lat, prevGpsRef.current.lng, gps.lat, gps.lng);
              const calc = dist / dtHours;
              if (calc >= 0 && calc <= 135) speed = calc;
            }
          }
          setComputedSpeedKmh(speed > 135 ? 0 : Math.max(0, Math.round(speed)));
          prevGpsRef.current = gps;
          setLiveGps(gps);
        }
      },
      (status) => {
        const targetVehId = assignedVehicleIdRef.current;
        if (targetVehId && status.vehicleId === targetVehId) {
          if (status.status === 'completed' || status.status === 'cancelled' || status.status === 'deleted') {
            toast.info(`Trip status updated: ${status.status}`);
            setActiveTrip(null);
            setComputedSpeedKmh(0);
            loadDriverData();
          } else {
            loadDriverData();
          }
        }
      },
    );

    if (isRailways) {
      socketService.onRailTelemetry((telemetry) => {
        if (activeMovement && telemetry.movementId === activeMovement.id) {
          setLiveRail(telemetry);
        }
      });

      socketService.onRailCompleted((completed) => {
        if (activeMovement && completed.movementId === activeMovement.id) {
          toast.success('Your train movement has completed destination arrival.');
          setActiveMovement((prev) => (prev ? { ...prev, status: 'completed' } : null));
        }
      });
    }

    if (isAirways) {
      socketService.onFlightTelemetry((telemetry) => {
        if (activeFlightMovement && telemetry.movementId === activeFlightMovement.id) {
          setLiveFlight(telemetry);
        }
      });

      socketService.onFlightCompleted((completed) => {
        if (activeFlightMovement && completed.movementId === activeFlightMovement.id) {
          toast.success('Your flight movement has touched down and completed.');
          setActiveFlightMovement((prev) => (prev ? { ...prev, status: 'completed' } : null));
        }
      });
    }

    if (isSeaways) {
      const handleSeaTel = (telemetry: LiveVesselTelemetryPayload) => {
        if (activeVoyageMovement && telemetry.movementId === activeVoyageMovement.id) {
          setLiveSea(telemetry);
        }
      };
      socketService.onSeaTelemetry(handleSeaTel);
    }

    return () => {
      isMounted = false;
      clearInterval(syncInterval);
      socketService.disconnect();
    };
  }, [user, isRailways, isAirways, isSeaways, activeMovement?.id, activeFlightMovement?.id, activeVoyageMovement?.id]);

  // Leaflet Map for Console
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const defaultCenter: [number, number] = [15.0, 78.0];
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: isAirways || isSeaways ? 5 : 11,
        zoomControl: false,
      });

      // Dark base tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        maxZoom: 19,
      }).addTo(map);

      // OpenRailwayMap overlay for Railways
      if (isRailways) {
        L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenRailwayMap',
          maxZoom: 19,
          opacity: 0.85,
        }).addTo(map);
      }

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    if (isSeaways) {
      // Seaways Map Display
      const originPort = activeVoyageMovement?.voyage?.origin_port;
      const destPort = activeVoyageMovement?.voyage?.destination_port;
      const currentLat = liveSea?.lat || originPort?.lat || undefined;
      const currentLng = liveSea?.lng || originPort?.lng || undefined;
      const heading = liveSea?.heading ?? 0;

      if (currentLat !== undefined && currentLng !== undefined) {
        map.setView([currentLat, currentLng], map.getZoom() || 6);

        const shipIcon = L.divIcon({
          html: `
            <div class="relative flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 border-2 border-sky-300 shadow-xl text-white" style="transform: rotate(${heading}deg);">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
                <path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/>
                <path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/>
                <path d="M12 10v4"/>
                <path d="M12 2v3"/>
              </svg>
            </div>
          `,
          className: 'bridge-ship-marker',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        if (markerRef.current) {
          markerRef.current.setLatLng([currentLat, currentLng]);
          markerRef.current.setIcon(shipIcon);
        } else {
          markerRef.current = L.marker([currentLat, currentLng], { icon: shipIcon }).addTo(map);
        }
      }

      if (activeVoyageMovement?.route_geometry?.coordinates?.length) {
        if (routeLayerRef.current) {
          routeLayerRef.current.remove();
        }
        const latLngs = activeVoyageMovement.route_geometry.coordinates.map(
          (c) => [c[1], c[0]] as [number, number],
        );
        routeLayerRef.current = L.polyline(latLngs, {
          color: '#38bdf8',
          weight: 4,
          opacity: 0.9,
        }).addTo(map);
      }
    } else if (isAirways) {
      // Airways Map Display
      const originAirport = activeFlightMovement?.flight?.origin_airport;
      const destAirport = activeFlightMovement?.flight?.destination_airport;
      const currentLat = liveFlight?.lat || originAirport?.lat || undefined;
      const currentLng = liveFlight?.lng || originAirport?.lng || undefined;
      const heading = liveFlight?.heading ?? 0;

      if (currentLat !== undefined && currentLng !== undefined) {
        map.setView([currentLat, currentLng], map.getZoom() || 6);

        const planeIcon = L.divIcon({
          html: `
            <div class="relative flex items-center justify-center w-8 h-8 rounded-full bg-cyan-600/90 border-2 border-white shadow-xl text-white" style="transform: rotate(${heading}deg);">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
            </div>
          `,
          className: 'pilot-plane-marker',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        if (markerRef.current) {
          markerRef.current.setLatLng([currentLat, currentLng]);
          markerRef.current.setIcon(planeIcon);
        } else {
          markerRef.current = L.marker([currentLat, currentLng], { icon: planeIcon }).addTo(map);
        }
      }

      if (
        originAirport?.lat != null &&
        originAirport?.lng != null &&
        destAirport?.lat != null &&
        destAirport?.lng != null
      ) {
        if (routeLayerRef.current) {
          routeLayerRef.current.remove();
        }
        const arcPoints: [number, number][] = [];
        const numPoints = 25;
        const d2r = Math.PI / 180;
        const r2d = 180 / Math.PI;
        const φ1 = originAirport.lat * d2r;
        const λ1 = originAirport.lng * d2r;
        const φ2 = destAirport.lat * d2r;
        const λ2 = destAirport.lng * d2r;
        const sinΔφ2 = Math.sin((φ2 - φ1) / 2);
        const sinΔλ2 = Math.sin((λ2 - λ1) / 2);
        const a = sinΔφ2 * sinΔφ2 + Math.cos(φ1) * Math.cos(φ2) * sinΔλ2 * sinΔλ2;
        const δ = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        if (δ > 0.0001) {
          for (let i = 0; i <= numPoints; i++) {
            const f = i / numPoints;
            const A = Math.sin((1 - f) * δ) / Math.sin(δ);
            const B = Math.sin(f * δ) / Math.sin(δ);
            const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
            const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
            const z = A * Math.sin(φ1) + B * Math.sin(φ2);
            const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * r2d;
            const lng = Math.atan2(y, x) * r2d;
            arcPoints.push([lat, lng]);
          }
        } else {
          arcPoints.push([originAirport.lat, originAirport.lng], [destAirport.lat, destAirport.lng]);
        }

        routeLayerRef.current = L.polyline(arcPoints, {
          color: '#06b6d4',
          weight: 4,
          opacity: 0.85,
          dashArray: '6, 6',
        }).addTo(map);
      }
    } else if (isRailways) {
      // Railways Map Display
      const currentLat = liveRail?.lat || activeMovement?.origin_station?.lat;
      const currentLng = liveRail?.lng || activeMovement?.origin_station?.lng;

      if (currentLat && currentLng) {
        map.setView([currentLat, currentLng], map.getZoom() || 11);

        const customIcon = L.divIcon({
          html: `
            <div class="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-600 border-2 border-white shadow-xl text-white animate-pulse">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/></svg>
            </div>
          `,
          className: 'pilot-marker',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        if (markerRef.current) {
          markerRef.current.setLatLng([currentLat, currentLng]);
        } else {
          markerRef.current = L.marker([currentLat, currentLng], { icon: customIcon }).addTo(map);
        }
      }

      if (activeMovement?.route_geometry?.coordinates?.length) {
        if (routeLayerRef.current) {
          routeLayerRef.current.remove();
        }
        const latLngs = activeMovement.route_geometry.coordinates.map(
          (c) => [c[1], c[0]] as [number, number],
        );
        routeLayerRef.current = L.polyline(latLngs, {
          color: '#10b981',
          weight: 4,
          opacity: 0.85,
        }).addTo(map);
      }
    } else {
      // Roadways Map Display
      if (!extraMarkersRef.current) {
        extraMarkersRef.current = L.layerGroup().addTo(map);
      } else {
        extraMarkersRef.current.clearLayers();
      }

      if (activeTrip?.route_geometry?.coordinates?.length) {
        if (routeLayerRef.current) {
          routeLayerRef.current.remove();
        }
        const latLngs = activeTrip.route_geometry.coordinates.map(
          (c) => [c[1], c[0]] as [number, number],
        );
        routeLayerRef.current = L.polyline(latLngs, {
          color: '#2563eb',
          weight: 5,
          opacity: 0.9,
        }).addTo(map);

        const originPt = latLngs[0];
        const destPt = latLngs[latLngs.length - 1];
        if (originPt && extraMarkersRef.current) {
          L.circleMarker(originPt, {
            radius: 6,
            color: '#fff',
            weight: 2,
            fillColor: '#10b981',
            fillOpacity: 1,
          })
            .bindPopup(`<strong>Origin:</strong> ${activeTrip.origin_label}`)
            .addTo(extraMarkersRef.current);
        }
        if (destPt && extraMarkersRef.current) {
          L.circleMarker(destPt, {
            radius: 7,
            color: '#fff',
            weight: 2,
            fillColor: '#f59e0b',
            fillOpacity: 1,
          })
            .bindPopup(`<strong>Destination:</strong> ${activeTrip.destination_label}`)
            .addTo(extraMarkersRef.current);
        }

        (activeTrip.checkpoints || []).forEach((cp: any, idx: number) => {
          if (cp.lat && cp.lng && extraMarkersRef.current) {
            L.circleMarker([cp.lat, cp.lng], {
              radius: 5,
              color: '#fff',
              weight: 1.5,
              fillColor: cp.reached_at ? '#10b981' : '#64748b',
              fillOpacity: 0.95,
            })
              .bindPopup(`#${idx + 1} ${cp.label}`)
              .addTo(extraMarkersRef.current);
          }
        });

        if (!liveGps && latLngs.length > 1) {
          map.fitBounds(L.latLngBounds(latLngs), { padding: [30, 30], maxZoom: 12 });
        }
      }

      if (liveGps) {
        const { lat, lng, heading = 0 } = liveGps;
        map.setView([lat, lng], map.getZoom() || 12);

        const customIcon = L.divIcon({
          html: `
            <div style="transform: rotate(${Math.round(heading)}deg);" class="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 border-2 border-white shadow-xl text-white">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.22.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
            </div>
          `,
          className: 'driver-marker',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
          markerRef.current.setIcon(customIcon);
        } else {
          markerRef.current = L.marker([lat, lng], { icon: customIcon }).addTo(map);
        }
      }
    }
  }, [liveGps, liveRail, liveFlight, liveSea, activeTrip, activeMovement, activeFlightMovement, activeVoyageMovement, isRailways, isAirways, isSeaways]);

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans"
      data-testid="driver-dashboard"
    >
      {/* Mobile-First Header */}
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-4 py-3 flex items-center justify-between shadow-xs sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-2 rounded-xl border ${
              isSeaways
                ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                : isAirways
                ? 'bg-sky-50 text-sky-700 border-sky-200'
                : isRailways
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}
          >
            {isSeaways ? (
              <Ship className="w-5 h-5" />
            ) : isAirways ? (
              <Plane className="w-5 h-5" />
            ) : isRailways ? (
              <TrainFront className="w-5 h-5" />
            ) : (
              <Truck className="w-5 h-5" />
            )}
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 tracking-tight">
              {isSeaways
                ? 'Bridge Master & Helm Console'
                : isAirways
                ? 'Flight Crew Cockpit Console'
                : isRailways
                ? 'Loco Pilot Console'
                : 'NEXUS WAYS • Driver Console'}
            </h1>
            <p className="text-[11px] text-slate-500">
              {user?.fullName || 'Crew Member'} &bull; {user?.organization?.name || 'NEXUS WAYS'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/')}
            className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 h-8 text-xs gap-1 shadow-xs"
          >
            <Home className="w-3.5 h-3.5" />
            Hub
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => logout().then(() => navigate(`/${currentMode}/login`))}
            className="h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white gap-1 shadow-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 max-w-4xl mx-auto w-full space-y-4">
        {/* SEAWAYS BRIDGE MASTER VIEW */}
        {isSeaways && (
          <>
            <Card className="bg-white border-slate-800 shadow-sm rounded-xl overflow-hidden">
              <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-cyan-50 text-cyan-600 border border-cyan-200">
                    <Ship className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-900">
                      Voyage: {activeVoyageMovement?.voyage?.voyage_number || 'Unscheduled'}
                    </CardTitle>
                    <p className="text-xs text-slate-500">
                      Vessel: {assignedVessel?.vessel_name || 'N/A'} ({assignedVessel?.vessel_type || 'Cargo Ship'})
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    activeVoyageMovement?.status === 'in_transit'
                      ? 'bg-cyan-50 text-cyan-700 border-cyan-300 font-semibold text-xs'
                      : activeVoyageMovement?.status === 'completed'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 text-xs'
                      : 'bg-slate-100 text-slate-600 border-slate-200 text-xs'
                  }
                >
                  {activeVoyageMovement?.status || 'No Active Voyage'}
                </Badge>
              </CardHeader>

              <CardContent className="p-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-500 font-medium">Speed (Knots)</span>
                    <p className="font-bold text-cyan-700 text-base flex items-center justify-center gap-1 mt-0.5">
                      <Gauge className="w-3.5 h-3.5 text-cyan-600" />
                      {liveSea?.speedKnots ?? (activeVoyageMovement?.status === 'in_transit' ? 18.5 : 0)} kts
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-500 font-medium">Sea Distance</span>
                    <p className="font-bold text-slate-900 text-base mt-0.5">
                      {activeVoyageMovement?.distance_km || 0} km
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-500 font-medium">True Heading</span>
                    <p className="font-bold text-amber-700 text-sm mt-0.5 flex items-center justify-center gap-1">
                      <Compass className="w-3.5 h-3.5 text-amber-600" />
                      {liveSea?.heading != null ? `${Math.round(liveSea.heading)}°` : '000°'}
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-500 font-medium">Est. Duration</span>
                    <p className="font-bold text-blue-700 text-sm mt-0.5 truncate">
                      {activeVoyageMovement?.duration_minutes || 0} min
                    </p>
                  </div>
                </div>

                {/* Ports path */}
                {activeVoyageMovement?.voyage && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Anchor className="w-4 h-4 text-cyan-600 shrink-0" />
                      <span className="text-slate-500">Origin Port:</span>
                      <span className="font-semibold text-slate-900">
                        {activeVoyageMovement.voyage.origin_port?.name} ({activeVoyageMovement.voyage.origin_port?.unlocode || 'PORT'})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <Anchor className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="text-slate-500">Destination Port:</span>
                      <span className="font-semibold text-slate-900">
                        {activeVoyageMovement.voyage.destination_port?.name} ({activeVoyageMovement.voyage.destination_port?.unlocode || 'PORT'})
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Live Land-Avoiding Marine Navigation Window */}
            <Card className="bg-white border-slate-800 shadow-sm rounded-xl overflow-hidden">
              <CardHeader className="p-3 border-b border-slate-100 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-cyan-600" />
                  Live Land-Avoiding Sea Navigation Track
                </CardTitle>
                <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200">
                  Open-Water Searoute
                </Badge>
              </CardHeader>
              <div ref={mapContainerRef} className="h-72 w-full bg-slate-100" />
            </Card>
          </>
        )}

        {/* AIRWAYS FLIGHT CREW VIEW */}
        {isAirways && (
          <>
            <Card className="bg-white border-slate-800 shadow-sm rounded-xl overflow-hidden">
              <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-sky-50 text-sky-600 border border-sky-200">
                    <Plane className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-900">
                      Flight: {activeFlightMovement?.flight?.flight_number || 'Unscheduled'}
                    </CardTitle>
                    <p className="text-xs text-slate-500">
                      Aircraft: {assignedAircraft?.tail_number || 'N/A'} ({assignedAircraft?.aircraft_type || 'Cargo Jet'})
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    activeFlightMovement?.status === 'in_transit'
                      ? 'bg-sky-50 text-sky-700 border-sky-300 font-semibold text-xs'
                      : activeFlightMovement?.status === 'completed'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 text-xs'
                      : 'bg-slate-100 text-slate-600 border-slate-200 text-xs'
                  }
                >
                  {activeFlightMovement?.status || 'No Active Flight'}
                </Badge>
              </CardHeader>

              <CardContent className="p-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-500 font-medium">Airspeed</span>
                    <p className="font-bold text-sky-700 text-base flex items-center justify-center gap-1 mt-0.5">
                      <Gauge className="w-3.5 h-3.5 text-sky-600" />
                      {liveFlight?.speedKts ?? (activeFlightMovement?.status === 'in_transit' ? 450 : 0)} kts
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-500 font-medium">Altitude</span>
                    <p className="font-bold text-slate-900 text-base mt-0.5">
                      {liveFlight?.altitudeFt != null
                        ? `${liveFlight.altitudeFt.toLocaleString()} ft`
                        : activeFlightMovement?.status === 'in_transit'
                        ? '33,000 ft'
                        : '0 ft'}
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-500 font-medium">Heading</span>
                    <p className="font-bold text-amber-700 text-sm mt-0.5 flex items-center justify-center gap-1">
                      <Compass className="w-3.5 h-3.5 text-amber-600" />
                      {liveFlight?.heading != null ? `${Math.round(liveFlight.heading)}°` : '000°'}
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-500 font-medium">Great-Circle Dist</span>
                    <p className="font-bold text-blue-700 text-sm mt-0.5 truncate">
                      {activeFlightMovement?.distance_km || 0} km
                    </p>
                  </div>
                </div>

                {/* Airports path */}
                {activeFlightMovement?.flight && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2 text-slate-700">
                      <MapPin className="w-4 h-4 text-sky-600 shrink-0" />
                      <span className="text-slate-500">Origin:</span>
                      <span className="font-semibold text-slate-900">
                        {activeFlightMovement.flight.origin_airport?.name} ({activeFlightMovement.flight.origin_airport?.iata_code || activeFlightMovement.flight.origin_airport?.icao_code || 'ORIG'})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="text-slate-500">Destination:</span>
                      <span className="font-semibold text-slate-900">
                        {activeFlightMovement.flight.destination_airport?.name} ({activeFlightMovement.flight.destination_airport?.iata_code || activeFlightMovement.flight.destination_airport?.icao_code || 'DEST'})
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Live Great-Circle Navigation Window */}
            <Card className="bg-white border-slate-800 shadow-sm rounded-xl overflow-hidden">
              <CardHeader className="p-3 border-b border-slate-100 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-sky-600" />
                  Live Great-Circle Flight Path
                </CardTitle>
                <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200">
                  Exact Arc Geometry
                </Badge>
              </CardHeader>
              <div ref={mapContainerRef} className="h-72 w-full bg-slate-100" />
            </Card>
          </>
        )}

        {/* RAILWAYS LOCO PILOT VIEW */}
        {isRailways && (
          <>
            {/* Active Train Movement Card */}
            <Card className="bg-white border-slate-800 shadow-sm rounded-xl overflow-hidden">
              <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-200">
                    <TrainFront className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-900">
                      Train Service: {assignedTrain?.train_number || 'Unassigned'}
                    </CardTitle>
                    <p className="text-xs text-slate-500">
                      {assignedTrain?.train_name || 'Scheduled Service'}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    activeMovement?.status === 'in_transit'
                      ? 'bg-blue-50 text-blue-700 border-blue-300 font-semibold text-xs'
                      : activeMovement?.status === 'completed'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 text-xs'
                      : 'bg-slate-100 text-slate-600 border-slate-200 text-xs'
                  }
                >
                  {activeMovement?.status || 'No Active Movement'}
                </Badge>
              </CardHeader>

              <CardContent className="p-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-500 font-medium">Speed</span>
                    <p className="font-bold text-emerald-700 text-base flex items-center justify-center gap-1 mt-0.5">
                      <Radio className="w-3.5 h-3.5 text-emerald-600" />
                      {liveRail?.speedKmh ?? (activeMovement?.status === 'in_transit' ? 75 : 0)} km/h
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-500 font-medium">Track Distance</span>
                    <p className="font-bold text-slate-900 text-base mt-0.5">
                      {activeMovement?.distance_km || 0} km
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-500 font-medium">Locomotive</span>
                    <p className="font-bold text-amber-700 text-sm mt-0.5 truncate">
                      {assignedTrain?.locomotive?.loco_number || 'Electric'}
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-500 font-medium">Rake Co.</span>
                    <p className="font-bold text-blue-700 text-sm mt-0.5 truncate">
                      {assignedTrain?.rake?.rake_id || '16 Coaches'}
                    </p>
                  </div>
                </div>

                {/* Stations path */}
                {activeMovement && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2 text-slate-700">
                      <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="text-slate-500">Origin:</span>
                      <span className="font-semibold text-slate-900">{activeMovement.origin_station?.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="text-slate-500">Destination:</span>
                      <span className="font-semibold text-slate-900">{activeMovement.destination_station?.name}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Live OpenRailwayMap Window */}
            <Card className="bg-white border-slate-800 shadow-sm rounded-xl overflow-hidden">
              <CardHeader className="p-3 border-b border-slate-100 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-emerald-600" />
                  Live OpenRailwayMap Track Position
                </CardTitle>
                <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200">
                  Real Rail Geometry
                </Badge>
              </CardHeader>
              <div ref={mapContainerRef} className="h-72 w-full bg-slate-100" />
            </Card>
          </>
        )}

        {/* ROADWAYS DRIVER VIEW */}
        {!isRailways && !isAirways && !isSeaways && (() => {
          const totalKm = Math.round(activeTrip?.distance_km || driverTwinSummary?.route?.total_distance_km || 0);
          let progressPct = activeTrip?.status === 'completed' ? 100 : 0;
          if (activeTrip?.status === 'in_transit') {
            if (typeof driverTwinSummary?.current_progress_pct === 'number') {
              progressPct = Math.round(driverTwinSummary.current_progress_pct);
            } else if (liveGps && activeTrip.route_geometry?.coordinates?.length) {
              const coords = activeTrip.route_geometry.coordinates;
              let bestIdx = 0;
              let bestDist = Infinity;
              for (let i = 0; i < coords.length; i++) {
                const d = Math.hypot(coords[i][1] - liveGps.lat, coords[i][0] - liveGps.lng);
                if (d < bestDist) {
                  bestDist = d;
                  bestIdx = i;
                }
              }
              progressPct = Math.max(0, Math.min(99, Math.round((bestIdx / Math.max(1, coords.length - 1)) * 100)));
            }
          }
          const completedKm = Math.round((progressPct / 100) * totalKm);
          const remainingKm = Math.max(0, totalKm - completedKm);
          const checkpointsList = activeTrip?.checkpoints || [];
          const nextCp = checkpointsList.find((cp: any) => !cp.reached_at) || checkpointsList[0] || null;
          const distToNextCpKm =
            nextCp && liveGps && nextCp.lat && nextCp.lng
              ? Math.round(haversineKm(liveGps.lat, liveGps.lng, nextCp.lat, nextCp.lng) * 10) / 10
              : null;
          const etaMinutes =
            tripEtaInfo?.predictedDurationMinutes ||
            activeTrip?.predicted_duration_minutes ||
            activeTrip?.duration_minutes ||
            null;
          const etaText = driverTwinSummary?.predicted_eta
            ? new Date(driverTwinSummary.predicted_eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : etaMinutes
            ? new Date(Date.now() + etaMinutes * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Unavailable';
          const cargoMeta: any = (activeTrip as any)?.dispatch_metadata || {};

          return (
          <>
            {/* Live Navigation Map */}
            <Card className="bg-white border-slate-200 shadow-sm rounded-xl overflow-hidden">
              <CardHeader className="p-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-blue-600" />
                  Live Navigation Map • {assignedVehicle?.registration_number || 'No Vehicle Assigned'}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 font-semibold"
                  >
                    SIMULATED GPS
                  </Badge>
                  {liveGps?.recorded_at && (
                    <span className="text-[10px] text-slate-500 font-mono">
                      Updated {new Date(liveGps.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  )}
                </div>
              </CardHeader>
              <div ref={mapContainerRef} className="h-72 sm:h-80 w-full bg-slate-100" />
            </Card>

            {/* Trip Summary & Progress Bar */}
            <Card className="bg-white border-slate-200 shadow-sm rounded-xl overflow-hidden">
              <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-200">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-900">
                      Vehicle: {assignedVehicle?.registration_number || 'Unassigned'}
                    </CardTitle>
                    <p className="text-xs text-slate-500">
                      {assignedVehicle?.vehicle_type || 'Assigned Commercial Unit'}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    activeTrip?.status === 'in_transit'
                      ? 'bg-blue-50 text-blue-700 border-blue-300 font-semibold text-xs'
                      : activeTrip?.status === 'completed'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 text-xs'
                      : 'bg-slate-100 text-slate-600 border-slate-200 text-xs'
                  }
                >
                  {activeTrip?.status || 'Idle'}
                </Badge>
              </CardHeader>

              <CardContent className="p-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] text-slate-500 font-medium">Live Speed</span>
                    <p className="font-bold text-blue-700 text-base mt-0.5">
                      {activeTrip?.status === 'in_transit' ? computedSpeedKmh : 0} km/h
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] text-slate-500 font-medium">Completed</span>
                    <p className="font-bold text-emerald-700 text-base mt-0.5">
                      {completedKm} km
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] text-slate-500 font-medium">Remaining</span>
                    <p className="font-bold text-slate-900 text-base mt-0.5">
                      {remainingKm} km
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] text-slate-500 font-medium">ETA</span>
                    <p className="font-bold text-slate-900 text-base mt-0.5">
                      {etaText}
                    </p>
                  </div>
                </div>

                {/* Journey Progress Bar */}
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between font-semibold text-slate-700">
                    <span>Journey Progress</span>
                    <span className="font-mono text-blue-700">{progressPct}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>Total: {totalKm} km</span>
                    <span>Direction: {liveGps?.heading ? `${Math.round(liveGps.heading)}°` : 'Along Route'}</span>
                  </div>
                </div>

                {activeTrip && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2 text-slate-700">
                      <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="text-slate-500">Origin:</span>
                      <span className="font-semibold text-slate-900">{activeTrip.origin_label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="text-slate-500">Destination:</span>
                      <span className="font-semibold text-slate-900">{activeTrip.destination_label}</span>
                    </div>
                    {(activeTrip.predicted_duration_minutes || activeTrip.duration_minutes) && (
                      <div className="flex items-center gap-2 text-slate-700">
                        <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="text-slate-500">Estimated Arrival:</span>
                        <span className="font-semibold text-slate-900">
                          {new Date(
                            Date.now() + (activeTrip.predicted_duration_minutes || activeTrip.duration_minutes || 0) * 60000,
                          ).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {routeChangeBanner && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 flex items-center justify-between gap-2">
                    <span className="font-semibold">{routeChangeBanner}</span>
                    <button
                      type="button"
                      onClick={() => setRouteChangeBanner(null)}
                      className="text-xs font-bold underline cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Driver Controls: Start/End Trip & Emergency Incident Report */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {activeTrip?.status === 'planned' && (
                      <Button
                        size="sm"
                        disabled={tripActionBusy}
                        onClick={async () => {
                          if (!activeTrip) return;
                          setTripActionBusy(true);
                          try {
                            const updated = await tripsService.updateStatus(activeTrip.id, 'in_transit');
                            setActiveTrip(updated);
                            toast.success('Trip started. Live tracking active.');
                          } catch (err: any) {
                            toast.error(err?.message || 'Failed to start trip');
                          } finally {
                            setTripActionBusy(false);
                          }
                        }}
                        className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Start Trip
                      </Button>
                    )}
                    {activeTrip?.status === 'in_transit' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={tripActionBusy}
                        onClick={async () => {
                          if (!activeTrip) return;
                          setTripActionBusy(true);
                          try {
                            const res = await tripsService.completeTrip(activeTrip.id, 'Completed by driver');
                            setActiveTrip(res.trip);
                            toast.success('Trip marked completed.');
                          } catch (err: any) {
                            toast.error(err?.message || 'Failed to complete trip');
                          } finally {
                            setTripActionBusy(false);
                          }
                        }}
                        className="h-8 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      >
                        End Trip
                      </Button>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowIncidentForm((p) => !p)}
                    className="h-8 text-xs border-rose-300 text-rose-700 hover:bg-rose-50 gap-1"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Report Incident / Emergency
                  </Button>
                </div>

                {showIncidentForm && (
                  <div className="p-3 rounded-lg bg-rose-50/70 border border-rose-200 space-y-2">
                    <input
                      type="text"
                      placeholder="Incident title (e.g., Highway Blockage, Breakdown)"
                      value={incidentTitle}
                      onChange={(e) => setIncidentTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-rose-200 bg-white"
                    />
                    <textarea
                      rows={2}
                      placeholder="Describe location, severity, and support needed..."
                      value={incidentDesc}
                      onChange={(e) => setIncidentDesc(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-rose-200 bg-white"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowIncidentForm(false)}
                        className="h-7 text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={incidentBusy || !incidentTitle.trim() || !incidentDesc.trim()}
                        onClick={async () => {
                          setIncidentBusy(true);
                          try {
                            await apiFetch('/notifications/incident', {
                              method: 'POST',
                              data: {
                                vehicleId: assignedVehicle?.id,
                                tripId: activeTrip?.id,
                                severity: 'critical',
                                title: incidentTitle.trim(),
                                description: incidentDesc.trim(),
                                lat: liveGps?.lat,
                                lng: liveGps?.lng,
                              },
                            });
                            toast.success('Incident alert sent to fleet operations.');
                            setIncidentTitle('');
                            setIncidentDesc('');
                            setShowIncidentForm(false);
                          } catch (err: any) {
                            toast.error(err?.message || 'Failed to report incident');
                          } finally {
                            setIncidentBusy(false);
                          }
                        }}
                        className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white"
                      >
                        {incidentBusy ? 'Sending...' : 'Send Alert'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Cargo & Delivery Progress Panel */}
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-blue-600" />
                      Cargo &amp; Delivery Progress
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {activeTrip ? `Shipment #${activeTrip.id.slice(0, 8)}` : 'No Active Shipment'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-600">
                    <div>
                      <span className="text-slate-400 block">Cargo</span>
                      <strong className="text-slate-800 capitalize">{cargoMeta.cargoType || assignedVehicle?.vehicle_type || 'Standard Freight'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Weight</span>
                      <strong className="text-slate-800">{cargoMeta.cargoWeightKg ? `${cargoMeta.cargoWeightKg} kg` : 'Unavailable'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Loading</span>
                      <strong className="text-slate-800">{activeTrip ? 'Loaded & Sealed' : 'Standby'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Delivery Status</span>
                      <strong className="text-slate-800 capitalize">{activeTrip?.status || 'Idle'}</strong>
                    </div>
                  </div>
                </div>

                {/* Driver Digital Twin Summary Panel */}
                <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-200 space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-blue-950">
                    <span className="flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-blue-600" />
                      Digital Twin Route &amp; Risk Summary
                    </span>
                    <span className="text-[10px] font-semibold text-blue-700">
                      {driverTwinSummary ? 'LIVE TWIN' : tripEtaInfo ? 'ETA ENGINE' : 'ANALYZING'}
                    </span>
                  </div>
                  {driverTwinSummary ? (
                    <div className="space-y-1 text-[11px] text-slate-700">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span>Predicted ETA: <strong>{etaText}</strong></span>
                        <span>Delay: <strong>+{driverTwinSummary.total_predicted_delay_minutes || 0}m</strong></span>
                        <span>Risk Score: <strong>{driverTwinSummary.risk_score}/100</strong></span>
                      </div>
                      {driverTwinSummary.explanation?.summary && (
                        <p className="text-slate-600">{driverTwinSummary.explanation.summary}</p>
                      )}
                      {driverTwinSummary.active_reroute && (
                        <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-900">
                          <strong>Recommended Alternate:</strong> {driverTwinSummary.active_reroute.recommended_route_name} (Saves {driverTwinSummary.active_reroute.time_saved_minutes}m)
                        </div>
                      )}
                    </div>
                  ) : tripEtaInfo ? (
                    <div className="text-[11px] text-slate-700 flex flex-wrap gap-x-4">
                      <span>Planned: <strong>{tripEtaInfo.plannedDurationMinutes}m</strong></span>
                      <span>Predicted: <strong>{tripEtaInfo.predictedDurationMinutes}m</strong></span>
                      <span>Traffic Delay: <strong>+{tripEtaInfo.trafficDelayMinutes || 0}m</strong></span>
                      <span>Weather Delay: <strong>+{tripEtaInfo.weatherDelayMinutes || 0}m</strong></span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      Analyzing journey — Digital Twin prediction unavailable until trip telemetry starts.
                    </p>
                  )}
                </div>

                {/* Checkpoints & Driver Shift/Rest Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Checkpoints ({checkpointsList.length})
                      {nextCp && distToNextCpKm !== null && (
                        <span className="ml-1 text-blue-700 font-normal">
                          • Next: {nextCp.label} ({distToNextCpKm} km)
                        </span>
                      )}
                    </div>
                    {checkpointsList.length > 0 ? (
                      <ul className="space-y-1 text-[11px] text-slate-600 max-h-24 overflow-y-auto">
                        {checkpointsList.map((cp: any, idx: number) => (
                          <li key={cp.id || idx} className="flex items-center justify-between">
                            <span>#{idx + 1} {cp.label}</span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {cp.reached_at ? 'Passed' : nextCp?.id === cp.id ? 'Next' : 'Upcoming'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-slate-500">No intermediate checkpoints logged.</p>
                    )}
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Driver Shift &amp; Rest Status
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Mandatory 30m rest required after 4.5h continuous driving. Keep HOS compliant.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
          );
        })()}
      </main>
    </div>
  );
};

export default DriverDashboard;
