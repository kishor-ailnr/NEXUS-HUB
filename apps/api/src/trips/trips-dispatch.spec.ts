import { BadRequestException } from '@nestjs/common';
import { TripsService } from './trips.service';
import { VehiclesService } from '../vehicles/vehicles.service';

describe('Fleet Dispatch, Trip Lifecycle & Resource Management', () => {
  const orgId = 'org-1';

  const makeMockTripsService = (overrides: {
    vehicle?: any;
    driver?: any;
    activeTrips?: any[];
    allTrips?: any[];
    createdTrip?: any;
  } = {}) => {
    const vehicle = overrides.vehicle ?? {
      id: 'veh-1',
      org_id: orgId,
      registration_number: 'TN-38-FF-2345',
      vehicle_type: 'Heavy Truck',
      status: 'idle',
      capacity_kg: 15000,
    };
    const driver = overrides.driver ?? {
      id: 'drv-1',
      org_id: orgId,
      status: 'available',
      user: { id: 'u-1', full_name: 'Ravi Kumar', email: 'ravi@nexus.in' },
    };
    const createdTrip = overrides.createdTrip ?? {
      id: 'trip-new-1',
      org_id: orgId,
      vehicle_id: vehicle.id,
      driver_id: driver.id,
      origin_label: 'Chennai',
      destination_label: 'Bengaluru',
      origin_lat: 13.0827,
      origin_lng: 80.2707,
      destination_lat: 12.9716,
      destination_lng: 77.5946,
      status: 'planned',
      distance_km: 346,
      eta_minutes: 360,
      created_at: new Date().toISOString(),
      vehicle,
      driver,
    };

    const mockSupabase: any = {
      adminClient: {
        from: jest.fn((table: string) => {
          if (table === 'vehicles') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({ data: vehicle, error: null }),
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
                  eq: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({ data: driver, error: null }),
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
          if (table === 'trips') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  in: jest.fn().mockResolvedValue({
                    data: overrides.activeTrips ?? [],
                    error: null,
                  }),
                  eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: createdTrip, error: null }),
                    maybeSingle: jest.fn().mockResolvedValue({ data: createdTrip, error: null }),
                  }),
                  order: jest.fn().mockResolvedValue({
                    data: overrides.allTrips ?? [createdTrip],
                    error: null,
                  }),
                }),
              }),
              insert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({ data: createdTrip, error: null }),
                }),
              }),
              update: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    select: jest.fn().mockReturnValue({
                      single: jest.fn().mockResolvedValue({
                        data: { ...createdTrip, status: 'completed', completed_at: new Date().toISOString() },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'saved_routes') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
              upsert: jest.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === 'trip_checkpoints') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  order: jest.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
              insert: jest.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === 'trips') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockImplementation((_col: string, vehId: string) => ({
                  in: jest.fn().mockImplementation(() => {
                    const active = vehId === 'v2' ? [{ id: 't-act', status: 'in_transit' }] : [];
                    return Object.assign(Promise.resolve({ data: active, error: null }), {
                      order: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                          maybeSingle: jest.fn().mockResolvedValue({ data: active[0] || null, error: null }),
                        }),
                      }),
                    });
                  }),
                })),
              }),
            };
          }
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                in: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                  }),
                }),
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          };
        }),
      },
    };

    const mockGeocoding: any = {
      geocodeAddress: jest.fn(async (addr: string) => {
        if (addr.toLowerCase().includes('chennai')) {
          return { latitude: 13.0827, longitude: 80.2707, displayName: 'Chennai, Tamil Nadu' };
        }
        return { latitude: 12.9716, longitude: 77.5946, displayName: 'Bengaluru, Karnataka' };
      }),
    };

    const mockRouting: any = {
      getRoute: jest.fn().mockResolvedValue({
        routing_source: 'osrm',
        coordinates: [
          [80.2707, 13.0827],
          [79.1325, 12.9165],
          [78.4867, 12.7409],
          [77.5946, 12.9716],
        ],
        distance_km: 346,
        duration_minutes: 360,
      }),
    };

    const mockSimulation: any = {
      startSimulation: jest.fn(),
      stopSimulation: jest.fn(),
    };

    const mockGateway: any = {
      emitTripStatusChanged: jest.fn(),
      emitGpsUpdate: jest.fn(),
    };

    const mockEta: any = {
      calculateTripEta: jest.fn().mockResolvedValue({
        plannedDurationMinutes: 360,
        predictedDurationMinutes: 375,
      }),
    };

    const mockToll: any = {
      calculateTripToll: jest.fn().mockReturnValue({
        tollEstimateInr: 1450,
        tollPlazas: [
          { name: 'Sriperumbudur Toll Plaza', lat: 12.96, lng: 79.94, feeInr: 320 },
        ],
      }),
    };

    const mockPdf: any = {};

    const service = new TripsService(
      mockSupabase,
      mockGeocoding,
      mockRouting,
      mockSimulation,
      mockGateway,
      mockEta,
      mockToll,
      mockPdf,
    );

    return { service, mockSupabase, mockSimulation, mockGateway };
  };

  it('previewDispatch computes route geometry and dynamic recommended checkpoints along route', async () => {
    const { service } = makeMockTripsService();
    const preview = await service.previewDispatch(orgId, {
      originAddress: 'Chennai',
      destinationAddress: 'Bengaluru',
      checkpointCount: 4,
      cargoType: 'general',
    });

    expect(preview.distanceKm).toBe(346);
    expect(preview.durationMinutes).toBe(360);
    expect(preview.routeGeometry.coordinates.length).toBeGreaterThan(2);
    expect(preview.recommendedCheckpoints).toHaveLength(4);
    expect(preview.recommendedCheckpoints[0].id).toBe('rec-cp-1');
    expect(preview.recommendedCheckpoints[0].cumulativeDistanceKm).toBeGreaterThan(0);
    expect(preview.validationErrors).toEqual([]);
  });

  it('previewDispatch flags maintenance vehicle, unavailable driver, and over-capacity cargo', async () => {
    const { service } = makeMockTripsService({
      vehicle: { id: 'veh-1', status: 'maintenance', capacity_kg: 5000 },
      driver: { id: 'drv-1', status: 'on_trip' },
    });

    const preview = await service.previewDispatch(orgId, {
      originAddress: 'Chennai',
      destinationAddress: 'Bengaluru',
      vehicleId: 'veh-1',
      driverId: 'drv-1',
      cargoWeightKg: 8000,
    });

    expect(preview.validationErrors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('maintenance'),
        expect.stringContaining('exceeds vehicle capacity'),
        expect.stringContaining('on_trip'),
      ]),
    );
  });

  it('dispatchTrip rejects maintenance vehicle and over-capacity cargo', async () => {
    const { service: maintSvc } = makeMockTripsService({
      vehicle: { id: 'veh-m', status: 'maintenance', capacity_kg: 10000 },
    });
    await expect(
      maintSvc.dispatchTrip(orgId, {
        vehicleId: 'veh-m',
        driverId: 'drv-1',
        originAddress: 'Chennai',
        destinationAddress: 'Bengaluru',
        cargoType: 'general',
        priority: 'normal',
      }),
    ).rejects.toThrow(BadRequestException);

    const { service: capSvc } = makeMockTripsService({
      vehicle: { id: 'veh-c', status: 'idle', capacity_kg: 3000 },
    });
    await expect(
      capSvc.dispatchTrip(orgId, {
        vehicleId: 'veh-c',
        driverId: 'drv-1',
        originAddress: 'Chennai',
        destinationAddress: 'Bengaluru',
        cargoType: 'general',
        cargoWeightKg: 9000,
        priority: 'high',
      }),
    ).rejects.toThrow(/exceeds vehicle capacity/i);
  });

  it('dispatchTrip rejects concurrent double-dispatch for the same vehicle', async () => {
    const { service } = makeMockTripsService();
    (service as any).inFlightVehicleDispatches.add('veh-1');

    await expect(
      service.dispatchTrip(orgId, {
        vehicleId: 'veh-1',
        driverId: 'drv-1',
        originAddress: 'Chennai',
        destinationAddress: 'Bengaluru',
        cargoType: 'general',
        priority: 'normal',
      }),
    ).rejects.toThrow(/Concurrent dispatch/i);
  });

  it('dispatchTrip creates trip and auto-starts live tracking when autoStart is enabled', async () => {
    const { service } = makeMockTripsService();
    const updateSpy = jest
      .spyOn(service, 'updateStatus')
      .mockResolvedValue({
        id: 'trip-new-1',
        org_id: orgId,
        vehicle_id: 'veh-1',
        driver_id: 'drv-1',
        status: 'in_transit',
      } as any);

    const result = await service.dispatchTrip(orgId, {
      vehicleId: 'veh-1',
      driverId: 'drv-1',
      originAddress: 'Chennai',
      destinationAddress: 'Bengaluru',
      cargoType: 'perishable',
      cargoWeightKg: 4500,
      priority: 'urgent',
      autoStart: true,
    });

    expect(updateSpy).toHaveBeenCalledWith(orgId, 'trip-new-1', { status: 'in_transit' });
    expect(result.status).toBe('in_transit');
  });

  it('completeTrip finalizes trip and generates a persisted completion report without fabricated metrics', async () => {
    const { service } = makeMockTripsService();
    const completed = {
      id: 'trip-done-1',
      org_id: orgId,
      vehicle_id: 'veh-1',
      driver_id: 'drv-1',
      origin_label: 'Chennai',
      destination_label: 'Bengaluru',
      status: 'completed',
      distance_km: 346,
      eta_minutes: 360,
      started_at: '2026-11-27T04:00:00.000Z',
      completed_at: '2026-11-27T10:15:00.000Z',
      created_at: '2026-11-27T03:45:00.000Z',
      vehicle: { registration_number: 'TN-38-FF-2345' },
      driver: { user: { full_name: 'Ravi Kumar' } },
    } as any;

    jest.spyOn(service, 'updateStatus').mockResolvedValue(completed);

    const { trip, report } = await service.completeTrip(orgId, 'trip-done-1', 'Delivered intact');
    expect(trip.status).toBe('completed');
    expect(report.tripId).toBe('trip-done-1');
    expect(report.tripSummary.vehicleRegistration).toBe('TN-38-FF-2345');
    expect(report.tripSummary.driverName).toBe('Ravi Kumar');
    expect(report.tripSummary.totalDistanceKm).toBe(346);
    expect(report.delayAndRiskAnalysis.mechanicalIncidents).toBe('Delivered intact');

    const cached = await service.getCompletionReport(orgId, 'trip-done-1');
    expect(cached).toEqual(report);
  });

  it('getTripHistory filters completed and cancelled trips by status and search', async () => {
    const { service } = makeMockTripsService();
    jest.spyOn(service, 'findAll').mockResolvedValue([
      {
        id: 't1',
        status: 'completed',
        vehicle_id: 'v1',
        driver_id: 'd1',
        origin_label: 'Chennai',
        destination_label: 'Bengaluru',
        created_at: '2026-11-27T01:00:00Z',
      },
      {
        id: 't2',
        status: 'in_transit',
        vehicle_id: 'v2',
        driver_id: 'd2',
        origin_label: 'Mumbai',
        destination_label: 'Pune',
        created_at: '2026-11-27T02:00:00Z',
      },
      {
        id: 't3',
        status: 'cancelled',
        vehicle_id: 'v3',
        driver_id: 'd3',
        origin_label: 'Delhi',
        destination_label: 'Jaipur',
        created_at: '2026-11-27T03:00:00Z',
      },
    ] as any);

    const allHist = await service.getTripHistory(orgId);
    expect(allHist.map((t) => t.id)).toEqual(['t1', 't3']);

    const onlyCancelled = await service.getTripHistory(orgId, { status: 'cancelled' });
    expect(onlyCancelled.map((t) => t.id)).toEqual(['t3']);

    const searchChennai = await service.getTripHistory(orgId, { search: 'chennai' });
    expect(searchChennai.map((t) => t.id)).toEqual(['t1']);
  });

  it('VehiclesService archiveVehicle, retireVehicle, and getResourceAvailability manage lifecycle safely', async () => {
    const vehiclesData = [
      { id: 'v1', org_id: orgId, registration_number: 'TN-01', status: 'idle', capacity_kg: 10000 },
      { id: 'v2', org_id: orgId, registration_number: 'TN-02', status: 'active', capacity_kg: 12000 },
      { id: 'v3', org_id: orgId, registration_number: 'TN-03', status: 'maintenance', capacity_kg: 8000 },
    ];
    const driversData = [
      { id: 'd1', org_id: orgId, status: 'available' },
      { id: 'd2', org_id: orgId, status: 'on_trip' },
      { id: 'd3', org_id: orgId, status: 'off_duty' },
    ];

    const mockSupabase: any = {
      adminClient: {
        from: jest.fn((table: string) => {
          if (table === 'vehicles') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockImplementation((_col: string, val: string) => {
                  if (val === orgId) {
                    return {
                      order: jest.fn().mockResolvedValue({ data: vehiclesData, error: null }),
                      eq: jest.fn().mockImplementation((_c2: string, idVal: string) => ({
                        single: jest.fn().mockResolvedValue({
                          data: vehiclesData.find((v) => v.id === idVal) || null,
                          error: null,
                        }),
                        maybeSingle: jest.fn().mockResolvedValue({
                          data: vehiclesData.find((v) => v.id === idVal) || null,
                          error: null,
                        }),
                      })),
                    };
                  }
                  return { data: vehiclesData, error: null };
                }),
              }),
              update: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    select: jest.fn().mockReturnValue({
                      single: jest.fn().mockResolvedValue({
                        data: { ...vehiclesData[0], status: 'maintenance' },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'drivers') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: driversData, error: null }),
              }),
            };
          }
          if (table === 'saved_routes') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
              upsert: jest.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === 'trip_checkpoints') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  order: jest.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
              insert: jest.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === 'trips') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockImplementation((_col: string, vehId: string) => ({
                  in: jest.fn().mockImplementation(() => {
                    const active = vehId === 'v2' ? [{ id: 't-act', status: 'in_transit' }] : [];
                    return Object.assign(Promise.resolve({ data: active, error: null }), {
                      order: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                          maybeSingle: jest.fn().mockResolvedValue({ data: active[0] || null, error: null }),
                        }),
                      }),
                    });
                  }),
                })),
              }),
            };
          }
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                in: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                  }),
                }),
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          };
        }),
      },
    };

    const vehiclesService = new VehiclesService(mockSupabase);

    // Active vehicle cannot be archived
    await expect(vehiclesService.archiveVehicle(orgId, 'v2')).rejects.toThrow(BadRequestException);

    // Idle vehicle can be archived
    const archived = await vehiclesService.archiveVehicle(orgId, 'v1');
    expect(archived.archived).toBe(true);
    expect(vehiclesService.isVehicleArchived('v1')).toBe(true);

    // Retired vehicle sets maintenance and marks retired
    const retired = await vehiclesService.retireVehicle(orgId, 'v1');
    expect(retired.status).toBe('maintenance');
    expect(vehiclesService.isVehicleRetired('v1')).toBe(true);
  });
});
