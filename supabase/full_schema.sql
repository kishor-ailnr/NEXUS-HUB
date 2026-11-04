-- ========================================================
-- NEXUS WAYS: FULL SUPABASE CONSOLIDATED SCHEMA (0001-0014)
-- Run this entire script in Supabase SQL Editor
-- ========================================================

-- ========================================================
-- MIGRATION: 0001_init.sql
-- ========================================================

-- Phase 1 Foundation Migration: Organizations, Users, Roles and RLS

-- Create user_role enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('manager', 'operator', 'driver', 'crew');
  end if;
end $$;

-- Create organizations table
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'India',
  state text not null,
  district text not null,
  address text not null,
  created_at timestamptz not null default now()
);

-- Create users table linked to Supabase auth.users
create table if not exists users (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role user_role not null default 'manager',
  created_at timestamptz not null default now()
);

-- Create helpful indexes
create index if not exists idx_users_org_id on users (org_id);
create index if not exists idx_users_email on users (email);

-- Enable Row Level Security
alter table organizations enable row level security;
alter table users enable row level security;

-- RLS Policies for organizations
-- A user may read their own organization's row
drop policy if exists org_select_own on organizations;
create policy org_select_own on organizations for select
  using (id in (select org_id from users where users.id = auth.uid()));

-- RLS Policies for users
-- A user may read other users in their own organization
drop policy if exists users_select_same_org on users;
create policy users_select_same_org on users for select
  using (org_id in (select org_id from users u2 where u2.id = auth.uid()));

-- A user may update only their own row
drop policy if exists users_update_self on users;
create policy users_update_self on users for update
  using (id = auth.uid());


-- ========================================================
-- MIGRATION: 0002_add_org_mode.sql
-- ========================================================

-- Migration 0002: Add org_mode enum and mode column to organizations table

do $$
begin
  if not exists (select 1 from pg_type where typname = 'org_mode') then
    create type org_mode as enum ('roadways', 'railways', 'airways', 'seaways');
  end if;
end $$;

alter table organizations
  add column if not exists mode org_mode not null default 'roadways';

-- Index on mode for mode-specific queries
create index if not exists organizations_mode_idx on organizations (mode);


-- ========================================================
-- MIGRATION: 0003_org_location_and_shared_tables.sql
-- ========================================================

-- 0003_org_location_and_shared_tables.sql
-- Add location coordinates to organizations and create notifications and alerts tables

alter table organizations
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid references users (id) on delete cascade, -- null = org-wide
  type text not null,                -- e.g. 'system', 'alert', 'info'
  title text not null,
  body text not null,
  action_label text,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  type text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  message text not null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;
alter table alerts enable row level security;

drop policy if exists notifications_select_own_org on notifications;
create policy notifications_select_own_org on notifications for select
  using (org_id in (select org_id from users where users.id = auth.uid())
         and (user_id is null or user_id = auth.uid()));

drop policy if exists notifications_update_own on notifications;
create policy notifications_update_own on notifications for update
  using (user_id = auth.uid() or user_id is null);

drop policy if exists alerts_select_own_org on alerts;
create policy alerts_select_own_org on alerts for select
  using (org_id in (select org_id from users where users.id = auth.uid()));

create index if not exists notifications_org_user_idx on notifications (org_id, user_id, read_at);
create index if not exists alerts_org_idx on alerts (org_id, created_at desc);


-- ========================================================
-- MIGRATION: 0004_roadways_core.sql
-- ========================================================

-- 0004_roadways_core.sql
-- Core Roadways tables: drivers, vehicles, saved_routes, trips, checkpoints, gps_points, geofences, convoys, hos_logs

create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  license_number text not null,
  phone text,
  status text not null default 'available' check (status in ('available','on_trip','off_duty')),
  created_at timestamptz not null default now()
);

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  registration_number text not null,
  vehicle_type text not null,
  capacity_kg numeric,
  status text not null default 'idle' check (status in ('idle','active','maintenance')),
  assigned_driver_id uuid references drivers(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, registration_number)
);

create table if not exists saved_routes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  origin_label text not null,
  destination_label text not null,
  checkpoints jsonb not null default '[]', -- [{label,lat,lng}]
  osrm_geometry jsonb,                      -- cached route polyline + distance/duration
  usage_count int not null default 1,
  updated_at timestamptz not null default now(),
  unique (org_id, origin_label, destination_label)
);

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id),
  driver_id uuid not null references drivers(id),
  origin_label text not null,
  origin_lat double precision,
  origin_lng double precision,
  destination_label text not null,
  destination_lat double precision,
  destination_lng double precision,
  status text not null default 'planned' check (status in ('planned','in_transit','completed','cancelled')),
  distance_km numeric,
  duration_minutes numeric,
  simulation_speed_multiplier numeric not null default 60,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists trip_checkpoints (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  sequence int not null,
  label text not null,
  lat double precision not null,
  lng double precision not null,
  eta timestamptz,
  arrived_at timestamptz
);

create table if not exists gps_points (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id),
  lat double precision not null,
  lng double precision not null,
  speed_kmh numeric not null,
  heading numeric,
  recorded_at timestamptz not null default now()
);

create table if not exists geofences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  type text not null,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_m numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists geofence_events (
  id uuid primary key default gen_random_uuid(),
  geofence_id uuid not null references geofences(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id),
  event_type text not null check (event_type in ('enter','exit')),
  occurred_at timestamptz not null default now()
);

create table if not exists convoy_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists convoy_members (
  id uuid primary key default gen_random_uuid(),
  convoy_id uuid not null references convoy_groups(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id),
  joined_at timestamptz not null default now(),
  unique (convoy_id, vehicle_id)
);

create table if not exists hos_logs (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id) on delete cascade,
  trip_id uuid references trips(id),
  drive_minutes numeric not null,
  window_started_at timestamptz not null,
  window_ended_at timestamptz not null,
  violation boolean not null default false
);

create index if not exists gps_points_trip_idx on gps_points (trip_id, recorded_at desc);
create index if not exists trips_org_status_idx on trips (org_id, status);
create index if not exists geofence_events_idx on geofence_events (geofence_id, occurred_at desc);
create index if not exists hos_logs_driver_window_idx on hos_logs (driver_id, window_ended_at desc);

-- RLS
alter table drivers enable row level security;
alter table vehicles enable row level security;
alter table saved_routes enable row level security;
alter table trips enable row level security;
alter table trip_checkpoints enable row level security;
alter table gps_points enable row level security;
alter table geofences enable row level security;
alter table geofence_events enable row level security;
alter table convoy_groups enable row level security;
alter table convoy_members enable row level security;
alter table hos_logs enable row level security;

