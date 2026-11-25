import { describe, it, expect } from 'vitest';
import {
  haversineMeters,
  projectPointOnSegment,
  calculateRouteProgress,
} from '../routeProgress';

describe('routeProgress utility', () => {
  it('calculates Haversine distance between two coordinates', () => {
    // Mumbai (19.076, 72.8777) to Pune (18.5204, 73.8567) is roughly 120km straight line
    const meters = haversineMeters(19.076, 72.8777, 18.5204, 73.8567);
    expect(meters).toBeGreaterThan(115000);
    expect(meters).toBeLessThan(130000);
  });

  it('projects point onto line segment accurately', () => {
    // Segment from (10.0, 10.0) to (10.0, 12.0)
    // Query point at (10.1, 11.0) should project onto (10.0, 11.0) with t approx 0.5
    const proj = projectPointOnSegment(10.1, 11.0, 10.0, 10.0, 10.0, 12.0);
    expect(proj.t).toBeCloseTo(0.5, 2);
    expect(proj.snapLat).toBeCloseTo(10.0, 3);
    expect(proj.snapLng).toBeCloseTo(11.0, 3);
  });

  it('splits route at start (0% progress)', () => {
    const route: [number, number][] = [
      [19.0, 72.8],
      [19.1, 72.9],
      [19.2, 73.0],
    ];
    // Vehicle right at start
    const res = calculateRouteProgress(route, 19.0, 72.8);
    expect(res.progressPercent).toBeCloseTo(0, 1);
    expect(res.travelledCoordinates.length).toBeGreaterThanOrEqual(1);
    expect(res.remainingCoordinates.length).toBe(3);
    // Boundary point connects seamlessly
    expect(res.travelledCoordinates[res.travelledCoordinates.length - 1]).toEqual(
      res.remainingCoordinates[0],
    );
  });

  it('splits route at midpoint (approx 50% progress)', () => {
    const route: [number, number][] = [
      [19.0, 72.0],
      [19.0, 73.0],
      [19.0, 74.0],
    ];
    // Vehicle right at middle waypoint [19.0, 73.0]
    const res = calculateRouteProgress(route, 19.0, 73.0);
    expect(res.progressPercent).toBeCloseTo(50, 0);
    expect(res.travelledDistanceKm).toBeGreaterThan(0);
    expect(res.remainingDistanceKm).toBeGreaterThan(0);
    // Boundary point connects seamlessly
    expect(res.travelledCoordinates[res.travelledCoordinates.length - 1]).toEqual(
      res.remainingCoordinates[0],
    );
  });

  it('splits route at 25% along first segment', () => {
    const route: [number, number][] = [
      [19.0, 72.0],
      [19.0, 74.0],
    ];
    // Vehicle at 25% (72.5)
    const res = calculateRouteProgress(route, 19.0, 72.5);
    expect(res.progressPercent).toBeCloseTo(25, 0);
    expect(res.remainingDistanceKm).toBeGreaterThan(res.travelledDistanceKm);
    expect(res.travelledCoordinates[res.travelledCoordinates.length - 1]).toEqual(
      res.remainingCoordinates[0],
    );
  });

  it('marks 100% progress when reaching destination', () => {
    const route: [number, number][] = [
      [19.0, 72.0],
      [19.0, 73.0],
      [19.0, 74.0],
    ];
    // Vehicle at destination [19.0, 74.0]
    const res = calculateRouteProgress(route, 19.0, 74.0);
    expect(res.progressPercent).toBe(100);
    expect(res.remainingDistanceKm).toBe(0);
    expect(res.travelledDistanceKm).toBe(res.totalDistanceKm);
  });

  it('applies monotonic progress smoothing against minor GPS noise', () => {
    const route: [number, number][] = [
      [19.0, 72.0],
      [19.0, 74.0],
    ];
    // Progress at 50 km
    const res1 = calculateRouteProgress(route, 19.0, 72.5);
    const prevKm = res1.travelledDistanceKm;

    // Small jitter: GPS temporarily flickers 20m backwards
    const jitterLat = 19.0;
    const jitterLng = 72.5 - 0.00015; // ~16 meters back
    const res2 = calculateRouteProgress(route, jitterLat, jitterLng, prevKm);

    // Confirmed progress holds steady, does not bounce backward
    expect(res2.travelledDistanceKm).toBeGreaterThanOrEqual(prevKm);
  });
});

