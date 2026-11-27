import { OsrmRouteGeometry } from '../types';

export type TruckType =
  | '32ft_mxl'
  | '20ft_container'
  | 'container_carrier'
  | 'tanker'
  | 'refrigerated';

export type TruckStatus = 'idle' | 'en_route' | 'delayed' | 'resting';

export type FuelType = 'Diesel' | 'LNG' | 'Electric';

export type CheckpointType =
  | 'toll_plaza'
  | 'fuel_station'
  | 'rest_stop'
  | 'city_bypass'
  | 'border_checkpost'
  | 'weigh_bridge'
  | 'ghat_section';

export type PredictionEventType =
  | 'weather'
  | 'toll_delay'
  | 'traffic'
  | 'driver_break'
  | 'fuel_check'
  | 'ghat_slowdown'
  | 'night_driving'
  | 'inspection';

export type PredictionEventSeverity = 'low' | 'medium' | 'high' | 'critical';

export type RerouteMode = 'fastest' | 'cheapest' | 'safest' | 'balanced';

export type RestCompliance = 'compliant' | 'warning' | 'violation';

export type PredictionProvenance = 'OBSERVED' | 'FORECAST' | 'MODEL_PREDICTION' | 'SCENARIO';

export interface DataFreshnessRecord {
  provider: string;
  last_fetched: string;
  status: 'live' | 'cached' | 'fallback_baseline';
  staleness_seconds?: number;
  details?: string;
}

export interface DataFreshnessSummary {
  weather: DataFreshnessRecord;
  traffic: DataFreshnessRecord;
  toll: DataFreshnessRecord;
  telemetry: DataFreshnessRecord;
  model: {
    version: string;
    algorithm: string;
    evaluation_mae_minutes?: number;
  };
}

export interface MockFleet {
  id: string;
  name: string;
  company: string;
  region: string;
  base_hub: string;
  vehicle_count: number;
  is_mock: boolean;
  seed_batch_id: string;
  created_at: string;
}

export interface MockDriver {
  id: string;
  name: string;
  phone: string;
  license_number: string;
  license_type: 'HMV' | 'HMV_HGMV';
  experience_years: number;
  rating: number;
  shift_start: string;
  hours_driven_today: number;
  max_daily_hours: number;
  rest_hours_compliance: RestCompliance;
  is_mock: boolean;
  seed_batch_id: string;
  created_at: string;
}

export interface MockRoute {
  id: string;
  name: string;
  corridor: string;
  origin_city: string;
  destination_city: string;
  total_distance_km: number;
  base_duration_hours: number;
  planned_departure: string;
  planned_eta: string;
  highway_numbers: string[];
  osrm_geometry?: OsrmRouteGeometry;
  is_mock: boolean;
  seed_batch_id: string;
  created_at: string;
}

export interface MockCheckpoint {
  id: string;
  route_id: string;
  name: string;
  type: CheckpointType;
  latitude: number;
  longitude: number;
  distance_from_start_km: number;
  planned_arrival_minutes: number;
  avg_halt_minutes: number;
  sequence_order: number;
  is_mock: boolean;
  seed_batch_id: string;
  created_at: string;
}

export interface MockVehicle {
  id: string;
  fleet_id: string;
  registration_number: string;
  truck_type: TruckType;
  capacity_tons: number;
  fuel_type: FuelType;
  current_load_tons: number;
  status: TruckStatus;
  current_lat: number;
  current_lng: number;
  progress_pct: number;
  speed_kmh: number;
  driver_id: string;
  route_id: string;
  driver?: MockDriver;
  fleet?: MockFleet;
  route?: MockRoute;
  is_mock: boolean;
  seed_batch_id: string;
  created_at: string;
}

export interface MockPredictionEvent {
  id: string;
  vehicle_id: string;
  timestamp: string;
  hours_from_now: number;
  checkpoint_id?: string;
  location_name: string;
  latitude: number;
  longitude: number;
  event_type: PredictionEventType;
  description: string;
  delay_minutes: number;
  confidence_pct: number;
  severity: PredictionEventSeverity;
  details?: Record<string, any>;
  is_mock: boolean;
  seed_batch_id: string;
  created_at: string;
  provenance?: PredictionProvenance;
  evidence?: string;
  recommended_action?: string;
  uncertainty_range_minutes?: [number, number];
  data_freshness?: DataFreshnessRecord;
}

