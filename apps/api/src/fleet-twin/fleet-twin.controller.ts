import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  NotFoundException,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { FleetTwinService } from './fleet-twin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  PredictionQueryDto,
  RerouteRequestDto,
  AcceptRerouteDto,
  WhatIfDto,
} from './dto/fleet-twin.dto';
import { WhatIfParams } from '@nexus-ways/shared';

@Controller(['api/fleet-twin', 'fleet-twin'])
@UseGuards(JwtAuthGuard, RolesGuard)
export class FleetTwinController {
  constructor(private readonly fleetTwinService: FleetTwinService) {}

  private checkEnabled() {
    if (!this.fleetTwinService.isEnabled()) {
      throw new NotFoundException('Fleet Digital Twin module is disabled via FLEET_TWIN_ENABLED');
    }
  }

  @Get('status')
  async getStatus() {
    return this.fleetTwinService.getStatus();
  }

  @Get('traffic/health')
  async getTrafficHealth(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const parsedLat = lat !== undefined ? Number(lat) : undefined;
    const parsedLng = lng !== undefined ? Number(lng) : undefined;
    return this.fleetTwinService.getTrafficDiagnostics(parsedLat, parsedLng);
  }

  @Get('overview')
  @Roles('manager', 'operator')
  async getOverview() {
    this.checkEnabled();
    return this.fleetTwinService.getOverview();
  }

  @Get('fleets')
  @Roles('manager', 'operator')
  async getFleets() {
    this.checkEnabled();
    return this.fleetTwinService.getFleets();
  }

  @Get('fleets/:id/vehicles')
  @Roles('manager', 'operator')
  async getVehiclesByFleet(@Param('id') fleetId: string) {
    this.checkEnabled();
    return this.fleetTwinService.getVehiclesByFleet(fleetId);
  }

  @Get('vehicles')
  @Roles('manager', 'operator')
  async getAllVehicles() {
    this.checkEnabled();
    return this.fleetTwinService.getAllVehicles();
  }

  @Get('vehicles/:id')
  @Roles('manager', 'operator', 'driver')
  async getVehicleById(@CurrentUser() user: any, @Param('id') id: string) {
    this.checkEnabled();
    await this.fleetTwinService.assertDriverOwnsVehicle(user, id);
    return this.fleetTwinService.getVehicleById(id);
  }

  @Get('vehicles/:id/checkpoints')
  @Roles('manager', 'operator', 'driver')
  async getCheckpointsByVehicle(@CurrentUser() user: any, @Param('id') id: string) {
    this.checkEnabled();
    await this.fleetTwinService.assertDriverOwnsVehicle(user, id);
    return this.fleetTwinService.getCheckpointsByVehicle(id);
  }

  @Get('vehicles/:id/route-changes')
  @Roles('manager', 'operator', 'driver')
  async getRouteChanges(@CurrentUser() user: any, @Param('id') id: string) {
    this.checkEnabled();
    await this.fleetTwinService.assertDriverOwnsVehicle(user, id);
    return this.fleetTwinService.getRouteChanges(id);
  }

  @Get('vehicles/:id/prediction')
  @Roles('manager', 'operator', 'driver')
  async getVehiclePrediction(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query() query: PredictionQueryDto,
  ) {
    this.checkEnabled();
    await this.fleetTwinService.assertDriverOwnsVehicle(user, id);
    const whatIf: WhatIfParams = {
      rain_severity_multiplier: query.rain_severity_multiplier ?? 1.0,
      toll_strike_hours: query.toll_strike_hours ?? 0,
      breakdown_hours: query.breakdown_hours ?? 0,
    };
    return this.fleetTwinService.getVehicleDigitalTwin(id, whatIf);
  }

  @Post('vehicles/:id/reroute')
  @Roles('manager', 'operator')
  async calculateReroute(
    @Param('id') id: string,
    @Body() dto: RerouteRequestDto,
  ) {
    this.checkEnabled();
    const whatIf: WhatIfParams = dto.whatIf || {
      rain_severity_multiplier: 1.0,
      toll_strike_hours: 0,
      breakdown_hours: 0,
    };
    return this.fleetTwinService.calculateReroute(id, dto.mode || 'balanced', whatIf);
  }

  @Post('vehicles/:id/reroute/accept')
  @Roles('manager', 'operator')
  async acceptReroute(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AcceptRerouteDto,
  ) {
    this.checkEnabled();
    return this.fleetTwinService.acceptReroute(id, dto.rerouteId, dto.candidateId, user);
  }

  @Post('vehicles/:id/reroute/revert')
  @Roles('manager', 'operator')
  async revertReroute(@Param('id') id: string) {
    this.checkEnabled();
    return this.fleetTwinService.revertReroute(id);
  }

  @Post('seed')
  @Roles('manager', 'operator')
  async seedMockData() {
    this.checkEnabled();
    return this.fleetTwinService.seedData();
  }

  @Delete('mock')
  @Roles('manager', 'operator')
  @HttpCode(HttpStatus.OK)
  async purgeMockData() {
    this.checkEnabled();
    return this.fleetTwinService.purgeData();
  }
}

