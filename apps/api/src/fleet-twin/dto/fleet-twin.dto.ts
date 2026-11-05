import { IsOptional, IsNumber, IsString, IsIn, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { RerouteMode, WhatIfParams } from '@nexus-ways/shared';

export class WhatIfDto implements WhatIfParams {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1.0)
  @Max(3.0)
  rain_severity_multiplier: number = 1.0;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(12)
  toll_strike_hours: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(8)
  breakdown_hours: number = 0;
}

export class PredictionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1.0)
  @Max(3.0)
  rain_severity_multiplier?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(12)
  toll_strike_hours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(8)
  breakdown_hours?: number;
}

export class RerouteRequestDto {
  @IsOptional()
  @IsString()
  @IsIn(['fastest', 'cheapest', 'safest', 'balanced'])
  mode?: RerouteMode;

  @IsOptional()
  @ValidateNested()
  @Type(() => WhatIfDto)
  whatIf?: WhatIfDto;
}

export class AcceptRerouteDto {
  @IsOptional()
  @IsString()
  rerouteId?: string;
}