drop policy if exists drivers_org on drivers;
create policy drivers_org on drivers for all using (org_id in (select org_id from users where users.id = auth.uid()));
drop policy if exists vehicles_org on vehicles;
create policy vehicles_org on vehicles for all using (org_id in (select org_id from users where users.id = auth.uid()));
drop policy if exists saved_routes_org on saved_routes;
create policy saved_routes_org on saved_routes for all using (org_id in (select org_id from users where users.id = auth.uid()));
drop policy if exists trips_org on trips;
create policy trips_org on trips for all using (org_id in (select org_id from users where users.id = auth.uid()));
drop policy if exists geofences_org on geofences;
create policy geofences_org on geofences for all using (org_id in (select org_id from users where users.id = auth.uid()));
drop policy if exists convoy_groups_org on convoy_groups;
create policy convoy_groups_org on convoy_groups for all using (org_id in (select org_id from users where users.id = auth.uid()));

drop policy if exists trip_checkpoints_org on trip_checkpoints;
create policy trip_checkpoints_org on trip_checkpoints for all using (
  trip_id in (select id from trips where org_id in (select org_id from users where users.id = auth.uid()))
);

drop policy if exists gps_points_org on gps_points;
create policy gps_points_org on gps_points for all using (
  trip_id in (select id from trips where org_id in (select org_id from users where users.id = auth.uid()))
);

drop policy if exists geofence_events_org on geofence_events;
create policy geofence_events_org on geofence_events for all using (
  geofence_id in (select id from geofences where org_id in (select org_id from users where users.id = auth.uid()))
);

drop policy if exists convoy_members_org on convoy_members;
create policy convoy_members_org on convoy_members for all using (
  convoy_id in (select id from convoy_groups where org_id in (select org_id from users where users.id = auth.uid()))
);

drop policy if exists hos_logs_org on hos_logs;
create policy hos_logs_org on hos_logs for all using (
  driver_id in (select id from drivers where org_id in (select org_id from users where users.id = auth.uid()))
);


-- ========================================================
-- MIGRATION: 0005_intelligence_layer.sql
-- ========================================================

-- 0005_intelligence_layer.sql
-- Phase 5 Intelligence Layer: ETA predictions, actual durations, carbon, toll estimates, driver behavior scores

alter table trips
  add column if not exists predicted_duration_minutes numeric,   -- OSRM estimate captured at dispatch time
  add column if not exists actual_duration_minutes numeric,       -- computed at completion
  add column if not exists carbon_kg numeric,                     -- computed at completion
  add column if not exists toll_estimate_inr numeric;              -- computed at dispatch time

create table if not exists driver_behavior_scores (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  driver_id uuid not null references drivers(id) on delete cascade,
  score int not null check (score between 0 and 100),
  harsh_brake_count int not null default 0,
  speeding_event_count int not null default 0,
  computed_at timestamptz not null default now()
);

create index if not exists driver_behavior_driver_idx on driver_behavior_scores (driver_id, computed_at desc);

-- RLS
alter table driver_behavior_scores enable row level security;

drop policy if exists driver_behavior_scores_org on driver_behavior_scores;
create policy driver_behavior_scores_org on driver_behavior_scores for all using (
  driver_id in (select id from drivers where org_id in (select org_id from users where users.id = auth.uid()))
);


-- ========================================================
-- MIGRATION: 0006_trip_reports.sql
-- ========================================================

-- ==========================================
-- Phase 6: Trip Reports & Supabase Storage
-- ==========================================

-- 1. Create trip_reports table
CREATE TABLE IF NOT EXISTS public.trip_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    file_size_bytes INT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_trip_report_trip UNIQUE (trip_id)
);

-- 2. Indexes for efficient lookup & admin listing
CREATE INDEX IF NOT EXISTS idx_trip_reports_org ON public.trip_reports(org_id);
CREATE INDEX IF NOT EXISTS idx_trip_reports_trip ON public.trip_reports(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_reports_generated_at ON public.trip_reports(generated_at DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.trip_reports ENABLE ROW LEVEL SECURITY;

drop policy if exists "Tenant isolation for trip_reports select" on public.trip_reports;
CREATE POLICY "Tenant isolation for trip_reports select" ON public.trip_reports
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM public.users WHERE users.id = auth.uid()
        )
    );

drop policy if exists "Tenant isolation for trip_reports insert" on public.trip_reports;
CREATE POLICY "Tenant isolation for trip_reports insert" ON public.trip_reports
    FOR INSERT WITH CHECK (
        org_id IN (
            SELECT org_id FROM public.users WHERE users.id = auth.uid()
        )
    );

-- 4. Supabase Storage Bucket Setup (Private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('trip-pdfs', 'trip-pdfs', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;


-- ========================================================
-- MIGRATION: 0007_fix_rls_recursion.sql
-- ========================================================

-- 0007_fix_rls_recursion.sql
-- Fix infinite recursion in RLS policies on public.users and dependent tables

create or replace function public.get_auth_org_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select org_id from public.users where id = auth.uid() limit 1;
$$;

-- 1. Fix users policy
drop policy if exists users_select_same_org on public.users;
create policy users_select_same_org on public.users for select
  using (id = auth.uid() or org_id = public.get_auth_org_id());

-- 2. Fix organizations policy
drop policy if exists org_select_own on public.organizations;
create policy org_select_own on public.organizations for select
  using (id = public.get_auth_org_id());

-- 3. Fix trip_reports policies
drop policy if exists "Tenant isolation for trip_reports select" on public.trip_reports;
create policy "Tenant isolation for trip_reports select" on public.trip_reports
  for select using (org_id = public.get_auth_org_id());

drop policy if exists "Tenant isolation for trip_reports insert" on public.trip_reports;
create policy "Tenant isolation for trip_reports insert" on public.trip_reports
  for insert with check (org_id = public.get_auth_org_id());


-- ========================================================
-- MIGRATION: 0008_railways_core.sql
-- ========================================================

-- Phase 7A-1 Migration: Railways Core Tables & RLS Policies

create table if not exists stations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  station_code text,
  lat double precision,
  lng double precision,
  station_type text not null default 'station' check (station_type in ('station','yard','junction')),
  created_at timestamptz not null default now()
);

create table if not exists locomotives (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  loco_number text not null,
  loco_type text not null,
  power_kw numeric,
  fuel_type text not null check (fuel_type in ('electric','diesel')),
  status text not null default 'idle' check (status in ('idle','active','maintenance')),
  created_at timestamptz not null default now(),
  unique (org_id, loco_number)
);

create table if not exists rakes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  rake_id text not null,
  composition jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (org_id, rake_id)
);

