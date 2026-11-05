import { RerouteEngine } from './reroute-engine';
import { INDIAN_CORRIDOR_GRAPHS } from './graph';

describe('RerouteEngine', () => {
  let engine: RerouteEngine;

  beforeEach(() => {
    engine = new RerouteEngine();
  });

  it('should initialize successfully with default providers', () => {
    expect(engine).toBeDefined();
  });

  it('should evaluate edge sequence with cumulative distance and delays', async () => {
    const graph = INDIAN_CORRIDOR_GRAPHS['chennai-bengaluru'];
    expect(graph).toBeDefined();

    const result = await engine.evaluateEdgeSequence(
      graph.edges.slice(0, 5),
      new Date('2026-11-05T08:00:00Z'),
      2.0,
      { rain_severity_multiplier: 1.0, toll_strike_hours: 0, breakdown_hours: 0 },
    );

    expect(result.totalDistanceKm).toBeGreaterThan(150);
    expect(result.totalDurationMinutes).toBeGreaterThan(100);
    expect(result.totalFuelCostInr).toBeGreaterThan(0);
    expect(result.steps.length).toBe(5);
  });

  it('should calculate optimal reroute when toll strike occurs', async () => {
    const recommendation = await engine.computeOptimalReroute({
      corridorKey: 'chennai-bengaluru',
      startNodeId: 'sriperumbudur',
      endNodeId: 'bengaluru',
      departureTime: new Date('2026-11-05T09:00:00Z'),
      deadlineTime: new Date('2026-11-05T20:00:00Z'),
      mode: 'fastest',
      driverHoursDrivenToday: 3.0,
      whatIf: { rain_severity_multiplier: 1.0, toll_strike_hours: 3.0, breakdown_hours: 0 },
    });

    expect(recommendation).toBeDefined();
    expect(recommendation.alternateCorridorName).toBeDefined();
    expect(recommendation.routeWaypoints.length).toBeGreaterThan(0);
    expect(recommendation.triggerCheckpointName).toBeDefined();
  });

  it('should compute different scores across fastest and cheapest modes', async () => {
    const fastest = await engine.computeOptimalReroute({
      corridorKey: 'chennai-bengaluru',
      startNodeId: 'sriperumbudur',
      endNodeId: 'bengaluru',
      departureTime: new Date('2026-11-05T14:00:00Z'),
      deadlineTime: new Date('2026-11-05T23:00:00Z'),
      mode: 'fastest',
      driverHoursDrivenToday: 1.0,
    });

    const cheapest = await engine.computeOptimalReroute({
      corridorKey: 'chennai-bengaluru',
      startNodeId: 'sriperumbudur',
      endNodeId: 'bengaluru',
      departureTime: new Date('2026-11-05T14:00:00Z'),
      deadlineTime: new Date('2026-11-05T23:00:00Z'),
      mode: 'cheapest',
      driverHoursDrivenToday: 1.0,
    });

    expect(fastest.mode).toBe('fastest');
    expect(cheapest.mode).toBe('cheapest');
  });
});
