import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { SupabaseService } from '../supabase/supabase.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { TripsService } from '../trips/trips.service';
import { TrainMovementsService } from '../railways/movements/train-movements.service';
import { FlightMovementsService } from '../airways/movements/flight-movements.service';
import { VoyageMovementsService } from '../seaways/movements/voyage-movements.service';
import { FleetTwinService } from '../fleet-twin/fleet-twin.service';
import {
  AiChatMessage,
  AiChatRequest,
  AiConfirmActionRequest,
  AiToolCall,
  AiProposedAction,
} from '@nexus-ways/shared';

// ---------------------------------------------------------------------------
// SYSTEM INSTRUCTION
// ---------------------------------------------------------------------------
const NEXUS_SYSTEM_INSTRUCTION = `You are the NEXUS WAYS Multimodal Logistics Operations Copilot — an intelligent, role-aware, multilingual AI analyst.

NEXUS WAYS is an enterprise Multimodal Logistics Intelligence Platform covering:
1. Roadways (live fleet simulation, OSRM routing, geofences, HOS/duty tracking, convoys, telemetry, Digital Twin)
2. Railways (freight rakes, yard tracking, block section operations, Overpass rail routing, slot intelligence, digital twin ghost tracking, crew scoring, GLEC rail carbon)
3. Airways (air cargo manifests, flight movements, Great-Circle direct spherical routing, airport runway/apron slot intelligence, DGCA FDTL compliance, pilot safety scoring, GLEC air carbon)
4. Seaways (ocean vessels, container tracking, port calls, berth allocations, searoute open-water routing, STCW Regulation VIII/1 watchkeeping compliance, master safety scoring, GLEC DWT-bucketed maritime carbon)

KEY PLATFORM CAPABILITIES:
- Digital Twin: Real-time ghost projection simulating scheduled vehicle/train/flight/vessel progress vs actual telemetry position, calculating schedule deviation in minutes.
- Predictive ETA: Dynamic arrival time confidence intervals derived from historical standard deviation (≥3 trips/movements) or calibrated heuristics (±15%).
- 48-Hour Timeline: Weather, traffic, toll, fatigue, and reroute event predictions for each vehicle.
- Alternate Route Engine: Fastest / Cheapest / Safest / Balanced reroute recommendations with time saved, cost delta, and risk delta.
- Safety & Crew Behavior: Deterministic rule-based scoring based on recorded telemetry.
- Green Logistics & Carbon: GLEC Framework v3.2 calculations.
- Operational Compliance: Geofencing, HOS rules, DGCA FDTL, IMO STCW watchkeeping.

LANGUAGE RULES (CRITICAL):
- Automatically detect the language of the user's message.
- If the user writes in Tamil script (தமிழ்) or Tanglish (Tamil words in English letters like "vehicle eppo varum"), respond naturally in the same style.
- If the user writes in English, respond in English.
- If mixed Tamil+English, respond in natural conversational Tamil-English mix.
- If the user says "தமிழில் சொல்லு" or "Explain in Tamil" or "Tamil la sollu", respond fully in Tamil.
- If the user says "Explain in English" or "English la sollu", respond in English.
- Operational values (vehicle numbers, speeds, distances, ETAs, coordinates, route names, units) MUST remain accurate regardless of language.

BEHAVIORAL RULES:
1. Answer general questions and architecture questions directly — do NOT call operational tools for general/conceptual questions.
2. Only call operational tools when the user explicitly asks for live data (fleet status, vehicle location, alerts, trips, routes, etc.).
3. Automatically choose the right tool set based on context (Road vs Rail vs Air vs Sea vs Fleet Twin).
4. When asked to acknowledge or clear an alert, propose the action using propose_acknowledge_alert so the human operator can confirm.
5. Maintain conversation context — if the user says "why?" after a vehicle query, understand they mean the previously mentioned vehicle.
6. For operational questions, respond in this structure: Vehicle/Status → Location/Speed → ETA/Delay → Risk → Recommended Action.
7. Distinguish data freshness clearly: LIVE / CACHED / FORECAST / MODEL PREDICTION.
8. Never invent facts. If data is unavailable, say so clearly.
9. Be concise for simple questions. Use structured formatting for analytical responses.

ROLE-BASED ACCESS:
- ADMIN: Full access to all fleet, vehicle, driver, trip, alert, route, analytics, and prediction data across the organization.
- MANAGER: Access to fleet and operational data within their authorized scope.
- DRIVER: Access ONLY to their own assigned vehicle, journey, route, checkpoints, alerts, ETA, and driving instructions. Must NOT see other vehicles, drivers, admin analytics, or restricted data.`;

// ---------------------------------------------------------------------------
// Language detection helper
// ---------------------------------------------------------------------------
function detectLanguage(text: string): 'tamil' | 'tanglish' | 'english' {
  // Tamil Unicode block: U+0B80–U+0BFF
  if (/[\u0B80-\u0BFF]/.test(text)) return 'tamil';

  const tanglishWords = [
    'eppo', 'enakku', 'enna', 'sollu', 'vehicle', 'varum', 'ponga', 'inga', 'enga',
    'paaru', 'theriyuma', 'illa', 'aam', 'sari', 'yaaru', 'enna', 'evvalavu',
    'yaarum', 'route', 'la sollu', 'la solu', 'solunga', 'parunga', 'vaanga',
    'vithu', 'po', 'da', 'di', 'bro', 'machi', 'dei', 'dei', 'nalla', 'romba',
  ];
  const lower = text.toLowerCase();
  if (tanglishWords.some((w) => lower.includes(w))) return 'tanglish';

  return 'english';
}

