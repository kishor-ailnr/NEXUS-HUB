-- ========================================================
-- MIGRATION 0015: FLEET DIGITAL TWIN (ROADWAYS MOCK MODULE)
-- Removable module with mock_* prefix. All rows have is_mock=true.
-- ========================================================

-- 1. Mock Fleets
CREATE TABLE IF NOT EXISTS public.mock_fleets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  region TEXT NOT NULL,
  base_hub TEXT NOT NULL,
  vehicle_count INT DEFAULT 0,
  is_mock BOOLEAN NOT NULL DEFAULT true,
  seed_batch_id TEXT NOT NULL DEFAULT 'batch_v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Mock Drivers
CREATE TABLE IF NOT EXISTS public.mock_drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  license_number TEXT NOT NULL,
  license_type TEXT NOT NULL DEFAULT 'HMV',
  experience_years INT NOT NULL DEFAULT 5,
  rating NUMERIC(3,2) NOT NULL DEFAULT 4.5,
  shift_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  hours_driven_today NUMERIC(4,2) NOT NULL DEFAULT 0,
  max_daily_hours NUMERIC(4,2) NOT NULL DEFAULT 10,
  rest_hours_compliance TEXT NOT NULL DEFAULT 'compliant',
  is_mock BOOLEAN NOT NULL DEFAULT true,
  seed_batch_id TEXT NOT NULL DEFAULT 'batch_v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Mock Routes
CREATE TABLE IF NOT EXISTS public.mock_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  corridor TEXT NOT NULL,
  origin_city TEXT NOT NULL,
  destination_city TEXT NOT NULL,
  total_distance_km NUMERIC(7,2) NOT NULL,
  base_duration_hours NUMERIC(5,2) NOT NULL,
  planned_departure TIMESTAMPTZ NOT NULL,
  planned_eta TIMESTAMPTZ NOT NULL,
  highway_numbers TEXT[] DEFAULT '{}',
  is_mock BOOLEAN NOT NULL DEFAULT true,
  seed_batch_id TEXT NOT NULL DEFAULT 'batch_v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Mock Checkpoints
CREATE TABLE IF NOT EXISTS public.mock_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES public.mock_routes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  distance_from_start_km NUMERIC(7,2) NOT NULL,
  planned_arrival_minutes INT NOT NULL,
  avg_halt_minutes INT NOT NULL DEFAULT 5,
  sequence_order INT NOT NULL,
  is_mock BOOLEAN NOT NULL DEFAULT true,
  seed_batch_id TEXT NOT NULL DEFAULT 'batch_v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Mock Vehicles