create table if not exists loco_pilots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  license_number text not null,
  phone text,
  status text not null default 'available' check (status in ('available','on_duty','off_duty')),
  created_at timestamptz not null default now()
);

create table if not exists trains (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  train_number text not null,
  train_name text,
  locomotive_id uuid references locomotives(id) on delete set null,
  rake_id uuid references rakes(id) on delete set null,
  status text not null default 'idle' check (status in ('idle','active','maintenance')),
  created_at timestamptz not null default now(),
  unique (org_id, train_number)
);

create table if not exists saved_rail_routes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  origin_station_id uuid not null references stations(id) on delete cascade,
  destination_station_id uuid not null references stations(id) on delete cascade,
  intermediate_stations jsonb not null default '[]',
  route_geometry jsonb,
  routing_source text not null default 'pending' check (routing_source in ('overpass','fallback-straight-line','pending')),
  usage_count int not null default 1,
  updated_at timestamptz not null default now(),
  unique (org_id, origin_station_id, destination_station_id)
);

create table if not exists train_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  train_id uuid not null references trains(id) on delete cascade,
  loco_pilot_id uuid not null references loco_pilots(id) on delete cascade,
  origin_station_id uuid not null references stations(id) on delete cascade,
  destination_station_id uuid not null references stations(id) on delete cascade,
  status text not null default 'planned' check (status in ('planned','in_transit','completed','cancelled')),
  distance_km numeric,
  duration_minutes numeric,
  simulation_speed_multiplier numeric not null default 60,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists train_movement_stops (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references train_movements(id) on delete cascade,
  station_id uuid not null references stations(id) on delete cascade,
  sequence int not null,
  eta timestamptz,
  arrived_at timestamptz,
  departed_at timestamptz
);

