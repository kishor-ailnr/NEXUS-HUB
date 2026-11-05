import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { FleetTwinService } from '../src/fleet-twin/fleet-twin.service';
import { PredictionService } from '../src/fleet-twin/prediction/prediction.service';
import { RerouteEngine } from '../src/fleet-twin/rerouting/reroute-engine';

describe('App Startup Boot Smoke Test', () => {
  let appModule: TestingModule;

  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://dummy.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-key';
    process.env.SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'dummy-secret-at-least-32-chars-long';
    process.env.PORT = '3000';
    process.env.FLEET_TWIN_ENABLED = 'true';

    appModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterAll(async () => {
    if (appModule) {
      await appModule.close();
    }
  });

  it('should compile AppModule and resolve all dependencies without ExceptionHandler errors', () => {
    expect(appModule).toBeDefined();
  });

  it('should resolve FleetTwinService, PredictionService, and RerouteEngine from DI context', () => {
    const fleetTwinService = appModule.get(FleetTwinService);
    const predictionService = appModule.get(PredictionService);
    const rerouteEngine = appModule.get(RerouteEngine);

    expect(fleetTwinService).toBeDefined();
    expect(predictionService).toBeDefined();
    expect(rerouteEngine).toBeDefined();
  });

  it('should compile AppModule cleanly when FLEET_TWIN_ENABLED=false', async () => {
    process.env.FLEET_TWIN_ENABLED = 'false';
    const disabledModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(disabledModule).toBeDefined();
    const service = disabledModule.get(FleetTwinService);
    expect(service.isEnabled()).toBe(false);

    await disabledModule.close();
    process.env.FLEET_TWIN_ENABLED = 'true';
  });
});
