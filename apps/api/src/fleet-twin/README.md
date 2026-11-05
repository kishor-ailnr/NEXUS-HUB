# NEXUS WAYS - Roadways Fleet Digital Twin Module (Mock / Simulated)

The **Fleet Digital Twin** is an isolated, removable simulation module for Indian road freight logistics. It delivers:
- Multi-fleet monitoring across 4 prominent logistics networks.
- 24 live-simulated heavy commercial freight vehicles with real telemetry attributes (load, speed, progress, driver hours).
- Deterministic 48-hour future prediction timeline (weather impacts across Western Ghats/monsoon, FASTag toll queues, city bypass bottlenecks, mandatory driver rest intervals, refueling stops, and mountain ghat slowdowns).
- Interactive procedural 3D animated event scenes (low-poly toll gates, rain/fog particle systems, traffic queues, night dhaba rest stops) with 2D fallback.
- Time-dependent A*/Dijkstra optimal rerouting engine on alternate Indian national highway corridors.
- Interactive "What-If" scenario sliders (rain severity, toll strikes, mechanical breakdowns).
- Three-tier mock data lifecycle management (Admin UI purge button, REST endpoint `DELETE /api/fleet-twin/mock`, and CLI command `npm run fleet-twin:purge`).

---

## 🚀 Environment & Feature Flag

The entire module is controlled by a single backend environment variable:

```env
FLEET_TWIN_ENABLED=true
```

- When `true` (default): All endpoints and frontend features operate normally.
- When `false`:
  - `GET /api/fleet-twin/status` returns `{ enabled: false }`.
  - All other `/api/fleet-twin/*` endpoints return HTTP `404 Not Found`.
  - The frontend dynamically hides the "Fleet Digital Twin" navigation pill and vehicle deep-links without needing a frontend rebuild.

---

## 📡 API Endpoints

All endpoints are mounted under `/api/fleet-twin`:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/fleet-twin/status` | Module status, active vehicle/fleet count, expiration date |
| `GET` | `/api/fleet-twin/fleets` | List of mock logistics fleets |
| `GET` | `/api/fleet-twin/fleets/:id/vehicles` | Vehicles belonging to a specific fleet |
| `GET` | `/api/fleet-twin/vehicles` | All 24 simulated vehicles |
| `GET` | `/api/fleet-twin/vehicles/:id` | Vehicle details with driver and route populated |
| `GET` | `/api/fleet-twin/vehicles/:id/checkpoints` | Checkpoints along vehicle corridor |
| `GET` | `/api/fleet-twin/vehicles/:id/prediction` | Full 48h timeline with delay breakdown and risk metrics |
| `POST` | `/api/fleet-twin/vehicles/:id/reroute` | Evaluates alternate corridor options (`fastest`, `cheapest`, etc.) |
| `POST` | `/api/fleet-twin/vehicles/:id/reroute/accept` | Accepts recommended reroute |
| `POST` | `/api/fleet-twin/vehicles/:id/reroute/revert` | Reverts back to original highway route |
| `POST` | `/api/fleet-twin/seed` | Idempotently populates mock database and cache |
| `DELETE` | `/api/fleet-twin/mock` | Purges all mock data |

---

## 🛠️ CLI Utilities

From the repository root or `apps/api`:

```bash
# Idempotently seed mock data
npm run fleet-twin:seed --workspace=@nexus-ways/api

# Completely purge all mock data
npm run fleet-twin:purge --workspace=@nexus-ways/api
```

---

## 🗑️ Complete Uninstallation / Removal Guide

Because this feature adheres to strict isolation rules, removing it completely takes under 2 minutes:

### 1. Drop Database Tables
Run the DOWN migration via Supabase SQL editor or CLI:
```bash
# Execute supabase/migrations/0015_fleet_twin_mock_down.sql
```
*(Alternatively, run `npm run fleet-twin:purge`)*

### 2. Delete New Folders
Delete only the dedicated fleet-twin folders:
- `packages/shared/src/fleet-twin/`
- `apps/api/src/fleet-twin/`
- `apps/web/src/features/fleet-twin/`
- `supabase/migrations/0015_fleet_twin_mock.sql`
- `supabase/migrations/0015_fleet_twin_mock_down.sql`

### 3. Remove Single-Block Comments
In the 5 modified files, remove the single blocks marked `// FLEET-TWIN (mock) - removable`:
1. `packages/shared/src/index.ts`
2. `apps/api/src/app.module.ts`
3. `apps/api/package.json`
4. `apps/web/src/App.tsx`
5. `apps/web/src/components/VehicleSidebar.tsx`

### 4. Verify Monorepo Build
```bash
npm run build --workspace=@nexus-ways/shared
npm run build --workspace=@nexus-ways/api
npm run build --workspace=@nexus-ways/web
```
Everything is cleanly uninstalled with zero residual footprint!

