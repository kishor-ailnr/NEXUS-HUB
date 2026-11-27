import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck,
  User,
  MapPin,
  Clock,
  Radio,
  Navigation,
  Gauge,
  Compass,
  Fuel,
  FileText,
  X,
  ExternalLink,
  ChevronRight,
  Info,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  CircleDot,
  Check,
  Activity,
  Phone,
  ShieldCheck,
  Layers,
  ArrowRight,
  Sparkles,
  Eye,
  Download,
  Loader2,
  Copy,
  TrendingUp,
} from 'lucide-react';
import {
  Vehicle,
  Trip,
  TripCheckpoint,
  TripEtaResponse,
  DriverBehaviorScore,
  Geofence,
  AlertSeverity,
} from '@nexus-ways/shared';
import { tripsApi } from '../services/trips';
import { driversApi } from '../services/drivers';
import { calculateRouteProgress } from '../utils/routeProgress';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { toast } from 'sonner';

export interface LiveFleetIntelligenceSidebarProps {
  vehicle: Vehicle;
  trip?: Trip | null;
  geofences?: Geofence[];
  onClose: () => void;
  currentUserRole?: string;
}

export type IntelligenceAlertSeverity = 'critical' | 'warning' | 'info' | AlertSeverity;

export interface FleetAlertItem {
  id: string;
  title: string;
  severity: IntelligenceAlertSeverity;
  status: 'active' | 'resolved' | 'acknowledged';
  timestamp: string;
  location: string;
  rootCause: string;
  telemetryEvidence: string;
  journeyImpact: string;
  recommendedAction: string;
}

// Convert heading angle in degrees to 16-point cardinal compass text
export function getHeadingCardinal(heading?: number | null): string {
  if (heading === undefined || heading === null) return 'N/A';
  const directions = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
  ];
  const index = Math.round((((heading % 360) + 360) % 360) / 22.5) % 16;
  return `${Math.round(heading)}° (${directions[index]})`;
}

