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
import { VehiclesService } from './vehicles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Vehicle } from '@nexus-ways/shared';
import { CreateVehicleDto, UpdateVehicleDto } from './dto/vehicle.dto';

@Controller('vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<Vehicle[]> {
    const vehicles = await this.vehiclesService.findAll(user.orgId, search, includeArchived === 'true');
    if (user.role === 'driver') {
      return vehicles.filter(
        (v) =>
          v.driver?.user?.id === user.id ||
          v.driver?.user_id === user.id ||
          v.active_trip?.driver?.user_id === user.id ||
          v.active_trip?.driver?.user?.id === user.id,
      );
    }
    return vehicles;
  }

  @Get('available')
  @Roles('manager', 'operator')
  async findAvailable(
    @CurrentUser() user: any,
    @Query('cargoWeightKg') cargoWeightKg?: string,
  ) {
    const weight = cargoWeightKg ? Number(cargoWeightKg) : undefined;
    return this.vehiclesService.getAvailableVehicles(user.orgId, weight);
  }

  @Get('availability')
  @Roles('manager', 'operator')
  async getAvailability(@CurrentUser() user: any) {
    return this.vehiclesService.getResourceAvailability(user.orgId);
  }

  @Post(':id/archive')
  @Roles('manager')
  async archive(@CurrentUser() user: any, @Param('id') id: string) {
    return this.vehiclesService.archiveVehicle(user.orgId, id);
  }

  @Post(':id/retire')
  @Roles('manager')
  async retire(@CurrentUser() user: any, @Param('id') id: string) {
    return this.vehiclesService.retireVehicle(user.orgId, id);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ): Promise<Vehicle> {
    const vehicle = await this.vehiclesService.findOne(user.orgId, id);
    if (user.role === 'driver') {
      const ownsVehicle =
        vehicle.driver?.user?.id === user.id ||
        vehicle.driver?.user_id === user.id ||
        vehicle.active_trip?.driver?.user_id === user.id ||
        vehicle.active_trip?.driver?.user?.id === user.id;
      if (!ownsVehicle) {
        throw new ForbiddenException('Forbidden: Drivers can only access their own assigned vehicle');
      }
    }
    return vehicle;
  }

  @Post()
  @Roles('manager')
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateVehicleDto,
  ): Promise<Vehicle> {
    return this.vehiclesService.create(user.orgId, dto);
  }

  @Patch(':id')
  @Roles('manager')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ): Promise<Vehicle> {
    return this.vehiclesService.update(user.orgId, id, dto);
  }

  @Delete(':id')
  @Roles('manager')
  async remove(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.vehiclesService.remove(user.orgId, id);
  }
}
