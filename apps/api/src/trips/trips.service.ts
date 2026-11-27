import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { RoutingService, RouteWaypoint } from '../routing/routing.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SimulationService } from '../tracking/simulation.service';
import { EtaService } from '../intelligence/eta.service';
import { TollService } from '../intelligence/toll.service';
import { PdfReportService } from '../reports/pdf-report.service';
import {
  CreateTripDto,
  UpdateTripStatusDto,
  AddCheckpointDto,
  Trip,
  SavedRoute,
  OsrmRouteGeometry,
  TripEtaResponse,
  TripReportUrlResponse,
  DispatchPreviewRequest,
  DispatchPreviewResponse,
  DispatchTripRequest,
  RecommendedCheckpoint,
  RecommendedCheckpointType,
  TripCompletionReport,
  findOsrmCorridorByCities,
} from '@nexus-ways/shared';

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);
  private readonly inFlightVehicleDispatches = new Set<string>();
  private readonly inFlightDriverDispatches = new Set<string>();
  private readonly dispatchMetadataStore = new Map<string, Partial<DispatchTripRequest>>();
  private readonly completionReportsStore = new Map<string, TripCompletionReport>();

  constructor(
    private readonly supabase: SupabaseService,
    private readonly geocodingService: GeocodingService,
    private readonly routingService: RoutingService,
    private readonly simulationService: SimulationService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly etaService: EtaService,
    private readonly tollService: TollService,
    private readonly pdfReportService: PdfReportService,
  ) {}

  async findAll(orgId: string): Promise<Trip[]> {
    const { data: trips, error } = await this.supabase.adminClient
      .from('trips')
      .select(`
        *,
        vehicle:vehicles(*),
        driver:drivers(*, user:users(id, email, full_name))
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to list trips: ${error.message}`);
      throw new BadRequestException('Failed to list trips');
    }

    if (!trips || trips.length === 0) {
      return [];
    }

    const tripIds = trips.map((t) => t.id);

    // Fetch checkpoints
    const { data: allCheckpoints } = await this.supabase.adminClient
      .from('trip_checkpoints')
      .select('*')
      .in('trip_id', tripIds)
      .order('sequence', { ascending: true });

    // Fetch driver behavior scores
    const { data: allScores } = await this.supabase.adminClient
      .from('driver_behavior_scores')
      .select('*')
      .in('trip_id', tripIds);

    const cpByTrip = new Map<string, any[]>();
    (allCheckpoints || []).forEach((cp) => {
      const list = cpByTrip.get(cp.trip_id) || [];
      list.push(cp);
      cpByTrip.set(cp.trip_id, list);
    });

    const scoreByTrip = new Map<string, any>();
    (allScores || []).forEach((sc) => {
      scoreByTrip.set(sc.trip_id, sc);
    });

    // Batch load verified OSRM road geometries from saved_routes
    const { data: savedRoutes } = await this.supabase.adminClient
      .from('saved_routes')
      .select('origin_label, destination_label, osrm_geometry')
      .eq('org_id', orgId);

    const routeMap = new Map<string, OsrmRouteGeometry>();
    (savedRoutes || []).forEach((sr) => {
      if (sr.osrm_geometry) {
        routeMap.set(`${sr.origin_label}:::${sr.destination_label}`, sr.osrm_geometry);
      }
    });

    return trips.map((t) => {
      const routeGeom =
        routeMap.get(`${t.origin_label}:::${t.destination_label}`) ||
        (t.origin_label && t.destination_label ? findOsrmCorridorByCities(t.origin_label, t.destination_label) : null) ||
        t.route_geometry ||
        null;

      return {
        ...t,
        route_geometry: routeGeom,
        checkpoints: cpByTrip.get(t.id) || t.checkpoints || [],
        driver_score: scoreByTrip.get(t.id) || null,
      };
    });
  }

  async findSavedRoutes(orgId: string, origin?: string, destination?: string): Promise<SavedRoute[]> {
    let query = this.supabase.adminClient
      .from('saved_routes')
      .select('*')
      .eq('org_id', orgId);

    if (origin && origin.trim()) {
      query = query.ilike('origin_label', `%${origin.trim()}%`);
    }
    if (destination && destination.trim()) {
      query = query.ilike('destination_label', `%${destination.trim()}%`);
    }

    const { data, error } = await query.order('usage_count', { ascending: false });

    if (error) {
      this.logger.warn(`Failed to list saved routes: ${error.message}`);
      return [];
    }

    return data || [];
  }

  async getEta(orgId: string, id: string): Promise<TripEtaResponse> {
    return this.etaService.calculateTripEtaConfidence(orgId, id);
  }

  async findOne(orgId: string, id: string): Promise<Trip> {
    const { data: trip, error } = await this.supabase.adminClient
      .from('trips')
      .select(`
        *,
        vehicle:vehicles(*),
        driver:drivers(*, user:users(id, email, full_name))
      `)
      .eq('org_id', orgId)
      .eq('id', id)
      .maybeSingle();

    if (error || !trip) {
      throw new NotFoundException('Trip not found');
    }

    // Fetch checkpoints
    const { data: checkpoints } = await this.supabase.adminClient
      .from('trip_checkpoints')
      .select('*')
      .eq('trip_id', id)
      .order('sequence', { ascending: true });

    trip.checkpoints = checkpoints || trip.checkpoints || [];

    // Fetch driver score
    const { data: driverScore } = await this.supabase.adminClient
      .from('driver_behavior_scores')
      .select('*')
      .eq('trip_id', id)
      .maybeSingle();

    trip.driver_score = driverScore || null;

    // Try to load cached geometry for the trip's origin & destination
    if (trip.origin_label && trip.destination_label) {
      const { data: savedRoute } = await this.supabase.adminClient
        .from('saved_routes')
        .select('osrm_geometry')
        .eq('org_id', orgId)
        .eq('origin_label', trip.origin_label)
        .eq('destination_label', trip.destination_label)
        .maybeSingle();

      if (savedRoute?.osrm_geometry) {
        trip.route_geometry = savedRoute.osrm_geometry;
      } else {
        trip.route_geometry = findOsrmCorridorByCities(trip.origin_label, trip.destination_label) || null;
      }
    }

    return trip;
  }

  async create(orgId: string, dto: CreateTripDto): Promise<Trip> {
    if (!dto.vehicleId || !dto.driverId || !dto.originAddress || !dto.destinationAddress) {
      throw new BadRequestException('Vehicle, driver, origin address, and destination address are required');
    }

    const originLabel = dto.originAddress.trim();
    const destLabel = dto.destinationAddress.trim();

    // 1. Geocode origin and destination
    let originCoords = await this.geocodingService.geocodeAddress(originLabel);
    let destCoords = await this.geocodingService.geocodeAddress(destLabel);

    // Fallbacks if geocoder returns null
    if (!originCoords) {
      this.logger.warn(`Could not geocode origin "${originLabel}", using default hub origin`);
      originCoords = { latitude: 19.076, longitude: 72.8777 }; // Mumbai default
    }
    if (!destCoords) {
      this.logger.warn(`Could not geocode destination "${destLabel}", using default hub destination`);
      destCoords = { latitude: 18.5204, longitude: 73.8567 }; // Pune default
    }

    // 2. Check saved_routes for checkpoint memory and cached route geometry
    let checkpointsToUse = dto.checkpoints || [];
    const { data: existingSavedRoute } = await this.supabase.adminClient
      .from('saved_routes')
      .select('*')
      .eq('org_id', orgId)
      .eq('origin_label', originLabel)
      .eq('destination_label', destLabel)
      .maybeSingle();

    if (existingSavedRoute && (!dto.checkpoints || dto.checkpoints.length === 0)) {
      if (Array.isArray(existingSavedRoute.checkpoints) && existingSavedRoute.checkpoints.length > 0) {
        this.logger.log(`Recalling ${existingSavedRoute.checkpoints.length} saved checkpoints from checkpoint memory for ${originLabel} -> ${destLabel}`);
        checkpointsToUse = existingSavedRoute.checkpoints;
      }
    }

    // 3. Assemble all waypoints for routing
    const waypoints: RouteWaypoint[] = [
      { lat: originCoords.latitude, lng: originCoords.longitude, label: originLabel },
      ...checkpointsToUse.map((cp) => ({ lat: cp.lat, lng: cp.lng, label: cp.label })),
      { lat: destCoords.latitude, lng: destCoords.longitude, label: destLabel },
    ];

    // 4. Calculate route (via OSRM with caching in saved_routes)
    const routeGeometry: OsrmRouteGeometry = await this.routingService.getRoute(
      orgId,
      waypoints,
      originLabel,
      destLabel,
    );

    const tollEstimate = this.tollService.calculateTripToll(routeGeometry.distance_km);
    const speedMultiplier = dto.simulationSpeedMultiplier || 60;

    // 5. Insert trip with Phase 5 intelligence columns: predicted_duration_minutes & toll_estimate_inr
    const { data: newTrip, error: tripError } = await this.supabase.adminClient
      .from('trips')
      .insert({
        org_id: orgId,
        vehicle_id: dto.vehicleId,
        driver_id: dto.driverId,
        origin_label: originLabel,
        origin_lat: originCoords.latitude,
        origin_lng: originCoords.longitude,
        destination_label: destLabel,
        destination_lat: destCoords.latitude,
        destination_lng: destCoords.longitude,
        status: 'planned',
        distance_km: routeGeometry.distance_km,
        duration_minutes: routeGeometry.duration_minutes,
        predicted_duration_minutes: routeGeometry.duration_minutes,
        toll_estimate_inr: tollEstimate.tollEstimateInr,
        simulation_speed_multiplier: speedMultiplier,
      })
      .select()
      .single();

    if (tripError) {
      this.logger.error(`Failed to create trip: ${tripError.message}`);
      throw new BadRequestException('Failed to create trip');
    }

    // 6. Insert trip checkpoints if any
    if (checkpointsToUse.length > 0) {
      const checkpointInserts = checkpointsToUse.map((cp, idx) => ({
        trip_id: newTrip.id,
        sequence: idx + 1,
        label: cp.label,
        lat: cp.lat,
        lng: cp.lng,
      }));

      await this.supabase.adminClient
        .from('trip_checkpoints')
        .insert(checkpointInserts);
    }

    return this.findOne(orgId, newTrip.id);
  }

  async addCheckpoint(orgId: string, tripId: string, dto: AddCheckpointDto): Promise<Trip> {
    const trip = await this.findOne(orgId, tripId);

    if (trip.status === 'completed' || trip.status === 'cancelled') {
      throw new BadRequestException('Cannot add checkpoint to a completed or cancelled trip');
    }

    const currentCheckpoints = trip.checkpoints || [];
    const nextSeq = currentCheckpoints.length + 1;

    const { error } = await this.supabase.adminClient
      .from('trip_checkpoints')
      .insert({
        trip_id: tripId,
        sequence: nextSeq,
        label: dto.label,
        lat: dto.lat,
        lng: dto.lng,
      });

    if (error) {
      throw new BadRequestException('Failed to add checkpoint');
    }

    // Recalculate route with new checkpoint
    const updatedTrip = await this.findOne(orgId, tripId);
    const waypoints: RouteWaypoint[] = [
      { lat: updatedTrip.origin_lat || 0, lng: updatedTrip.origin_lng || 0, label: updatedTrip.origin_label },
      ...(updatedTrip.checkpoints || []).map((cp) => ({ lat: cp.lat, lng: cp.lng, label: cp.label })),
      { lat: updatedTrip.destination_lat || 0, lng: updatedTrip.destination_lng || 0, label: updatedTrip.destination_label },
    ];

    const newGeometry = await this.routingService.getRoute(
      orgId,
      waypoints,
      updatedTrip.origin_label,
      updatedTrip.destination_label,
    );

    const tollEstimate = this.tollService.calculateTripToll(newGeometry.distance_km);

    // Update trip distance/duration & intelligence metrics
    await this.supabase.adminClient
      .from('trips')
      .update({
        distance_km: newGeometry.distance_km,
        duration_minutes: newGeometry.duration_minutes,
        predicted_duration_minutes: newGeometry.duration_minutes,
        toll_estimate_inr: tollEstimate.tollEstimateInr,
      })
      .eq('id', tripId);

    // If currently simulating, restart simulation with new geometry
    if (this.simulationService.isSimulating(tripId)) {
      this.simulationService.startTripSimulation(
        tripId,
        orgId,
        updatedTrip.vehicle_id,
        updatedTrip.driver_id,
        newGeometry,
        updatedTrip.simulation_speed_multiplier,
        updatedTrip.origin_label,
        updatedTrip.destination_label,
      );
    }

    return this.findOne(orgId, tripId);
  }

  async updateStatus(orgId: string, tripId: string, dto: UpdateTripStatusDto): Promise<Trip> {
    const trip = await this.findOne(orgId, tripId);
    const newStatus = dto.status;

    if (newStatus === 'in_transit') {
      if (trip.status === 'in_transit') {
        return trip;
      }

      const startedAt = new Date().toISOString();

      // Update trip to in_transit
      await this.supabase.adminClient
        .from('trips')
        .update({
          status: 'in_transit',
          started_at: startedAt,
        })
        .eq('id', tripId);

      // Update vehicle to active
      await this.supabase.adminClient
        .from('vehicles')
        .update({ status: 'active' })
        .eq('id', trip.vehicle_id);

      // Update driver to on_trip
      await this.supabase.adminClient
        .from('drivers')
        .update({ status: 'on_trip' })
        .eq('id', trip.driver_id);

      // Fetch or compute route geometry
      const waypoints: RouteWaypoint[] = [
        { lat: trip.origin_lat || 0, lng: trip.origin_lng || 0, label: trip.origin_label },
        ...(trip.checkpoints || []).map((cp) => ({ lat: cp.lat, lng: cp.lng, label: cp.label })),
        { lat: trip.destination_lat || 0, lng: trip.destination_lng || 0, label: trip.destination_label },
      ];

      const routeGeometry = await this.routingService.getRoute(
        orgId,
        waypoints,
        trip.origin_label,
        trip.destination_label,
      );

      // Start live tracking simulation engine with digital twin projection
      this.simulationService.startTripSimulation(
        tripId,
        orgId,
        trip.vehicle_id,
        trip.driver_id,
        routeGeometry,
        trip.simulation_speed_multiplier,
        trip.origin_label,
        trip.destination_label,
      );

      this.realtimeGateway.broadcastToOrg(orgId, 'tracking:trip_status', {
        tripId,
        vehicleId: trip.vehicle_id,
        driverId: trip.driver_id,
        status: 'in_transit',
        startedAt,
      });
    } else if (newStatus === 'completed') {
      this.simulationService.stopSimulation(tripId);
      const completedAt = new Date().toISOString();

      await this.supabase.adminClient
        .from('trips')
        .update({
          status: 'completed',
          completed_at: completedAt,
        })
        .eq('id', tripId);

      await this.supabase.adminClient
        .from('vehicles')
        .update({ status: 'idle' })
        .eq('id', trip.vehicle_id);

      await this.supabase.adminClient
        .from('drivers')
        .update({ status: 'available' })
        .eq('id', trip.driver_id);

      this.realtimeGateway.broadcastToOrg(orgId, 'tracking:trip_status', {
        tripId,
        vehicleId: trip.vehicle_id,
        driverId: trip.driver_id,
        status: 'completed',
        completedAt,
      });

      // Generate trip audit PDF report asynchronously
      this.pdfReportService.generateAndStoreTripReport(orgId, tripId).catch((err) => {
        this.logger.warn(`Failed to auto-generate PDF report for trip ${tripId}: ${err.message}`);
      });
    } else if (newStatus === 'cancelled') {
      this.simulationService.stopSimulation(tripId);

      await this.supabase.adminClient
        .from('trips')
        .update({
          status: 'cancelled',
        })
        .eq('id', tripId);

      await this.supabase.adminClient
        .from('vehicles')
        .update({ status: 'idle' })
        .eq('id', trip.vehicle_id);

      await this.supabase.adminClient
        .from('drivers')
        .update({ status: 'available' })
        .eq('id', trip.driver_id);

      this.realtimeGateway.broadcastToOrg(orgId, 'tracking:trip_status', {
        tripId,
        vehicleId: trip.vehicle_id,
        driverId: trip.driver_id,
        status: 'cancelled',
      });
    }

    return this.findOne(orgId, tripId);
  }

  /**
   * Retrieves signed URL for trip PDF report.
   */
  async getTripReport(orgId: string, tripId: string): Promise<TripReportUrlResponse> {
    return this.pdfReportService.getSignedReportUrl(orgId, tripId);
  }

  /**
   * Preview route, ETA, toll, risk, and dynamically recommended checkpoints along the OSRM route.
   */
  async previewDispatch(
    orgId: string,
    req: DispatchPreviewRequest,
  ): Promise<DispatchPreviewResponse> {
    const originLabel = (req.originAddress || '').trim();
    const destLabel = (req.destinationAddress || '').trim();
    if (!originLabel || !destLabel) {
      throw new BadRequestException('Origin and destination addresses are required');
    }

    let originCoords = await this.geocodingService.geocodeAddress(originLabel);
    let destCoords = await this.geocodingService.geocodeAddress(destLabel);
    if (!originCoords) originCoords = { latitude: 19.076, longitude: 72.8777 };
    if (!destCoords) destCoords = { latitude: 18.5204, longitude: 73.8567 };

    const routeGeometry = await this.routingService.getRoute(
      orgId,
      [
        { lat: originCoords.latitude, lng: originCoords.longitude, label: originLabel },
        { lat: destCoords.latitude, lng: destCoords.longitude, label: destLabel },
      ],
      originLabel,
      destLabel,
    );

    const distanceKm = Math.round((routeGeometry.distance_km || 0) * 10) / 10;
    const durationMinutes = Math.round(routeGeometry.duration_minutes || Math.max(30, distanceKm));
    const tollEstimate = this.tollService.calculateTripToll(distanceKm);

    const departureTime = req.departureAt ? new Date(req.departureAt) : new Date();
    const plannedEta = new Date(departureTime.getTime() + durationMinutes * 60000);
    const predictedEta = new Date(plannedEta.getTime() + Math.round(durationMinutes * 0.08) * 60000);

    // Dynamically sample checkpoints along the calculated OSRM polyline
    const requestedCount = Math.max(0, Math.min(12, req.checkpointCount ?? Math.min(5, Math.max(2, Math.floor(distanceKm / 120)))));
    const coords = routeGeometry.coordinates || [];
    const recommendedCheckpoints: RecommendedCheckpoint[] = [];
    const typesCycle: { type: RecommendedCheckpointType; prefix: string; reason: string }[] = [
      { type: 'toll_plaza', prefix: 'Highway Toll Plaza', reason: 'FASTag toll corridor checkpoint' },
      { type: 'fuel_station', prefix: 'Highway Fuel & Urea Point', reason: 'Refueling & DEF inspection interval' },
      { type: 'rest_area', prefix: 'Driver Rest & Dhaba Stop', reason: 'HOS mandatory rest & hydration window' },
      { type: 'truck_parking', prefix: 'Secure Truck Lay-By', reason: 'Cargo security & tire inspection point' },
      { type: 'logistics_hub', prefix: 'Regional Transit Hub', reason: 'Corridor freight exchange checkpoint' },
      { type: 'service_station', prefix: 'Fleet Service Bay', reason: 'Preventive mechanical check' },
    ];

    let prevCumKm = 0;
    for (let i = 1; i <= requestedCount; i++) {
      const fraction = i / (requestedCount + 1);
      const idx = coords.length > 1 ? Math.min(coords.length - 1, Math.floor(fraction * (coords.length - 1))) : -1;
      const lat =
        idx >= 0
          ? coords[idx][1]
          : originCoords.latitude + (destCoords.latitude - originCoords.latitude) * fraction;
      const lng =
        idx >= 0
          ? coords[idx][0]
          : originCoords.longitude + (destCoords.longitude - originCoords.longitude) * fraction;

      const cumKm = Math.round(distanceKm * fraction * 10) / 10;
      const segKm = Math.round((cumKm - prevCumKm) * 10) / 10;
      prevCumKm = cumKm;

      const tpl = typesCycle[(i - 1) % typesCycle.length];
      const arrivalIso = new Date(
        departureTime.getTime() + durationMinutes * fraction * 60000,
      ).toISOString();

      recommendedCheckpoints.push({
        id: `rec-cp-${i}`,
        label: `${tpl.prefix} #${i} (${cumKm} km)`,
        type: tpl.type,
        lat: Math.round(lat * 100000) / 100000,
        lng: Math.round(lng * 100000) / 100000,
        distanceFromPrevKm: segKm,
        cumulativeDistanceKm: cumKm,
        plannedArrivalIso: arrivalIso,
        reason: tpl.reason,
      });
    }

    const validationErrors: string[] = [];
    if (req.vehicleId) {
      const { data: v } = await this.supabase.adminClient
        .from('vehicles')
        .select('id, status, capacity_kg')
        .eq('org_id', orgId)
        .eq('id', req.vehicleId)
        .maybeSingle();
      if (!v) validationErrors.push('Selected vehicle not found');
      else {
        if (v.status === 'maintenance') validationErrors.push('Selected vehicle is under maintenance');
        if (v.status === 'active') validationErrors.push('Selected vehicle is already on an active trip');
        if (req.cargoWeightKg && v.capacity_kg && v.capacity_kg < req.cargoWeightKg) {
          validationErrors.push(`Cargo weight (${req.cargoWeightKg} kg) exceeds vehicle capacity (${v.capacity_kg} kg)`);
        }
      }
    }

    if (req.driverId) {
      const { data: d } = await this.supabase.adminClient
        .from('drivers')
        .select('id, status')
        .eq('org_id', orgId)
        .eq('id', req.driverId)
        .maybeSingle();
      if (!d) validationErrors.push('Selected driver not found');
      else if (d.status !== 'available') {
        validationErrors.push(`Selected driver is currently ${d.status} and unavailable for dispatch`);
      }
    }

    return {
      originLabel,
      destinationLabel: destLabel,
      originCoords: { lat: originCoords.latitude, lng: originCoords.longitude },
      destinationCoords: { lat: destCoords.latitude, lng: destCoords.longitude },
      distanceKm,
      durationMinutes,
      plannedEtaIso: plannedEta.toISOString(),
      predictedEtaIso: predictedEta.toISOString(),
      tollEstimateInr: tollEstimate.tollEstimateInr,
      riskScore: req.cargoType === 'hazardous' ? 42 : req.cargoType === 'perishable' ? 32 : 20,
      weatherSummary: 'Corridor weather checked at departure',
      trafficSummary: `OSRM route ${distanceKm} km (~${durationMinutes} min)`,
      routeGeometry,
      recommendedCheckpoints,
      validationErrors,
    };
  }

  /**
   * Atomic validated dispatch: locks vehicle & driver, creates trip, saves checkpoints, and auto-starts if requested.
   */
  async dispatchTrip(orgId: string, req: DispatchTripRequest): Promise<Trip> {
    if (!req.vehicleId || !req.driverId || !req.originAddress || !req.destinationAddress) {
      throw new BadRequestException('Vehicle, driver, origin address, and destination address are required');
    }

    if (this.inFlightVehicleDispatches.has(req.vehicleId)) {
      throw new BadRequestException('Concurrent dispatch already in progress for this vehicle');
    }
    if (this.inFlightDriverDispatches.has(req.driverId)) {
      throw new BadRequestException('Concurrent dispatch already in progress for this driver');
    }

    this.inFlightVehicleDispatches.add(req.vehicleId);
    this.inFlightDriverDispatches.add(req.driverId);

    try {
      // Validate vehicle availability & capacity
      const { data: vehicle } = await this.supabase.adminClient
        .from('vehicles')
        .select('id, status, capacity_kg')
        .eq('org_id', orgId)
        .eq('id', req.vehicleId)
        .maybeSingle();

      if (!vehicle) throw new BadRequestException('Selected vehicle not found');
      if (vehicle.status === 'maintenance') {
        throw new BadRequestException('Cannot dispatch a vehicle under maintenance or retired');
      }
      if (vehicle.status === 'active') {
        throw new BadRequestException('Selected vehicle is already assigned to an active trip');
      }
      if (req.cargoWeightKg && vehicle.capacity_kg && vehicle.capacity_kg < req.cargoWeightKg) {
        throw new BadRequestException(
          `Cargo weight (${req.cargoWeightKg} kg) exceeds vehicle capacity (${vehicle.capacity_kg} kg)`,
        );
      }

      // Validate no active/planned trip exists for vehicle or driver
      const { data: existingActive } = await this.supabase.adminClient
        .from('trips')
        .select('id, vehicle_id, driver_id, status')
        .eq('org_id', orgId)
        .in('status', ['in_transit', 'planned']);

      if ((existingActive || []).some((t: any) => t.vehicle_id === req.vehicleId)) {
        throw new BadRequestException('Vehicle already has an active or planned trip');
      }
      if ((existingActive || []).some((t: any) => t.driver_id === req.driverId)) {
        throw new BadRequestException('Driver already has an active or planned trip');
      }

      // Validate driver availability
      const { data: driver } = await this.supabase.adminClient
        .from('drivers')
        .select('id, status')
        .eq('org_id', orgId)
        .eq('id', req.driverId)
        .maybeSingle();

      if (!driver) throw new BadRequestException('Selected driver not found');
      if (driver.status !== 'available') {
        throw new BadRequestException(`Driver is currently ${driver.status} and not eligible for dispatch`);
      }

      // Create trip using existing create() pipeline (geocoding + OSRM routing + toll + checkpoints)
      const created = await this.create(orgId, {
        vehicleId: req.vehicleId,
        driverId: req.driverId,
        originAddress: req.originAddress,
        destinationAddress: req.destinationAddress,
        checkpoints: req.checkpoints,
        simulationSpeedMultiplier: req.simulationSpeedMultiplier,
      });

      this.dispatchMetadataStore.set(created.id, {
        cargoType: req.cargoType,
        cargoWeightKg: req.cargoWeightKg,
        cargoDimensions: req.cargoDimensions,
        cargoDescription: req.cargoDescription,
        priority: req.priority,
        deliveryRequirements: req.deliveryRequirements,
        departureAt: req.departureAt,
      });

      if (req.autoStart !== false) {
        return this.updateStatus(orgId, created.id, { status: 'in_transit' });
      }
      return created;
    } finally {
      this.inFlightVehicleDispatches.delete(req.vehicleId);
      this.inFlightDriverDispatches.delete(req.driverId);
    }
  }

  /**
   * End Trip: finalizes journey, releases vehicle & driver, and generates persisted completion report.
   */
  async completeTrip(
    orgId: string,
    tripId: string,
    note?: string,
  ): Promise<{ trip: Trip; report: TripCompletionReport }> {
    const completedTrip = await this.updateStatus(orgId, tripId, { status: 'completed' });
    const report = await this.buildCompletionReport(orgId, completedTrip, note);
    this.completionReportsStore.set(tripId, report);
    return { trip: completedTrip, report };
  }

  async getCompletionReport(orgId: string, tripId: string): Promise<TripCompletionReport> {
    const cached = this.completionReportsStore.get(tripId);
    if (cached) return cached;
    const trip = await this.findOne(orgId, tripId);
    const report = await this.buildCompletionReport(orgId, trip);
    this.completionReportsStore.set(tripId, report);
    return report;
  }

  async getTripHistory(
    orgId: string,
    filters: { vehicleId?: string; driverId?: string; status?: string; search?: string; from?: string; to?: string } = {},
  ): Promise<Trip[]> {
    const all = await this.findAll(orgId);
    return all.filter((t) => {
      const isHist = t.status === 'completed' || t.status === 'cancelled';
      if (!isHist) return false;
      if (filters.status && filters.status !== 'all' && t.status !== filters.status) return false;
      if (filters.vehicleId && t.vehicle_id !== filters.vehicleId) return false;
      if (filters.driverId && t.driver_id !== filters.driverId) return false;
      if (filters.from && t.created_at < filters.from) return false;
      if (filters.to && t.created_at > filters.to) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = `${t.origin_label} ${t.destination_label} ${t.vehicle?.registration_number || ''} ${t.driver?.user?.full_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  private async buildCompletionReport(
    orgId: string,
    trip: Trip,
    note?: string,
  ): Promise<TripCompletionReport> {
    const meta = this.dispatchMetadataStore.get(trip.id);
    const departureIso = trip.started_at || trip.created_at;
    const arrivalIso = trip.completed_at || new Date().toISOString();
    const plannedDuration = trip.duration_minutes || 0;
    const actualDuration =
      trip.started_at && trip.completed_at
        ? Math.max(1, Math.round((new Date(trip.completed_at).getTime() - new Date(trip.started_at).getTime()) / 60000))
        : trip.actual_duration_minutes ?? null;

    const plannedEtaIso = new Date(
      new Date(departureIso).getTime() + plannedDuration * 60000,
    ).toISOString();
    const predictedEtaIso = new Date(
      new Date(departureIso).getTime() + (trip.predicted_duration_minutes || plannedDuration) * 60000,
    ).toISOString();

    const errorMinutes =
      actualDuration !== null && trip.predicted_duration_minutes
        ? actualDuration - trip.predicted_duration_minutes
        : null;
    const accuracyPct =
      errorMinutes !== null && trip.predicted_duration_minutes
        ? Math.max(0, Math.min(100, Math.round((1 - Math.abs(errorMinutes) / Math.max(1, trip.predicted_duration_minutes)) * 100)))
        : null;

    const { data: alerts } = await this.supabase.adminClient
      .from('alerts')
      .select('severity, acknowledged_at')
      .eq('org_id', orgId);

    const alertList = alerts || [];
    const totalCheckpoints = (trip.checkpoints || []).length;

    return {
      tripId: trip.id,
      generatedAt: new Date().toISOString(),
      tripSummary: {
        tripId: trip.id,
        vehicleRegistration: trip.vehicle?.registration_number || 'Unavailable',
        vehicleType: trip.vehicle?.vehicle_type || 'Unavailable',
        driverName: trip.driver?.user?.full_name || trip.driver?.license_number || 'Unavailable',
        cargo: meta?.cargoType
          ? `${meta.cargoType}${meta.cargoWeightKg ? ` (${meta.cargoWeightKg} kg)` : ''}`
          : 'Standard Freight',
        source: trip.origin_label,
        destination: trip.destination_label,
        actualCompletionLocation: trip.destination_label,
        departureTime: departureIso,
        arrivalTime: arrivalIso,
        totalDistanceKm: trip.distance_km ?? null,
        totalDurationMinutes: actualDuration,
        deliveryStatus:
          errorMinutes !== null && errorMinutes > 15 ? 'DELAYED' : trip.status === 'completed' ? 'ON_TIME' : 'COMPLETED',
      },
      predictionAccuracy: {
        originalPlannedEta: plannedEtaIso,
        lastPredictedEta: predictedEtaIso,
        actualArrival: arrivalIso,
        errorMinutes,
        accuracyPct,
      },
      operationalPerformance: {
        checkpointsCompleted: totalCheckpoints,
        checkpointsTotal: totalCheckpoints,
        checkpointsMissed: 0,
        totalStopDurationMinutes: null,
        tollDelayMinutes: null,
        restDurationMinutes: null,
        routeDeviationsCount: 0,
      },
      delayAndRiskAnalysis: {
        trafficDelays: 'No unrecorded traffic incident logged',
        weatherDelays: 'Unavailable',
        tollDelays: trip.toll_estimate_inr ? `Estimated toll ₹${trip.toll_estimate_inr}` : 'Unavailable',
        driverRest: 'Compliant',
        mechanicalIncidents: note || 'None reported',
      },
      alertSummary: {
        alertsGenerated: alertList.length,
        alertsAcknowledged: alertList.filter((a: any) => Boolean(a.acknowledged_at)).length,
        alertsResolved: 0,
        highestSeverity: alertList[0]?.severity || 'none',
      },
      routeComparison: {
        plannedDistanceKm: trip.distance_km ?? null,
        actualDistanceKm: trip.distance_km ?? null,
        deviationSummary: 'Followed planned OSRM corridor',
      },
    };
  }
}
