import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { TripsService } from './trips.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  Trip,
  SavedRoute,
  TripEtaResponse,
  TripReportUrlResponse,
  DispatchPreviewRequest,
  DispatchTripRequest,
} from '@nexus-ways/shared';
import { CreateTripDto, UpdateTripStatusDto, AddCheckpointDto } from './dto/trip.dto';

@Controller('trips')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  private async assertDriverOwnsTrip(user: any, tripId: string): Promise<Trip> {
    const trip = await this.tripsService.findOne(user.orgId, tripId);
    if (user.role === 'driver') {
      const ownsTrip =
        trip.driver?.user_id === user.id || trip.driver?.user?.id === user.id;
      if (!ownsTrip) {
        throw new ForbiddenException('Forbidden: Drivers can only access their own assigned trips');
      }
    }
    return trip;
  }

  @Get()
  async findAll(@CurrentUser() user: any): Promise<Trip[]> {
    const trips = await this.tripsService.findAll(user.orgId);
    if (user.role === 'driver') {
      return trips.filter(
        (t) => t.driver?.user_id === user.id || t.driver?.user?.id === user.id,
      );
    }
    return trips;
  }

  @Get('history')
  async getHistory(
    @CurrentUser() user: any,
    @Query('vehicleId') vehicleId?: string,
    @Query('driverId') driverId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<Trip[]> {
    const history = await this.tripsService.getTripHistory(user.orgId, { vehicleId, driverId, status, search, from, to });
    if (user.role === 'driver') {
      return history.filter(
        (t) => t.driver?.user_id === user.id || t.driver?.user?.id === user.id,
      );
    }
    return history;
  }

  @Post('preview-dispatch')
  @Roles('manager')
  async previewDispatch(
    @CurrentUser() user: any,
    @Body() body: DispatchPreviewRequest,
  ) {
    return this.tripsService.previewDispatch(user.orgId, body);
  }

  @Post('dispatch')
  @Roles('manager')
  async dispatchTrip(
    @CurrentUser() user: any,
    @Body() body: DispatchTripRequest,
  ): Promise<Trip> {
    return this.tripsService.dispatchTrip(user.orgId, body);
  }

  @Get('saved-routes')
  async findSavedRoutes(
    @CurrentUser() user: any,
    @Query('origin') origin?: string,
    @Query('destination') destination?: string,
  ): Promise<SavedRoute[]> {
    return this.tripsService.findSavedRoutes(user.orgId, origin, destination);
  }

  @Get(':id/completion-report')
  async getCompletionReport(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    await this.assertDriverOwnsTrip(user, id);
    return this.tripsService.getCompletionReport(user.orgId, id);
  }

  @Post(':id/complete')
  @Roles('manager', 'operator', 'driver')
  async completeTrip(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body?: { note?: string },
  ) {
    await this.assertDriverOwnsTrip(user, id);
    return this.tripsService.completeTrip(user.orgId, id, body?.note);
  }

  @Get(':id/eta')
  async getEta(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ): Promise<TripEtaResponse> {
    await this.assertDriverOwnsTrip(user, id);
    return this.tripsService.getEta(user.orgId, id);
  }

  @Get(':id/report')
  async getReport(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ): Promise<TripReportUrlResponse> {
    await this.assertDriverOwnsTrip(user, id);
    return this.tripsService.getTripReport(user.orgId, id);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ): Promise<Trip> {
    return this.assertDriverOwnsTrip(user, id);
  }

  @Post()
  @Roles('manager')
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateTripDto,
  ): Promise<Trip> {
    return this.tripsService.create(user.orgId, dto);
  }

  @Patch(':id/checkpoints')
  @Roles('manager')
  async addCheckpoint(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AddCheckpointDto,
  ): Promise<Trip> {
    return this.tripsService.addCheckpoint(user.orgId, id, dto);
  }

  @Patch(':id/status')
  @Roles('manager', 'operator', 'driver')
  async updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateTripStatusDto,
  ): Promise<Trip> {
    await this.assertDriverOwnsTrip(user, id);
    return this.tripsService.updateStatus(user.orgId, id, dto);
  }

  @Delete(':id')
  @Roles('manager', 'operator')
  async remove(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.tripsService.deleteTrip(user.orgId, id);
  }
}
