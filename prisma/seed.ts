import 'dotenv/config';
import { hash } from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import {
  TechnicianVerificationStatus,
  UserRole,
} from '../generated/prisma/enums';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const SEED_USERS = [
  {
    role: UserRole.ADMIN,
    email: process.env.ADMIN_EMAIL?.toLowerCase() ?? 'admin@vacuumcare.local',
    password: process.env.ADMIN_PASSWORD ?? 'Admin1234!',
    firstName: 'System',
    lastName: 'Admin',
    phone: '+14165550100',
  },
  {
    role: UserRole.CUSTOMER,
    email:
      process.env.CUSTOMER_EMAIL?.toLowerCase() ?? 'customer@vacuumcare.local',
    password: process.env.CUSTOMER_PASSWORD ?? 'Customer1234!',
    firstName: 'Alex',
    lastName: 'Morgan',
    phone: '+14165550101',
  },
  {
    role: UserRole.TECHNICIAN,
    email:
      process.env.TECHNICIAN_EMAIL?.toLowerCase() ??
      'technician@vacuumcare.local',
    password: process.env.TECHNICIAN_PASSWORD ?? 'Technician1234!',
    firstName: 'Riley',
    lastName: 'Chen',
    phone: '+14165550102',
  },
] as const;

async function upsertUser(seed: (typeof SEED_USERS)[number]) {
  const passwordHash = await hash(seed.password, 12);
  return prisma.user.upsert({
    where: { email: seed.email },
    update: {
      passwordHash,
      isActive: true,
      firstName: seed.firstName,
      lastName: seed.lastName,
      phone: seed.phone,
    },
    create: {
      role: seed.role,
      email: seed.email,
      passwordHash,
      firstName: seed.firstName,
      lastName: seed.lastName,
      phone: seed.phone,
      isActive: true,
      addresses: {
        create: {
          line1: '123 Main Street',
          city: 'Toronto',
          state: 'ON',
          zipCode: 'M5V 2T6',
          isPrimary: true,
        },
      },
      technician:
        seed.role === UserRole.TECHNICIAN
          ? {
              create: {
                serviceArea: 'Greater Toronto Area',
                skills: ['Central vacuum repair', 'Installation'],
                employeeId: 'TECH-1001',
                verificationStatus: TechnicianVerificationStatus.VERIFIED,
                verifiedAt: new Date(),
                isAvailable: true,
              },
            }
          : undefined,
    },
  });
}

async function main() {
  for (const seed of SEED_USERS) {
    await upsertUser(seed);
  }

  const catalogs = [
    {
      name: 'Maintenance',
      issues: [
        'Unit will not turn on',
        'Unit will not shut off',
        'Clogged system',
        'Low suction',
        'Retractable hose will not pull out or retract',
        'Broken inlet valve / vacuum port',
        'General service or parts request',
      ],
    },
    {
      name: 'Installation',
      issues: ['New System', 'Custom Fit', 'System Upgrade', 'Architectural'],
    },
  ];
  for (const item of catalogs) {
    const category = await prisma.serviceCategory.upsert({
      where: { name: item.name },
      update: {},
      create: { name: item.name },
    });
    for (const name of item.issues)
      await prisma.serviceIssue.upsert({
        where: { categoryId_name: { categoryId: category.id, name } },
        update: {},
        create: { categoryId: category.id, name },
      });
  }

  const product = await prisma.product.findFirst({
    where: { name: 'Elite 500 Performance' },
  });
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