CREATE TABLE IF NOT EXISTS public.mock_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id UUID NOT NULL REFERENCES public.mock_fleets(id) ON DELETE CASCADE,
  registration_number TEXT NOT NULL UNIQUE,
  truck_type TEXT NOT NULL,
  capacity_tons NUMERIC(5,2) NOT NULL,
  fuel_type TEXT NOT NULL DEFAULT 'Diesel',
  current_load_tons NUMERIC(5,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'idle',
  current_lat DOUBLE PRECISION NOT NULL,
  current_lng DOUBLE PRECISION NOT NULL,
  progress_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  speed_kmh NUMERIC(5,2) NOT NULL DEFAULT 0,
  driver_id UUID REFERENCES public.mock_drivers(id) ON DELETE SET NULL,
  route_id UUID REFERENCES public.mock_routes(id) ON DELETE SET NULL,
  is_mock BOOLEAN NOT NULL DEFAULT true,
  seed_batch_id TEXT NOT NULL DEFAULT 'batch_v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Mock Predictions
CREATE TABLE IF NOT EXISTS public.mock_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.mock_vehicles(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  hours_from_now NUMERIC(5,2) NOT NULL,
  checkpoint_id UUID REFERENCES public.mock_checkpoints(id) ON DELETE SET NULL,
  location_name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  delay_minutes INT NOT NULL DEFAULT 0,
  confidence_pct INT NOT NULL DEFAULT 85,
  severity TEXT NOT NULL DEFAULT 'low',
  details JSONB DEFAULT '{}'::jsonb,
  is_mock BOOLEAN NOT NULL DEFAULT true,
  seed_batch_id TEXT NOT NULL DEFAULT 'batch_v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Mock Reroutes
CREATE TABLE IF NOT EXISTS public.mock_reroutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.mock_vehicles(id) ON DELETE CASCADE,
  original_route_id UUID NOT NULL REFERENCES public.mock_routes(id) ON DELETE CASCADE,
  recommended_route_name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'balanced',
  time_saved_minutes INT NOT NULL DEFAULT 0,
  extra_distance_km NUMERIC(6,2) NOT NULL DEFAULT 0,
  fuel_cost_delta_inr NUMERIC(8,2) NOT NULL DEFAULT 0,
  toll_cost_delta_inr NUMERIC(8,2) NOT NULL DEFAULT 0,
  risk_score_delta INT NOT NULL DEFAULT 0,
  new_eta TIMESTAMPTZ NOT NULL,
  meeting_deadline_prob INT NOT NULL DEFAULT 90,
  route_waypoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  alternate_corridor TEXT NOT NULL,
  reason TEXT NOT NULL,
  trigger_checkpoint_name TEXT NOT NULL,
  trigger_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted BOOLEAN NOT NULL DEFAULT false,
  is_mock BOOLEAN NOT NULL DEFAULT true,
  seed_batch_id TEXT NOT NULL DEFAULT 'batch_v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mock_vehicles_fleet ON public.mock_vehicles(fleet_id);
CREATE INDEX IF NOT EXISTS idx_mock_vehicles_driver ON public.mock_vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_mock_vehicles_route ON public.mock_vehicles(route_id);
CREATE INDEX IF NOT EXISTS idx_mock_checkpoints_route ON public.mock_checkpoints(route_id);
CREATE INDEX IF NOT EXISTS idx_mock_predictions_vehicle ON public.mock_predictions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_mock_reroutes_vehicle ON public.mock_reroutes(vehicle_id);

-- Enable RLS
ALTER TABLE public.mock_fleets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_reroutes ENABLE ROW LEVEL SECURITY;

-- Allow read for authenticated users, full access for service_role
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow read mock_fleets" ON public.mock_fleets;
  CREATE POLICY "Allow read mock_fleets" ON public.mock_fleets FOR SELECT TO authenticated, anon USING (true);

  DROP POLICY IF EXISTS "Allow read mock_drivers" ON public.mock_drivers;
  CREATE POLICY "Allow read mock_drivers" ON public.mock_drivers FOR SELECT TO authenticated, anon USING (true);

  DROP POLICY IF EXISTS "Allow read mock_routes" ON public.mock_routes;
  CREATE POLICY "Allow read mock_routes" ON public.mock_routes FOR SELECT TO authenticated, anon USING (true);

  DROP POLICY IF EXISTS "Allow read mock_checkpoints" ON public.mock_checkpoints;
  CREATE POLICY "Allow read mock_checkpoints" ON public.mock_checkpoints FOR SELECT TO authenticated, anon USING (true);

  DROP POLICY IF EXISTS "Allow read mock_vehicles" ON public.mock_vehicles;
  CREATE POLICY "Allow read mock_vehicles" ON public.mock_vehicles FOR SELECT TO authenticated, anon USING (true);

  DROP POLICY IF EXISTS "Allow read mock_predictions" ON public.mock_predictions;
  CREATE POLICY "Allow read mock_predictions" ON public.mock_predictions FOR SELECT TO authenticated, anon USING (true);

  DROP POLICY IF EXISTS "Allow read mock_reroutes" ON public.mock_reroutes;
  CREATE POLICY "Allow read mock_reroutes" ON public.mock_reroutes FOR SELECT TO authenticated, anon USING (true);
END $$;

