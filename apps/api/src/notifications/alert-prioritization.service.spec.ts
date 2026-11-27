import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AlertPrioritizationService, RawAlertInput } from './alert-prioritization.service';

describe('AlertPrioritizationService', () => {
  let service: AlertPrioritizationService;
  let mockSupabase: any;
  let mockFleetTwin: any;

  beforeEach(() => {
    mockSupabase = {
      adminClient: {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'alerts') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    limit: jest.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
              update: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ error: null }),
                }),
              }),
            };
          }
          if (table === 'drivers') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({
                    data: [{ id: 'drv-1', license_number: 'TN-DRV-01' }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'users') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: { full_name: 'Karthik Raj' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      },
    };

    mockFleetTwin = {
      isEnabled: jest.fn().mockReturnValue(true),
      getOverview: jest.fn().mockResolvedValue({
        enabled: true,
        timestamp: '2026-11-27T01:00:00Z',
        vehicles: [
          {
            id: 'veh-1',
            registration_number: 'TN 38 FF 2345',
            current_lat: 11.01,
            current_lng: 76.95,
            driver: { name: 'Karthik Raj', license_number: 'TN-DRV-01' },
            live_traffic: {
              lat: 11.01,
              lng: 76.95,
              road_segment: 'NH-544 Coimbatore Bypass',
              current_speed_kmh: 18,
              free_flow_speed_kmh: 65,
              congestion_level: 'heavy',
              speed_reduction_pct: 72,
              estimated_delay_minutes: 35,
              road_closure: false,
              confidence_pct: 96,
              data_source: 'TomTom Traffic API',
              provenance: 'LIVE_TOMTOM',
              observed_at: '2026-11-27T01:00:00Z',
            },
          },
          {
            id: 'veh-2',
            registration_number: 'MH 01 CD 9999',
            current_lat: 19.07,
            current_lng: 72.87,
            driver: { name: 'Suresh Kumar', license_number: 'MH-DRV-02' },
          },
        ],
        alerts: [
          {
            vehicle_id: 'veh-1',
            registration_number: 'TN 38 FF 2345',
            event_type: 'weather',
            severity: 'critical',
            delay_minutes: 40,
            description: 'Torrential rainfall downpour with highway surface pooling',
            location_name: 'Salem Ghat',
            hours_from_now: 0.5,
          },
          {
            vehicle_id: 'veh-2',
            registration_number: 'MH 01 CD 9999',
            event_type: 'eta',
            severity: 'low',
            delay_minutes: 5,
            description: 'Minor 5m corridor slowdown',
            location_name: 'Panvel',
            hours_from_now: 3.0,
          },
        ],
      }),
    };

    service = new AlertPrioritizationService(mockSupabase, mockFleetTwin);
  });

  it('ranks P1 safety-critical alerts above P2, P3, P4 regardless of newer timestamps', () => {
    const inputs: RawAlertInput[] = [
      {
        id: 'low-new',
        source: 'db_alert',
        rawType: 'eta',
        severity: 'low',
        message: 'Minor 5m delay',
        detectedAt: '2026-11-27T07:00:00Z',
        delayMinutes: 5,
        dataSource: 'DB',
        dataFreshness: 'LIVE',
      },
      {
        id: 'p1-old-safety',
        source: 'fleet_twin',
        rawType: 'weather',
        severity: 'critical',
        message: 'Torrential rainfall and severe visibility hazard',
        vehicleId: 'veh-1',
        detectedAt: '2026-11-27T05:00:00Z',
        hoursFromNow: 0.5,
        delayMinutes: 25,
        dataSource: 'Open-Meteo',
        dataFreshness: 'FORECAST',
      },
      {
        id: 'p2-traffic',
        source: 'live_traffic',
        rawType: 'traffic',
        severity: 'high',
        message: 'Heavy congestion +35m delay',
        vehicleId: 'veh-2',
        detectedAt: '2026-11-27T06:30:00Z',
        hoursFromNow: 0,
        delayMinutes: 35,
        dataSource: 'TomTom',
        dataFreshness: 'LIVE_TOMTOM',
      },
    ];

    const sorted = service.prioritizeAndDeduplicate(inputs);
    expect(sorted[0].id).toBe('p1-old-safety');
    expect(sorted[0].priority).toBe('P1');
    expect(sorted[0].isSafetyCritical).toBe(true);
    expect(sorted[1].id).toBe('p2-traffic');
    expect(sorted[1].priority).toBe('P2');
    expect(sorted[2].id).toBe('low-new');
    expect(sorted[2].priority).toBe('P4');
  });

  it('places safety-critical P1 incidents above non-safety operational P1 incidents', () => {
    const inputs: RawAlertInput[] = [
      {
        id: 'p1-ops',
        source: 'db_alert',
        rawType: 'eta',
        severity: 'critical',
        message: 'Critical SLA breach 90m delay',
        vehicleId: 'veh-2',
        detectedAt: '2026-11-27T06:00:00Z',
        delayMinutes: 90,
        dataSource: 'DB',
        dataFreshness: 'LIVE',
      },
      {
        id: 'p1-safety',
        source: 'fleet_twin',
        rawType: 'hos_violation',
        severity: 'critical',
        message: 'Dangerous HOS violation exceeded limit',
        vehicleId: 'veh-1',
        detectedAt: '2026-11-27T06:15:00Z',
        delayMinutes: 10,
        dataSource: 'HOS',
        dataFreshness: 'LIVE',
      },
    ];

    const sorted = service.prioritizeAndDeduplicate(inputs);
    expect(sorted[0].id).toBe('p1-safety');
    expect(sorted[0].isSafetyCritical).toBe(true);
    expect(sorted[1].id).toBe('p1-ops');
  });

  it('ranks more urgent alerts higher within the same priority tier', () => {
    const inputs: RawAlertInput[] = [
      {
        id: 'p2-later',
        source: 'fleet_twin',
        rawType: 'traffic',
        severity: 'high',
        message: 'Heavy traffic +30m delay',
        vehicleId: 'veh-1',
        location: 'Loc A',
        detectedAt: '2026-11-27T06:00:00Z',
        hoursFromNow: 5,
        delayMinutes: 30,
        dataSource: 'TomTom',
        dataFreshness: 'LIVE_TOMTOM',
      },
      {
        id: 'p2-soon',
        source: 'fleet_twin',
        rawType: 'traffic',
        severity: 'high',
        message: 'Heavy traffic +30m delay',
        vehicleId: 'veh-2',
        location: 'Loc B',
        detectedAt: '2026-11-27T06:00:00Z',
        hoursFromNow: 0.2,
        delayMinutes: 30,
        dataSource: 'TomTom',
        dataFreshness: 'LIVE_TOMTOM',
      },
    ];

    const sorted = service.prioritizeAndDeduplicate(inputs);
    expect(sorted[0].id).toBe('p2-soon');
  });

  it('deduplicates identical ongoing incidents and escalates priority when severity worsens', () => {
    const inputs: RawAlertInput[] = [
      {
        id: 'dup-1',
        source: 'fleet_twin',
        rawType: 'weather',
        severity: 'medium',
        message: 'Moderate rain +10m delay',
        vehicleId: 'veh-1',
        location: 'Salem Ghat',
        detectedAt: '2026-11-27T05:00:00Z',
        delayMinutes: 10,
        dataSource: 'Open-Meteo',
        dataFreshness: 'FORECAST',
      },
      {
        id: 'dup-2',
        source: 'fleet_twin',
        rawType: 'weather',
        severity: 'critical',
        message: 'Torrential rainfall +40m delay',
        vehicleId: 'veh-1',
        location: 'Salem Ghat',
        detectedAt: '2026-11-27T05:30:00Z',
        delayMinutes: 40,
        dataSource: 'Open-Meteo',
        dataFreshness: 'FORECAST',
      },
    ];

    const sorted = service.prioritizeAndDeduplicate(inputs);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].priority).toBe('P1');
    expect(sorted[0].estimatedDelayMinutes).toBe(40);
  });

  it('keeps acknowledged alerts in the active queue and moves resolved alerts out of active queue', async () => {
    const initial = await service.getPrioritizedAlerts('org-1', 'admin-1', 'admin', 'active');
    const target = initial.alerts[0];
    expect(target.state).toBe('NEW');

    // Acknowledge -> remains active (NOT auto-resolved)
    const acked = await service.updateLifecycle('org-1', 'admin-1', 'admin', 'Admin', target.id, {
      action: 'acknowledge',
    });
    expect(acked.state).toBe('ACKNOWLEDGED');

    const afterAck = await service.getPrioritizedAlerts('org-1', 'admin-1', 'admin', 'active');
    expect(afterAck.alerts.some((a) => a.id === target.id && a.state === 'ACKNOWLEDGED')).toBe(true);

    // Resolve -> leaves active queue, appears in resolved filter
    const resolved = await service.updateLifecycle('org-1', 'admin-1', 'admin', 'Admin', target.id, {
      action: 'resolve',
      note: 'Rerouted safely',
    });
    expect(resolved.state).toBe('RESOLVED');
    expect(resolved.resolutionNotes).toBe('Rerouted safely');

    const afterResolveActive = await service.getPrioritizedAlerts('org-1', 'admin-1', 'admin', 'active');
    expect(afterResolveActive.alerts.some((a) => a.id === target.id)).toBe(false);

    const resolvedList = await service.getPrioritizedAlerts('org-1', 'admin-1', 'admin', 'resolved');
    expect(resolvedList.alerts.some((a) => a.id === target.id)).toBe(true);
  });

  it('enforces driver-only vehicle isolation and blocks driver from resolving/assigning incidents', async () => {
    const driverRes = await service.getPrioritizedAlerts('org-1', 'driver-user-1', 'driver', 'active');
    expect(driverRes.alerts.every((a) => a.vehicleId === 'veh-1')).toBe(true);

    await expect(
      service.updateLifecycle('org-1', 'driver-user-1', 'driver', 'Karthik', driverRes.alerts[0].id, {
        action: 'resolve',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when updating lifecycle for missing alert', async () => {
    await expect(
      service.updateLifecycle('org-1', 'admin-1', 'admin', 'Admin', 'non-existent-id', {
        action: 'acknowledge',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