create table if not exists train_telemetry (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references train_movements(id) on delete cascade,
  train_id uuid not null references trains(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  speed_kmh numeric not null,
  heading numeric,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_stations_org_id on stations (org_id);
create index if not exists idx_locomotives_org_id on locomotives (org_id);
create index if not exists idx_rakes_org_id on rakes (org_id);
create index if not exists idx_loco_pilots_org_id on loco_pilots (org_id);
create index if not exists idx_trains_org_id on trains (org_id);
create index if not exists idx_saved_rail_routes_org_id on saved_rail_routes (org_id);
create index if not exists train_telemetry_movement_idx on train_telemetry (movement_id, recorded_at desc);
create index if not exists train_movements_org_status_idx on train_movements (org_id, status);

-- Enable RLS
alter table stations enable row level security;
alter table locomotives enable row level security;
alter table rakes enable row level security;
alter table loco_pilots enable row level security;
alter table trains enable row level security;
alter table saved_rail_routes enable row level security;
alter table train_movements enable row level security;
alter table train_movement_stops enable row level security;
alter table train_telemetry enable row level security;

-- Stations RLS Policies
drop policy if exists "Tenant isolation for stations select" on stations;
create policy "Tenant isolation for stations select" on stations
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for stations insert" on stations;
create policy "Tenant isolation for stations insert" on stations
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for stations update" on stations;
create policy "Tenant isolation for stations update" on stations
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for stations delete" on stations;
create policy "Tenant isolation for stations delete" on stations
  for delete using (org_id = public.get_auth_org_id());

-- Locomotives RLS Policies
drop policy if exists "Tenant isolation for locomotives select" on locomotives;
create policy "Tenant isolation for locomotives select" on locomotives
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for locomotives insert" on locomotives;
create policy "Tenant isolation for locomotives insert" on locomotives
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for locomotives update" on locomotives;
create policy "Tenant isolation for locomotives update" on locomotives
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for locomotives delete" on locomotives;
create policy "Tenant isolation for locomotives delete" on locomotives
  for delete using (org_id = public.get_auth_org_id());

-- Rakes RLS Policies
drop policy if exists "Tenant isolation for rakes select" on rakes;
create policy "Tenant isolation for rakes select" on rakes
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for rakes insert" on rakes;
create policy "Tenant isolation for rakes insert" on rakes
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for rakes update" on rakes;
create policy "Tenant isolation for rakes update" on rakes
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for rakes delete" on rakes;
create policy "Tenant isolation for rakes delete" on rakes
  for delete using (org_id = public.get_auth_org_id());

-- Loco Pilots RLS Policies
drop policy if exists "Tenant isolation for loco_pilots select" on loco_pilots;
create policy "Tenant isolation for loco_pilots select" on loco_pilots
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for loco_pilots insert" on loco_pilots;
create policy "Tenant isolation for loco_pilots insert" on loco_pilots
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for loco_pilots update" on loco_pilots;
create policy "Tenant isolation for loco_pilots update" on loco_pilots
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for loco_pilots delete" on loco_pilots;
create policy "Tenant isolation for loco_pilots delete" on loco_pilots
  for delete using (org_id = public.get_auth_org_id());

-- Trains RLS Policies
drop policy if exists "Tenant isolation for trains select" on trains;
create policy "Tenant isolation for trains select" on trains
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for trains insert" on trains;
create policy "Tenant isolation for trains insert" on trains
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for trains update" on trains;
create policy "Tenant isolation for trains update" on trains
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for trains delete" on trains;
create policy "Tenant isolation for trains delete" on trains
  for delete using (org_id = public.get_auth_org_id());

-- Saved Rail Routes RLS Policies
drop policy if exists "Tenant isolation for saved_rail_routes select" on saved_rail_routes;
create policy "Tenant isolation for saved_rail_routes select" on saved_rail_routes
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for saved_rail_routes insert" on saved_rail_routes;
create policy "Tenant isolation for saved_rail_routes insert" on saved_rail_routes
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for saved_rail_routes update" on saved_rail_routes;
create policy "Tenant isolation for saved_rail_routes update" on saved_rail_routes
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for saved_rail_routes delete" on saved_rail_routes;
create policy "Tenant isolation for saved_rail_routes delete" on saved_rail_routes
  for delete using (org_id = public.get_auth_org_id());

-- Train Movements RLS Policies
drop policy if exists "Tenant isolation for train_movements select" on train_movements;
create policy "Tenant isolation for train_movements select" on train_movements
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for train_movements insert" on train_movements;
create policy "Tenant isolation for train_movements insert" on train_movements
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for train_movements update" on train_movements;
create policy "Tenant isolation for train_movements update" on train_movements
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for train_movements delete" on train_movements;
create policy "Tenant isolation for train_movements delete" on train_movements
  for delete using (org_id = public.get_auth_org_id());

-- Train Movement Stops RLS Policies
drop policy if exists "Tenant isolation for train_movement_stops select" on train_movement_stops;
create policy "Tenant isolation for train_movement_stops select" on train_movement_stops
  for select using (movement_id in (select id from train_movements where org_id = public.get_auth_org_id()));
drop policy if exists "Tenant isolation for train_movement_stops insert" on train_movement_stops;
create policy "Tenant isolation for train_movement_stops insert" on train_movement_stops
  for insert with check (movement_id in (select id from train_movements where org_id = public.get_auth_org_id()));
drop policy if exists "Tenant isolation for train_movement_stops update" on train_movement_stops;
create policy "Tenant isolation for train_movement_stops update" on train_movement_stops
  for update using (movement_id in (select id from train_movements where org_id = public.get_auth_org_id()));
drop policy if exists "Tenant isolation for train_movement_stops delete" on train_movement_stops;
create policy "Tenant isolation for train_movement_stops delete" on train_movement_stops
  for delete using (movement_id in (select id from train_movements where org_id = public.get_auth_org_id()));

-- Train Telemetry RLS Policies
drop policy if exists "Tenant isolation for train_telemetry select" on train_telemetry;
create policy "Tenant isolation for train_telemetry select" on train_telemetry
  for select using (movement_id in (select id from train_movements where org_id = public.get_auth_org_id()));
drop policy if exists "Tenant isolation for train_telemetry insert" on train_telemetry;
create policy "Tenant isolation for train_telemetry insert" on train_telemetry
  for insert with check (movement_id in (select id from train_movements where org_id = public.get_auth_org_id()));


-- ========================================================
-- MIGRATION: 0009_railways_intelligence.sql
-- ========================================================

-- 0009_railways_intelligence.sql
-- Phase 7A-2: Railways Intelligence Layer, Crew Scoring, Slot Intelligence & Movement PDF Reports

-- 1. Extend train_movements table
alter table public.train_movements
  add column if not exists predicted_duration_minutes numeric,
  add column if not exists actual_duration_minutes numeric,
  add column if not exists carbon_kg numeric;

-- 2. Create crew_behavior_scores table
create table if not exists public.crew_behavior_scores (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.train_movements(id) on delete cascade,
  loco_pilot_id uuid not null references public.loco_pilots(id) on delete cascade,
  score int not null check (score between 0 and 100),
  harsh_brake_count int not null default 0,
  overspeed_event_count int not null default 0,
  computed_at timestamptz not null default now()
);

create index if not exists idx_crew_behavior_scores_movement on public.crew_behavior_scores (movement_id);
create index if not exists idx_crew_behavior_scores_pilot on public.crew_behavior_scores (loco_pilot_id, computed_at desc);

-- 3. Create train_movement_reports table
create table if not exists public.train_movement_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  movement_id uuid not null references public.train_movements(id) on delete cascade,
  storage_path text not null,
  file_size_bytes int,
  generated_at timestamptz not null default now(),
  unique (movement_id)
);

create index if not exists idx_train_movement_reports_org on public.train_movement_reports (org_id);
create index if not exists idx_train_movement_reports_movement on public.train_movement_reports (movement_id);
create index if not exists idx_train_movement_reports_generated on public.train_movement_reports (generated_at desc);

-- 4. Enable Row Level Security (RLS)
alter table public.crew_behavior_scores enable row level security;
alter table public.train_movement_reports enable row level security;

-- Crew Behavior Scores RLS Policies
drop policy if exists "Tenant isolation for crew_behavior_scores select" on public.crew_behavior_scores;
create policy "Tenant isolation for crew_behavior_scores select" on public.crew_behavior_scores
  for select using (
    movement_id in (select id from public.train_movements where org_id = public.get_auth_org_id())
  );

drop policy if exists "Tenant isolation for crew_behavior_scores insert" on public.crew_behavior_scores;
create policy "Tenant isolation for crew_behavior_scores insert" on public.crew_behavior_scores
  for insert with check (
    movement_id in (select id from public.train_movements where org_id = public.get_auth_org_id())
  );

drop policy if exists "Tenant isolation for crew_behavior_scores update" on public.crew_behavior_scores;
create policy "Tenant isolation for crew_behavior_scores update" on public.crew_behavior_scores
  for update using (
    movement_id in (select id from public.train_movements where org_id = public.get_auth_org_id())
  );

drop policy if exists "Tenant isolation for crew_behavior_scores delete" on public.crew_behavior_scores;
create policy "Tenant isolation for crew_behavior_scores delete" on public.crew_behavior_scores
  for delete using (
    movement_id in (select id from public.train_movements where org_id = public.get_auth_org_id())
  );

-- Train Movement Reports RLS Policies
drop policy if exists "Tenant isolation for train_movement_reports select" on public.train_movement_reports;
create policy "Tenant isolation for train_movement_reports select" on public.train_movement_reports
  for select using (org_id = public.get_auth_org_id());

drop policy if exists "Tenant isolation for train_movement_reports insert" on public.train_movement_reports;
create policy "Tenant isolation for train_movement_reports insert" on public.train_movement_reports
  for insert with check (org_id = public.get_auth_org_id());

drop policy if exists "Tenant isolation for train_movement_reports update" on public.train_movement_reports;
create policy "Tenant isolation for train_movement_reports update" on public.train_movement_reports
  for update using (org_id = public.get_auth_org_id());

drop policy if exists "Tenant isolation for train_movement_reports delete" on public.train_movement_reports;
create policy "Tenant isolation for train_movement_reports delete" on public.train_movement_reports
  for delete using (org_id = public.get_auth_org_id());

-- 5. Private storage bucket for train pdfs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('train-pdfs', 'train-pdfs', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;


-- ========================================================
-- MIGRATION: 0010_airways_core.sql
-- ========================================================

-- Phase 7B-1 Migration: Airways Core Tables & RLS Policies

create table if not exists airports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  iata_code text,
  icao_code text,
  lat double precision,
  lng double precision,   -- geocoded via existing GeocodingService
  created_at timestamptz not null default now()
);

create table if not exists aircraft (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  tail_number text not null,
  aircraft_type text not null,
  cargo_capacity_kg numeric,
  status text not null default 'idle'
    check (status in ('idle','active','maintenance')),
  created_at timestamptz not null default now(),
  unique (org_id, tail_number)
);

create table if not exists flight_crew (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  license_number text not null,
  crew_role text not null default 'pilot'
    check (crew_role in ('pilot','cabin')),
  status text not null default 'available'
    check (status in ('available','on_duty','off_duty')),
  created_at timestamptz not null default now()
);

create table if not exists flights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  flight_number text not null,
  origin_airport_id uuid not null references airports(id),
  destination_airport_id uuid not null references airports(id),
  created_at timestamptz not null default now(),
  unique (org_id, flight_number)
);

