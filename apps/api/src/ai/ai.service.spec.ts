import { AiService } from './ai.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('AiService (Unit)', () => {
  let aiService: AiService;
  let mockSupabase: any;
  let mockConfigService: any;
  let mockDashboardService: any;
  let mockTripsService: any;
  let mockTrainMovementsService: any;
  let mockFlightMovementsService: any;
  let mockVoyageMovementsService: any;
  let mockFleetTwinService: any;

  beforeEach(() => {
    const alertQueryBuilder: any = {};
    alertQueryBuilder.select = jest.fn().mockReturnValue(alertQueryBuilder);
    alertQueryBuilder.eq = jest.fn().mockReturnValue(alertQueryBuilder);
    alertQueryBuilder.is = jest.fn().mockReturnValue(alertQueryBuilder);
    alertQueryBuilder.in = jest.fn().mockReturnValue(alertQueryBuilder);
    alertQueryBuilder.order = jest.fn().mockReturnValue(alertQueryBuilder);
    alertQueryBuilder.limit = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'alert-1',
          type: 'speed_alert',
          message: 'Vehicle speed 95 km/h exceeds limit',
          severity: 'high',
          vehicle_id: 'veh-1',
          created_at: new Date().toISOString(),
        },
      ],
      error: null,
    });
    alertQueryBuilder.update = jest.fn().mockImplementation(() => alertQueryBuilder);

    const genericQueryBuilder: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve: any) => resolve({ data: [], error: null }),
    };

    mockSupabase = {
      adminClient: {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'alerts') return alertQueryBuilder;
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
          if (table === 'trips') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  in: jest.fn().mockResolvedValue({
                    data: [{ id: 't-101', vehicle_id: 'veh-1' }],
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
                    data: { full_name: 'Karthik Raj', email: 'driver@nexus.in' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return genericQueryBuilder;
        }),
      },
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue(''), // Unset API key by default
    };

    mockDashboardService = {
      getStats: jest.fn().mockResolvedValue({
        activeAlerts: 2,
        activeVehicles: { value: 5, label: 'Active Vehicles' },
        totalFleetToday: { value: 10, label: 'Fleet Size' },
        avgSpeedKmh: { value: 45, label: 'Avg Speed' },
        arrivedCount: { value: 3, label: 'Arrived' },
        departedCount: { value: 4, label: 'Departed' },
      }),
    };

    mockTripsService = {
      findAll: jest.fn().mockResolvedValue([
        {
          id: 't-101',
          vehicle_id: 'veh-1',
          vehicle: { registration_number: 'TN 01 AB 4021' },
          driver: { user: { id: 'driver-user-1', full_name: 'Karthik Raj' } },
          origin_label: 'Chennai Hub',
          destination_label: 'Bengaluru Depot',
          status: 'in_transit',
          distance_km: 350,
          predicted_duration_minutes: 420,
        },
        {
          id: 't-102',
          vehicle_id: 'veh-2',
          vehicle: { registration_number: 'MH 01 CD 9999' },
          driver: { user: { id: 'driver-user-2', full_name: 'Suresh Kumar' } },
          origin_label: 'Mumbai Port',
          destination_label: 'Pune Hub',
          status: 'in_transit',
          distance_km: 150,
          predicted_duration_minutes: 180,
        },
      ]),
      findOne: jest.fn().mockImplementation(async (_orgId: string, id: string) => {
        if (id === 't-102') {
          return {
            id: 't-102',
            origin_label: 'Mumbai Port',
            destination_label: 'Pune Hub',
            status: 'in_transit',
            driver: { user: { id: 'driver-user-2', full_name: 'Suresh Kumar' } },
          };
        }
        return {
          id: 't-101',
          origin_label: 'Chennai Hub',
          destination_label: 'Bengaluru Depot',
          status: 'in_transit',
          driver: { user: { id: 'driver-user-1', full_name: 'Karthik Raj' } },
        };
      }),
      getEta: jest.fn().mockResolvedValue({
        base_eta_minutes: 120,
        min_eta_minutes: 105,
        max_eta_minutes: 135,
        confidence_basis: 'default',
        sample_size: 1,
      }),
    };

    mockTrainMovementsService = {
      findAll: jest.fn().mockResolvedValue([
        {
          id: 'mov-rail-101',
          train: { train_number: 'TR-7001', train_name: 'Freight Express', locomotive: { fuel_type: 'electric' } },
          origin_station: { name: 'Mumbai CSMT' },
          destination_station: { name: 'New Delhi' },
          loco_pilot: { user: { full_name: 'Vikram Singh' } },
          status: 'in_transit',
          distance_km: 450,
          duration_minutes: 360,
        },
      ]),
      findOne: jest.fn().mockResolvedValue({ id: 'mov-rail-101' }),
      getEtaConfidence: jest.fn().mockResolvedValue(null),
      checkSlot: jest.fn().mockResolvedValue({ congested: false }),
    };

    mockFlightMovementsService = {
      findAll: jest.fn().mockResolvedValue([
        {
          id: 'fmov-1',
          status: 'in_transit',
          distance_km: 1148,
          duration_minutes: 135,
          flight: { flight_number: 'AI-701', origin_airport: { name: 'Delhi', iata_code: 'DEL' }, destination_airport: { name: 'Mumbai', iata_code: 'BOM' } },
          aircraft: { tail_number: 'VT-NWX', aircraft_type: 'Boeing 777F' },
          pilot: { user: { full_name: 'Capt. Vikram Batra' } },
        },
      ]),
      findOne: jest.fn().mockResolvedValue({ id: 'fmov-1' }),
      getEtaConfidence: jest.fn().mockResolvedValue(null),
    };

    mockVoyageMovementsService = {
      findAll: jest.fn().mockResolvedValue([
        {
          id: 'vmov-1',
          status: 'in_transit',
          distance_km: 1530,
          duration_minutes: 3600,
          voyage: { voyage_number: 'VY-901', origin_port: { name: 'Jawaharlal Nehru Port', code: 'INNSA' }, destination_port: { name: 'Chennai Port', code: 'INMAA' } },
          vessel: { name: 'MV Ocean Titan', imo_number: 'IMO9234567', dwt_tonnes: 65000 },
          crew: { master_license: 'M-STCW-991', user: { full_name: 'Capt. Rajiv Sharma' } },
        },
      ]),
      findOne: jest.fn().mockResolvedValue({ id: 'vmov-1' }),
      getEtaConfidence: jest.fn().mockResolvedValue(null),
      checkSlots: jest.fn().mockResolvedValue({ congested: false }),
    };

    mockFleetTwinService = {
      getOverview: jest.fn().mockResolvedValue({
        enabled: true,
        totals: {
          total_fleet: 2,
          active_vehicles: 2,
          active_alerts: 1,
          average_speed_kmh: 54,
          arrived_today: 0,
          departed_today: 2,
        },
        vehicles: [
          {
            id: 'veh-1',
            registration_number: 'TN 01 AB 4021',
            truck_type: 'Heavy Container',
            status: 'delayed',
            speed_kmh: 42,
            current_lat: 12.9165,
            current_lng: 79.1325,
            progress_pct: 48,
            fleet_name: 'South Corridor Fleet',
            driver: { name: 'Karthik Raj' },
            current_checkpoint_name: 'Vellore Toll',
            next_checkpoint_name: 'Krishnagiri',
            next_checkpoint_distance_km: 65,
            route: { origin_city: 'Chennai', destination_city: 'Bengaluru', total_distance_km: 350 },
            predicted_eta: '2026-11-26T20:00:00Z',
            total_predicted_delay_minutes: 45,
            risk_score: 72,
          },
          {
            id: 'veh-2',
            registration_number: 'MH 01 CD 9999',
            truck_type: 'Reefer',
            status: 'en_route',
            speed_kmh: 66,
            current_lat: 19.076,
            current_lng: 72.8777,
            progress_pct: 30,
            fleet_name: 'West Express Fleet',
            driver: { name: 'Suresh Kumar' },
            current_checkpoint_name: 'Panvel',
            next_checkpoint_name: 'Lonavala',
            next_checkpoint_distance_km: 40,
            predicted_eta: '2026-11-26T18:00:00Z',
            total_predicted_delay_minutes: 5,
            risk_score: 18,
          },
        ],
        alerts: [
          {
            vehicle_id: 'veh-1',
            registration_number: 'TN 01 AB 4021',
            event_type: 'weather',
            severity: 'high',
            delay_minutes: 30,
            description: 'Heavy rain near Vellore',
          },
        ],
      }),
      getAllVehicles: jest.fn().mockResolvedValue([
        {
          id: 'veh-1',
          registration_number: 'TN 01 AB 4021',
          status: 'delayed',
          speed_kmh: 42,
          progress_pct: 48,
          driver: { name: 'Karthik Raj', license_number: 'TN-DRV-01' },
          route: { total_distance_km: 350 },
        },
        {
          id: 'veh-2',
          registration_number: 'MH 01 CD 9999',
          status: 'en_route',
          speed_kmh: 66,
          progress_pct: 30,
          driver: { name: 'Suresh Kumar', license_number: 'MH-DRV-02' },
          route: { total_distance_km: 150 },
        },
      ]),
      getVehicleById: jest.fn().mockResolvedValue({
        id: 'veh-1',
        registration_number: 'TN 01 AB 4021',
        progress_pct: 48,
        route: { total_distance_km: 350 },
      }),
      getCheckpointsByVehicle: jest.fn().mockResolvedValue([
        { id: 'cp-1', name: 'Sriperumbudur', type: 'toll', sequence_order: 1, distance_from_start_km: 45, latitude: 12.96, longitude: 79.94 },
        { id: 'cp-2', name: 'Vellore', type: 'checkpoint', sequence_order: 2, distance_from_start_km: 140, latitude: 12.91, longitude: 79.13 },
        { id: 'cp-3', name: 'Krishnagiri', type: 'checkpoint', sequence_order: 3, distance_from_start_km: 250, latitude: 12.52, longitude: 78.21 },
      ]),
      getVehicleDigitalTwin: jest.fn().mockImplementation(async (vehicleId: string, whatIf: any) => ({
        vehicle: {
          id: vehicleId,
          registration_number: 'TN 01 AB 4021',
          truck_type: 'Heavy Container',
          status: 'delayed',
          current_lat: 12.9165,
          current_lng: 79.1325,
          speed_kmh: 42,
        },
        driver: { name: 'Karthik Raj', phone: '9876543210', hours_driven_today: 6.5, rest_hours_compliance: true },
        fleet: { name: 'South Corridor Fleet' },
        route: { name: 'NH-48 Chennai-Bengaluru', origin_city: 'Chennai', destination_city: 'Bengaluru', total_distance_km: 350 },
        current_progress_pct: 48,
        planned_eta: '2026-11-26T19:15:00Z',
        predicted_eta: '2026-11-26T20:00:00Z',
        total_predicted_delay_minutes: whatIf?.rain_severity_multiplier > 1 ? 85 : 45,
        on_time_probability: 0.35,
        risk_score: whatIf?.rain_severity_multiplier > 1 ? 88 : 72,
        top_delay_causes: ['Heavy rain near Vellore', 'Toll plaza queue'],
        driver_fatigue_pct: 40,
        current_checkpoint: { name: 'Vellore' },
        next_checkpoint: { name: 'Krishnagiri' },
        timeline: [],
        eta_breakdown: { base_minutes: 360, weather_delay: 30, toll_delay: 15 },
        explanation: 'Delayed due to rain and toll queue.',
        data_freshness: 'LIVE',
      })),
      calculateReroute: jest.fn().mockResolvedValue({
        vehicle_id: 'veh-1',
        mode: 'fastest',
        recommended_route_name: 'NH-75 Chittoor Bypass',
        time_saved_minutes: 28,
        extra_distance_km: 14,
        fuel_cost_delta_inr: 320,
        toll_cost_delta_inr: -50,
        risk_score_delta: -18,
        new_eta: '2026-11-26T19:32:00Z',
        meeting_deadline_prob: 0.78,
        feasibility: 'feasible',
        problems: [],
        reason: 'Avoids Vellore congestion',
      }),
      acknowledgeTwinAlert: jest.fn().mockReturnValue({
        alertId: 'twin-alert-v11111111-0021-4111-8111-000000000021-0',
        acknowledgedAt: new Date().toISOString(),
      }),
      isTwinAlertAcknowledged: jest.fn().mockReturnValue(false),
    };

    aiService = new AiService(
      mockConfigService as ConfigService,
      mockSupabase,
      mockDashboardService,
      mockTripsService,
      mockTrainMovementsService,
      mockFlightMovementsService,
      mockVoyageMovementsService,
      mockFleetTwinService,
    );
  });

  describe('Deterministic Fallback Responder & Language Detection', () => {
    it('plainly identifies fallback mode and reason when GEMINI_API_KEY is unset', async () => {
      const response = await aiService.processChat('org-123', 'admin-1', 'admin', {
        message: 'What is the overall fleet status?',
      });

      expect(response.isFallback).toBe(true);
      expect(response.fallbackReason).toBe('GEMINI_API_KEY_MISSING');
      expect(response.role).toBe('assistant');
      expect(response.content).toContain('Rule-Based Assistant Fallback Mode');
      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls![0].name).toBe('get_fleet_twin_overview');
      expect(response.content).toContain('TN 01 AB 4021');
    });

    it('detects Tamil script and Tanglish messages', async () => {
      const tamilResp = await aiService.processChat('org-123', 'admin-1', 'admin', {
        message: 'வண்டி எங்க இருக்கு? fleet status சொல்லு',
      });
      expect(tamilResp.detectedLanguage).toBe('tamil');

      const tanglishResp = await aiService.processChat('org-123', 'admin-1', 'admin', {
        message: 'vehicle eppo varum sollu',
      });
      expect(tanglishResp.detectedLanguage).toBe('tanglish');

      const englishResp = await aiService.processChat('org-123', 'admin-1', 'admin', {
        message: 'Show active alerts',
      });
      expect(englishResp.detectedLanguage).toBe('english');
    });

    it('answers active alerts query in fallback mode with visible tool call', async () => {
      const response = await aiService.processChat('org-123', 'admin-1', 'admin', {
        message: 'Show active alerts',
      });

      expect(response.isFallback).toBe(true);
      expect(response.toolCalls).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'list_unacknowledged_alerts' })]),
      );
      expect(response.content).toContain('Vehicle speed 95 km/h exceeds limit');
    });

    it('answers active train, flight, and voyage movements queries', async () => {
      const rail = await aiService.processChat('org-123', 'admin-1', 'admin', {
        message: 'List all active train movements',
      });
      expect(rail.content).toContain('TR-7001');

      const air = await aiService.processChat('org-123', 'admin-1', 'admin', {
        message: 'Show active flight movements in airways',
      });
      expect(air.content).toContain('AI-701');

      const sea = await aiService.processChat('org-123', 'admin-1', 'admin', {
        message: 'Show active voyage movements at sea',
      });
      expect(sea.content).toContain('MV Ocean Titan');
    });

    it('proposes acknowledge_alert action without immediately modifying database', async () => {
      const response = await aiService.processChat('org-123', 'admin-1', 'admin', {
        message: 'Acknowledge alert #alert-1',
      });

      expect(response.proposedAction).toBeDefined();
      expect(response.proposedAction?.actionType).toBe('acknowledge_alert');
      expect(response.proposedAction?.payload).toEqual(
        expect.objectContaining({ alertId: 'alert-1', alertSource: 'db_alert' }),
      );
      expect(response.proposedAction?.status).toBe('pending');
    });
  });

  describe('Backend RBAC Enforcement (Driver vs Admin)', () => {
    it('prevents driver from accessing another vehicle via Digital Twin tool', async () => {
      const result = await (aiService as any).executeTool(
        'org-123',
        'driver-user-1',
        'driver',
        'get_vehicle_digital_twin',
        { vehicle_id: 'veh-2' },
      );

      expect(result.error).toContain('Access denied');
      expect(mockFleetTwinService.getVehicleDigitalTwin).not.toHaveBeenCalled();
    });

    it('allows driver to access their own assigned vehicle by registration number', async () => {
      const result = await (aiService as any).executeTool(
        'org-123',
        'driver-user-1',
        'driver',
        'get_vehicle_digital_twin',
        { vehicle_id: 'TN 01 AB 4021', rain_severity_multiplier: 2.0 },
      );

      expect(result.error).toBeUndefined();
      expect(result.registration).toBe('TN 01 AB 4021');
      expect(result.delayMinutes).toBe(85); // What-If rain multiplier applied!
    });

    it('blocks driver from organization-wide dashboard stats and multimodal ops', async () => {
      const statsRes = await (aiService as any).executeTool(
        'org-123',
        'driver-user-1',
        'driver',
        'get_dashboard_stats',
        {},
      );
      expect(statsRes.error).toContain('Access denied');

      const trainRes = await (aiService as any).executeTool(
        'org-123',
        'driver-user-1',
        'driver',
        'list_active_train_movements',
        {},
      );
      expect(trainRes.error).toContain('Access denied');
    });

    it('filters fleet overview and trips strictly to driver own vehicle', async () => {
      const overview = await (aiService as any).executeTool(
        'org-123',
        'driver-user-1',
        'driver',
        'get_fleet_twin_overview',
        {},
      );
      expect(overview.vehicles).toHaveLength(1);
      expect(overview.vehicles[0].id).toBe('veh-1');

      const trips = await (aiService as any).executeTool(
        'org-123',
        'driver-user-1',
        'driver',
        'list_active_trips',
        {},
      );
      expect(trips).toHaveLength(1);
      expect(trips[0].tripId).toBe('t-101');
    });

    it('blocks driver from confirming organization actions', async () => {
      await expect(
        aiService.confirmAction(
          'org-123',
          {
            actionId: 'action-1',
            actionType: 'acknowledge_alert',
            payload: { alertId: 'alert-1' },
            confirmed: true,
          },
          'driver',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Fleet Twin Tools (Checkpoints, Reroute, Gemini Multi-Turn)', () => {
    it('returns checkpoint crossed/remaining status', async () => {
      const cps = await (aiService as any).executeTool(
        'org-123',
        'admin-1',
        'admin',
        'get_vehicle_checkpoints',
        { vehicle_id: 'TN 01 AB 4021' },
      );
      expect(cps).toHaveLength(3);
      expect(cps[0].crossed).toBe(true); // 45km <= 168km (48% of 350km)
      expect(cps[1].crossed).toBe(true); // 140km <= 168km
      expect(cps[2].crossed).toBe(false); // 250km > 168km
      expect(cps[2].isNext).toBe(true);
    });

    it('computes alternate route via RerouteEngine', async () => {
      const reroute = await (aiService as any).executeTool(
        'org-123',
        'admin-1',
        'admin',
        'get_vehicle_reroute',
        { vehicle_id: 'veh-1', mode: 'fastest' },
      );
      expect(reroute.recommendedRoute).toBe('NH-75 Chittoor Bypass');
      expect(reroute.timeSavedMinutes).toBe(28);
    });

    it('handles Gemini multi-turn functionCall -> functionResponse -> synthesis with isFallback=false', async () => {
      const generateContentMock = jest
        .fn()
        .mockResolvedValueOnce({
          text: '',
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'get_fleet_twin_overview',
                      args: {},
                    },
                  },
                ],
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          text: 'Vehicle TN 01 AB 4021 is delayed by 45 minutes due to heavy rain near Vellore.',
        });

      (aiService as any).genAiClient = {
        models: { generateContent: generateContentMock },
      };

      const res = await aiService.processChat('org-123', 'admin-1', 'admin', {
        message: 'Which vehicle has the highest delay?',
      });

      expect(res.isFallback).toBe(false);
      expect(res.content).toContain('TN 01 AB 4021');
      expect(res.toolCalls).toHaveLength(1);
      expect(res.toolCalls![0].name).toBe('get_fleet_twin_overview');
      expect(generateContentMock).toHaveBeenCalledTimes(2);

      // Verify second call used proper functionResponse parts
      const secondCallArgs = generateContentMock.mock.calls[1][0];
      const lastTurn = secondCallArgs.contents[secondCallArgs.contents.length - 1];
      expect(lastTurn.parts[0].functionResponse).toBeDefined();
      expect(lastTurn.parts[0].functionResponse.name).toBe('get_fleet_twin_overview');
    });

    it('sets RATE_LIMIT fallbackReason when Gemini returns 429', async () => {
      (aiService as any).genAiClient = {
        models: {
          generateContent: jest.fn().mockRejectedValue(new Error('429 Quota exceeded')),
        },
      };

      const res = await aiService.processChat('org-123', 'admin-1', 'admin', {
        message: 'Show active alerts',
      });

      expect(res.isFallback).toBe(true);
      expect(res.fallbackReason).toBe('RATE_LIMIT');
    });
  });

  describe('Action Confirmation (Write Operations)', () => {
    it('executes database update for valid persistent UUID alert when user confirms', async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      mockSupabase.adminClient.from.mockImplementation((table: string) => {
        if (table === 'alerts') return { update: mockUpdate };
      });

      const validUuid = '11111111-2222-4333-8444-555555555555';
      const result = await aiService.confirmAction('org-123', {
        actionId: 'action-uuid-1',
        actionType: 'acknowledge_alert',
        payload: { alertId: validUuid, alertSource: 'db_alert' },
        confirmed: true,
      });

      expect(result.success).toBe(true);
      expect(result.alertSource).toBe('db_alert');
      expect(result.message).toContain('successfully acknowledged');
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('acknowledges Digital Twin alert without passing custom ID to Postgres UUID column', async () => {
      const mockUpdate = jest.fn();
      const mockInsert = jest.fn().mockResolvedValue({ error: null });
      mockSupabase.adminClient.from.mockImplementation((table: string) => {
        if (table === 'alerts') return { update: mockUpdate, insert: mockInsert };
      });

      const twinAlertId = 'twin-alert-v11111111-0021-4111-8111-000000000021-0';
      const result = await aiService.confirmAction('org-123', {
        actionId: 'action-twin-1',
        actionType: 'acknowledge_alert',
        payload: {
          alertId: twinAlertId,
          alertSource: 'fleet_twin',
          vehicleId: 'v11111111-0021-4111-8111-000000000021',
          registration: 'TN 38 FF 2345',
          eventType: 'weather',
        },
        confirmed: true,
      }, 'manager', 'user-1');

      expect(result.success).toBe(true);
      expect(result.alertSource).toBe('fleet_twin');
      expect(result.message).toContain('TN 38 FF 2345');
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockFleetTwinService.acknowledgeTwinAlert).toHaveBeenCalledWith(
        twinAlertId,
        expect.objectContaining({
          vehicleId: 'v11111111-0021-4111-8111-000000000021',
          eventType: 'weather',
          acknowledgedBy: 'user-1',
        }),
      );
    });

    it('rejects malformed non-UUID persistent alert IDs cleanly', async () => {
      await expect(
        aiService.confirmAction('org-123', {
          actionId: 'action-bad-1',
          actionType: 'acknowledge_alert',
          payload: { alertId: 'not-a-valid-uuid', alertSource: 'db_alert' },
          confirmed: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('prevents duplicate execution on repeated Apply clicks for the same actionId', async () => {
      const twinAlertId = 'twin-alert-v11111111-0021-4111-8111-000000000021-0';
      const first = await aiService.confirmAction('org-123', {
        actionId: 'action-dup-1',
        actionType: 'acknowledge_alert',
        payload: { alertId: twinAlertId, alertSource: 'fleet_twin' },
        confirmed: true,
      });
      const second = await aiService.confirmAction('org-123', {
        actionId: 'action-dup-1',
        actionType: 'acknowledge_alert',
        payload: { alertId: twinAlertId, alertSource: 'fleet_twin' },
        confirmed: true,
      });

      expect(first.success).toBe(true);
      expect(second.deduplicated).toBe(true);
      expect(mockFleetTwinService.acknowledgeTwinAlert).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException on database update failure', async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: { message: 'DB failure' } }),
        }),
      });
      mockSupabase.adminClient.from.mockImplementation(() => ({ update: mockUpdate }));

      await expect(
        aiService.confirmAction('org-123', {
          actionId: 'action-db-err',
          actionType: 'acknowledge_alert',
          payload: { alertId: '11111111-2222-4333-8444-555555555555' },
          confirmed: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('cancels action when user rejects without modifying database or twin alerts', async () => {
      const mockUpdate = jest.fn();
      mockSupabase.adminClient.from.mockImplementation(() => ({ update: mockUpdate }));

      const result = await aiService.confirmAction('org-123', {
        actionId: 'action-123',
        actionType: 'acknowledge_alert',
        payload: { alertId: '11111111-2222-4333-8444-555555555555' },
        confirmed: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('rejected and cancelled');
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockFleetTwinService.acknowledgeTwinAlert).not.toHaveBeenCalled();
    });
  });

  describe('Reconciled Dashboard, Trips & Alerts', () => {
    it('reconciles list_active_trips with FleetTwin active vehicles when org trips table is empty', async () => {
      mockTripsService.findAll.mockResolvedValueOnce([]);
      const trips = await (aiService as any).executeTool(
        'org-123',
        'admin-1',
        'admin',
        'list_active_trips',
        {},
      );

      expect(Array.isArray(trips)).toBe(true);
      expect(trips.length).toBe(2);
      expect(trips[0].source).toBe('fleet_twin');
      expect(trips[0].vehicle).toBe('TN 01 AB 4021');
      expect(trips[0].origin).toBe('Chennai');
      expect(trips[0].destination).toBe('Bengaluru');
    });

    it('excludes completed and cancelled trips from list_active_trips', async () => {
      mockTripsService.findAll.mockResolvedValueOnce([
        { id: 't-comp', status: 'completed', origin_label: 'A', destination_label: 'B' },
        { id: 't-canc', status: 'cancelled', origin_label: 'C', destination_label: 'D' },
        { id: 't-act', status: 'in_transit', origin_label: 'E', destination_label: 'F', vehicle: { registration_number: 'KA 01 ZZ 1111' } },
      ]);
      mockFleetTwinService.getOverview.mockResolvedValueOnce({ enabled: false, vehicles: [], alerts: [] });

      const trips = await (aiService as any).executeTool(
        'org-123',
        'admin-1',
        'admin',
        'list_active_trips',
        {},
      );

      expect(trips).toHaveLength(1);
      expect(trips[0].tripId).toBe('t-act');
    });

    it('surfaces service error instead of returning [] when both trip sources fail', async () => {
      mockTripsService.findAll.mockRejectedValueOnce(new Error('DB connection lost'));
      mockFleetTwinService.getOverview.mockRejectedValueOnce(new Error('Twin offline'));

      const res = await (aiService as any).executeTool(
        'org-123',
        'admin-1',
        'admin',
        'list_active_trips',
        {},
      );

      expect(res.error).toContain('Trip service temporarily unavailable');
    });

    it('reconciles get_dashboard_stats across DashboardService and FleetTwinService', async () => {
      const stats = await (aiService as any).executeTool(
        'org-123',
        'admin-1',
        'admin',
        'get_dashboard_stats',
        {},
      );

      // 5 (org DB) + 2 (FleetTwin) = 7 activeVehicles; 2 + 1 = 3 activeAlerts
      expect(stats.activeVehicles).toBe(7);
      expect(stats.totalFleet).toBe(12);
      expect(stats.activeAlerts).toBe(3);
      expect(stats.dataFreshness).toBe('LIVE_RECONCILED');
    });

    it('retries next Gemini model on 503 UNAVAILABLE and preserves thoughtSignature', async () => {
      const generateContentMock = jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('503 UNAVAILABLE'), { status: 503 }))
        .mockResolvedValueOnce({
          text: '',
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: { name: 'list_active_trips', args: {} },
                    thoughtSignature: 'sig-123',
                  },
                ],
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          text: 'There are 2 active trips currently running.',
          candidates: [{ content: { role: 'model', parts: [{ text: 'There are 2 active trips currently running.' }] } }],
        });

      (aiService as any).genAiClient = {
        models: { generateContent: generateContentMock },
      };

      const res = await aiService.processChat('org-123', 'admin-1', 'admin', {
        message: 'List active trips',
      });

      expect(res.isFallback).toBe(false);
      expect(res.content).toContain('2 active trips');
      const thirdCallContents = generateContentMock.mock.calls[2][0].contents;
      const modelTurn = thirdCallContents.find((c: any) => c.role === 'model');
      expect(modelTurn.parts[0].thoughtSignature).toBe('sig-123');
    });
  });
});
