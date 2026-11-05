-- ========================================================
-- DOWN MIGRATION 0015: REVERT FLEET DIGITAL TWIN MOCK TABLES
-- Drops all mock_* tables created for the Fleet Twin module.
-- ========================================================

DROP TABLE IF EXISTS public.mock_reroutes CASCADE;
DROP TABLE IF EXISTS public.mock_predictions CASCADE;
DROP TABLE IF EXISTS public.mock_checkpoints CASCADE;
DROP TABLE IF EXISTS public.mock_vehicles CASCADE;
DROP TABLE IF EXISTS public.mock_routes CASCADE;
DROP TABLE IF EXISTS public.mock_drivers CASCADE;
DROP TABLE IF EXISTS public.mock_fleets CASCADE;