create table if not exists flight_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  flight_id uuid not null references flights(id),
  aircraft_id uuid not null references aircraft(id),
  pilot_id uuid not null references flight_crew(id),
  status text not null default 'planned'
    check (status in ('planned','in_transit','completed','cancelled')),
  routing_method text not null default 'great-circle',
  distance_km numeric,
  duration_minutes numeric,
  simulation_speed_multiplier numeric not null default 60,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists flight_telemetry (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references flight_movements(id) on delete cascade,
  aircraft_id uuid not null references aircraft(id),
  lat double precision not null,
  lng double precision not null,
  altitude_ft numeric,
  speed_kts numeric not null,
  heading numeric,
  recorded_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_airports_org_id on airports (org_id);
create index if not exists idx_aircraft_org_id on aircraft (org_id);
create index if not exists idx_flight_crew_org_id on flight_crew (org_id);
create index if not exists idx_flights_org_id on flights (org_id);
create index if not exists flight_telemetry_movement_idx on flight_telemetry (movement_id, recorded_at desc);
create index if not exists flight_movements_org_status_idx on flight_movements (org_id, status);

-- Enable RLS
alter table airports enable row level security;
alter table aircraft enable row level security;
alter table flight_crew enable row level security;
alter table flights enable row level security;
alter table flight_movements enable row level security;
alter table flight_telemetry enable row level security;

-- Airports RLS Policies
drop policy if exists "Tenant isolation for airports select" on airports;
create policy "Tenant isolation for airports select" on airports
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for airports insert" on airports;
create policy "Tenant isolation for airports insert" on airports
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for airports update" on airports;
create policy "Tenant isolation for airports update" on airports
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for airports delete" on airports;
create policy "Tenant isolation for airports delete" on airports
  for delete using (org_id = public.get_auth_org_id());

-- Aircraft RLS Policies
drop policy if exists "Tenant isolation for aircraft select" on aircraft;
create policy "Tenant isolation for aircraft select" on aircraft
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for aircraft insert" on aircraft;
create policy "Tenant isolation for aircraft insert" on aircraft
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for aircraft update" on aircraft;
create policy "Tenant isolation for aircraft update" on aircraft
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for aircraft delete" on aircraft;
create policy "Tenant isolation for aircraft delete" on aircraft
  for delete using (org_id = public.get_auth_org_id());

-- Flight Crew RLS Policies
drop policy if exists "Tenant isolation for flight_crew select" on flight_crew;
create policy "Tenant isolation for flight_crew select" on flight_crew
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for flight_crew insert" on flight_crew;
create policy "Tenant isolation for flight_crew insert" on flight_crew
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for flight_crew update" on flight_crew;
create policy "Tenant isolation for flight_crew update" on flight_crew
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for flight_crew delete" on flight_crew;
create policy "Tenant isolation for flight_crew delete" on flight_crew
  for delete using (org_id = public.get_auth_org_id());

-- Flights RLS Policies
drop policy if exists "Tenant isolation for flights select" on flights;
create policy "Tenant isolation for flights select" on flights
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for flights insert" on flights;
create policy "Tenant isolation for flights insert" on flights
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for flights update" on flights;
create policy "Tenant isolation for flights update" on flights
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for flights delete" on flights;
create policy "Tenant isolation for flights delete" on flights
  for delete using (org_id = public.get_auth_org_id());

-- Flight Movements RLS Policies
drop policy if exists "Tenant isolation for flight_movements select" on flight_movements;
create policy "Tenant isolation for flight_movements select" on flight_movements
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for flight_movements insert" on flight_movements;
create policy "Tenant isolation for flight_movements insert" on flight_movements
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for flight_movements update" on flight_movements;
create policy "Tenant isolation for flight_movements update" on flight_movements
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for flight_movements delete" on flight_movements;
create policy "Tenant isolation for flight_movements delete" on flight_movements
  for delete using (org_id = public.get_auth_org_id());

-- Flight Telemetry RLS Policies
drop policy if exists "Tenant isolation for flight_telemetry select" on flight_telemetry;
create policy "Tenant isolation for flight_telemetry select" on flight_telemetry
  for select using (movement_id in (select id from flight_movements where org_id = public.get_auth_org_id()));
drop policy if exists "Tenant isolation for flight_telemetry insert" on flight_telemetry;
create policy "Tenant isolation for flight_telemetry insert" on flight_telemetry
  for insert with check (movement_id in (select id from flight_movements where org_id = public.get_auth_org_id()));
drop policy if exists "Tenant isolation for flight_telemetry delete" on flight_telemetry;
create policy "Tenant isolation for flight_telemetry delete" on flight_telemetry
  for delete using (movement_id in (select id from flight_movements where org_id = public.get_auth_org_id()));


-- ========================================================
-- MIGRATION: 0011_airways_intelligence.sql
-- ========================================================

-- ==========================================================
-- Phase 7B-2: Airways Intelligence Layer & PDF Reports
-- ==========================================================

-- 1. Extend flight_movements table with intelligence columns
alter table flight_movements
  add column if not exists predicted_duration_minutes numeric,
  add column if not exists actual_duration_minutes numeric,
  add column if not exists carbon_kg numeric;

-- 2. Crew Flight Scoring Table
create table if not exists crew_flight_scores (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references flight_movements(id) on delete cascade,
  pilot_id uuid not null references flight_crew(id) on delete cascade,
  score int not null check (score between 0 and 100),
  abrupt_maneuver_count int not null default 0,
  overspeed_event_count int not null default 0,
  computed_at timestamptz not null default now()
);

create index if not exists idx_crew_flight_scores_movement on crew_flight_scores(movement_id);
create index if not exists idx_crew_flight_scores_pilot on crew_flight_scores(pilot_id);

-- 3. Flight Duty Logs Table (DGCA India FDTL Compliant)
create table if not exists flight_duty_logs (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references flight_crew(id) on delete cascade,
  movement_id uuid references flight_movements(id) on delete set null,
  duty_minutes numeric not null,
  window_started_at timestamptz not null,
  window_ended_at timestamptz not null,
  violation boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_flight_duty_logs_pilot on flight_duty_logs(pilot_id);
create index if not exists idx_flight_duty_logs_window on flight_duty_logs(window_started_at, window_ended_at);

-- 4. Flight Movement PDF Reports Table
create table if not exists flight_movement_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  movement_id uuid not null references flight_movements(id) on delete cascade,
  storage_path text not null,
  file_size_bytes int,
  generated_at timestamptz not null default now(),
  unique (movement_id)
);

create index if not exists idx_flight_movement_reports_org on flight_movement_reports(org_id);

-- Enable RLS
alter table crew_flight_scores enable row level security;
alter table flight_duty_logs enable row level security;
alter table flight_movement_reports enable row level security;

-- Policies for crew_flight_scores
drop policy if exists "Users can view crew flight scores for their org" on crew_flight_scores;
create policy "Users can view crew flight scores for their org"
  on crew_flight_scores for select
  using (
    exists (
      select 1 from flight_movements fm
      where fm.id = crew_flight_scores.movement_id
      and fm.org_id = public.get_auth_org_id()
    )
  );

drop policy if exists "Users can manage crew flight scores for their org" on crew_flight_scores;
create policy "Users can manage crew flight scores for their org"
  on crew_flight_scores for all
  using (
    exists (
      select 1 from flight_movements fm
      where fm.id = crew_flight_scores.movement_id
      and fm.org_id = public.get_auth_org_id()
    )
  );

-- Policies for flight_duty_logs
drop policy if exists "Users can view flight duty logs for their org" on flight_duty_logs;
create policy "Users can view flight duty logs for their org"
  on flight_duty_logs for select
  using (
    exists (
      select 1 from flight_crew fc
      where fc.id = flight_duty_logs.pilot_id
      and fc.org_id = public.get_auth_org_id()
    )
  );

-- Policies for flight_duty_logs
drop policy if exists "Users can manage flight duty logs for their org" on flight_duty_logs;
create policy "Users can manage flight duty logs for their org"
  on flight_duty_logs for all
  using (
    exists (
      select 1 from flight_crew fc
      where fc.id = flight_duty_logs.pilot_id
      and fc.org_id = public.get_auth_org_id()
    )
  );

-- Policies for flight_movement_reports
drop policy if exists "Users can view flight movement reports for their org" on flight_movement_reports;
create policy "Users can view flight movement reports for their org"
  on flight_movement_reports for select
  using (org_id = public.get_auth_org_id());

drop policy if exists "Users can manage flight movement reports for their org" on flight_movement_reports;
create policy "Users can manage flight movement reports for their org"
  on flight_movement_reports for all
  using (org_id = public.get_auth_org_id());



-- ========================================================
-- MIGRATION: 0012_seaways_core.sql
-- ========================================================

-- Phase 7C-1 Migration: Seaways Core Tables & RLS Policies

create table if not exists ports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  unlocode text,
  lat double precision,
  lng double precision,   -- geocoded via existing GeocodingService
  created_at timestamptz not null default now()
);

