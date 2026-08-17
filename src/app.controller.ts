import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './database/prisma.service';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DatabaseHealthResponseDto } from './common/dto/health-response.dto';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOkResponse({ type: String, example: 'Hello World!' })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health/db')
  @ApiOkResponse({ type: DatabaseHealthResponseDto })
  async getDatabaseHealth(): Promise<{ status: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
