import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminPersonSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() email!: string;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
}

export class AdminNamedEntityDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}
