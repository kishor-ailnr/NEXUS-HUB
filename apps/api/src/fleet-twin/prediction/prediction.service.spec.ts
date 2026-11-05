import { PredictionService } from './prediction.service';
import {
  MOCK_VEHICLES_DATA,
  MOCK_ROUTES_DATA,
  MOCK_CHECKPOINTS_DATA,
  MOCK_DRIVERS_DATA,
} from '../seed/mock-seed-data';
import { MockVehicle, MockRoute, MockDriver, MockCheckpoint } from '@nexus-ways/shared';

describe('PredictionService', () => {
  let service: PredictionService;
  const now = new Date('2026-11-05T06:00:00Z');

  const testVehicle: MockVehicle = {
    ...MOCK_VEHICLES_DATA[0],
    created_at: now.toISOString(),
  };

  const testRoute: MockRoute = {
    ...MOCK_ROUTES_DATA[0],
    created_at: now.toISOString(),
  };

  const testDriver: MockDriver = {
    ...MOCK_DRIVERS_DATA[0],
    created_at: now.toISOString(),
  };

  const testCheckpoints: MockCheckpoint[] = MOCK_CHECKPOINTS_DATA
    .filter((c) => c.route_id === testRoute.id)
    .map((c) => ({ ...c, created_at: now.toISOString() }));

  beforeEach(() => {
    service = new PredictionService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate deterministic timeline for identical inputs', async () => {
    const analysis1 = await service.generate48hTimeline(
      testVehicle,
      testRoute,
      testCheckpoints,
      testDriver,
      { rain_severity_multiplier: 1.0, toll_strike_hours: 0, breakdown_hours: 0 },
      now,
    );

    const analysis2 = await service.generate48hTimeline(
      testVehicle,
      testRoute,
      testCheckpoints,
      testDriver,
      { rain_severity_multiplier: 1.0, toll_strike_hours: 0, breakdown_hours: 0 },
      now,
    );

    expect(analysis1.totalDelayMinutes).toEqual(analysis2.totalDelayMinutes);
    expect(analysis1.events.length).toEqual(analysis2.events.length);
    expect(analysis1.predictedEta).toEqual(analysis2.predictedEta);
  });

  it('should scale weather delay when rain multiplier increases', async () => {
    const normal = await service.generate48hTimeline(
      testVehicle,
      testRoute,
      testCheckpoints,
      testDriver,
      { rain_severity_multiplier: 1.0, toll_strike_hours: 0, breakdown_hours: 0 },
      now,
    );

    const heavyRain = await service.generate48hTimeline(
      testVehicle,
      testRoute,
      testCheckpoints,
      testDriver,
      { rain_severity_multiplier: 2.5, toll_strike_hours: 0, breakdown_hours: 0 },
      now,
    );

    expect(heavyRain.totalDelayMinutes).toBeGreaterThanOrEqual(normal.totalDelayMinutes);
  });

  it('should inject breakdown event when breakdown_hours > 0', async () => {
    const withBreakdown = await service.generate48hTimeline(
      testVehicle,
      testRoute,
      testCheckpoints,
      testDriver,
      { rain_severity_multiplier: 1.0, toll_strike_hours: 0, breakdown_hours: 2.5 },
      now,
    );

    const breakdownEvent = withBreakdown.events.find((e) => e.event_type === 'inspection');
    expect(breakdownEvent).toBeDefined();
    expect(breakdownEvent?.delay_minutes).toBe(150);
  });

  it('should include driver rest events along the route', async () => {
    const analysis = await service.generate48hTimeline(
      testVehicle,
      testRoute,
      testCheckpoints,
      testDriver,
      { rain_severity_multiplier: 1.0, toll_strike_hours: 0, breakdown_hours: 0 },
      now,
    );

    const restEvents = analysis.events.filter((e) => e.event_type === 'driver_break');
    expect(restEvents.length).toBeGreaterThan(0);
  });
});

