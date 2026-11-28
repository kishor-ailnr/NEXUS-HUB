import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FleetTwinService } from './fleet-twin.service';
import { FleetTwinController } from './fleet-twin.controller';
import { PredictionService } from './prediction/prediction.service';
import { VehiclesController } from '../vehicles/vehicles.controller';
import { TripsController } from '../trips/trips.controller';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import { TripsService } from '../trips/trips.service';
import { RoutingService } from '../routing/routing.service';

describe('Digital Twin Dynamic Current-Position Routing & Strict RBAC', () => {
  it('calculateReroute starts alternate route strictly from vehicle current GPS position (not trip origin)', async () => {
    const mockRoutingService: any = {
      getDistinctAlternateRoute: jest.fn().mockResolvedValue({
        routing_source: 'osrm',
        coordinates: [
          [79.1325, 12.9165], // Vellore current position [lng, lat]
          [79.1003, 13.2172], // Chittoor bypass
          [78.1294, 13.1378], // Kolar
          [77.5946, 12.9716], // Bengaluru destination
        ],
        distance_km: 218,
        duration_minutes: 210,
      }),
    };
    const mockRealtime: any = { broadcastToOrg: jest.fn() };
    const predictionService = new PredictionService();
    const service = new FleetTwinService(
      null as any,
      predictionService,
      undefined,
      undefined,
      mockRoutingService,
      mockRealtime,
    );

    const vehicles = await service.getAllVehicles();
    const target = vehicles[0];
    // Simulate vehicle halfway near Vellore (12.9165, 79.1325)
    target.current_lat = 12.9165;
    target.current_lng = 79.1325;
    target.progress_pct = 45;

    const reroute = await service.calculateReroute(target.id, 'fastest');

    expect(reroute.divergence_point?.latitude).toBeCloseTo(12.9165, 3);
    expect(reroute.divergence_point?.longitude).toBeCloseTo(79.1325, 3);
    expect(reroute.alternate_waypoints?.[0][0]).toBeCloseTo(12.9165, 3);
    expect(reroute.alternate_waypoints?.[0][1]).toBeCloseTo(79.1325, 3);
    expect(mockRoutingService.getDistinctAlternateRoute).toHaveBeenCalledTimes(1);
  });

  it('acceptReroute promotes alternate route to active, records RouteChange, and broadcasts real-time update', async () => {
    const mockRealtime: any = { broadcastToOrg: jest.fn() };
    const service = new FleetTwinService(
      null as any,
      new PredictionService(),
      undefined,
      undefined,
      undefined,
      mockRealtime,
    );

    const vehicles = await service.getAllVehicles();
    const target = vehicles[0];

    const reroute = await service.calculateReroute(target.id, 'balanced');
    const candId = reroute.alternate_candidates?.[0]?.id;
    const accepted = await service.acceptReroute(target.id, reroute.id, candId, {
      orgId: 'org-1',
      fullName: 'Ops Admin',
    });

    expect(accepted.success).toBe(true);
    expect(accepted.reroute.accepted).toBe(true);
    expect(accepted.routeChange).toBeDefined();
    expect(accepted.routeChange.changed_by).toBe('Ops Admin');

    const history = await service.getRouteChanges(target.id);
    expect(history).toHaveLength(1);
    expect(mockRealtime.broadcastToOrg).toHaveBeenCalledWith(
      'org-1',
      'route:changed',
      expect.objectContaining({ vehicleId: target.id }),
    );
  });

  it('assertDriverOwnsVehicle blocks driver from accessing another vehicle (HTTP 403)', async () => {
    const service = new FleetTwinService(null as any, new PredictionService());
    const vehicles = await service.getAllVehicles();
    const v0 = vehicles[0];

    await expect(
      service.assertDriverOwnsVehicle(
        { id: 'driver-unauthorized-user', email: 'other@nexus.in', role: 'driver', orgId: 'org-1' },
        v0.id,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('VehiclesController and TripsController enforce driver isolation and reject cross-vehicle/trip access', async () => {
    const mockVehiclesSvc: any = {
      findAll: jest.fn().mockResolvedValue([
        { id: 'v-mine', driver: { user_id: 'drv-u1', user: { id: 'drv-u1' } } },
        { id: 'v-other', driver: { user_id: 'drv-u2', user: { id: 'drv-u2' } } },
      ]),
      findOne: jest.fn().mockResolvedValue({
        id: 'v-other',
        driver: { user_id: 'drv-u2', user: { id: 'drv-u2' } },
      }),
    };
    const vehiclesCtrl = new VehiclesController(mockVehiclesSvc);

    const mineOnly = await vehiclesCtrl.findAll({ id: 'drv-u1', role: 'driver', orgId: 'org-1' });
    expect(mineOnly.map((v) => v.id)).toEqual(['v-mine']);

    await expect(
      vehiclesCtrl.findOne({ id: 'drv-u1', role: 'driver', orgId: 'org-1' }, 'v-other'),
    ).rejects.toThrow(ForbiddenException);

    const mockTripsSvc: any = {
      findAll: jest.fn().mockResolvedValue([
        { id: 't-mine', driver: { user_id: 'drv-u1' } },
        { id: 't-other', driver: { user_id: 'drv-u2' } },
      ]),
      findOne: jest.fn().mockResolvedValue({
        id: 't-other',
        driver: { user_id: 'drv-u2' },
      }),
    };
    const tripsCtrl = new TripsController(mockTripsSvc);

    const myTrips = await tripsCtrl.findAll({ id: 'drv-u1', role: 'driver', orgId: 'org-1' });
    expect(myTrips.map((t) => t.id)).toEqual(['t-mine']);

    await expect(
      tripsCtrl.findOne({ id: 'drv-u1', role: 'driver', orgId: 'org-1' }, 't-other'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('JwtAuthGuard rejects unauthenticated requests (401) and RolesGuard rejects driver on admin endpoint (403)', async () => {
    const jwtGuard = new JwtAuthGuard({} as any);
    const unauthCtx: any = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {}, cookies: {} }),
      }),
    };
    await expect(jwtGuard.canActivate(unauthCtx)).rejects.toThrow(UnauthorizedException);

    const reflector = new Reflector();
    const rolesGuard = new RolesGuard(reflector);
    const handler = FleetTwinController.prototype.acceptReroute;
    const driverCtx: any = {
      getHandler: () => handler,
      getClass: () => FleetTwinController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'u-drv', role: 'driver' } }),
      }),
    };
    expect(() => rolesGuard.canActivate(driverCtx)).toThrow(ForbiddenException);
  });

  it('AuthService.exchangeSession rejects mismatched selectedRole (driver+admin or manager+driver)', async () => {
    const makeAuthSvc = (dbRole: string) => {
      const mockSupa: any = {
        verifyJwt: jest.fn().mockResolvedValue({ sub: 'u-1', email: 'test@nexus.in' }),
        signToken: jest.fn().mockReturnValue('tok'),
        adminClient: {
          from: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: {
                    id: 'u-1',
                    org_id: 'org-1',
                    full_name: 'Test User',
                    email: 'test@nexus.in',
                    role: dbRole,
                    organizations: { id: 'org-1', name: 'Org', mode: 'roadways' },
                  },
                }),
              }),
            }),
          }),
        },
      };
      return new AuthService(mockSupa, {} as any);
    };

    const driverAuth = makeAuthSvc('driver');
    await expect(
      driverAuth.exchangeSession('at', 'rt', 'roadways', 'admin'),
    ).rejects.toThrow(ForbiddenException);

    const adminAuth = makeAuthSvc('manager');
    await expect(
      adminAuth.exchangeSession('at', 'rt', 'roadways', 'driver'),
    ).rejects.toThrow(ForbiddenException);

    const validDriver = await driverAuth.exchangeSession('at', 'rt', 'roadways', 'driver');
    expect(validDriver.user.role).toBe('driver');
  });

  it('TripsService.deleteTrip stops simulation, releases vehicle & driver, and broadcasts deleted status', async () => {
    const mockSim: any = { stopSimulation: jest.fn() };
    const mockGateway: any = { broadcastToOrg: jest.fn() };
    const mockSupa: any = {
      adminClient: {
        from: jest.fn((table: string) => {
          if (table === 'trips') {
            return {
              delete: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ error: null }),
                }),
              }),
            };
          }
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
          };
        }),
      },
    };
    const tripsSvc = new TripsService(
      mockSupa,
      {} as any,
      {} as any,
      mockSim,
      mockGateway,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(tripsSvc, 'findOne').mockResolvedValue({
      id: 'trip-del-1',
      vehicle_id: 'veh-1',
      driver_id: 'drv-1',
    } as any);

    const res = await tripsSvc.deleteTrip('org-1', 'trip-del-1');
    expect(res.success).toBe(true);
    expect(mockSim.stopSimulation).toHaveBeenCalledWith('trip-del-1');
    expect(mockGateway.broadcastToOrg).toHaveBeenCalledWith(
      'org-1',
      'tracking:trip_status',
      expect.objectContaining({ tripId: 'trip-del-1', status: 'deleted' }),
    );
  });

  it('RoutingService.getDistinctAlternateRoute rejects duplicate routes and returns distinct OSRM alternate', async () => {
    const routingSvc = new RoutingService({} as any);
    const primary: [number, number][] = [
      [79.1325, 12.9165],
      [78.5, 12.8],
      [77.5946, 12.9716],
    ];
    const fetchSpy = jest.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          { distance: 200000, duration: 12000, geometry: { coordinates: primary } },
          {
            distance: 215000,
            duration: 11000,
            geometry: {
              coordinates: [
                [79.1325, 12.9165],
                [79.1003, 13.2172],
                [78.1294, 13.1378],
                [77.5946, 12.9716],
              ],
            },
          },
        ],
      }),
    } as any);

    const alt = await routingSvc.getDistinctAlternateRoute(
      12.9165,
      79.1325,
      12.9716,
      77.5946,
      13.2,
      78.8,
      primary,
    );
    fetchSpy.mockRestore();

    expect(alt).not.toBeNull();
    expect(alt?.routing_source).toBe('osrm');
    expect(alt?.coordinates.length).toBe(4);
  });
});
