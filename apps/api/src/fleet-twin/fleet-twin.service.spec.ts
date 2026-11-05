import { FleetTwinService } from './fleet-twin.service';
import { PredictionService } from './prediction/prediction.service';
import { MOCK_VEHICLES_DATA } from './seed/mock-seed-data';

describe('FleetTwinService', () => {
  let service: FleetTwinService;
  let predictionService: PredictionService;

  beforeEach(() => {
    predictionService = new PredictionService();
    // Pass null for SupabaseService to test in-memory resilient fallback
    service = new FleetTwinService(null as any, predictionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should report status with enabled flag and fleet counts', async () => {
    const status = await service.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.total_fleets).toBe(4);
    expect(status.total_vehicles).toBe(24);
    expect(status.is_expired).toBe(false);
  });

  it('should return all 4 fleets', async () => {
    const fleets = await service.getFleets();
    expect(fleets.length).toBe(4);
    expect(fleets[0].name).toContain('BlueDart');
  });

  it('should return 24 vehicles with populated driver and route', async () => {
    const vehicles = await service.getAllVehicles();
    expect(vehicles.length).toBe(24);
    expect(vehicles[0].driver).toBeDefined();
    expect(vehicles[0].route).toBeDefined();
    expect(vehicles[0].fleet).toBeDefined();
  });

  it('should aggregate digital twin hero data for a vehicle', async () => {
    const vId = MOCK_VEHICLES_DATA[0].id;
    const twin = await service.getVehicleDigitalTwin(vId);

    expect(twin.vehicle.id).toBe(vId);
    expect(twin.driver).toBeDefined();
    expect(twin.route).toBeDefined();
    expect(twin.timeline.length).toBeGreaterThan(0);
    expect(twin.risk_score).toBeGreaterThanOrEqual(0);
    expect(twin.risk_score).toBeLessThanOrEqual(100);
    expect(twin.on_time_probability).toBeGreaterThan(0);
  });

  it('should calculate, accept and revert alternate corridor reroute', async () => {
    const vId = MOCK_VEHICLES_DATA[0].id;
    const reroute = await service.calculateReroute(vId, 'fastest');

    expect(reroute).toBeDefined();
    expect(reroute.vehicle_id).toBe(vId);
    expect(reroute.accepted).toBe(false);

    const acceptRes = await service.acceptReroute(vId);
    expect(acceptRes.success).toBe(true);
    expect(acceptRes.reroute.accepted).toBe(true);

    const revertRes = await service.revertReroute(vId);
    expect(revertRes.success).toBe(true);
  });

  it('should handle purge and seed idempotency cleanly', async () => {
    const purgeRes = await service.purgeData();
    expect(purgeRes.success).toBe(true);

    let fleets = await service.getFleets();
    expect(fleets.length).toBe(0);

    const seedRes = await service.seedData();
    expect(seedRes.success).toBe(true);
    expect(seedRes.counts.fleets).toBe(4);
    expect(seedRes.counts.vehicles).toBe(24);

    fleets = await service.getFleets();
    expect(fleets.length).toBe(4);
  });
});

