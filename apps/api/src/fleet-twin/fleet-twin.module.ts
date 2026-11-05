import { Module } from '@nestjs/common';
import { FleetTwinController } from './fleet-twin.controller';
import { FleetTwinService } from './fleet-twin.service';
import { PredictionService } from './prediction/prediction.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [FleetTwinController],
  providers: [FleetTwinService, PredictionService],
  exports: [FleetTwinService, PredictionService],
})
export class FleetTwinModule {}

