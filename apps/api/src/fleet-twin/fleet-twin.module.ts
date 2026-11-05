import { Module } from '@nestjs/common';
import { FleetTwinController } from './fleet-twin.controller';
import { FleetTwinService } from './fleet-twin.service';
import { PredictionService } from './prediction/prediction.service';
import { RerouteEngine } from './rerouting/reroute-engine';
import { MockWeatherProvider } from './prediction/providers/weather.provider';
import { MockTrafficProvider } from './prediction/providers/traffic.provider';
import { MockTollProvider } from './prediction/providers/toll.provider';
import { WEATHER_PROVIDER, TRAFFIC_PROVIDER, TOLL_PROVIDER } from './tokens';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [FleetTwinController],
  providers: [
    { provide: WEATHER_PROVIDER, useClass: MockWeatherProvider },
    { provide: TRAFFIC_PROVIDER, useClass: MockTrafficProvider },
    { provide: TOLL_PROVIDER, useClass: MockTollProvider },
    MockWeatherProvider,
    MockTrafficProvider,
    MockTollProvider,
    PredictionService,
    RerouteEngine,
    FleetTwinService,
  ],
  exports: [
    FleetTwinService,
    PredictionService,
    RerouteEngine,
    WEATHER_PROVIDER,
    TRAFFIC_PROVIDER,
    TOLL_PROVIDER,
  ],
})
export class FleetTwinModule {}
