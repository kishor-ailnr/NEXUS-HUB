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
} from '@nestjs/common';
import { FleetTwinService } from './fleet-twin.service';
import {
  PredictionQueryDto,
  RerouteRequestDto,
  AcceptRerouteDto,
  WhatIfDto,
} from './dto/fleet-twin.dto';
import { WhatIfParams } from '@nexus-ways/shared';

@Controller(['api/fleet-twin', 'fleet-twin'])
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

  @Get('fleets')
  async getFleets() {
    this.checkEnabled();
    return this.fleetTwinService.getFleets();
  }

  @Get('fleets/:id/vehicles')
  async getVehiclesByFleet(@Param('id') fleetId: string) {
    this.checkEnabled();
    return this.fleetTwinService.getVehiclesByFleet(fleetId);
  }

  @Get('vehicles')
  async getAllVehicles() {
    this.checkEnabled();
    return this.fleetTwinService.getAllVehicles();
  }

  @Get('vehicles/:id')
  async getVehicleById(@Param('id') id: string) {
    this.checkEnabled();
    return this.fleetTwinService.getVehicleById(id);
  }

  @Get('vehicles/:id/checkpoints')
  async getCheckpointsByVehicle(@Param('id') id: string) {
    this.checkEnabled();
    return this.fleetTwinService.getCheckpointsByVehicle(id);
  }

  @Get('vehicles/:id/prediction')
  async getVehiclePrediction(
    @Param('id') id: string,
    @Query() query: PredictionQueryDto,
  ) {
    this.checkEnabled();
    const whatIf: WhatIfParams = {
      rain_severity_multiplier: query.rain_severity_multiplier ?? 1.0,
      toll_strike_hours: query.toll_strike_hours ?? 0,
      breakdown_hours: query.breakdown_hours ?? 0,
    };
    return this.fleetTwinService.getVehicleDigitalTwin(id, whatIf);
  }

  @Post('vehicles/:id/reroute')
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
  async acceptReroute(
    @Param('id') id: string,
    @Body() dto: AcceptRerouteDto,
  ) {
    this.checkEnabled();
    return this.fleetTwinService.acceptReroute(id, dto.rerouteId);
  }

  @Post('vehicles/:id/reroute/revert')
  async revertReroute(@Param('id') id: string) {
    this.checkEnabled();
    return this.fleetTwinService.revertReroute(id);
  }

  @Post('seed')
  async seedMockData() {
    this.checkEnabled();
    return this.fleetTwinService.seedData();
  }

  @Delete('mock')
  @HttpCode(HttpStatus.OK)
  async purgeMockData() {
    this.checkEnabled();
    return this.fleetTwinService.purgeData();
  }
}