// ---------------------------------------------------------------------------
// AiService
// ---------------------------------------------------------------------------
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private genAiClient: GoogleGenAI | null = null;
  private readonly modelName: string;
  private pendingActions = new Map<string, AiProposedAction>();
  private processingActions = new Set<string>();
  private completedActions = new Map<string, { success: boolean; message: string }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly dashboardService: DashboardService,
    private readonly tripsService: TripsService,
    private readonly trainMovementsService: TrainMovementsService,
    private readonly flightMovementsService: FlightMovementsService,
    private readonly voyageMovementsService: VoyageMovementsService,
    private readonly fleetTwinService: FleetTwinService,
  ) {
    const rawModel = this.configService.get<string>('GEMINI_MODEL');
    this.modelName = rawModel && rawModel.trim() ? rawModel.trim() : 'gemini-3-flash-preview';
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (apiKey && apiKey.trim() && apiKey !== 'mock-gemini-key') {
      try {
        this.genAiClient = new GoogleGenAI({ apiKey: apiKey.trim() });
        this.logger.log(`Gemini Assistant initialized with model ${this.modelName}`);
      } catch (err: any) {
        this.logger.warn(`Failed to initialize GoogleGenAI: ${err.message}`);
      }
    } else {
      this.logger.log('No GEMINI_API_KEY configured. Context-aware fallback active.');
    }
  }

  // -------------------------------------------------------------------------
  // RBAC: Resolve driver's authorized vehicle & trip scope from backend DB
  // -------------------------------------------------------------------------
  private async getDriverScope(
    orgId: string,
    userId: string,
  ): Promise<{ vehicleIds: string[]; tripIds: string[]; registrations: string[] }> {
    const vehicleIds: string[] = [];
    const tripIds: string[] = [];
    const registrations: string[] = [];

    try {
      const { data: driverRows } = await this.supabase.adminClient
        .from('drivers')
        .select('id, license_number')
        .eq('org_id', orgId)
        .eq('user_id', userId);

      const driverIds = (driverRows || []).map((d: any) => d.id);
      if (driverIds.length > 0) {
        const { data: tripRows } = await this.supabase.adminClient
          .from('trips')
          .select('id, vehicle_id')
          .eq('org_id', orgId)
          .in('driver_id', driverIds);

        for (const t of tripRows || []) {
          if (t.id) tripIds.push(t.id);
          if (t.vehicle_id) vehicleIds.push(t.vehicle_id);
        }
      }

      // Also match mock fleet-twin driver by user email/full_name or license_number
      const { data: userRow } = await this.supabase.adminClient
        .from('users')
        .select('full_name, email')
        .eq('id', userId)
        .maybeSingle();

      const allVehicles = await this.fleetTwinService.getAllVehicles();
      for (const v of allVehicles) {
        const drv = (v as any).driver;
        const nameMatch =
          userRow?.full_name &&
          drv?.name &&
          drv.name.toLowerCase().includes(userRow.full_name.toLowerCase());
        const licenseMatch = (driverRows || []).some(
          (d: any) => d.license_number && drv?.license_number === d.license_number,
        );
        if (nameMatch || licenseMatch || vehicleIds.includes(v.id)) {
          vehicleIds.push(v.id);
          if (v.registration_number) {
            registrations.push(v.registration_number.replace(/\s+/g, '').toUpperCase());
          }
        }
      }
    } catch (err) {
      this.logger.debug(`Driver scope lookup error: ${err}`);
    }

    return {
      vehicleIds: Array.from(new Set(vehicleIds)),
      tripIds: Array.from(new Set(tripIds)),
      registrations: Array.from(new Set(registrations)),
    };
  }

  /**
   * Resolve a vehicle UUID or registration number (e.g., "TN 01 AB 4021") to its vehicle ID.
   */
  private async resolveVehicleId(vehicleIdOrReg: string): Promise<string> {
    if (!vehicleIdOrReg) return vehicleIdOrReg;
    try {
      const all = await this.fleetTwinService.getAllVehicles();
      const normalized = vehicleIdOrReg.replace(/\s+/g, '').toUpperCase();
      const match = all.find(
        (v) =>
          v.id === vehicleIdOrReg ||
          (v.registration_number && v.registration_number.replace(/\s+/g, '').toUpperCase() === normalized),
      );
      return match ? match.id : vehicleIdOrReg;
    } catch {
      return vehicleIdOrReg;
    }
  }

  // -------------------------------------------------------------------------
  // Tool Executor — RBAC enforced here, not just in system prompt
  // -------------------------------------------------------------------------
  private async executeTool(
    orgId: string,
    userId: string,
    userRole: string,
    name: string,
    args: any,
  ): Promise<any> {
    this.logger.log(`AI Tool [${userRole}/${userId}]: ${name}(${JSON.stringify(args)})`);

    const isDriver = userRole === 'driver';
    const driverScope = isDriver ? await this.getDriverScope(orgId, userId) : null;

    const isVehicleAuthorized = (resolvedId: string): boolean => {
      if (!isDriver || !driverScope) return true;
      return driverScope.vehicleIds.includes(resolvedId);
    };

    switch (name) {
      // ---- DASHBOARD (Reconciled: Org DB + Fleet Twin, matching Roadways Dashboard) ----
      case 'get_dashboard_stats': {
        if (isDriver) {
          return {
            error: 'Access denied: Drivers cannot access organization-wide dashboard analytics. Ask about your assigned vehicle or trip instead.',
          };
        }

        let dbStats: any = null;
        let dbError: string | null = null;
        try {
          dbStats = await this.dashboardService.getStats(orgId);
        } catch (err: any) {
          dbError = err?.message || 'Dashboard DB unavailable';
          this.logger.warn(`get_dashboard_stats DB error: ${dbError}`);
        }

        let twinOverview: any = null;
        try {
          twinOverview = await this.fleetTwinService.getOverview();
        } catch (err: any) {
          this.logger.warn(`get_dashboard_stats FleetTwin error: ${err?.message}`);
        }

        if (!dbStats && !twinOverview) {
          return {
            error: `Dashboard statistics unavailable: ${dbError || 'Services temporarily unavailable'}`,
            dataSource: 'UNAVAILABLE',
          };
        }

        const realActive = dbStats?.activeVehicles?.value ?? 0;
        const realTotal = dbStats?.totalFleetToday?.value ?? 0;
        const realAlerts = dbStats?.activeAlerts ?? 0;
        const realSpeed = dbStats?.avgSpeedKmh?.value ?? 0;
        const realArrived = dbStats?.arrivedCount?.value ?? 0;
        const realDeparted = dbStats?.departedCount?.value ?? 0;

        const twinActive = twinOverview?.enabled ? (twinOverview.totals?.active_vehicles ?? 0) : 0;
        const twinTotal = twinOverview?.enabled ? (twinOverview.totals?.total_fleet ?? 0) : 0;
        const twinAlerts = twinOverview?.enabled ? (twinOverview.totals?.active_alerts ?? 0) : 0;
        const twinSpeed = twinOverview?.enabled ? (twinOverview.totals?.average_speed_kmh ?? 0) : 0;
        const twinArrived = twinOverview?.enabled ? (twinOverview.totals?.arrived_today ?? 0) : 0;
        const twinDeparted = twinOverview?.enabled ? (twinOverview.totals?.departed_today ?? 0) : 0;

        const combinedSpeed =
          realSpeed > 0 && twinSpeed > 0
            ? Math.round(((realSpeed + twinSpeed) / 2) * 10) / 10
            : twinSpeed > 0
            ? twinSpeed
            : realSpeed;

        return {
          activeAlerts: realAlerts + twinAlerts,
          activeVehicles: realActive + twinActive,
          totalFleet: realTotal + twinTotal,
          avgSpeedKmh: combinedSpeed,
          arrivedCount: realArrived + twinArrived,
          departedCount: realDeparted + twinDeparted,
          breakdown: {
            orgDatabase: dbError ? { error: dbError } : { activeVehicles: realActive, totalFleet: realTotal, activeAlerts: realAlerts },
            fleetTwin: twinOverview?.enabled ? { activeVehicles: twinActive, totalFleet: twinTotal, activeAlerts: twinAlerts } : null,
          },
          dataFreshness: 'LIVE_RECONCILED',
          timestamp: new Date().toISOString(),
        };
      }

      // ---- FLEET TWIN OVERVIEW ----
      case 'get_fleet_twin_overview': {
        const overview = await this.fleetTwinService.getOverview();
        const vehicles = isDriver
          ? overview.vehicles
              .filter((v) => driverScope?.vehicleIds.includes(v.id))
              .map((v) => ({
                id: v.id,
                registration: v.registration_number,
                truckType: v.truck_type,
                status: v.status,
                speedKmh: v.speed_kmh,
                location: { lat: v.current_lat, lng: v.current_lng },
                progressPct: v.progress_pct,
                currentCheckpoint: v.current_checkpoint_name,
                nextCheckpoint: v.next_checkpoint_name,
                nextCheckpointDistKm: v.next_checkpoint_distance_km,
                predictedEta: v.predicted_eta,
                delayMinutes: v.total_predicted_delay_minutes,
                riskScore: v.risk_score,
              }))
          : overview.vehicles.map((v) => ({
              id: v.id,
              registration: v.registration_number,
              truckType: v.truck_type,
              status: v.status,
              speedKmh: v.speed_kmh,
              location: { lat: v.current_lat, lng: v.current_lng },
              progressPct: v.progress_pct,
              fleetName: v.fleet_name,
              driverName: v.driver?.name,
              currentCheckpoint: v.current_checkpoint_name,
              nextCheckpoint: v.next_checkpoint_name,
              nextCheckpointDistKm: v.next_checkpoint_distance_km,
              predictedEta: v.predicted_eta,
              delayMinutes: v.total_predicted_delay_minutes,
              riskScore: v.risk_score,
              liveTraffic: v.live_traffic,
            }));

        const alerts = isDriver
          ? overview.alerts.filter((a) => driverScope?.vehicleIds.includes(a.vehicle_id))
          : overview.alerts;

        if (isDriver && vehicles.length === 0) {
          return {
            error: 'No assigned vehicle found for your driver account. Contact your fleet manager.',
            dataSource: 'RBAC_FILTERED',
          };
        }

        return {
          enabled: overview.enabled,
          totalFleet: isDriver ? vehicles.length : overview.totals.total_fleet,
          activeVehicles: isDriver ? vehicles.length : overview.totals.active_vehicles,
          activeAlerts: alerts.length,
          averageSpeedKmh: isDriver
            ? vehicles[0]?.speedKmh || 0
            : overview.totals.average_speed_kmh,
          arrivedToday: isDriver ? 0 : overview.totals.arrived_today,
          departedToday: isDriver ? vehicles.length : overview.totals.departed_today,
          vehicles,
          alerts,
          dataSource: 'LIVE_FLEET_TWIN',
        };
      }

      // ---- ALL VEHICLES LIST ----
      case 'get_all_vehicles': {
        const allV = await this.fleetTwinService.getAllVehicles();
        const filtered = isDriver
          ? allV.filter((v) => driverScope?.vehicleIds.includes(v.id))
          : allV;
        if (isDriver && filtered.length === 0) {
          return { error: 'Access denied. No assigned vehicle found for your driver account.' };
        }
        return filtered.map((v) => ({
          id: v.id,
          registration: v.registration_number,
          truckType: v.truck_type,
          status: v.status,
          speedKmh: v.speed_kmh,
          lat: v.current_lat,
          lng: v.current_lng,
          progressPct: v.progress_pct,
          fuelType: v.fuel_type,
          capacityTons: v.capacity_tons,
          currentLoadTons: v.current_load_tons,
          driverName: (v as any).driver?.name,
          fleetName: (v as any).fleet?.name,
          routeName: (v as any).route?.name,
        }));
      }

      // ---- VEHICLE DIGITAL TWIN ----
      case 'get_vehicle_digital_twin': {
        if (!args.vehicle_id) return { error: 'vehicle_id or registration number is required' };
        const vehicleId = await this.resolveVehicleId(String(args.vehicle_id));
        if (!isVehicleAuthorized(vehicleId)) {
          return { error: 'Access denied: Drivers can only access their own assigned vehicle.' };
        }

        const whatIf: any = {
          rain_severity_multiplier: Number(args.rain_severity_multiplier) || 1.0,
          toll_strike_hours: Number(args.toll_strike_hours) || 0,
          breakdown_hours: Number(args.breakdown_hours) || 0,
          traffic_congestion_multiplier: Number(args.traffic_congestion_multiplier) || 1.0,
        };

        try {
          const twin = await this.fleetTwinService.getVehicleDigitalTwin(vehicleId, whatIf);
          return {
            vehicleId: twin.vehicle.id,
            registration: twin.vehicle.registration_number,
            truckType: twin.vehicle.truck_type,
            status: twin.vehicle.status,
            currentLocation: { lat: twin.vehicle.current_lat, lng: twin.vehicle.current_lng },
            speedKmh: twin.vehicle.speed_kmh,
            progressPct: twin.current_progress_pct,
            fleetName: twin.fleet?.name,
            driverName: twin.driver?.name,
            driverPhone: !isDriver ? twin.driver?.phone : undefined,
            driverHoursDrivenToday: twin.driver?.hours_driven_today,
            driverRestCompliance: twin.driver?.rest_hours_compliance,
            routeName: twin.route?.name,
            originCity: twin.route?.origin_city,
            destinationCity: twin.route?.destination_city,
            totalDistanceKm: twin.route?.total_distance_km,
            plannedEta: twin.planned_eta,
            predictedEta: twin.predicted_eta,
            delayMinutes: twin.total_predicted_delay_minutes,
            onTimeProbability: twin.on_time_probability,
            riskScore: twin.risk_score,
            topDelayCauses: twin.top_delay_causes,
            driverFatiguePct: twin.driver_fatigue_pct,
            currentCheckpoint: twin.current_checkpoint?.name,
            nextCheckpoint: twin.next_checkpoint?.name,
            upcomingEvents: (twin.timeline || []).slice(0, 6).map((e: any) => ({
              eventType: e.event_type,
              time: e.timestamp,
              location: e.location_name,
              delayMinutes: e.delay_minutes,
              severity: e.severity,
              description: e.description,
              hoursFromNow: e.hours_from_now,
            })),
            etaBreakdown: twin.eta_breakdown,
            explanation: twin.explanation,
            scenarioComparison: twin.scenario_comparison,
            activeReroute: twin.active_reroute
              ? {
                  recommendedRoute: twin.active_reroute.recommended_route_name,
                  mode: twin.active_reroute.mode,
                  timeSavedMinutes: twin.active_reroute.time_saved_minutes,
                  extraDistanceKm: twin.active_reroute.extra_distance_km,
                  newEta: twin.active_reroute.new_eta,
                }
              : null,
            dataFreshness: twin.data_freshness,
            liveTraffic: twin.live_traffic,
            dataSource: 'LIVE_DIGITAL_TWIN_48H',
          };
        } catch (e: any) {
          return { error: `Vehicle digital twin not found: ${e.message}` };
        }
      }

      // ---- VEHICLE CHECKPOINTS ----
      case 'get_vehicle_checkpoints': {
        if (!args.vehicle_id) return { error: 'vehicle_id or registration number is required' };
        const vehicleId = await this.resolveVehicleId(String(args.vehicle_id));
        if (!isVehicleAuthorized(vehicleId)) {
          return { error: 'Access denied: Drivers can only access checkpoints for their own assigned vehicle.' };
        }
        try {
          const checkpoints = await this.fleetTwinService.getCheckpointsByVehicle(vehicleId);
          const vehicle = await this.fleetTwinService.getVehicleById(vehicleId);
          const totalDist = (vehicle as any).route?.total_distance_km || 500;
          const currentDist = (vehicle.progress_pct / 100) * totalDist;

          return checkpoints.map((cp) => ({
            id: cp.id,
            name: cp.name,
            type: cp.type,
            sequence: cp.sequence_order,
            distanceFromStartKm: cp.distance_from_start_km,
            lat: cp.latitude,
            lng: cp.longitude,
            crossed: cp.distance_from_start_km <= currentDist,
            isNext: cp.distance_from_start_km > currentDist &&
              checkpoints.find(c => c.distance_from_start_km > currentDist)?.id === cp.id,
          }));
        } catch (e: any) {
          return { error: `Could not retrieve checkpoints: ${e.message}` };
        }
      }

      // ---- VEHICLE REROUTE ----
      case 'get_vehicle_reroute': {
        if (!args.vehicle_id) return { error: 'vehicle_id or registration number is required' };
        const vehicleId = await this.resolveVehicleId(String(args.vehicle_id));
        if (!isVehicleAuthorized(vehicleId)) {
          return { error: 'Access denied: Drivers can only request reroutes for their own assigned vehicle.' };
        }
        const mode = args.mode || 'balanced';
        const whatIf: any = {
          rain_severity_multiplier: Number(args.rain_severity_multiplier) || 1.0,
          toll_strike_hours: Number(args.toll_strike_hours) || 0,
          breakdown_hours: Number(args.breakdown_hours) || 0,
          traffic_congestion_multiplier: Number(args.traffic_congestion_multiplier) || 1.0,
        };
        try {
          const reroute = await this.fleetTwinService.calculateReroute(vehicleId, mode as any, whatIf);
          return {
            vehicleId: reroute.vehicle_id,
            mode: reroute.mode,
            recommendedRoute: reroute.recommended_route_name,
            timeSavedMinutes: reroute.time_saved_minutes,
            extraDistanceKm: reroute.extra_distance_km,
            fuelCostDeltaInr: reroute.fuel_cost_delta_inr,
            tollCostDeltaInr: reroute.toll_cost_delta_inr,
            riskScoreDelta: reroute.risk_score_delta,
            newEta: reroute.new_eta,
            meetingDeadlineProb: reroute.meeting_deadline_prob,
            feasibility: reroute.feasibility,
            problems: reroute.problems,
            reason: reroute.reason,
            dataSource: 'REROUTE_ENGINE_LIVE',
          };
        } catch (e: any) {
          return { error: `Reroute calculation failed: ${e.message}` };
        }
      }

      // ---- VEHICLE ALERTS ----
      case 'get_vehicle_alerts': {
        const vehicleId = args.vehicle_id
          ? await this.resolveVehicleId(String(args.vehicle_id))
          : undefined;
        if (isDriver) {
          if (vehicleId && !isVehicleAuthorized(vehicleId)) {
            return { error: 'Access denied: Drivers can only view alerts for their own assigned vehicle.' };
          }
          if (!driverScope || driverScope.vehicleIds.length === 0) {
            return [];
          }
        }

        const query = this.supabase.adminClient
          .from('alerts')
          .select('*')
          .eq('org_id', orgId)
          .is('acknowledged_at', null)
          .order('created_at', { ascending: false })
          .limit(20);

        if (vehicleId) {
          query.eq('vehicle_id', vehicleId);
        } else if (isDriver && driverScope) {
          query.in('vehicle_id', driverScope.vehicleIds);
        }

        const { data: alerts } = await query;
        return (alerts || []).map((a: any) => ({
          id: a.id,
          type: a.type,
          severity: a.severity,
          message: a.message,
          vehicleId: a.vehicle_id,
          createdAt: a.created_at,
        }));
      }

      // ---- EXISTING + FLEET TWIN ACTIVE TRIPS (Reconciled) ----
      case 'list_active_trips': {
        let orgTrips: any[] = [];
        let orgTripError: string | null = null;
        try {
          orgTrips = await this.tripsService.findAll(orgId);
        } catch (err: any) {
          orgTripError = err?.message || 'Trips database query failed';
          this.logger.warn(`list_active_trips DB error: ${orgTripError}`);
        }

        const ACTIVE_TRIP_STATUSES = new Set([
          'in_transit',
          'planned',
          'dispatched',
          'en_route',
          'delayed',
          'resting',
          'paused',
        ]);

        let activeOrgTrips = orgTrips.filter((t) =>
          ACTIVE_TRIP_STATUSES.has(String(t.status || '').toLowerCase()),
        );
        if (isDriver && driverScope) {
          activeOrgTrips = activeOrgTrips.filter(
            (t) =>
              t.driver?.user?.id === userId ||
              driverScope.tripIds.includes(t.id) ||
              (t.vehicle_id && driverScope.vehicleIds.includes(t.vehicle_id)),
          );
        }

        const reconciled: any[] = activeOrgTrips.map((t) => ({
          tripId: t.id,
          source: 'org_trips',
          origin: t.origin_label,
          destination: t.destination_label,
          vehicleId: t.vehicle_id,
          vehicle: t.vehicle?.registration_number || 'Unassigned',
          vehicleType: t.vehicle?.vehicle_type,
          driver: t.driver?.user?.full_name || t.driver?.license_number,
          status: t.status,
          dispatchTime: t.started_at || t.created_at,
          distanceKm: t.distance_km,
          predictedDurationMin: t.predicted_duration_minutes,
          dataFreshness: 'LIVE_DB',
        }));

        const seenRegistrations = new Set(
          reconciled
            .map((r) => String(r.vehicle || '').replace(/\s+/g, '').toUpperCase())
            .filter(Boolean),
        );

        let twinError: string | null = null;
        try {
          const twinOverview = await this.fleetTwinService.getOverview();
          if (twinOverview?.enabled && Array.isArray(twinOverview.vehicles)) {
            for (const v of twinOverview.vehicles) {
              if (isDriver && !driverScope?.vehicleIds.includes(v.id)) continue;
              const normalizedReg = String(v.registration_number || '')
                .replace(/\s+/g, '')
                .toUpperCase();
              if (seenRegistrations.has(normalizedReg)) continue;

              const vStatus = String(v.status || '').toLowerCase();
              if (vStatus === 'completed' || vStatus === 'cancelled') continue;
              if ((v.progress_pct ?? 0) >= 100) continue;
              if (!v.route && vStatus === 'idle') continue;

              reconciled.push({
                tripId: `twin-${v.id}`,
                vehicleId: v.id,
                source: 'fleet_twin',
                origin: v.route?.origin_city || 'Origin',
                destination: v.route?.destination_city || 'Destination',
                routeName: v.route?.name,
                vehicle: v.registration_number,
                vehicleType: v.truck_type,
                driver: v.driver?.name,
                status: v.status, // en_route, delayed, resting, idle
                currentLocation: { lat: v.current_lat, lng: v.current_lng },
                speedKmh: v.speed_kmh,
                progressPct: v.progress_pct,
                nextCheckpoint: v.next_checkpoint_name,
                nextCheckpointDistKm: v.next_checkpoint_distance_km,
                plannedEta: v.route?.planned_eta,
                predictedEta: v.predicted_eta,
                delayMinutes: v.total_predicted_delay_minutes,
                riskScore: v.risk_score,
                distanceKm: v.route?.total_distance_km,
                dataFreshness: 'LIVE_FLEET_TWIN',
              });
            }
          }
        } catch (err: any) {
          twinError = err?.message || 'Fleet Twin overview unavailable';
          this.logger.warn(`list_active_trips FleetTwin error: ${twinError}`);
        }

        if (orgTripError && twinError) {
          return {
            error: `Trip service temporarily unavailable (${orgTripError}; ${twinError})`,
            dataSource: 'UNAVAILABLE',
          };
        }

        return reconciled;
      }

      case 'get_trip_details': {
        if (!args.trip_id) return { error: 'trip_id is required' };
        try {
          const trip = await this.tripsService.findOne(orgId, args.trip_id);
          if (
            isDriver &&
            trip.driver?.user?.id !== userId &&
            !driverScope?.tripIds.includes(trip.id)
          ) {
            return { error: 'Access denied: Drivers can only access their own assigned trip.' };
          }
          const eta = await this.tripsService.getEta(orgId, args.trip_id).catch(() => null);
          return {
            tripId: trip.id,
            origin: trip.origin_label,
            destination: trip.destination_label,
            status: trip.status,
            vehicle: trip.vehicle?.registration_number,
            driver: trip.driver?.user?.full_name,
            driverScore: trip.driver_score?.score,
            carbonKg: trip.carbon_kg,
            tollEstimateInr: trip.toll_estimate_inr,
            etaConfidence: eta
              ? {
                  baseEtaMinutes: eta.base_eta_minutes,
                  minEta: eta.min_eta_minutes,
                  maxEta: eta.max_eta_minutes,
                  confidenceBasis: eta.confidence_basis,
                  sampleSize: eta.sample_size,
                }
              : null,
          };
        } catch (e: any) {
          return { error: `Trip ${args.trip_id} not found` };
        }
      }

      // ---- TRAIN MOVEMENTS ----
      case 'list_active_train_movements': {
        if (isDriver) return { error: 'Access denied: Roadway drivers cannot access Railways operations.' };
        const movements = await this.trainMovementsService.findAll(orgId);
        const active = movements.filter((m) => m.status === 'in_transit' || m.status === 'planned');
        return active.map((m) => ({
          movementId: m.id,
          trainNumber: m.train?.train_number,
          trainName: m.train?.train_name,
          originStation: m.origin_station?.name,
          destinationStation: m.destination_station?.name,
          locoPilot: m.loco_pilot?.user?.full_name || m.loco_pilot?.license_number,
          locoFuelType: m.train?.locomotive?.fuel_type,
          status: m.status,
          distanceKm: m.distance_km,
          durationMinutes: m.duration_minutes,
        }));
      }

      case 'get_train_movement_details': {
        if (isDriver) return { error: 'Access denied: Roadway drivers cannot access Railways operations.' };
        if (!args.movement_id) return { error: 'movement_id is required' };
        try {
          const movement = await this.trainMovementsService.findOne(orgId, args.movement_id);
          const eta = await this.trainMovementsService.getEtaConfidence(orgId, args.movement_id).catch(() => null);
          return {
            movementId: movement.id,
            trainNumber: movement.train?.train_number,
            trainName: movement.train?.train_name,
            locomotive: movement.train?.locomotive?.loco_number,
            fuelType: movement.train?.locomotive?.fuel_type,
            originStation: movement.origin_station?.name,
            destinationStation: movement.destination_station?.name,
            status: movement.status,
            locoPilot: movement.loco_pilot?.user?.full_name,
            crewScore: movement.crew_score?.score,
            carbonKg: movement.carbon_kg,
            stopsCount: movement.stops?.length || 0,
            etaConfidence: eta
              ? {
                  baseEtaMinutes: eta.base_eta_minutes,
                  minEta: eta.min_eta_minutes,
                  maxEta: eta.max_eta_minutes,
                  confidenceBasis: eta.confidence_basis,
                  sampleSize: eta.sample_size,
                }
              : null,
          };
        } catch (e: any) {
          return { error: `Train movement ${args.movement_id} not found` };
        }
      }

      // ---- FLIGHT MOVEMENTS ----
      case 'list_active_flight_movements': {
        if (isDriver) return { error: 'Access denied: Roadway drivers cannot access Airways operations.' };
        const movements = await this.flightMovementsService.findAll(orgId);
        const active = movements.filter((m) => m.status === 'in_transit' || m.status === 'planned');
        return active.map((m) => ({
          movementId: m.id,
          flightNumber: m.flight?.flight_number,
          aircraft: `${m.aircraft?.tail_number} (${m.aircraft?.aircraft_type})`,
          originAirport: `${m.flight?.origin_airport?.name || 'Origin'} (${m.flight?.origin_airport?.iata_code || ''})`,
          destinationAirport: `${m.flight?.destination_airport?.name || 'Dest'} (${m.flight?.destination_airport?.iata_code || ''})`,
          pilot: m.pilot?.user?.full_name || m.pilot?.license_number,
          status: m.status,
          distanceKm: m.distance_km,
          durationMinutes: m.duration_minutes,
        }));
      }

      case 'get_flight_movement_details': {
        if (isDriver) return { error: 'Access denied: Roadway drivers cannot access Airways operations.' };
        const movementId = args.movement_id || args.flight_movement_id;
        if (!movementId) return { error: 'movement_id is required' };
        try {
          const movement = await this.flightMovementsService.findOne(orgId, movementId);
          const eta = await this.flightMovementsService.getEtaConfidence(orgId, movementId).catch(() => null);
          return {
            movementId: movement.id,
            flightNumber: movement.flight?.flight_number,
            aircraft: movement.aircraft?.tail_number,
            aircraftType: movement.aircraft?.aircraft_type,
            originAirport: movement.flight?.origin_airport?.name,
            originIata: movement.flight?.origin_airport?.iata_code,
            destAirport: movement.flight?.destination_airport?.name,
            destIata: movement.flight?.destination_airport?.iata_code,
            status: movement.status,
            pilot: movement.pilot?.user?.full_name,
            carbonKg: movement.carbon_kg,
            predictedDurationMinutes: movement.predicted_duration_minutes,
            actualDurationMinutes: movement.actual_duration_minutes,
            distanceKm: movement.distance_km,
            etaConfidence: eta
              ? {
                  baseEtaMinutes: eta.base_eta_minutes,
                  minEta: eta.min_eta_minutes,
                  maxEta: eta.max_eta_minutes,
                  confidenceBasis: eta.confidence_basis,
                  sampleSize: eta.sample_size,
                }
              : null,
          };
        } catch (e: any) {
          return { error: `Flight movement ${movementId} not found` };
        }
      }

      // ---- VOYAGE MOVEMENTS ----
      case 'list_active_voyage_movements': {
        if (isDriver) return { error: 'Access denied: Roadway drivers cannot access Seaways operations.' };
        const movements = await this.voyageMovementsService.findAll(orgId);
        const active = movements.filter((m) => m.status === 'in_transit' || m.status === 'planned');
        return active.map((m: any) => {
          const vName = m.vessel?.vessel_name || m.vessel?.name || 'Vessel';
          const vType = m.vessel?.vessel_type || 'Panamax';
          const oCode = m.voyage?.origin_port?.unlocode || m.voyage?.origin_port?.code || '';
          const dCode = m.voyage?.destination_port?.unlocode || m.voyage?.destination_port?.code || '';
          const masterName = m.crew?.user?.full_name || m.master?.user?.full_name || m.crew?.master_license || m.master?.certificate_number || 'Master';
          return {
            movementId: m.id,
            voyageNumber: m.voyage?.voyage_number,
            vessel: `${vName} (${vType})`,
            imoNumber: m.vessel?.imo_number,
            dwtTonnes: m.vessel?.dwt_tonnes,
            originPort: `${m.voyage?.origin_port?.name || 'Origin'}${oCode ? ` (${oCode})` : ''}`,
            destinationPort: `${m.voyage?.destination_port?.name || 'Dest'}${dCode ? ` (${dCode})` : ''}`,
            master: masterName,
            status: m.status,
            distanceKm: m.distance_km,
            durationMinutes: m.duration_minutes,
          };
        });
      }

      case 'get_voyage_movement_details': {
        if (isDriver) return { error: 'Access denied: Roadway drivers cannot access Seaways operations.' };
        const movementId = args.movement_id || args.voyage_movement_id;
        if (!movementId) return { error: 'movement_id is required' };
        try {
          const movement = await this.voyageMovementsService.findOne(orgId, movementId);
          const eta = await this.voyageMovementsService.getEtaConfidence(orgId, movementId).catch(() => null);
          return {
            movementId: movement.id,
            voyageNumber: movement.voyage?.voyage_number,
            vessel: movement.vessel?.vessel_name,
            vesselType: movement.vessel?.vessel_type,
            imoNumber: movement.vessel?.imo_number,
            dwtTonnes: movement.vessel?.dwt_tonnes,
            originPort: movement.voyage?.origin_port?.name,
            originUnlocode: movement.voyage?.origin_port?.unlocode,
            destPort: movement.voyage?.destination_port?.name,
            destUnlocode: movement.voyage?.destination_port?.unlocode,
            status: movement.status,
            master: movement.master?.user?.full_name,
            crewScore: movement.crew_score?.score,
            carbonKg: movement.carbon_kg,
            predictedDurationMinutes: movement.predicted_duration_minutes,
            actualDurationMinutes: movement.actual_duration_minutes,
            distanceKm: movement.distance_km,
            etaConfidence: eta
              ? {
                  baseEtaMinutes: eta.base_eta_minutes,
                  minEta: eta.min_eta_minutes,
                  maxEta: eta.max_eta_minutes,
                  confidenceBasis: eta.confidence_basis,
                  sampleSize: eta.sample_size,
                }
              : null,
          };
        } catch (e: any) {
          return { error: `Voyage movement ${movementId} not found` };
        }
      }

      // ---- SLOT CHECKS ----
      case 'check_rail_slot': {
        if (isDriver) return { error: 'Access denied: Roadway drivers cannot access Railways slot intelligence.' };
        if (!args.origin_station_id || !args.destination_station_id) {
          return { error: 'origin_station_id and destination_station_id are required' };
        }
        return this.trainMovementsService.checkSlot(
          orgId,
          args.origin_station_id,
          args.destination_station_id,
          args.proposed_departure,
        );
      }

      case 'check_port_slot': {
        if (isDriver) return { error: 'Access denied: Roadway drivers cannot access Seaways port slot intelligence.' };
        if (!args.origin_port_id || !args.destination_port_id) {
          return { error: 'origin_port_id and destination_port_id are required' };
        }
        return this.voyageMovementsService.checkSlots(
          orgId,
          args.origin_port_id,
          args.destination_port_id,
          args.proposed_departure,
        );
      }

      // ---- ALERTS (Reconciled: Org DB + Fleet Twin) ----
      case 'list_unacknowledged_alerts': {
        let dbAlerts: any[] = [];
        let dbError: string | null = null;
        try {
          const query = this.supabase.adminClient
            .from('alerts')
            .select('*')
            .eq('org_id', orgId)
            .is('acknowledged_at', null)
            .order('created_at', { ascending: false })
            .limit(15);

          const { data: alerts, error } = await query;
          if (error) {
            dbError = error.message;
          } else {
            dbAlerts = isDriver && driverScope
              ? (alerts || []).filter((a: any) => driverScope.vehicleIds.includes(a.vehicle_id))
              : (alerts || []);
          }
        } catch (err: any) {
          dbError = err?.message || 'Alerts DB error';
        }

        const mappedDb = dbAlerts.map((a: any) => ({
          id: a.id,
          alertSource: 'db_alert' as const,
          source: 'org_alerts',
          type: a.type,
          severity: a.severity,
          message: a.message,
          vehicleId: a.vehicle_id,
          createdAt: a.created_at,
        }));

        let twinAlerts: any[] = [];
        try {
          const overview = await this.fleetTwinService.getOverview();
          if (overview?.enabled && Array.isArray(overview.alerts)) {
            const filteredTwin = isDriver && driverScope
              ? overview.alerts.filter((a) => driverScope.vehicleIds.includes(a.vehicle_id))
              : overview.alerts;
            twinAlerts = filteredTwin
              .map((a, idx) => ({
                id: `twin-alert-${a.vehicle_id}-${idx}`,
                alertSource: 'fleet_twin' as const,
                source: 'fleet_twin',
                type: a.event_type,
                eventType: a.event_type,
                severity: a.severity,
                message: `${a.registration_number}: ${a.description} (${a.location_name}, +${a.delay_minutes}m delay)`,
                vehicleId: a.vehicle_id,
                registration: a.registration_number,
                locationName: a.location_name,
                delayMinutes: a.delay_minutes,
              }))
              .filter(
                (a) =>
                  !this.fleetTwinService.isTwinAlertAcknowledged?.(
                    a.id,
                    a.vehicleId,
                    a.eventType,
                  ),
              );
          }
        } catch {
          // ignore if twin unavailable
        }

        if (dbError && twinAlerts.length === 0 && mappedDb.length === 0) {
          return { error: `Alerts service unavailable: ${dbError}` };
        }

        return [...mappedDb, ...twinAlerts];
      }

      case 'propose_acknowledge_alert':
        // handled in processChat before executeTool is called
        return { error: 'Use propose_acknowledge_alert flow in processChat' };

      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  // -------------------------------------------------------------------------
  // Build the tool declarations for Gemini
  // -------------------------------------------------------------------------
  private buildToolDeclarations(): FunctionDeclaration[] {
    return [
      {
        name: 'get_dashboard_stats',
        description: 'Get live operational dashboard stats: active vehicles, alert count, average speed, trip departures/arrivals for the organization.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'get_fleet_twin_overview',
        description: 'Get the complete Fleet Digital Twin overview with all vehicle positions, speeds, ETAs, delay minutes, risk scores, next checkpoints, driver info, and high-priority alerts. Use for general fleet questions: "how many vehicles?", "fleet status", "which vehicles are delayed?", "highest risk vehicle?", "compare all vehicles".',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'get_all_vehicles',
        description: 'Get a summary list of all mock fleet vehicles with registration, type, status, speed, location, progress, and load. Use when user asks to list vehicles.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'get_vehicle_digital_twin',
        description: 'Get complete 48-hour Digital Twin intelligence for a specific vehicle (accepts UUID or registration like "TN 01 AB 4021"): current location, speed, status, planned ETA, predicted ETA, delay minutes, on-time probability, risk score, top delay causes, driver fatigue, checkpoint status, upcoming weather/traffic/toll events, ETA breakdown, alternate reroute recommendation, and AI explanation. Also supports optional What-If simulation parameters (e.g., rain_severity_multiplier=2.0, toll_strike_hours=2) to answer "what will happen if rain increases or toll waiting increases?".',
        parameters: {
          type: Type.OBJECT,
          properties: {
            vehicle_id: { type: Type.STRING, description: 'The vehicle UUID or registration number (e.g. TN 01 AB 4021)' },
            rain_severity_multiplier: { type: Type.NUMBER, description: 'Optional What-If rain multiplier (default 1.0, e.g. 2.0 for heavy rain)' },
            toll_strike_hours: { type: Type.NUMBER, description: 'Optional What-If toll plaza waiting delay in hours (default 0)' },
            traffic_congestion_multiplier: { type: Type.NUMBER, description: 'Optional What-If traffic congestion multiplier (default 1.0)' },
            breakdown_hours: { type: Type.NUMBER, description: 'Optional What-If breakdown delay in hours (default 0)' },
          },
          required: ['vehicle_id'],
        },
      },
      {
        name: 'get_vehicle_checkpoints',
        description: 'Get all checkpoints for a vehicle\'s route with crossed/pending status. Use to answer: "which checkpoints remain?", "has it crossed Vellore?", "what is the next checkpoint?".',
        parameters: {
          type: Type.OBJECT,
          properties: {
            vehicle_id: { type: Type.STRING, description: 'The vehicle UUID or registration number' },
          },
          required: ['vehicle_id'],
        },
      },
      {
        name: 'get_vehicle_reroute',
        description: 'Calculate the optimal alternate route for a specific vehicle. Modes: fastest (minimize time), cheapest (minimize cost), safest (minimize risk), balanced (best all-round). Returns time saved, extra distance, fuel/toll cost delta, risk delta, and new ETA.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            vehicle_id: { type: Type.STRING, description: 'The vehicle UUID or registration number' },
            mode: { type: Type.STRING, description: 'Reroute mode: fastest | cheapest | safest | balanced' },
            rain_severity_multiplier: { type: Type.NUMBER, description: 'Optional What-If rain multiplier (default 1.0)' },
            toll_strike_hours: { type: Type.NUMBER, description: 'Optional What-If toll waiting hours (default 0)' },
          },
          required: ['vehicle_id'],
        },
      },
      {
        name: 'get_vehicle_alerts',
        description: 'Get active unacknowledged alerts for a specific vehicle or all vehicles in the org.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            vehicle_id: { type: Type.STRING, description: 'Optional: filter alerts to a specific vehicle UUID' },
          },
        },
      },
      {
        name: 'list_active_trips',
        description: 'List all currently in-transit or planned Roadways fleet shipments and manifests.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'get_trip_details',
        description: 'Get full operational intelligence for a specific Roadways trip ID including ETA confidence, carbon, and driver safety score.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            trip_id: { type: Type.STRING, description: 'The unique trip UUID' },
          },
          required: ['trip_id'],
        },
      },
      {
        name: 'list_active_train_movements',
        description: 'List all currently in-transit or planned Railways freight train movements, rakes, and locomotives.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'get_train_movement_details',
        description: 'Get full operational intelligence for a specific Railways train movement ID.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            movement_id: { type: Type.STRING, description: 'The unique train movement UUID' },
          },
          required: ['movement_id'],
        },
      },
      {
        name: 'list_active_flight_movements',
        description: 'List all currently in-transit or planned Airways flight movements, aircraft, and pilots.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'get_flight_movement_details',
        description: 'Get full operational intelligence for a specific Airways flight movement ID.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            movement_id: { type: Type.STRING, description: 'The unique flight movement UUID' },
          },
          required: ['movement_id'],
        },
      },
      {
        name: 'list_active_voyage_movements',
        description: 'List all currently in-transit or planned Seaways voyage movements, vessels, and ship masters.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'get_voyage_movement_details',
        description: 'Get full operational intelligence for a specific Seaways voyage movement ID.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            movement_id: { type: Type.STRING, description: 'The unique voyage movement UUID' },
          },
          required: ['movement_id'],
        },
      },
      {
        name: 'check_rail_slot',
        description: 'Check rail slot congestion on a specific station corridor for proposed departure times.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            origin_station_id: { type: Type.STRING, description: 'Origin station UUID' },
            destination_station_id: { type: Type.STRING, description: 'Destination station UUID' },
            proposed_departure: { type: Type.STRING, description: 'Proposed departure ISO timestamp' },
          },
          required: ['origin_station_id', 'destination_station_id'],
        },
      },
      {
        name: 'check_port_slot',
        description: 'Check port berth and channel slot congestion for proposed voyage departure times.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            origin_port_id: { type: Type.STRING, description: 'Origin port UUID' },
            destination_port_id: { type: Type.STRING, description: 'Destination port UUID' },
            proposed_departure: { type: Type.STRING, description: 'Proposed departure ISO timestamp' },
          },
          required: ['origin_port_id', 'destination_port_id'],
        },
      },
      {
        name: 'list_unacknowledged_alerts',
        description: 'List all active unacknowledged operational alerts across Roadways, Railways, Airways, and Seaways.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'propose_acknowledge_alert',
        description: 'Propose acknowledging a specific alert (requires explicit human confirmation before executing).',
        parameters: {
          type: Type.OBJECT,
          properties: {
            alert_id: { type: Type.STRING, description: 'The alert UUID to acknowledge' },
            reason: { type: Type.STRING, description: 'Reason for acknowledging the alert' },
          },
          required: ['alert_id'],
        },
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Main chat turn handler — Gemini with proper multi-turn tool calling
  // -------------------------------------------------------------------------
  async processChat(
    orgId: string,
    userId: string,
    userRole: string,
    req: AiChatRequest,
  ): Promise<AiChatMessage> {
    const userMessage = req.message.trim();
    const detectedLang = detectLanguage(userMessage);
    const toolCallsExecuted: AiToolCall[] = [];
    let proposedAction: AiProposedAction | null = null;

    let fallbackReason = this.genAiClient ? 'GEMINI_RESPONSE_EMPTY' : 'GEMINI_API_KEY_MISSING';

    if (this.genAiClient) {
      try {
        const tools = this.buildToolDeclarations();

        // Build a role-aware system instruction prefix
        const rolePrefix =
          userRole === 'driver'
            ? `\n\nCURRENT USER ROLE: DRIVER (userId: ${userId}). You MUST only provide information about the driver's own assigned vehicle. Do NOT reveal other vehicles, other drivers, admin analytics, or any restricted organizational data. If asked about other vehicles, politely decline and explain drivers can only view their own assigned vehicle.`
            : userRole === 'manager'
            ? `\n\nCURRENT USER ROLE: MANAGER (userId: ${userId}). You have access to fleet and operational data within your authorized scope.`
            : `\n\nCURRENT USER ROLE: ADMIN (userId: ${userId}). You have full access to all fleet, vehicle, driver, trip, alert, route, and analytics data.`;

        const langNote =
          detectedLang === 'tamil'
            ? '\n\nLANGUAGE: User is writing in Tamil. Respond in clear, natural Tamil.'
            : detectedLang === 'tanglish'
            ? '\n\nLANGUAGE: User is writing in Tanglish. Respond in natural Tanglish or Tamil as appropriate.'
            : '';

        const systemInstruction = NEXUS_SYSTEM_INSTRUCTION + rolePrefix + langNote;

        // Format conversation history
        const contents: any[] = (req.conversationHistory || []).map((h) => ({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.content }],
        }));
        contents.push({ role: 'user', parts: [{ text: userMessage }] });

        // Model fallback chain: primary configured model + active Gemini 3 models on 404/503
        const candidateModels = Array.from(
          new Set([
            this.modelName,
            'gemini-3-flash-preview',
            'gemini-3.8-flash',
            'gemini-3.5-flash',
            'gemini-3.1-flash-lite',
          ]),
        );

        let activeModel = candidateModels[0];
        const callGemini = async (turnContents: any[], includeTools: boolean) => {
          let lastErr: any;
          for (const m of candidateModels) {
            try {
              const res = await this.genAiClient!.models.generateContent({
                model: m,
                contents: turnContents,
                config: includeTools
                  ? { systemInstruction, tools: [{ functionDeclarations: tools }] }
                  : { systemInstruction },
              });
              activeModel = m;
              return res;
            } catch (err: any) {
              lastErr = err;
              const msg = String(err?.message || '');
              const status = err?.status || err?.code;
              const retryable =
                status === 404 ||
                status === 503 ||
                msg.includes('404') ||
                msg.includes('503') ||
                msg.includes('NOT_FOUND') ||
                msg.includes('UNAVAILABLE');
              if (!retryable) throw err;
              this.logger.warn(`Gemini model ${m} unavailable (${status || 'err'}), trying next model...`);
            }
          }
          throw lastErr;
        };

        // Multi-step tool calling loop (up to 3 rounds), preserving full candidate.content (incl. thoughtSignature)
        let workingContents = [...contents];
        let assistantReply = '';

        for (let round = 0; round < 3; round++) {
          const response = await callGemini(workingContents, true);
          const candidate = response.candidates?.[0];
          const parts = candidate?.content?.parts || [];
          const functionCallParts = parts.filter((p: any) => p.functionCall);

          if (functionCallParts.length === 0) {
            assistantReply = response.text || '';
            break;
          }

          // Append the model's exact content (preserving thoughtSignature)
          workingContents.push(
            candidate?.content || { role: 'model', parts: functionCallParts },
          );

          const functionResponseParts: any[] = [];
          for (const part of functionCallParts) {
            const call = part.functionCall;
            const toolName = call.name as string;
            const toolArgs = call.args || {};

            if (toolName === 'propose_acknowledge_alert') {
              if (userRole === 'driver') {
                const denied = { error: 'Access denied: Drivers cannot acknowledge organization alerts.' };
                toolCallsExecuted.push({ name: toolName, args: toolArgs, result: denied });
                functionResponseParts.push({
                  functionResponse: { name: toolName, response: denied },
                });
                continue;
              }
              const actionId = `action-${Date.now()}`;
              const alertIdStr = String(toolArgs.alert_id || '');
              const isTwinAlert = alertIdStr.startsWith('twin-alert-');
              let twinMeta: { vehicleId?: string; eventType?: string; registration?: string } = {};
              if (isTwinAlert) {
                const match = alertIdStr.match(/^twin-alert-(.+)-(\d+)$/);
                if (match) {
                  twinMeta.vehicleId = match[1];
                }
                try {
                  const ov = await this.fleetTwinService.getOverview();
                  const found = (ov?.alerts || []).find(
                    (a, idx) => `twin-alert-${a.vehicle_id}-${idx}` === alertIdStr || a.vehicle_id === twinMeta.vehicleId,
                  );
                  if (found) {
                    twinMeta = {
                      vehicleId: found.vehicle_id,
                      eventType: found.event_type,
                      registration: found.registration_number,
                    };
                  }
                } catch {
                  // fallback to parsed vehicleId
                }
              }

              proposedAction = {
                id: actionId,
                actionType: 'acknowledge_alert',
                description: twinMeta.registration
                  ? `Acknowledge Digital Twin alert for ${twinMeta.registration} (${toolArgs.reason || 'Operational review'})`
                  : `Acknowledge alert #${alertIdStr.substring(0, 8)} (${toolArgs.reason || 'Operational review'})`,
                payload: {
                  alertId: alertIdStr,
                  alertSource: isTwinAlert ? 'fleet_twin' : 'db_alert',
                  vehicleId: twinMeta.vehicleId,
                  registration: twinMeta.registration,
                  eventType: twinMeta.eventType,
                  reason: toolArgs.reason ? String(toolArgs.reason) : undefined,
                },
                status: 'pending',
              };
              this.pendingActions.set(actionId, proposedAction);

              const propResult = { status: 'proposed_for_user_confirmation', actionId };
              toolCallsExecuted.push({ name: toolName, args: toolArgs, result: propResult });
              functionResponseParts.push({
                functionResponse: { name: toolName, response: propResult },
              });
            } else {
              const result = await this.executeTool(orgId, userId, userRole, toolName, toolArgs);
              toolCallsExecuted.push({ name: toolName, args: toolArgs, result });
              functionResponseParts.push({
                functionResponse: { name: toolName, response: result },
              });
            }
          }

          workingContents.push({ role: 'user', parts: functionResponseParts });

          // If this was the last round, do a final synthesis without tools
          if (round === 2) {
            const finalResp = await callGemini(workingContents, false);
            assistantReply = finalResp.text || '';
          }
        }

        if (assistantReply.trim()) {
          this.logger.debug(`Gemini response generated via ${activeModel} (${toolCallsExecuted.length} tool calls)`);
          return {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: assistantReply,
            toolCalls: toolCallsExecuted.length > 0 ? toolCallsExecuted : undefined,
            proposedAction,
            isFallback: false,
            detectedLanguage: detectedLang,
            createdAt: new Date().toISOString(),
          };
        }
      } catch (geminiError: any) {
        const msg = String(geminiError?.message || '');
        if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate')) {
          fallbackReason = 'RATE_LIMIT';
        } else if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('etimedout')) {
          fallbackReason = 'TIMEOUT';
        } else {
          fallbackReason = 'MODEL_ERROR';
        }
        this.logger.warn(`Gemini API call failed (${fallbackReason}): ${msg}. Using context-aware fallback.`);
      }
    }

    // Context-Aware Fallback Responder
    return this.processFallbackChat(orgId, userId, userRole, userMessage, detectedLang, fallbackReason);
  }

  // -------------------------------------------------------------------------
  // Context-aware fallback (no Gemini API)
  // -------------------------------------------------------------------------
  async processFallbackChat(
    orgId: string,
    userId: string,
    userRole: string,
    message: string,
    detectedLang: 'tamil' | 'tanglish' | 'english' = 'english',
    fallbackReason: string = 'GEMINI_API_KEY_MISSING',
  ): Promise<AiChatMessage> {
    const lower = message.toLowerCase();
    const toolCallsExecuted: AiToolCall[] = [];
    let proposedAction: AiProposedAction | null = null;
    let replyText = '';

    // Helper to execute tools in fallback
    const runTool = async (name: string, args: any = {}) => {
      const result = await this.executeTool(orgId, userId, userRole, name, args);
      toolCallsExecuted.push({ name, args, result });
      return result;
    };

    // Check for specific Indian vehicle registration pattern (e.g. TN 01 AB 4021 or TN01AB4021)
    const regMatch = message.match(/\b([A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{3,4})\b/i);

    if (regMatch) {
      const twin = await runTool('get_vehicle_digital_twin', { vehicle_id: regMatch[1] });
      if (twin.error) {
        replyText = twin.error;
      } else {
        replyText =
          `**Vehicle:** ${twin.registration} (${twin.status?.toUpperCase()})\n` +
          `**Location:** ${twin.currentLocation?.lat?.toFixed(4)}, ${twin.currentLocation?.lng?.toFixed(4)} (${twin.currentCheckpoint || 'En Route'})\n` +
          `**Speed:** ${twin.speedKmh} km/h | **Progress:** ${twin.progressPct}%\n` +
          `**Route:** ${twin.originCity} → ${twin.destinationCity}\n` +
          `**Planned ETA:** ${twin.plannedEta}\n` +
          `**Predicted ETA:** ${twin.predictedEta} (Delay: +${twin.delayMinutes} min)\n` +
          `**Risk Score:** ${twin.riskScore}/100\n` +
          `**Main Causes:** ${(twin.topDelayCauses || []).join(', ') || 'None reported'}\n` +
          (twin.activeReroute
            ? `**Recommended Alternate Route:** ${twin.activeReroute.recommendedRoute} (saves ${twin.activeReroute.timeSavedMinutes} min)`
            : '');
      }
    } else if (lower.includes('highest risk') || lower.includes('risk')) {
      const overview = await runTool('get_fleet_twin_overview', {});
      if (overview.error) {
        replyText = overview.error;
      } else {
        const sorted = [...(overview.vehicles || [])].sort(
          (a: any, b: any) => (b.riskScore || 0) - (a.riskScore || 0),
        );
        const top = sorted[0];
        replyText = top
          ? `Highest-risk vehicle is **${top.registration}** (Risk Score: **${top.riskScore}/100**, Status: ${top.status}, Delay: +${top.delayMinutes} min, Next Checkpoint: ${top.nextCheckpoint || 'N/A'}).\n\n` +
            sorted
              .slice(0, 5)
              .map((v: any, i: number) => `${i + 1}. ${v.registration} — Risk ${v.riskScore}/100, ${v.status}, ${v.speedKmh} km/h`)
              .join('\n')
          : 'No active fleet vehicles found.';
      }
    } else if (lower.includes('fleet twin') || lower.includes('fleet overview') || lower.includes('digital twin') ||
        lower.includes('fleet status') || lower.includes('all vehicle') || lower.includes('active vehicle') ||
        lower.includes('how many fleet') || lower.includes('moving')) {
      const overview = await runTool('get_fleet_twin_overview', {});
      replyText =
        `Fleet Twin Overview (LIVE):\n` +
        `• Total Fleet: ${overview.totalFleet} vehicles\n` +
        `• Active: ${overview.activeVehicles} | Avg Speed: ${overview.averageSpeedKmh} km/h\n` +
        `• Active Alerts: ${overview.activeAlerts} | Arrived Today: ${overview.arrivedToday}\n\n`;
      if (overview.vehicles && overview.vehicles.length > 0) {
        replyText += overview.vehicles
          .slice(0, 8)
          .map(
            (v: any) =>
              `${v.registration} (${v.status}) — Speed: ${v.speedKmh} km/h, Progress: ${v.progressPct}%, Risk: ${v.riskScore}, Next: ${v.nextCheckpoint || 'N/A'}, ETA Delay: ${v.delayMinutes}min`,
          )
          .join('\n');
      }
    } else if (
      lower.includes('voyage') || lower.includes('vessel') || lower.includes('ship') ||
      lower.includes('seaways') || lower.includes('port') || lower.includes('berth') ||
      lower.includes('stcw') || lower.includes('watchkeeping')
    ) {
      if (lower.includes('stcw') || lower.includes('watchkeeping') || lower.includes('rest hour')) {
        replyText =
          `IMO STCW Watchkeeping & Rest-Hour Compliance Module:\n\n` +
          `• Minimum Daily Rest: 10 hours in any 24-hour period (max duty: 14 hours).\n` +
          `• Weekly Rest: Minimum 77 hours in any 7-day period.\n` +
          `• Rest Division: No more than two periods, one of which must be at least 6 hours.`;
      } else {
        const voyages = await runTool('list_active_voyage_movements', {});
        replyText =
          voyages.length > 0
            ? `Found ${voyages.length} active/planned voyage movement(s):\n` +
              voyages.map((v: any, i: number) =>
                `${i + 1}. ${v.voyageNumber || 'N/A'} — ${v.vessel}: ${v.originPort} → ${v.destinationPort} (${v.status})`,
              ).join('\n')
            : 'No active voyage movements. Use "Dispatch Voyage" to schedule.';
      }
    } else if (
      lower.includes('flight') || lower.includes('aircraft') || lower.includes('pilot') ||
      lower.includes('airways') || lower.includes('airport') || lower.includes('fdtl')
    ) {
      if (lower.includes('fdtl') || lower.includes('flight duty')) {
        replyText =
          `DGCA FDTL Module (CAR Section 7 Series J):\n\n` +
          `• Max Flight Duty Period: 13 hours in any 24-hour window.\n` +
          `• Max Flight Time: 8 hours in a 24-hour window.`;
      } else {
        const flights = await runTool('list_active_flight_movements', {});
        replyText =
          flights.length > 0
            ? `Found ${flights.length} active/planned flight movement(s):\n` +
              flights.map((f: any, i: number) =>
                `${i + 1}. ${f.flightNumber || 'N/A'} — ${f.aircraft}: ${f.originAirport} → ${f.destinationAirport} (${f.status})`,
              ).join('\n')
            : 'No active flight movements. Use "Dispatch Flight" to schedule.';
      }
    } else if (
      lower.includes('train') || lower.includes('rail') || lower.includes('rake') ||
      lower.includes('loco') || lower.includes('station')
    ) {
      const movements = await runTool('list_active_train_movements', {});
      replyText =
        movements.length > 0
          ? `Found ${movements.length} active/planned train movement(s):\n` +
            movements.map((m: any, i: number) =>
              `${i + 1}. Train ${m.trainNumber || 'N/A'}: ${m.originStation} → ${m.destinationStation} (${m.status})`,
            ).join('\n')
          : 'No active train movements. Use "Dispatch Train" to schedule.';
    } else if (
      lower.includes('alert') || lower.includes('warning') || lower.includes('incident') ||
      lower.includes('hos') || lower.includes('geofence')
    ) {
      const alerts = await runTool('list_unacknowledged_alerts', {});
      if (lower.includes('ack') || lower.includes('dismiss') || lower.includes('clear')) {
        const firstAlert = alerts[0];
        if (firstAlert) {
          const actionId = `action-${Date.now()}`;
          const isTwinAlert = firstAlert.alertSource === 'fleet_twin' || String(firstAlert.id).startsWith('twin-alert-');
          proposedAction = {
            id: actionId,
            actionType: 'acknowledge_alert',
            description: `Acknowledge alert #${String(firstAlert.id).substring(0, 8)} (${firstAlert.type} - ${firstAlert.message.substring(0, 40)}...)`,
            payload: {
              alertId: firstAlert.id,
              alertSource: isTwinAlert ? 'fleet_twin' : 'db_alert',
              vehicleId: firstAlert.vehicleId,
              registration: firstAlert.registration,
              eventType: firstAlert.eventType || firstAlert.type,
            },
            status: 'pending',
          };
          this.pendingActions.set(actionId, proposedAction);
          replyText = `Found alert: "${firstAlert.message}". Prepared action for confirmation.`;
        } else {
          replyText = 'No active alerts to acknowledge.';
        }
      } else {
        replyText =
          alerts.length > 0
            ? `${alerts.length} unacknowledged alert(s):\n` +
              alerts.map((a: any, i: number) => `${i + 1}. [${a.severity?.toUpperCase()}] ${a.message}`).join('\n')
            : 'All operational alerts are clear.';
      }
    } else if (
      lower.includes('trip') || lower.includes('manifest') || lower.includes('shipment') || lower.includes('delayed')
    ) {
      const trips = await runTool('list_active_trips', {});
      if (trips && !Array.isArray(trips) && trips.error) {
        replyText = `I couldn't retrieve active trips: ${trips.error}`;
      } else {
        const filtered = lower.includes('delayed')
          ? trips.filter((t: any) => t.status === 'delayed' || (t.delayMinutes || 0) > 0)
          : trips;
        replyText =
          filtered.length > 0
            ? `Found ${filtered.length} active/planned trip(s):\n` +
              filtered
                .map(
                  (t: any, i: number) =>
                    `${i + 1}. **${t.vehicle || 'N/A'}**: ${t.origin} → ${t.destination} (${t.status}${
                      t.speedKmh !== undefined ? `, ${t.speedKmh} km/h` : ''
                    }${t.delayMinutes ? `, +${t.delayMinutes}m delay` : ''})`,
                )
                .join('\n')
            : 'There are currently no active trips.';
      }
    } else if (
      lower.includes('fleet') || lower.includes('status') || lower.includes('speed') ||
      lower.includes('stats') || lower.includes('summary')
    ) {
      const stats = await runTool('get_dashboard_stats', {});
      if (stats.error) {
        replyText = stats.error;
      } else {
        replyText =
          `Operational Fleet Summary (${stats.dataFreshness || 'LIVE'}):\n` +
          `• Active Vehicles: ${stats.activeVehicles} of ${stats.totalFleet}\n` +
          `• Active Alerts: ${stats.activeAlerts}\n` +
          `• Average Speed: ${stats.avgSpeedKmh} km/h\n` +
          `• Completed Today: ${stats.arrivedCount} | Departed Today: ${stats.departedCount}`;
      }
    } else if (lower.includes('digital twin') || lower.includes('what can you do') || lower.includes('capabilities')) {
      replyText =
        `I am your NEXUS WAYS Operations Copilot. You can ask me:\n` +
        `• 🚛 Fleet twin status, vehicle location, speed, ETA, delay analysis\n` +
        `• ⚠️ Active alerts and risk scores\n` +
        `• 🛤️ Checkpoint status and alternate route recommendations\n` +
        `• 🚂 Train movements and rail slot intelligence\n` +
        `• ✈️ Flight movements and FDTL compliance\n` +
        `• 🚢 Voyage movements and STCW watchkeeping\n` +
        `• 🌧️ Weather, traffic, toll predictions via Digital Twin\n\n` +
        `Ask in English, Tamil, or Tanglish!`;
    } else {
      replyText =
        `I am your NEXUS WAYS Operations Copilot. Ask about fleet status, vehicle location, delays, alerts, routes, or any multimodal logistics operation.\n\n` +
        `Examples: "Show fleet overview", "Where is TN 01 AB 4021?", "What are active alerts?", "List active flights"`;
    }

    return {
      id: `fallback-${Date.now()}`,
      role: 'assistant',
      content: `[Rule-Based Assistant Fallback Mode — ${fallbackReason}]\n${replyText}`,
      toolCalls: toolCallsExecuted.length > 0 ? toolCallsExecuted : undefined,
      proposedAction,
      isFallback: true,
      fallbackReason,
      detectedLanguage: detectedLang,
      createdAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Confirm and apply a proposed write action (e.g. acknowledge_alert)
  // -------------------------------------------------------------------------
  async confirmAction(
    orgId: string,
    req: AiConfirmActionRequest,
    userRole: string = 'admin',
    userId?: string,
  ): Promise<{ success: boolean; message: string; alertSource?: string; deduplicated?: boolean }> {
    if (userRole === 'driver') {
      throw new ForbiddenException('Drivers are not authorized to confirm organization actions');
    }

    // Idempotency & duplicate-click protection
    if (req.actionId) {
      const completed = this.completedActions.get(req.actionId);
      if (completed) {
        return { ...completed, deduplicated: true };
      }
      if (this.processingActions.has(req.actionId)) {
        throw new BadRequestException('This action is already being processed.');
      }
    }

    if (!req.confirmed) {
      this.pendingActions.delete(req.actionId);
      const res = { success: true, message: 'Proposed action was rejected and cancelled.' };
      if (req.actionId) this.completedActions.set(req.actionId, res);
      return res;
    }

    if (req.actionId) this.processingActions.add(req.actionId);

    try {
      if (req.actionType === 'acknowledge_alert') {
        // Prefer server-side verified pending action payload when available
        const serverPending = req.actionId ? this.pendingActions.get(req.actionId) : undefined;
        const effectivePayload = serverPending?.payload || req.payload || {};

        const alertId = String(effectivePayload.alertId || '').trim();
        if (!alertId) {
          throw new BadRequestException('alertId is required to acknowledge alert');
        }

        const isTwinAlert =
          effectivePayload.alertSource === 'fleet_twin' ||
          alertId.startsWith('twin-alert-');

        if (isTwinAlert) {
          const parsedMatch = alertId.match(/^twin-alert-(.+)-(\d+)$/);
          const vehicleId = effectivePayload.vehicleId || parsedMatch?.[1];
          const eventType = effectivePayload.eventType;
          const registration = effectivePayload.registration;

          this.fleetTwinService.acknowledgeTwinAlert(alertId, {
            vehicleId,
            eventType,
            acknowledgedBy: userId,
            reason: effectivePayload.reason,
          });

          // Optional non-blocking audit log in alerts table using Postgres gen_random_uuid() (never passing twin-alert string as uuid!)
          try {
            await this.supabase.adminClient.from('alerts').insert({
              org_id: orgId,
              type: eventType ? `twin_${eventType}` : 'digital_twin_ack',
              severity: 'medium',
              message: `Acknowledged Digital Twin alert (${alertId})${registration ? ` for ${registration}` : ''}`,
              acknowledged_at: new Date().toISOString(),
            });
          } catch {
            // Audit insert is best-effort; twin acknowledgement already succeeded
          }

          this.pendingActions.delete(req.actionId);
          const res = {
            success: true,
            alertSource: 'fleet_twin',
            message: registration
              ? `Digital Twin alert for ${registration} successfully acknowledged.`
              : `Digital Twin alert (${alertId}) successfully acknowledged.`,
          };
          if (req.actionId) this.completedActions.set(req.actionId, res);
          return res;
        }

        // Persistent DB alert: strictly validate UUID before querying Postgres uuid column
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        // Allow test-style IDs like 'alert-456' ONLY when running in unit tests? No — validate UUID in production,
        // wait: existing unit test ai.service.spec.ts uses payload: { alertId: 'alert-456' }!
        // Let's check: if it contains 'twin-alert-' we handled it above. For DB alerts, reject obviously malformed non-UUIDs ONLY if not a simple test mock, OR check DB existence first.
        // Better: validate UUID OR let's update our unit test to use a real UUID! Wait — let's check if any OTHER test in the repo passes 'alert-456'.
        if (!uuidRegex.test(alertId)) {
          throw new BadRequestException(
            `Invalid persistent alert identifier "${alertId}". Expected a valid UUID.`,
          );
        }

        const { error } = await this.supabase.adminClient
          .from('alerts')
          .update({ acknowledged_at: new Date().toISOString() })
          .eq('org_id', orgId)
          .eq('id', alertId);

        if (error) {
          throw new BadRequestException(`Failed to acknowledge alert: ${error.message}`);
        }

        this.pendingActions.delete(req.actionId);
        const res = {
          success: true,
          alertSource: 'db_alert',
          message: `Alert #${alertId.substring(0, 8)} successfully acknowledged.`,
        };
        if (req.actionId) this.completedActions.set(req.actionId, res);
        return res;
      }

      throw new BadRequestException(`Unsupported action type: ${req.actionType}`);
    } finally {
      if (req.actionId) this.processingActions.delete(req.actionId);
    }
  }
}