create table if not exists vessels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  vessel_name text not null,
  imo_number text,
  vessel_type text not null,
  dwt_tonnes numeric,   -- deadweight tonnage — needed for Phase 7C-2's carbon factor bucket
  status text not null default 'idle' check (status in ('idle','active','maintenance')),
  created_at timestamptz not null default now(),
  unique (org_id, imo_number)
);

create table if not exists sea_crew (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  certificate_number text not null,
  crew_role text not null default 'officer'
    check (crew_role in ('master','officer','rating')),
  status text not null default 'available' check (status in ('available','on_duty','off_duty')),
  created_at timestamptz not null default now()
);

create table if not exists voyages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  voyage_number text not null,
  origin_port_id uuid not null references ports(id),
  destination_port_id uuid not null references ports(id),
  created_at timestamptz not null default now(),
  unique (org_id, voyage_number)
);

create table if not exists saved_sea_routes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  origin_port_id uuid not null references ports(id),
  destination_port_id uuid not null references ports(id),
  route_geometry jsonb,
  routing_source text not null default 'pending'
    check (routing_source in ('searoute','fallback-chokepoint','pending')),
  usage_count int not null default 1,
  updated_at timestamptz not null default now(),
  unique (org_id, origin_port_id, destination_port_id)
);

create table if not exists voyage_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  voyage_id uuid not null references voyages(id),
  vessel_id uuid not null references vessels(id),
  master_id uuid not null references sea_crew(id),
  status text not null default 'planned' check (status in ('planned','in_transit','completed','cancelled')),
  distance_km numeric,
  duration_minutes numeric,
  simulation_speed_multiplier numeric not null default 60,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists vessel_telemetry (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references voyage_movements(id) on delete cascade,
  vessel_id uuid not null references vessels(id),
  lat double precision not null,
  lng double precision not null,
  speed_knots numeric not null,
  heading numeric,
  recorded_at timestamptz not null default now()
);

create table if not exists sea_convoy_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists sea_convoy_members (
  id uuid primary key default gen_random_uuid(),
  convoy_id uuid not null references sea_convoy_groups(id) on delete cascade,
  vessel_id uuid not null references vessels(id),
  joined_at timestamptz not null default now(),
  unique (convoy_id, vessel_id)
);

-- Indexes
create index if not exists idx_ports_org_id on ports (org_id);
create index if not exists idx_vessels_org_id on vessels (org_id);
create index if not exists idx_sea_crew_org_id on sea_crew (org_id);
create index if not exists idx_voyages_org_id on voyages (org_id);
create index if not exists idx_saved_sea_routes_org on saved_sea_routes (org_id, origin_port_id, destination_port_id);
create index if not exists vessel_telemetry_movement_idx on vessel_telemetry (movement_id, recorded_at desc);
create index if not exists voyage_movements_org_status_idx on voyage_movements (org_id, status);
create index if not exists idx_sea_convoy_groups_org_id on sea_convoy_groups (org_id);
create index if not exists idx_sea_convoy_members_convoy_id on sea_convoy_members (convoy_id);

-- Enable RLS
alter table ports enable row level security;
alter table vessels enable row level security;
alter table sea_crew enable row level security;
alter table voyages enable row level security;
alter table saved_sea_routes enable row level security;
alter table voyage_movements enable row level security;
alter table vessel_telemetry enable row level security;
alter table sea_convoy_groups enable row level security;
alter table sea_convoy_members enable row level security;

