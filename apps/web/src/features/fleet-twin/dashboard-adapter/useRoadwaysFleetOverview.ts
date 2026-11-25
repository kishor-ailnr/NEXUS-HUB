import { useState, useEffect, useMemo, useRef } from 'react';
import {
  DashboardStats,
  Vehicle,
  Trip,
  StatField,
  VehicleStatus,
  DriverStatus,
  UserRole,
  OsrmRouteGeometry,
  getOsrmCorridor,
  findOsrmCorridorByCities,
} from '@nexus-ways/shared';
import { FleetTwinOverview, FleetTwinVehicleOverview, TruckStatus } from '@nexus-ways/shared';
import { fleetTwinApi } from '../services/fleetTwinApi';

export interface EnrichedRoadwaysVehicle extends Vehicle {
  is_twin?: boolean;
  twin_status?: TruckStatus;
  progress_pct?: number;
  route_name?: string;
  route_short_name?: string;
  next_checkpoint_name?: string;
  next_checkpoint_distance_km?: number;
  predicted_eta?: string;
  risk_score?: number;
  truck_type_label?: string;
  fleet_name?: string;
}

export function formatTruckType(type: string): string {
  switch (type) {
    case '32ft_mxl':
      return '32ft MXL Multi-Axle';
    case '20ft_container':
      return '20ft Container Truck';
    case 'container_carrier':
      return 'Heavy Container Carrier';
    case 'tanker':
      return 'Cryogenic / Fuel Tanker';
    case 'refrigerated':
      return 'Refrigerated Reefer';
    default:
      return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

interface UseRoadwaysFleetOverviewProps {
  realStats: DashboardStats | null;
  realVehicles: Vehicle[];
  realTrips: Trip[];
  isRoadways: boolean;
}

export function useRoadwaysFleetOverview({
  realStats,
  realVehicles,
  realTrips,
  isRoadways,
}: UseRoadwaysFleetOverviewProps) {
  const [twinOverview, setTwinOverview] = useState<FleetTwinOverview | null>(null);
  const [tick, setTick] = useState(0);
  const mountedRef = useRef(true);

  // Poll overview data
  useEffect(() => {
    if (!isRoadways) return;
    mountedRef.current = true;

    const fetchOverview = async () => {
      try {
        const data = await fleetTwinApi.getOverview();
        if (mountedRef.current && data && data.enabled) {
          setTwinOverview(data);
        }
      } catch (err) {
        // Graceful fallback to null if endpoint fails or twin is disabled
        if (mountedRef.current) {
          setTwinOverview(null);
        }
      }
    };

    fetchOverview();
    const pollTimer = setInterval(fetchOverview, 15000);

    return () => {
      mountedRef.current = false;
      clearInterval(pollTimer);
    };
  }, [isRoadways]);

  // Minor tick animation for live vehicle movement (every 3 seconds)
  useEffect(() => {
    if (!isRoadways || !twinOverview?.enabled) return;

    const animTimer = setInterval(() => {
      setTick((t) => (t + 1) % 3600);
    }, 3000);

    return () => clearInterval(animTimer);
  }, [isRoadways, twinOverview?.enabled]);

  // Combined Stats
  const mergedStats = useMemo<DashboardStats | null>(() => {
    if (!twinOverview || !twinOverview.enabled || twinOverview.vehicles.length === 0) {
      return realStats;
    }

    const twinTotals = twinOverview.totals;
    const realActive = realStats?.activeVehicles?.available ? realStats.activeVehicles.value : 0;
    const realTotal = realStats?.totalFleetToday?.available ? realStats.totalFleetToday.value : 0;
    const realAlerts = realStats?.activeAlerts || 0;
    const realSpeed = realStats?.avgSpeedKmh?.available ? realStats.avgSpeedKmh.value : 0;
    const realArrived = realStats?.arrivedCount?.available ? realStats.arrivedCount.value : 0;
    const realDeparted = realStats?.departedCount?.available ? realStats.departedCount.value : 0;

    const totalActive = realActive + twinTotals.active_vehicles;
    const totalFleet = realTotal + twinTotals.total_fleet;
    const totalAlerts = realAlerts + twinTotals.active_alerts;
    const totalArrived = realArrived + twinTotals.arrived_today;
    const totalDeparted = realDeparted + twinTotals.departed_today;

    // Combined speed average
    let avgSpeed = twinTotals.average_speed_kmh;
    if (realSpeed > 0 && twinTotals.average_speed_kmh > 0) {
      avgSpeed = Math.round(((realSpeed + twinTotals.average_speed_kmh) / 2) * 10) / 10;
    } else if (realSpeed > 0) {
      avgSpeed = realSpeed;
    }

    const makeField = (value: number): StatField<number> => ({
      value,
      available: true,
    });

    return {
      activeVehicles: makeField(totalActive),
      totalFleetToday: makeField(totalFleet),
      activeAlerts: totalAlerts,
      avgSpeedKmh: makeField(avgSpeed),
      arrivedCount: makeField(totalArrived),
      departedCount: makeField(totalDeparted),
    };
  }, [realStats, twinOverview]);

  // Transform twin vehicles into Vehicle interface compatible items
  const mergedVehicles = useMemo<EnrichedRoadwaysVehicle[]>(() => {
    if (!twinOverview || !twinOverview.enabled || twinOverview.vehicles.length === 0) {
      return realVehicles as EnrichedRoadwaysVehicle[];
    }

    const twinVehiclesFormatted: EnrichedRoadwaysVehicle[] = twinOverview.vehicles.map(
      (tv: FleetTwinVehicleOverview, idx: number) => {
        // Resolve authentic OSRM highway geometry
        const corridorGeom: OsrmRouteGeometry | null =
          tv.route?.osrm_geometry ||
          (tv.route?.corridor ? getOsrmCorridor(tv.route.corridor) : null) ||
          (tv.route ? findOsrmCorridorByCities(tv.route.origin_city, tv.route.destination_city) : null);

        // Calculate smooth position and heading along actual OSRM road coordinates
        let lat = tv.current_lat;
        let lng = tv.current_lng;
        let heading = 90;
        let dynamicProgress = tv.progress_pct;

        if (corridorGeom && corridorGeom.coordinates && corridorGeom.coordinates.length > 1) {
          const coords = corridorGeom.coordinates;
          const isMoving = tv.speed_kmh > 0 && tv.status !== 'idle' && tv.status !== 'resting';

          // Advance progress realistically per simulation tick
          if (isMoving) {
            const kmPerTick = (tv.speed_kmh * 3) / 3600;
            const progressAdvancePct = (kmPerTick / (corridorGeom.distance_km || 300)) * 100;
            dynamicProgress = Math.min(100, (tv.progress_pct + (tick * progressAdvancePct * 2)) % 100);
          }

          const totalIndices = coords.length - 1;
          const fractionalIndex = (dynamicProgress / 100) * totalIndices;
          const baseIndex = Math.min(totalIndices - 1, Math.max(0, Math.floor(fractionalIndex)));
          const remainder = fractionalIndex - baseIndex;

          const p1 = coords[baseIndex];
          const p2 = coords[Math.min(totalIndices, baseIndex + 1)];

          // Exact road coordinate interpolation
          lng = p1[0] + (p2[0] - p1[0]) * remainder;
          lat = p1[1] + (p2[1] - p1[1]) * remainder;

          // Road segment bearing
          const dLng = ((p2[0] - p1[0]) * Math.PI) / 180;
          const φ1 = (p1[1] * Math.PI) / 180;
          const φ2 = (p2[1] * Math.PI) / 180;
          const y = Math.sin(dLng) * Math.cos(φ2);
          const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng);
          heading = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
        } else {
          const isMoving = tv.speed_kmh > 0;
          const driftLat = isMoving ? Math.sin((tick * 0.15) + idx) * 0.0005 : 0;
          const driftLng = isMoving ? Math.cos((tick * 0.15) + idx) * 0.0005 : 0;
          lat = tv.current_lat + driftLat;
          lng = tv.current_lng + driftLng;
        }

        const truckLabel = formatTruckType(tv.truck_type);
        const routeShortName = tv.route
          ? `${tv.route.origin_city} → ${tv.route.destination_city}`
          : undefined;

        const vehicleStatus: VehicleStatus =
          tv.status === 'idle' ? 'idle' : 'active';

        // High-resolution OSRM highway geometry for active trip
        const activeRouteGeometry: OsrmRouteGeometry | null = corridorGeom
          ? {
              routing_source: 'osrm',
              routing_status: 'OSRM_SUCCESS',
              coordinates: corridorGeom.coordinates,
              distance_km: corridorGeom.distance_km,
              duration_minutes: corridorGeom.duration_minutes,
            }
          : tv.route?.waypoints
          ? {
              routing_source: 'fallback-straight-line',
              routing_status: 'FALLBACK_ROUTE',
              coordinates: tv.route.waypoints.map((wp) => [wp[1], wp[0]]),
              distance_km: tv.route.total_distance_km,
              duration_minutes: Math.round((tv.route.total_distance_km / 50) * 60),
            }
          : null;

        return {
          id: tv.id,
          org_id: 'fleet-twin',
          registration_number: tv.registration_number,
          vehicle_type: truckLabel,
          capacity_kg: Math.round(tv.capacity_tons * 1000),
          status: vehicleStatus,
          assigned_driver_id: tv.driver?.id || null,
          created_at: tv.route?.planned_eta || new Date().toISOString(),
          driver: tv.driver
            ? {
                id: tv.driver.id,
                org_id: 'fleet-twin',
                user_id: tv.driver.id,
                license_number: tv.driver.license_number,
                phone_number: tv.driver.phone,
                status: (tv.status === 'resting' ? 'off_duty' : 'on_trip') as DriverStatus,
                created_at: new Date().toISOString(),
                user: {
                  id: tv.driver.id,
                  org_id: 'fleet-twin',
                  full_name: tv.driver.name,
                  email: '',
                  role: 'driver' as UserRole,
                  created_at: new Date().toISOString(),
                },
              }
            : null,
          latest_gps: {
            id: `gps-${tv.id}`,
            trip_id: `trip-${tv.id}`,
            vehicle_id: tv.id,
            lat,
            lng,
            speed_kmh: tv.speed_kmh,
            heading,
            recorded_at: new Date().toISOString(),
          },
          active_trip: tv.route
            ? {
                id: `trip-${tv.id}`,
                org_id: 'fleet-twin',
                vehicle_id: tv.id,
                driver_id: tv.driver?.id || '',
                origin_label: tv.route.origin_city,
                destination_label: tv.route.destination_city,
                origin_lat: corridorGeom?.coordinates?.[0]?.[1] || tv.route.waypoints?.[0]?.[0] || lat,
                origin_lng: corridorGeom?.coordinates?.[0]?.[0] || tv.route.waypoints?.[0]?.[1] || lng,
                destination_lat:
                  corridorGeom?.coordinates?.[corridorGeom.coordinates.length - 1]?.[1] ||
                  tv.route.waypoints?.[tv.route.waypoints.length - 1]?.[0] ||
                  lat,
                destination_lng:
                  corridorGeom?.coordinates?.[corridorGeom.coordinates.length - 1]?.[0] ||
                  tv.route.waypoints?.[tv.route.waypoints.length - 1]?.[1] ||
                  lng,
                status: tv.status === 'idle' ? 'planned' : 'in_transit',
                distance_km: corridorGeom?.distance_km || tv.route.total_distance_km,
                duration_minutes: corridorGeom?.duration_minutes || 360,
                simulation_speed_multiplier: 1,
                created_at: new Date().toISOString(),
                route_geometry: activeRouteGeometry,
                checkpoints: tv.route.waypoints
                  ? tv.route.waypoints.map((wp, i) => ({
                      id: `cp-${tv.id}-${i}`,
                      trip_id: `trip-${tv.id}`,
                      label:
                        i === 0
                          ? tv.route!.origin_city
                          : i === tv.route!.waypoints!.length - 1
                          ? tv.route!.destination_city
                          : `CP ${i}`,
                      lat: wp[0],
                      lng: wp[1],
                      sequence: i,
                    }))
                  : [],
              }
            : null,
          // Twin specific enrichment
          is_twin: true,
          twin_status: tv.status,
          progress_pct: Math.round(dynamicProgress * 10) / 10,
          route_name: tv.route?.name,
          route_short_name: routeShortName,
          next_checkpoint_name: tv.next_checkpoint_name,
          next_checkpoint_distance_km: tv.next_checkpoint_distance_km,
          predicted_eta: tv.predicted_eta,
          risk_score: tv.risk_score,
          truck_type_label: truckLabel,
          fleet_name: tv.fleet_name,
        };
      },
    );

    return [...(realVehicles as EnrichedRoadwaysVehicle[]), ...twinVehiclesFormatted];
  }, [realVehicles, twinOverview, tick]);

  // Combined Active Trips for map lines
  const mergedTrips = useMemo<Trip[]>(() => {
    if (!twinOverview || !twinOverview.enabled || twinOverview.vehicles.length === 0) {
      return realTrips;
    }

    const twinTrips: Trip[] = [];
    mergedVehicles.forEach((v) => {
      if (v.is_twin && v.active_trip) {
        twinTrips.push(v.active_trip);
      }
    });

    return [...realTrips, ...twinTrips];
  }, [realTrips, mergedVehicles, twinOverview]);

  return {
    stats: mergedStats,
    vehicles: mergedVehicles,
    activeTrips: mergedTrips,
    twinOverview,
    isTwinActive: !!twinOverview?.enabled && (twinOverview.vehicles.length > 0),
  };
}
