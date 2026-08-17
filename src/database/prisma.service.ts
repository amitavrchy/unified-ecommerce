import 'dotenv/config';
import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  return databaseUrl;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnApplicationShutdown
{
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: getDatabaseUrl() }) });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