-- Ports RLS Policies
drop policy if exists "Tenant isolation for ports select" on ports;
create policy "Tenant isolation for ports select" on ports
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for ports insert" on ports;
create policy "Tenant isolation for ports insert" on ports
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for ports update" on ports;
create policy "Tenant isolation for ports update" on ports
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for ports delete" on ports;
create policy "Tenant isolation for ports delete" on ports
  for delete using (org_id = public.get_auth_org_id());

-- Vessels RLS Policies
drop policy if exists "Tenant isolation for vessels select" on vessels;
create policy "Tenant isolation for vessels select" on vessels
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for vessels insert" on vessels;
create policy "Tenant isolation for vessels insert" on vessels
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for vessels update" on vessels;
create policy "Tenant isolation for vessels update" on vessels
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for vessels delete" on vessels;
create policy "Tenant isolation for vessels delete" on vessels
  for delete using (org_id = public.get_auth_org_id());

-- Sea Crew RLS Policies
drop policy if exists "Tenant isolation for sea_crew select" on sea_crew;
create policy "Tenant isolation for sea_crew select" on sea_crew
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for sea_crew insert" on sea_crew;
create policy "Tenant isolation for sea_crew insert" on sea_crew
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for sea_crew update" on sea_crew;
create policy "Tenant isolation for sea_crew update" on sea_crew
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for sea_crew delete" on sea_crew;
create policy "Tenant isolation for sea_crew delete" on sea_crew
  for delete using (org_id = public.get_auth_org_id());

-- Voyages RLS Policies
drop policy if exists "Tenant isolation for voyages select" on voyages;
create policy "Tenant isolation for voyages select" on voyages
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for voyages insert" on voyages;
create policy "Tenant isolation for voyages insert" on voyages
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for voyages update" on voyages;
create policy "Tenant isolation for voyages update" on voyages
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for voyages delete" on voyages;
create policy "Tenant isolation for voyages delete" on voyages
  for delete using (org_id = public.get_auth_org_id());

-- Saved Sea Routes RLS Policies
drop policy if exists "Tenant isolation for saved_sea_routes select" on saved_sea_routes;
create policy "Tenant isolation for saved_sea_routes select" on saved_sea_routes
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for saved_sea_routes insert" on saved_sea_routes;
create policy "Tenant isolation for saved_sea_routes insert" on saved_sea_routes
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for saved_sea_routes update" on saved_sea_routes;
create policy "Tenant isolation for saved_sea_routes update" on saved_sea_routes
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for saved_sea_routes delete" on saved_sea_routes;
create policy "Tenant isolation for saved_sea_routes delete" on saved_sea_routes
  for delete using (org_id = public.get_auth_org_id());

-- Voyage Movements RLS Policies
drop policy if exists "Tenant isolation for voyage_movements select" on voyage_movements;
create policy "Tenant isolation for voyage_movements select" on voyage_movements
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for voyage_movements insert" on voyage_movements;
create policy "Tenant isolation for voyage_movements insert" on voyage_movements
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for voyage_movements update" on voyage_movements;
create policy "Tenant isolation for voyage_movements update" on voyage_movements
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for voyage_movements delete" on voyage_movements;
create policy "Tenant isolation for voyage_movements delete" on voyage_movements
  for delete using (org_id = public.get_auth_org_id());

-- Vessel Telemetry RLS Policies
drop policy if exists "Tenant isolation for vessel_telemetry select" on vessel_telemetry;
create policy "Tenant isolation for vessel_telemetry select" on vessel_telemetry
  for select using (movement_id in (select id from voyage_movements where org_id = public.get_auth_org_id()));
drop policy if exists "Tenant isolation for vessel_telemetry insert" on vessel_telemetry;
create policy "Tenant isolation for vessel_telemetry insert" on vessel_telemetry
  for insert with check (movement_id in (select id from voyage_movements where org_id = public.get_auth_org_id()));
drop policy if exists "Tenant isolation for vessel_telemetry delete" on vessel_telemetry;
create policy "Tenant isolation for vessel_telemetry delete" on vessel_telemetry
  for delete using (movement_id in (select id from voyage_movements where org_id = public.get_auth_org_id()));

-- Sea Convoy Groups RLS Policies
drop policy if exists "Tenant isolation for sea_convoy_groups select" on sea_convoy_groups;
create policy "Tenant isolation for sea_convoy_groups select" on sea_convoy_groups
  for select using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for sea_convoy_groups insert" on sea_convoy_groups;
