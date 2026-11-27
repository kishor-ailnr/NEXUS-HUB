import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { AlertPrioritizationService } from './alert-prioritization.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { FleetTwinModule } from '../fleet-twin/fleet-twin.module';

@Module({
  imports: [SupabaseModule, FleetTwinModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, AlertPrioritizationService],
  exports: [NotificationsService, AlertPrioritizationService],
})
export class NotificationsModule {}