export type RouteProblemCategory =
  | 'traffic_congestion'
  | 'highway_incident'
  | 'road_closure'
  | 'heavy_rain'
  | 'fog_low_visibility'
  | 'toll_delay'
  | 'ghat_risk'
  | 'breakdown';

export interface RouteProblem {
  id: string;
  location_name: string;
  latitude: number;
  longitude: number;
  category: RouteProblemCategory;
  severity: PredictionEventSeverity;
  status: PredictionProvenance;
  expected_occurrence_time: string;
  expected_delay_minutes: number;
  data_source: string;
  last_updated: string;
  recommended_action: string;
  evidence: string;
}

export interface RouteComparisonMetrics {
  remaining_distance_km: number;
  predicted_travel_time_minutes: number;
  expected_eta: string;
  traffic_delay_minutes: number;
  weather_risk_score: number;
  toll_cost_inr: number;
  fuel_cost_inr: number;
  total_operating_cost_inr: number;
  route_risk_score: number;
}

export interface RouteFeasibilityExplanation {
  why_current_route_problematic: string[];
  why_alternate_better: string[];
  why_feasible: {
    road_accessibility: string;
    vehicle_compatibility: string;
    traffic_advantage: string;
    weather_suitability: string;
    time_feasibility: string;
    operational_constraints: string;
  };
  feasibility_status: 'feasible' | 'warning' | 'infeasible';
}

export interface RouteWaypointPoint {
  name?: string;
  latitude: number;
  longitude: number;
}

export interface MockReroute {
  id: string;
  vehicle_id: string;
  original_route_id: string;
  recommended_route_name: string;
  mode: RerouteMode;
  time_saved_minutes: number;
  extra_distance_km: number;
  fuel_cost_delta_inr: number;
  toll_cost_delta_inr: number;
  risk_score_delta: number;
  new_eta: string;
  meeting_deadline_prob: number;
  route_waypoints: [number, number][];
  alternate_corridor: string;
  reason: string;
  trigger_checkpoint_name: string;
  trigger_time: string;
  accepted: boolean;
  is_mock: boolean;
  seed_batch_id: string;
  created_at: string;
  // Enhanced dynamic rerouting attributes
  original_metrics?: RouteComparisonMetrics;
  alternate_metrics?: RouteComparisonMetrics;
  problems?: RouteProblem[];
  feasibility?: RouteFeasibilityExplanation;
  divergence_point?: RouteWaypointPoint;
  convergence_point?: RouteWaypointPoint;
  destination_point?: RouteWaypointPoint;
  travelled_waypoints?: [number, number][];
  original_remaining_waypoints?: [number, number][];
  alternate_waypoints?: [number, number][];
  alternate_candidates?: AlternateCandidateRoute[];
}

export interface AlternateCandidateRoute {
  id: string;
  name: string;
  corridor: string;
  waypoints: [number, number][];
  distance_km: number;
  duration_minutes: number;
  toll_cost_inr: number;
  fuel_cost_inr: number;
  risk_score: number;
  is_recommended: boolean;
  checkpoints?: {
    name: string;
    type: string;
    latitude: number;
    longitude: number;
    sequence_order: number;
    planned_arrival_minutes?: number;
    status?: 'pending' | 'active' | 'passed';
  }[];
}

export interface WhatIfParams {
  rain_severity_multiplier: number; // 1.0 - 3.0
  toll_strike_hours: number;        // 0 - 6
  breakdown_hours: number;          // 0 - 4
  traffic_congestion_multiplier?: number; // 1.0 - 2.5
  extra_rest_hours?: number;        // 0 - 6
}

export type TrafficProvenance =
  | 'LIVE_TOMTOM'
  | 'CACHED_TOMTOM'
  | 'HISTORICAL_MODEL'
  | 'BASELINE_FALLBACK'
  | 'UNAVAILABLE';