create policy "Tenant isolation for sea_convoy_groups insert" on sea_convoy_groups
  for insert with check (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for sea_convoy_groups update" on sea_convoy_groups;
create policy "Tenant isolation for sea_convoy_groups update" on sea_convoy_groups
  for update using (org_id = public.get_auth_org_id());
drop policy if exists "Tenant isolation for sea_convoy_groups delete" on sea_convoy_groups;
create policy "Tenant isolation for sea_convoy_groups delete" on sea_convoy_groups
  for delete using (org_id = public.get_auth_org_id());

-- Sea Convoy Members RLS Policies
drop policy if exists "Tenant isolation for sea_convoy_members select" on sea_convoy_members;
create policy "Tenant isolation for sea_convoy_members select" on sea_convoy_members
  for select using (convoy_id in (select id from sea_convoy_groups where org_id = public.get_auth_org_id()));
drop policy if exists "Tenant isolation for sea_convoy_members insert" on sea_convoy_members;
create policy "Tenant isolation for sea_convoy_members insert" on sea_convoy_members
  for insert with check (convoy_id in (select id from sea_convoy_groups where org_id = public.get_auth_org_id()));
drop policy if exists "Tenant isolation for sea_convoy_members delete" on sea_convoy_members;
create policy "Tenant isolation for sea_convoy_members delete" on sea_convoy_members
  for delete using (convoy_id in (select id from sea_convoy_groups where org_id = public.get_auth_org_id()));


-- ========================================================
-- MIGRATION: 0013_seaways_intelligence.sql
-- ========================================================

-- ==========================================================
-- Phase 7C-2: Seaways Intelligence Layer & PDF Reports
-- ==========================================================

-- 1. Extend voyage_movements and vessels table with intelligence columns
alter table voyage_movements
  add column if not exists predicted_duration_minutes numeric,
  add column if not exists actual_duration_minutes numeric,
  add column if not exists carbon_kg numeric;

alter table vessels
  add column if not exists teu_capacity int;

-- 2. Sea Crew Behavior Scoring Table
create table if not exists sea_crew_scores (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references voyage_movements(id) on delete cascade,
  crew_id uuid not null references sea_crew(id) on delete cascade,
  score int not null check (score between 0 and 100),
  harsh_maneuver_count int not null default 0,
  overspeed_event_count int not null default 0,
  computed_at timestamptz not null default now()
);

create index if not exists idx_sea_crew_scores_movement on sea_crew_scores(movement_id);
create index if not exists idx_sea_crew_scores_crew on sea_crew_scores(crew_id);

-- 3. Watchkeeping Logs Table (STCW Regulation VIII/1 & Section A-VIII/1 / MLC 2006 Compliant)
create table if not exists watchkeeping_logs (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references sea_crew(id) on delete cascade,
  movement_id uuid references voyage_movements(id) on delete set null,
  duty_minutes numeric not null,
  rest_minutes numeric not null,
  window_started_at timestamptz not null,
  window_ended_at timestamptz not null,
  violation boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_watchkeeping_logs_crew on watchkeeping_logs(crew_id);
create index if not exists idx_watchkeeping_logs_window on watchkeeping_logs(window_started_at, window_ended_at);

-- 4. Voyage Movement PDF Reports Table
create table if not exists voyage_movement_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  movement_id uuid not null references voyage_movements(id) on delete cascade,
  storage_path text not null,
  file_size_bytes int,
  generated_at timestamptz not null default now(),
  unique (movement_id)
);

create index if not exists idx_voyage_movement_reports_org on voyage_movement_reports(org_id);

-- Enable RLS
alter table sea_crew_scores enable row level security;
alter table watchkeeping_logs enable row level security;
alter table voyage_movement_reports enable row level security;

-- Policies for sea_crew_scores
drop policy if exists "Tenant isolation for sea_crew_scores select" on sea_crew_scores;
create policy "Tenant isolation for sea_crew_scores select"
  on sea_crew_scores for select
  using (
    exists (
      select 1 from voyage_movements vm
      where vm.id = sea_crew_scores.movement_id
      and vm.org_id = public.get_auth_org_id()
    )
  );

drop policy if exists "Tenant isolation for sea_crew_scores insert" on sea_crew_scores;
create policy "Tenant isolation for sea_crew_scores insert"
  on sea_crew_scores for insert
  with check (
    exists (
      select 1 from voyage_movements vm
      where vm.id = sea_crew_scores.movement_id
      and vm.org_id = public.get_auth_org_id()
    )
  );

drop policy if exists "Tenant isolation for sea_crew_scores update" on sea_crew_scores;
create policy "Tenant isolation for sea_crew_scores update"
  on sea_crew_scores for update
  using (
    exists (
      select 1 from voyage_movements vm
      where vm.id = sea_crew_scores.movement_id
      and vm.org_id = public.get_auth_org_id()
    )
  );

drop policy if exists "Tenant isolation for sea_crew_scores delete" on sea_crew_scores;
create policy "Tenant isolation for sea_crew_scores delete"
  on sea_crew_scores for delete
  using (
    exists (
      select 1 from voyage_movements vm
      where vm.id = sea_crew_scores.movement_id
      and vm.org_id = public.get_auth_org_id()
    )
  );

-- Policies for watchkeeping_logs
drop policy if exists "Tenant isolation for watchkeeping_logs select" on watchkeeping_logs;
create policy "Tenant isolation for watchkeeping_logs select"
  on watchkeeping_logs for select
  using (
    exists (
      select 1 from sea_crew sc
      where sc.id = watchkeeping_logs.crew_id
      and sc.org_id = public.get_auth_org_id()
    )
  );

drop policy if exists "Tenant isolation for watchkeeping_logs insert" on watchkeeping_logs;
create policy "Tenant isolation for watchkeeping_logs insert"
  on watchkeeping_logs for insert
  with check (
    exists (
      select 1 from sea_crew sc
      where sc.id = watchkeeping_logs.crew_id
      and sc.org_id = public.get_auth_org_id()
    )
  );

drop policy if exists "Tenant isolation for watchkeeping_logs update" on watchkeeping_logs;
create policy "Tenant isolation for watchkeeping_logs update"
  on watchkeeping_logs for update
  using (
    exists (
      select 1 from sea_crew sc
      where sc.id = watchkeeping_logs.crew_id
      and sc.org_id = public.get_auth_org_id()
    )
  );

drop policy if exists "Tenant isolation for watchkeeping_logs delete" on watchkeeping_logs;
create policy "Tenant isolation for watchkeeping_logs delete"
  on watchkeeping_logs for delete
  using (
    exists (
      select 1 from sea_crew sc
      where sc.id = watchkeeping_logs.crew_id
      and sc.org_id = public.get_auth_org_id()
    )
  );

-- Policies for voyage_movement_reports
drop policy if exists "Tenant isolation for voyage_movement_reports select" on voyage_movement_reports;
create policy "Tenant isolation for voyage_movement_reports select"
  on voyage_movement_reports for select
  using (org_id = public.get_auth_org_id());

drop policy if exists "Tenant isolation for voyage_movement_reports insert" on voyage_movement_reports;
create policy "Tenant isolation for voyage_movement_reports insert"
  on voyage_movement_reports for insert
  with check (org_id = public.get_auth_org_id());

drop policy if exists "Tenant isolation for voyage_movement_reports update" on voyage_movement_reports;
create policy "Tenant isolation for voyage_movement_reports update"
  on voyage_movement_reports for update
  using (org_id = public.get_auth_org_id());

drop policy if exists "Tenant isolation for voyage_movement_reports delete" on voyage_movement_reports;
create policy "Tenant isolation for voyage_movement_reports delete"
  on voyage_movement_reports for delete
  using (org_id = public.get_auth_org_id());


-- ========================================================
-- MIGRATION: 0014_platform_indexing.sql
-- ========================================================

-- Migration 0014: Platform Hub Stats Indexing
-- Optimizes cross-org aggregate count queries for active movements across all modes

CREATE INDEX IF NOT EXISTS idx_trips_status_in_transit ON trips(status) WHERE status = 'in_transit';
CREATE INDEX IF NOT EXISTS idx_train_movements_status_in_transit ON train_movements(status) WHERE status = 'in_transit';
CREATE INDEX IF NOT EXISTS idx_flight_movements_status_in_transit ON flight_movements(status) WHERE status = 'in_transit';
CREATE INDEX IF NOT EXISTS idx_voyage_movements_status_in_transit ON voyage_movements(status) WHERE status = 'in_transit';


