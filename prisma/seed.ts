import 'dotenv/config';
import { hash } from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    await prisma.user.upsert({
      where: { email: adminEmail.toLowerCase() },
      update: {},
      create: { role: 'ADMIN', email: adminEmail.toLowerCase(), passwordHash: await hash(adminPassword, 12), firstName: 'System', lastName: 'Admin' },
    });
  }

  const catalogs = [
    { name: 'Maintenance', issues: ['Unit will not turn on', 'Unit will not shut off', 'Clogged system', 'Low suction', 'Retractable hose will not pull out or retract', 'Broken inlet valve / vacuum port', 'General service or parts request'] },
    { name: 'Installation', issues: ['New System', 'Custom Fit', 'System Upgrade', 'Architectural'] },
  ];
  for (const item of catalogs) {
    const category = await prisma.serviceCategory.upsert({ where: { name: item.name }, update: {}, create: { name: item.name } });
    for (const name of item.issues) await prisma.serviceIssue.upsert({ where: { categoryId_name: { categoryId: category.id, name } }, update: {}, create: { categoryId: category.id, name } });
  }

  const product = await prisma.product.findFirst({ where: { name: 'Elite 500 Performance' } });
  if (!product) {
    await prisma.product.create({
      data: {
        name: 'Elite 500 Performance',
        slug: 'elite-500-performance',
        description: 'Quiet-flow central vacuum system with HEPA filtration.',
        category: 'Central Vacuum Units',
        price: 349,
        stock: 20,
        imageUrls: [],
        features: ['HEPA filtration', 'Quiet-flow motor'],
        warranty: '5-year manufacturer warranty',
        shippingInfo: 'Ships within 1–2 business days.',
      },
    });
  }
}

main().finally(() => prisma.$disconnect());