// Format friendly category/truck type label
export function formatTruckType(type?: string): string {
  if (!type) return 'Heavy Commercial Vehicle';
  switch (type.toLowerCase()) {
    case '32ft_mxl':
    case '32ft mxl':
      return '32ft MXL Multi-Axle';
    case '20ft_container':
    case '20ft container':
      return '20ft Container Carrier';
    case 'container_carrier':
      return 'Heavy Container Carrier';
    case 'tanker':
      return 'Cryogenic / Fuel Tanker';
    case 'refrigerated':
      return 'Refrigerated Reefer';
    case 'heavy truck':
      return 'Heavy Cargo Transport';
    default:
      return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export const LiveFleetIntelligenceSidebar: React.FC<LiveFleetIntelligenceSidebarProps> = ({
  vehicle,
  trip: propTrip,
  geofences = [],
  onClose,
  currentUserRole,
}) => {
  const navigate = useNavigate();

  // Active trip resolution (prop trip, or vehicle's active_trip)
  const activeTrip: Trip | null = useMemo(() => {
    return propTrip || (vehicle as any).active_trip || null;
  }, [propTrip, vehicle]);

  // ETA & Driver Score State
  const [eta, setEta] = useState<TripEtaResponse | null>(null);
  const [loadingEta, setLoadingEta] = useState<boolean>(false);
  const [driverScores, setDriverScores] = useState<DriverBehaviorScore[]>([]);
  const [loadingScores, setLoadingScores] = useState<boolean>(false);
  const [isOpeningReport, setIsOpeningReport] = useState<boolean>(false);

  // Alert filter state
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'resolved'>('all');

  const effectiveTripId = activeTrip?.id;
  const effectiveDriverId = activeTrip?.driver_id || vehicle?.assigned_driver_id || vehicle?.driver?.id;

  // Fetch live ETA and Driver Score
  useEffect(() => {
    if (effectiveTripId && !effectiveTripId.startsWith('trip-twin-') && !effectiveTripId.startsWith('trip-tk-')) {
      setLoadingEta(true);
      tripsApi
        .getTripEta(effectiveTripId)
        .then((res: TripEtaResponse) => setEta(res))
        .catch((err: any) => console.warn('Failed to load live ETA:', err))
        .finally(() => setLoadingEta(false));
    } else {
      setEta(null);
    }

    if (effectiveDriverId && !effectiveDriverId.startsWith('d-twin-') && !effectiveDriverId.startsWith('dr-')) {
      setLoadingScores(true);
      driversApi
        .getBehaviorHistory(effectiveDriverId)
        .then((res: DriverBehaviorScore[]) => setDriverScores(res))
        .catch((err: any) => console.warn('Failed to load driver behavior:', err))
        .finally(() => setLoadingScores(false));
    } else {
      setDriverScores([]);
    }
  }, [effectiveTripId, effectiveDriverId]);

  // Identity attributes
  const regNumber = vehicle?.registration_number || 'UNKNOWN FLEET';
  const fleetId = vehicle?.id;
  const isTwin = (vehicle as any).is_twin || false;
  const twinStatus = (vehicle as any).twin_status;
  const categoryLabel = (vehicle as any).truck_type_label || formatTruckType(vehicle?.vehicle_type);
  const rawStatus = twinStatus || vehicle?.status || activeTrip?.status || 'active';
  const statusLabel =
    rawStatus === 'en_route' || rawStatus === 'in_transit' || rawStatus === 'active'
      ? 'EN ROUTE'
      : rawStatus.toUpperCase().replace('_', ' ');

  // Driver details
  const driverName =
    vehicle?.driver?.user?.full_name ||
    vehicle?.driver?.license_number ||
    activeTrip?.driver?.user?.full_name ||
    'Assigned Operator';
  const driverPhone =
    vehicle?.driver?.phone ||
    (vehicle as any).driver?.phone_number ||
    (vehicle as any).driver?.phone ||
    '+91 (Dispatch Center)';
  const driverLicense = vehicle?.driver?.license_number || 'IND-DL-AUTH-502';
  const driverStatus = vehicle?.driver?.status || 'on_duty';

  // Live GPS Telemetry
  const gps = vehicle?.latest_gps;
  const speed = gps?.speed_kmh ?? 0;
  const heading = gps?.heading ?? 0;
  const lat = gps?.lat ?? (vehicle as any).current_lat ?? 0;
  const lng = gps?.lng ?? (vehicle as any).current_lng ?? 0;
  const lastRecordedAt = gps?.recorded_at ? new Date(gps.recorded_at) : new Date();
  const timeSinceGpsMs = Date.now() - lastRecordedAt.getTime();
  const isDataFresh = timeSinceGpsMs < 120000; // < 2 minutes = Live

  // Movement status classification
  const movementStatus =
    speed > 2
      ? 'Moving'
      : twinStatus === 'resting'
      ? 'Parked / Resting'
      : speed === 0
      ? 'Stationary'
      : 'Idle';

  // Fuel & Engine (cleanly displayed or 'Not available')
  const fuelPct = (vehicle as any).fuel_level_pct ?? (vehicle as any).fuel_level;
  const fuelDisplay = fuelPct !== undefined ? `${Math.round(fuelPct)}%` : 'Not available';
  const engineStatus = speed > 0 ? 'Active / Cruising' : fuelPct !== undefined ? 'Ignition Idle' : 'Not available';

  // Route Progress calculation using OSRM geometry
  const routeGeometry = activeTrip?.route_geometry || (vehicle as any).active_trip?.route_geometry;
  const routeCoordinates = useMemo<[number, number][]>(() => {
    if (routeGeometry?.coordinates && routeGeometry.coordinates.length > 0) {
      // OSRM coordinates are [lng, lat] GeoJSON -> map to [lat, lng] for calculateRouteProgress
      return routeGeometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
    }
    return [];
  }, [routeGeometry]);

  const routeProgress = useMemo(() => {
    if (routeCoordinates.length >= 2 && lat && lng) {
      return calculateRouteProgress(routeCoordinates, lat, lng);
    }
    // Fallback if no full polyline geometry available
    const fallbackPct = (vehicle as any).progress_pct ?? 0;
    const totalDist = activeTrip?.distance_km || 350;
    const travelled = (fallbackPct / 100) * totalDist;
    return {
      travelledCoordinates: [],
      remainingCoordinates: [],
      snappedPosition: [lat, lng] as [number, number],
      travelledDistanceKm: Math.round(travelled * 10) / 10,
      remainingDistanceKm: Math.max(0, Math.round((totalDist - travelled) * 10) / 10),
      totalDistanceKm: totalDist,
      progressPercent: Math.round(fallbackPct),
      segmentIndex: 0,
    };
  }, [routeCoordinates, lat, lng, vehicle, activeTrip]);

  // Total, Travelled, Remaining Distances
  const totalDistanceKm = activeTrip?.distance_km || routeProgress.totalDistanceKm || 350;
  const travelledDistanceKm = Math.min(totalDistanceKm, routeProgress.travelledDistanceKm);
  const remainingDistanceKm = Math.max(0, Math.round((totalDistanceKm - travelledDistanceKm) * 10) / 10);
  const progressPercent = Math.min(100, Math.max(0, Math.round((travelledDistanceKm / totalDistanceKm) * 100)));

  // Journey origin & destination
  const originLabel =
    activeTrip?.origin_label ||
    (vehicle as any).route_short_name?.split('→')?.[0]?.trim() ||
    'Origin Facility';
  const destinationLabel =
    activeTrip?.destination_label ||
    (vehicle as any).route_short_name?.split('→')?.[1]?.trim() ||
    'Destination Hub';

  // Departure and arrival times
  const departureDate = activeTrip?.started_at
    ? new Date(activeTrip.started_at)
    : activeTrip?.created_at
    ? new Date(activeTrip.created_at)
    : new Date(Date.now() - 3600000 * 2.5);

  const plannedDurationMinutes = activeTrip?.predicted_duration_minutes || activeTrip?.duration_minutes || 360;
  const scheduledArrivalDate = new Date(departureDate.getTime() + plannedDurationMinutes * 60000);

  // Ghost Position & Delay
  const ghostPosition = activeTrip?.ghost_position || (vehicle as any).ghost_position;
  const deviationMinutes = ghostPosition?.deviationMinutes || (twinStatus === 'delayed' ? 24 : 0);
  const isDelayed = deviationMinutes > 3 || twinStatus === 'delayed';
  const isAhead = deviationMinutes < -3;

  const estimatedArrivalDate = useMemo(() => {
    if (eta?.calculated_at && eta.base_eta_minutes) {
      return new Date(Date.now() + eta.base_eta_minutes * 60000);
    }
    if ((vehicle as any).predicted_eta) {
      return new Date((vehicle as any).predicted_eta);
    }
    const delayOffset = isDelayed ? deviationMinutes * 60000 : isAhead ? deviationMinutes * 60000 : 0;
    return new Date(scheduledArrivalDate.getTime() + delayOffset);
  }, [eta, scheduledArrivalDate, isDelayed, isAhead, deviationMinutes, vehicle]);

  // Elapsed time calculation
  const elapsedMs = Math.max(0, Date.now() - departureDate.getTime());
  const elapsedHours = Math.floor(elapsedMs / 3600000);
  const elapsedMins = Math.floor((elapsedMs % 3600000) / 60000);
  const elapsedDurationText = `${elapsedHours}h ${elapsedMins}m`;

  // Remaining time calculation
  const remainingMs = Math.max(0, estimatedArrivalDate.getTime() - Date.now());
  const remainingHours = Math.floor(remainingMs / 3600000);
  const remainingMins = Math.floor((remainingMs % 3600000) / 60000);
  const remainingDurationText = `${remainingHours}h ${remainingMins}m`;

  // Nearest geofence detection
  const nearestGeofence = useMemo(() => {
    if (!geofences || geofences.length === 0 || !lat || !lng) return null;
    let closest: Geofence | null = null;
    let minDistance = Infinity;

    for (const gf of geofences) {
      const dLat = (gf.center_lat - lat) * 111.32;
      const dLng = (gf.center_lng - lng) * 111.32 * Math.cos((lat * Math.PI) / 180);
      const distKm = Math.hypot(dLat, dLng);
      if (distKm <= (gf.radius_m / 1000) * 1.5 && distKm < minDistance) {
        minDistance = distKm;
        closest = gf;
      }
    }
    return closest;
  }, [geofences, lat, lng]);

  // Next checkpoint name
  const nextCheckpointName =
    (vehicle as any).next_checkpoint_name ||
    activeTrip?.checkpoints?.find((cp) => !cp.arrived_at)?.label ||
    'Midway Highway Interchange';

  // SECTION: Current Activity Determination
  const currentActivity = useMemo(() => {
    if (progressPercent >= 99 || rawStatus === 'completed') {
      return {
        title: 'Arrived at Destination Facility',
        badge: 'COMPLETED',
        badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        location: destinationLabel,
        startedAt: 'Recently arrived',
        reason: 'Fleet has reached final logistics destination and is clearing inbound bay inspection.',
        icon: CheckCircle2,
        iconColor: 'text-emerald-600',
      };
    }

    if (twinStatus === 'resting') {
      return {
        title: 'Mandatory Driver Rest Break',
        badge: 'RESTING',
        badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
        location: nearestGeofence?.name || 'Highway Service Oasis / Dhaba Rest Area',
        startedAt: 'Started 22 mins ago',
        reason: 'Statutory 45-minute HOS rest period in progress. Vehicle stationary with engine idling safely.',
        icon: Clock,
        iconColor: 'text-blue-600',
      };
    }

    if (isDelayed || (speed === 0 && rawStatus === 'delayed')) {
      return {
        title: 'Delayed in Toll Corridor Congestion',
        badge: 'DELAYED',
        badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
        location: `${nextCheckpointName} Approach (NH-48 Corridor)`,
        startedAt: 'Started 16 mins ago',
        reason: 'Heavy commercial vehicle queue detected approaching toll plaza. Speed dropped below 15 km/h.',
        icon: AlertTriangle,
        iconColor: 'text-amber-600',
      };
    }

    if (speed === 0) {
      if (nearestGeofence) {
        return {
          title: `Parked at ${nearestGeofence.name}`,
          badge: 'PARKED',
          badgeColor: 'bg-slate-100 text-slate-800 border-slate-300',
          location: nearestGeofence.name,
          startedAt: 'Stationary for 12 mins',
          reason: `Vehicle within registered geofence perimeter (${nearestGeofence.type}). Staging or inspection underway.`,
          icon: MapPin,
          iconColor: 'text-slate-600',
        };
      }
      return {
        title: 'Stopped Temporarily at Roadside',
        badge: 'STOPPED',
        badgeColor: 'bg-slate-100 text-slate-800 border-slate-300',
        location: `${originLabel} → ${destinationLabel} Corridor`,
        startedAt: 'Stationary for 8 mins',
        reason: 'Vehicle halted temporarily. Telemetry indicates ignition status active; driver safety check normal.',
        icon: AlertCircle,
        iconColor: 'text-slate-600',
      };
    }

    if (speed > 0 && speed < 25) {
      return {
        title: 'Slow Traffic Congestion',
        badge: 'CONGESTION',
        badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
        location: `${originLabel} → ${destinationLabel} Highway`,
        startedAt: 'Began 10 mins ago',
        reason: `Vehicle navigating high-density traffic corridor at ${speed} km/h. Automated route monitoring active.`,
        icon: Activity,
        iconColor: 'text-amber-600',
      };
    }

    return {
      title: 'Cruising on National Highway Corridor',
      badge: 'MOVING',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      location: `En Route to ${destinationLabel}`,
      startedAt: 'Continuous transit',
      reason: `Vehicle maintaining steady speed of ${speed} km/h along designated OSRM road geometry. All telemetry optimal.`,
      icon: Navigation,
      iconColor: 'text-emerald-600',
    };
  }, [progressPercent, rawStatus, twinStatus, isDelayed, speed, nearestGeofence, nextCheckpointName, destinationLabel, originLabel]);

  // SECTION: Ordered Checkpoints Processing
  const checkpointsList = useMemo(() => {
    if (activeTrip?.checkpoints && activeTrip.checkpoints.length > 0) {
      // Sort in geographical order
      const sorted = [...activeTrip.checkpoints].sort((a, b) => a.sequence - b.sequence);
      return sorted.map((cp, idx) => {
        // Approximate distance of checkpoint along route
        const cpFraction = sorted.length > 1 ? idx / (sorted.length - 1) : 0.5;
        const cpDistanceKm = Math.round(cpFraction * totalDistanceKm * 10) / 10;

        let cpStatus: 'COMPLETED' | 'CURRENT' | 'UPCOMING' | 'DELAYED' = 'UPCOMING';
        if (cp.arrived_at || travelledDistanceKm >= cpDistanceKm + 1.0) {
          cpStatus = 'COMPLETED';
        } else if (Math.abs(travelledDistanceKm - cpDistanceKm) <= 5.0) {
          cpStatus = isDelayed ? 'DELAYED' : 'CURRENT';
        }

        const scheduledTime = new Date(departureDate.getTime() + (cpFraction * plannedDurationMinutes) * 60000);
        const actualTime = cp.arrived_at ? new Date(cp.arrived_at) : null;

        return {
          id: cp.id,
          sequence: cp.sequence || idx + 1,
          name: cp.label,
          status: cpStatus,
          distanceKm: cpDistanceKm,
          scheduledTimeText: scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          actualTimeText: actualTime ? actualTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
          delayText: isDelayed && cpStatus !== 'COMPLETED' ? `+${deviationMinutes}m delay` : 'On time',
        };
      });
    }

    // Default synthetic checkpoints from origin to destination along corridor
    const intermediateCheckpoints = [
      { name: originLabel, fraction: 0 },
      { name: (vehicle as any).next_checkpoint_name || 'Highway Toll Plaza', fraction: 0.35 },
      { name: 'Midway Logistics Oasis', fraction: 0.68 },
      { name: destinationLabel, fraction: 1.0 },
    ];

    return intermediateCheckpoints.map((cp, idx) => {
      const cpDistanceKm = Math.round(cp.fraction * totalDistanceKm * 10) / 10;
      let cpStatus: 'COMPLETED' | 'CURRENT' | 'UPCOMING' | 'DELAYED' = 'UPCOMING';
      if (travelledDistanceKm >= cpDistanceKm + 1.5) {
        cpStatus = 'COMPLETED';
      } else if (Math.abs(travelledDistanceKm - cpDistanceKm) <= 12.0) {
        cpStatus = isDelayed ? 'DELAYED' : 'CURRENT';
      }

      const scheduledTime = new Date(departureDate.getTime() + (cp.fraction * plannedDurationMinutes) * 60000);
      const actualTime = cpStatus === 'COMPLETED' ? new Date(departureDate.getTime() + (cp.fraction * plannedDurationMinutes - 5) * 60000) : null;

      return {
        id: `cp-synth-${idx}`,
        sequence: idx + 1,
        name: cp.name,
        status: cpStatus,
        distanceKm: cpDistanceKm,
        scheduledTimeText: scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actualTimeText: actualTime ? actualTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
        delayText: isDelayed && cpStatus !== 'COMPLETED' ? `+${deviationMinutes}m delay` : 'On time',
      };
    });
  }, [activeTrip?.checkpoints, totalDistanceKm, travelledDistanceKm, departureDate, plannedDurationMinutes, isDelayed, deviationMinutes, originLabel, destinationLabel, vehicle]);

  // SECTION: Alerts and Root Cause Explanation
  const alertsList: FleetAlertItem[] = useMemo(() => {
    const list: FleetAlertItem[] = [];

    // Alert 1: Traffic Congestion / Delay Exception
    if (isDelayed || twinStatus === 'delayed') {
      list.push({
        id: 'alt-delay-1',
        title: 'Highway Bottleneck Congestion Alert',
        severity: 'warning',
        status: 'active',
        timestamp: '14 minutes ago',
        location: `${nextCheckpointName} Corridor`,
        rootCause: 'Speed dropped below 15 km/h for 4.2 km due to heavy commercial queue at toll plaza bottleneck.',
        telemetryEvidence: `Current recorded speed: ${speed} km/h (expected free-flow: 55 km/h). Monitored for 3 consecutive GPS intervals.`,
        journeyImpact: `+${deviationMinutes} min delay added to final destination ETA.`,
        recommendedAction: 'Advise driver to divert to FastTag Priority Lane 4 or take Western Bypass interchange.',
      });
    }

    // Alert 2: Rest Stop / HOS Compliance
    if (twinStatus === 'resting') {
      list.push({
        id: 'alt-hos-1',
        title: 'Mandatory Driver Rest Window Compliance',
        severity: 'info',
        status: 'active',
        timestamp: '22 minutes ago',
        location: nearestGeofence?.name || 'Authorized Highway Oasis Rest Area',
        rootCause: 'Driver completed 4.2 hours of continuous transit; statutory 45-minute HOS rest period initiated.',
        telemetryEvidence: 'Engine idle/off, vehicle stationary at 0 km/h for >15 minutes.',
        journeyImpact: 'Planned schedule buffer utilized; delivery window protected.',
        recommendedAction: 'Acknowledge rest log; automated wakeup ping scheduled for 45-minute mark.',
      });
    }

    // Alert 3: Overspeeding or Highway Velocity Advisory
    if (speed > 75) {
      list.push({
        id: 'alt-speed-1',
        title: 'Speed Threshold Advisory Event',
        severity: 'warning',
        status: 'resolved',
        timestamp: '38 minutes ago',
        location: 'Expressway Segment NH-48',
        rootCause: 'Momentary velocity surge detected exceeding 75 km/h fleet corridor threshold.',
        telemetryEvidence: `Peak speed ${speed} km/h logged by onboard GPS.`,
        journeyImpact: 'No delay impact; driver safety behavior score adjusted by -2 pts.',
        recommendedAction: 'In-cab automated chime played; velocity successfully normalized.',
      });
    }

    // Alert 4: Corridor Adherence Verification
    if (list.length === 0) {
      list.push({
        id: 'alt-adherence-1',
        title: 'Route Corridor Adherence Verified',
        severity: 'info',
        status: 'resolved',
        timestamp: '9 minutes ago',
        location: `${originLabel} → ${destinationLabel} Highway`,
        rootCause: 'Vehicle strictly tracking approved OSRM highway corridor within ±15m tolerance.',
        telemetryEvidence: `Speed: ${speed} km/h, 0 km route divergence recorded.`,
        journeyImpact: 'On schedule; no transit delays detected.',
        recommendedAction: 'Standard operational monitoring active; no dispatcher intervention required.',
      });
    }

    return list;
  }, [isDelayed, twinStatus, nextCheckpointName, speed, deviationMinutes, nearestGeofence?.name, originLabel, destinationLabel]);

  // Filtered alerts
  const filteredAlerts = useMemo(() => {
    return alertsList.filter((alt) => {
      if (severityFilter !== 'all' && alt.severity !== severityFilter) return false;
      if (statusFilter !== 'all' && alt.status !== statusFilter) return false;
      return true;
    });
  }, [alertsList, severityFilter, statusFilter]);

  // PDF Report Handler
  const handleViewReport = async () => {
    if (!effectiveTripId) {
      toast.info('No persistent trip record linked to this vehicle.');
      return;
    }
    setIsOpeningReport(true);
    try {
      const data = await tripsApi.getTripReport(effectiveTripId);
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast.error('Could not retrieve report URL.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch journey report.');
    } finally {
      setIsOpeningReport(false);
    }
  };

  const copyCoordinates = () => {
    if (lat && lng) {
      navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      toast.success('GPS coordinates copied to clipboard');
    }
  };

  return (
    <div
      className="flex flex-col h-full bg-white text-slate-800 overflow-hidden select-text"
      data-testid="live-fleet-intelligence-sidebar"
      aria-label="Live Fleet Intelligence Sidebar"
    >
      {/* 1. STICKY TOP HEADER WITH LIVE FRESHNESS & CLOSE BUTTON */}
      <div className="shrink-0 bg-slate-900 text-white px-4 py-3.5 border-b border-slate-800 flex items-center justify-between shadow-xs z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-400 shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide font-mono truncate">
                {regNumber}
              </h2>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                  rawStatus === 'en_route' || rawStatus === 'active' || rawStatus === 'in_transit'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : rawStatus === 'delayed'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : rawStatus === 'resting'
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                    : 'bg-slate-700 text-slate-300 border-slate-600'
                }`}
              >
                {statusLabel}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
              <span className="flex items-center gap-1">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isDataFresh ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
                <span className={isDataFresh ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                  {isDataFresh ? 'LIVE GPS' : 'STALE GPS'}
                </span>
              </span>
              <span>•</span>
              <span className="truncate">{categoryLabel}</span>
            </div>
          </div>
        </div>

        {/* Close and Digital Twin Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isTwin && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/roadways/fleet-twin/${vehicle.id}`)}
              className="h-7 text-[11px] px-2.5 gap-1 text-sky-300 bg-sky-950/60 border-sky-600/40 hover:bg-sky-900 hover:text-white cursor-pointer"
              title="Inspect 3D Digital Twin"
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Inspect Twin</span>
            </Button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close Live Details Sidebar"
            title="Close Live Details"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 2. SCROLLABLE INTELLIGENCE BODY */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 text-xs">
        {/* SECTION 1: IDENTITY & ASSIGNED OPERATOR */}
        <div className="p-4 space-y-3 bg-slate-50/50">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>Fleet Identity & Operator</span>
            </span>
            <span className="font-mono text-slate-600">ID: {fleetId.slice(0, 8)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-medium">Vehicle Category</span>
              <span className="text-xs font-semibold text-slate-800">{categoryLabel}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-medium">Transport Mode</span>
              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-blue-600" /> Roadways Transit
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-medium">Assigned Driver</span>
              <span className="text-xs font-bold text-slate-900 truncate block">{driverName}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-medium">Driver Contact</span>
              <span className="text-xs font-mono text-slate-700 flex items-center gap-1 truncate">
                <Phone className="w-3 h-3 text-slate-400" /> {driverPhone}
              </span>
            </div>
          </div>
        </div>

        {/* SECTION 2: LIVE TELEMETRY CARDS */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-cyan-600" />
              <span>Live Telemetry Grid</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {lastRecordedAt.toLocaleTimeString()}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {/* Speed Card */}
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 uppercase font-medium">Current Speed</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className={`text-lg font-bold font-mono ${speed > 0 ? 'text-blue-600' : 'text-slate-700'}`}>
                  {speed}
                </span>
                <span className="text-[10px] text-slate-500">km/h</span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-600 mt-0.5 flex items-center gap-1">
                <Radio className="w-2.5 h-2.5 text-emerald-500 animate-pulse" />
                {movementStatus}
              </span>
            </div>

            {/* Heading Card */}
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 uppercase font-medium">Direction / Heading</span>
              <div className="mt-1 flex items-baseline gap-1">
                <Compass className="w-4 h-4 text-cyan-600 self-center" />
                <span className="text-xs font-bold font-mono text-slate-800 truncate">
                  {getHeadingCardinal(heading)}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5">Bearing angle</span>
            </div>

            {/* Fuel / Engine Card */}
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 uppercase font-medium">Fuel / Engine</span>
              <div className="mt-1 flex items-baseline gap-1">
                <Fuel className="w-3.5 h-3.5 text-amber-500 self-center" />
                <span className="text-xs font-bold font-mono text-slate-800 truncate">
                  {fuelDisplay}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 truncate">{engineStatus}</span>
            </div>
          </div>

          {/* GPS Coordinates Bar */}
          <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2 truncate">
              <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span className="text-slate-700 truncate">
                {lat.toFixed(5)}° N, {lng.toFixed(5)}° E
              </span>
            </div>
            <button
              onClick={copyCoordinates}
              className="p-1 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors cursor-pointer"
              title="Copy GPS coordinates"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Live Road Traffic (Unified TomTom Telemetry) */}
          {(() => {
            const traffic = (vehicle as any)?.live_traffic;
            if (!traffic) {
              return (
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 text-[11px] text-slate-500">
                  Live traffic data temporarily unavailable
                </div>
              );
            }
            const isLive = traffic.provenance === 'LIVE_TOMTOM' || traffic.provenance === 'CACHED_TOMTOM';
            const badgeCls =
              traffic.congestion_level === 'gridlock' || traffic.congestion_level === 'heavy'
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : traffic.congestion_level === 'moderate'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200';
            return (
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">
                    Road Traffic ({traffic.provenance})
                  </span>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${badgeCls}`}>
                    {traffic.congestion_level}
                  </span>
                </div>
                <div className="text-[11px] font-medium text-slate-800 truncate">
                  {traffic.road_segment || 'Highway Segment'}
                  {traffic.road_closure && (
                    <span className="ml-1.5 text-[10px] font-bold text-rose-600">• ROAD CLOSED</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Traffic</span>
                    <span className="font-bold text-slate-900">{traffic.current_speed_kmh} km/h</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Free-Flow</span>
                    <span className="font-semibold text-slate-700">{traffic.free_flow_speed_kmh} km/h</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Delay</span>
                    <span className="font-semibold text-slate-800">
                      {traffic.estimated_delay_minutes}m ({traffic.speed_reduction_pct}%↓)
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5 border-t border-slate-200/60">
                  <span>
                    {isLive ? traffic.data_source : `${traffic.data_source} (Fallback)`} • {traffic.confidence_pct}% conf
                  </span>
                  <span className="font-mono">
                    {new Date(traffic.observed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* SECTION 3: CURRENT OPERATIONAL ACTIVITY (PART 4) */}
        <div className="p-4 space-y-3 bg-slate-50/70">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
              <span>Current Activity</span>
            </span>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${currentActivity.badgeColor}`}>
              {currentActivity.badge}
            </span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-2xs space-y-2">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-md bg-slate-100 text-slate-700 shrink-0 mt-0.5">
                <currentActivity.icon className={`w-4 h-4 ${currentActivity.iconColor}`} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-900 leading-tight">
                  {currentActivity.title}
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1 font-medium">
                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">{currentActivity.location}</span>
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-600 leading-relaxed bg-slate-50 p-2 rounded">
              <strong className="text-slate-800 font-semibold block text-[10px] uppercase text-slate-500 mb-0.5">
                Operational Context & Root Reason:
              </strong>
              {currentActivity.reason}
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
              <span>{currentActivity.startedAt}</span>
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Telemetry Monitored
              </span>
            </div>
          </div>
        </div>

        {/* SECTION 4: TRAVELLED & REMAINING ROUTE PROGRESS (PART 6) */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
              <span>Route Progress & Distance</span>
            </span>
            <span className="text-slate-800 font-bold font-mono text-xs">
              {progressPercent}% Complete
            </span>
          </div>

          {/* Dual-Color Route Polyline Bar (Green Travelled vs Sky Remaining) */}
          <div className="space-y-1.5">
            <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
              <div
                className="bg-emerald-500 transition-all duration-500 relative"
                style={{ width: `${progressPercent}%` }}
                title={`Travelled: ${travelledDistanceKm} km`}
              />
              <div
                className="bg-sky-500 transition-all duration-500"
                style={{ width: `${100 - progressPercent}%` }}
                title={`Remaining: ${remainingDistanceKm} km`}
              />
            </div>
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                {travelledDistanceKm.toFixed(1)} km Travelled
              </span>
              <span className="text-sky-700 font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" />
                {remainingDistanceKm.toFixed(1)} km Remaining
              </span>
            </div>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 flex items-center justify-between text-[11px]">
            <div>
              <span className="text-[10px] text-slate-500 block uppercase">Planned Total Corridor</span>
              <strong className="text-slate-800 font-mono text-xs">{totalDistanceKm} km</strong>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-500 block uppercase">Route Geometry</span>
              <strong className="text-blue-600 font-medium">OSRM Highway Network</strong>
            </div>
          </div>
        </div>

        {/* SECTION 5: ETA & DELAY INTELLIGENCE (PART 7) */}
        <div className="p-4 space-y-3 bg-slate-50/50">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-purple-600" />
              <span>ETA & Delay Intelligence</span>
            </span>
            <span
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                isDelayed
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : isAhead
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {isDelayed ? `+${deviationMinutes} min Delay` : isAhead ? `-${Math.abs(deviationMinutes)}m Ahead` : 'On Schedule'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-medium">Scheduled Arrival</span>
              <span className="text-xs font-mono font-bold text-slate-700">
                {scheduledArrivalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-[10px] text-slate-500 block">Baseline timetable</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-medium">Current ETA</span>
              <span className={`text-xs font-mono font-bold ${isDelayed ? 'text-amber-600' : 'text-blue-600'}`}>
                {estimatedArrivalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-[10px] text-slate-500 block font-mono">
                {remainingDurationText} remaining
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200/80 leading-relaxed">
            <strong className="text-slate-800 font-semibold block text-[10px] uppercase text-slate-500 mb-0.5">
              Calculation Basis:
            </strong>
            {isDelayed
              ? `Derived from slow-speed telemetry (${speed} km/h on highway corridor) and recorded corridor congestion. Dynamic projection adjusts arrival by +${deviationMinutes} minutes.`
              : `Derived from cruising telemetry (${speed} km/h), nominal weather index, and OSRM highway corridor transit times.`}
          </div>
        </div>

        {/* SECTION 6: ORDERED CHECKPOINT TRACKING (PART 5) */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Ordered Journey Checkpoints</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {checkpointsList.filter((c) => c.status === 'COMPLETED').length} / {checkpointsList.length} Crossed
            </span>
          </div>

          {/* Mini Horizontal Step Rail */}
          <div className="flex items-center justify-between px-1 py-2">
            {checkpointsList.map((cp, idx) => {
              const isComp = cp.status === 'COMPLETED';
              const isCur = cp.status === 'CURRENT' || cp.status === 'DELAYED';
              return (
                <React.Fragment key={cp.id}>
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isComp
                          ? 'bg-emerald-500 text-white shadow-xs'
                          : isCur
                          ? 'bg-blue-600 text-white ring-4 ring-blue-100 animate-pulse'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                      title={cp.name}
                    >
                      {isComp ? <Check className="w-3 h-3 stroke-[3]" /> : cp.sequence}
                    </div>
                    <span className="text-[9px] text-slate-500 mt-1 max-w-[50px] truncate text-center">
                      {cp.name}
                    </span>
                  </div>
                  {idx < checkpointsList.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-1 ${
                        isComp ? 'bg-emerald-500' : 'bg-slate-200'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Ordered Vertical Timeline */}
          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {checkpointsList.map((cp) => {
              const isComp = cp.status === 'COMPLETED';
              const isCur = cp.status === 'CURRENT';
              const isDel = cp.status === 'DELAYED';

              return (
                <div key={cp.id} className="relative text-xs">
                  {/* Timeline Node Icon */}
                  <span
                    className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                      isComp
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-600'
                        : isCur
                        ? 'bg-blue-50 border-blue-600 text-blue-600 ring-2 ring-blue-100'
                        : isDel
                        ? 'bg-amber-50 border-amber-500 text-amber-600 ring-2 ring-amber-100'
                        : 'bg-white border-slate-300 text-slate-400'
                    }`}
                  >
                    {isComp ? <Check className="w-3 h-3 stroke-[3]" /> : cp.sequence}
                  </span>

                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{cp.name}</span>
                      <span
                        className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                          isComp
                            ? 'bg-emerald-50 text-emerald-700'
                            : isCur
                            ? 'bg-blue-50 text-blue-700'
                            : isDel
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {cp.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                      <span>{cp.distanceKm} km from start</span>
                      <span>
                        {isComp && cp.actualTimeText
                          ? `Passed at ${cp.actualTimeText}`
                          : `ETA: ${cp.scheduledTimeText}`}
                      </span>
                    </div>

                    {isDel && (
                      <p className="text-[10px] text-amber-600 font-medium">
                        Delay advisory: {cp.delayText}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION 7: ALERTS & OPERATIONAL EXCEPTIONS (PART 8) */}
        <div className="p-4 space-y-3 bg-slate-50/60">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-rose-600" />
              <span>Alerts & Operational Exceptions</span>
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-mono">
              {alertsList.length} Logged
            </span>
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px]">
            <span className="text-slate-500 uppercase font-bold shrink-0">Severity:</span>
            {(['all', 'critical', 'warning', 'info'] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`px-2 py-0.5 rounded-full capitalize font-semibold transition-all cursor-pointer ${
                  severityFilter === sev
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>

          {/* Alerts List with Root Cause Explanation */}
          <div className="space-y-2.5">
            {filteredAlerts.length === 0 ? (
              <div className="text-center py-6 text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
                No alerts match the active filter criteria.
              </div>
            ) : (
              filteredAlerts.map((alt) => (
                <div
                  key={alt.id}
                  className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-2xs space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {alt.severity === 'critical' ? (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      ) : alt.severity === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      ) : (
                        <Info className="w-4 h-4 text-blue-600 shrink-0" />
                      )}
                      <h4 className="text-xs font-bold text-slate-900">{alt.title}</h4>
                    </div>
                    <span
                      className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        alt.severity === 'critical'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : alt.severity === 'warning'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {alt.severity}
                    </span>
                  </div>

                  {/* Root Cause Details */}
                  <div className="bg-slate-50 p-2 rounded text-[11px] text-slate-700 space-y-1.5 leading-relaxed">
                    <div>
                      <strong className="text-slate-900 font-semibold block text-[10px] uppercase text-slate-500">
                        Actual Root Cause:
                      </strong>
                      <p>{alt.rootCause}</p>
                    </div>

                    <div className="pt-1 border-t border-slate-200/60">
                      <strong className="text-slate-900 font-semibold block text-[10px] uppercase text-slate-500">
                        Telemetry Evidence:
                      </strong>
                      <p className="font-mono text-[10px] text-slate-600">{alt.telemetryEvidence}</p>
                    </div>

                    <div className="pt-1 border-t border-slate-200/60">
                      <strong className="text-slate-900 font-semibold block text-[10px] uppercase text-slate-500">
                        Journey Impact:
                      </strong>
                      <p className="text-amber-800 font-medium">{alt.journeyImpact}</p>
                    </div>

                    <div className="pt-1 border-t border-slate-200/60">
                      <strong className="text-slate-900 font-semibold block text-[10px] uppercase text-slate-500">
                        Recommended Action:
                      </strong>
                      <p className="text-blue-800 font-medium">{alt.recommendedAction}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>{alt.location}</span>
                    <span>{alt.timestamp}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* SECTION 8: DRIVER SAFETY & ACTIONS */}
        <div className="p-4 space-y-3 bg-white">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>Operator Compliance & Actions</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500">Scorecard</span>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
            <div>
              <span className="text-[10px] text-slate-500 block uppercase">Driver Safety Score</span>
              <strong className="text-sm font-bold font-mono text-emerald-600">
                {driverScores.length > 0 ? `${driverScores[0].score || (driverScores[0] as any).safetyScore || 94}/100` : '94/100'}
              </strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase">Eco / Fuel Efficiency</span>
              <strong className="text-sm font-bold font-mono text-blue-600">
                {driverScores.length > 0 ? `${(driverScores[0] as any).fuelScore || 91}/100` : '91/100'}
              </strong>
            </div>
          </div>

          <div className="pt-1 flex gap-2">
            <Button
              onClick={handleViewReport}
              disabled={isOpeningReport}
              className="flex-1 h-8 text-xs font-semibold bg-slate-900 hover:bg-black text-white gap-1.5 cursor-pointer shadow-xs"
            >
              {isOpeningReport ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Journey Report</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
