import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Optional,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AlertPrioritizationService } from './alert-prioritization.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AlertLifecycleUpdateRequest } from '@nexus-ways/shared';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly alertPrioritization?: AlertPrioritizationService,
  ) {}

  @Get('prioritized-alerts')
  async getPrioritizedAlerts(
    @Req() req: any,
    @Query('filter') filter: string = 'active',
  ) {
    const orgId = req.user.orgId || req.user.org_id;
    const userId = req.user.id || req.user.sub;
    const userRole = req.user.role || 'manager';
    if (!this.alertPrioritization) {
      return {
        alerts: [],
        summary: {
          totalActive: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          resolvedCount: 0,
          unacknowledgedCount: 0,
          highestPriorityAlert: null,
        },
      };
    }
    return this.alertPrioritization.getPrioritizedAlerts(orgId, userId, userRole, filter);
  }

  @Patch('prioritized-alerts/:id/lifecycle')
  async updateAlertLifecycle(
    @Param('id') id: string,
    @Body() body: AlertLifecycleUpdateRequest,
    @Req() req: any,
  ) {
    const orgId = req.user.orgId || req.user.org_id;
    const userId = req.user.id || req.user.sub;
    const userRole = req.user.role || 'manager';
    const userName = req.user.fullName || req.user.email || userRole;
    if (!this.alertPrioritization) {
      return { alert: null };
    }
    const alert = await this.alertPrioritization.updateLifecycle(
      orgId,
      userId,
      userRole,
      userName,
      id,
      body,
    );
    return { alert };
  }

  @Get()
  async getNotifications(@Req() req: any) {
    const orgId = req.user.orgId || req.user.org_id;
    const userId = req.user.id || req.user.sub;
    const notifications = await this.notificationsService.getNotifications(orgId, userId);
    return { notifications };
  }

  @Get('unread-count')
  async getUnreadCount(@Req() req: any) {
    const orgId = req.user.orgId || req.user.org_id;
    const userId = req.user.id || req.user.sub;
    const count = await this.notificationsService.getUnreadCount(orgId, userId);
    return { count };
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Req() req: any) {
    const orgId = req.user.orgId || req.user.org_id;
    const userId = req.user.id || req.user.sub;
    const notification = await this.notificationsService.markAsRead(id, orgId, userId);
    return { notification };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('manager')
  async createNotification(@Body() dto: CreateNotificationDto, @Req() req: any) {
    const orgId = req.user.orgId || req.user.org_id;
    const notification = await this.notificationsService.createNotification(orgId, dto);
    return { notification };
  }
}