export interface UnifiedTrafficTelemetry {
  vehicle_id?: string;
  lat: number;
  lng: number;
  road_segment?: string;
  functional_road_class?: string;
  current_speed_kmh: number;
  free_flow_speed_kmh: number;
  congestion_level: 'low' | 'moderate' | 'heavy' | 'gridlock';
  speed_reduction_pct: number;
  estimated_delay_minutes: number;
  road_closure: boolean;
  confidence_pct: number;
  data_source: string;
  provenance: TrafficProvenance;
  observed_at: string;
  stale_after?: string;
  provider_status: 'CONNECTED' | 'DEGRADED' | 'FAILED';
  error_message?: string;
}

export interface TrafficProviderDiagnostics {
  provider: string;
  status: 'CONNECTED' | 'DEGRADED' | 'FAILED';
  api_key_configured: boolean;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_http_status: number | null;
  error_category: string | null;
  response_latency_ms: number | null;
  data_freshness: TrafficProvenance;
  success_count: number;
  failure_count: number;
  cache_size: number;
  cache_ttl_seconds: number;
}

export interface VehicleDigitalTwinData {
  vehicle: MockVehicle;
  driver: MockDriver;
  fleet: MockFleet;
  route: MockRoute;
  checkpoints: MockCheckpoint[];
  current_progress_pct: number;
  simulated_clock: string;
  current_checkpoint: MockCheckpoint | null;
  next_checkpoint: MockCheckpoint | null;
  timeline: MockPredictionEvent[];
  planned_eta: string;
  predicted_eta: string;
  total_predicted_delay_minutes: number;
  on_time_probability: number;
  risk_score: number; // 0 - 100
  top_delay_causes: { cause: string; minutes: number }[];
  driver_fatigue_pct: number;
  active_reroute?: MockReroute | null;
  preview_reroute?: MockReroute | null;
  what_if?: WhatIfParams;
  data_freshness?: DataFreshnessSummary;
  live_traffic?: UnifiedTrafficTelemetry;
  eta_breakdown?: {
    base_travel_minutes: number;
    traffic_delay_minutes: number;
    weather_delay_minutes: number;
    toll_delay_minutes: number;
    mandatory_rest_minutes: number;
    ghat_slowdown_minutes: number;
    scenario_delay_minutes: number;
  };
  explanation?: {
    summary: string;
    primary_bottleneck: string;
    mitigation: string;
    on_time_verdict: string;
  };
  scenario_comparison?: {
    baseline_eta: string;
    scenario_eta: string;
    eta_delta_minutes: number;
    risk_delta: number;
    additional_cost_inr: number;
  };
}

export interface FleetTwinStatus {
  enabled: boolean;
  mock_expires_at?: string;
  is_expired: boolean;
  total_fleets: number;
  total_vehicles: number;
  last_seeded_at?: string;
}

export interface FleetTwinVehicleOverview {
  id: string;
  registration_number: string;
  truck_type: string;
  status: TruckStatus;
  speed_kmh: number;
  current_lat: number;
  current_lng: number;
  progress_pct: number;
  capacity_tons: number;
  current_load_tons: number;
  fuel_type: FuelType;
  driver?: {
    id: string;
    name: string;
    phone: string;
    license_number: string;
    hours_driven_today: number;
    rest_hours_compliance: RestCompliance;
  };
  route?: {
    id: string;
    name: string;
    corridor: string;
    origin_city: string;
    destination_city: string;
    total_distance_km: number;
    planned_eta: string;
    waypoints?: [number, number][];
    osrm_geometry?: OsrmRouteGeometry;
  };
  fleet_name?: string;
  current_checkpoint_name?: string;
  next_checkpoint_name?: string;
  next_checkpoint_distance_km?: number;
  predicted_eta?: string;
  total_predicted_delay_minutes?: number;
  risk_score?: number;
  live_traffic?: UnifiedTrafficTelemetry;
  is_twin: boolean;
}

export interface FleetTwinOverview {
  enabled: boolean;
  timestamp: string;
  simulated_clock: string;
  traffic_diagnostics?: TrafficProviderDiagnostics;
  totals: {
    active_vehicles: number;
    total_fleet: number;
    active_alerts: number;
    average_speed_kmh: number;
    arrived_today: number;
    departed_today: number;
  };
  vehicles: FleetTwinVehicleOverview[];
  alerts: {
    vehicle_id: string;
    registration_number: string;
    event_type: string;
    severity: PredictionEventSeverity;
    delay_minutes: number;
    description: string;
    location_name: string;
    hours_from_now: number;
  }[];
}

