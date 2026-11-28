import { Module } from '@nestjs/common';
import { FleetTwinController } from './fleet-twin.controller';
import { FleetTwinService } from './fleet-twin.service';
import { PredictionService } from './prediction/prediction.service';
import { RerouteEngine } from './rerouting/reroute-engine';
import { MockWeatherProvider, OpenMeteoWeatherProvider } from './prediction/providers/weather.provider';
import { MockTrafficProvider, TomTomTrafficProvider } from './prediction/providers/traffic.provider';
import { MockTollProvider, IndianHighwayTollProvider } from './prediction/providers/toll.provider';
import { WEATHER_PROVIDER, TRAFFIC_PROVIDER, TOLL_PROVIDER } from './tokens';
import { SupabaseModule } from '../supabase/supabase.module';
import { RoutingModule } from '../routing/routing.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [SupabaseModule, RoutingModule, RealtimeModule],
  controllers: [FleetTwinController],
  providers: [
    { provide: WEATHER_PROVIDER, useClass: OpenMeteoWeatherProvider },
    { provide: TRAFFIC_PROVIDER, useClass: TomTomTrafficProvider },
    { provide: TOLL_PROVIDER, useClass: IndianHighwayTollProvider },
    MockWeatherProvider,
    OpenMeteoWeatherProvider,
    MockTrafficProvider,
    TomTomTrafficProvider,
    MockTollProvider,
    IndianHighwayTollProvider,
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
