import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { UserRole } from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import { adminPage, adminSkip } from '../common/admin-pagination';
import {
  AdminCustomerQueryDto,
  AdminUpdateCustomerDto,
} from './dto/customers.dto';

type SafeUser = Omit<Prisma.UserGetPayload<object>, 'passwordHash'>;
type CustomerViewRow = SafeUser & {
  _count: { customerRequests: number; orders: number };
};

@Injectable()
export class AdminCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminCustomerQueryDto) {
    const where: Prisma.UserWhereInput = { role: UserRole.CUSTOMER };
    if (query.search) where.OR = this.personSearch(query.search);
    const result = await adminPage(
      this.prisma,
      this.prisma.user.findMany({
        where,
        omit: { passwordHash: true },
        include: {
          _count: { select: { customerRequests: true, orders: true } },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        skip: adminSkip(query),
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
      query,
    );
    return {
      ...result,
      items: result.items.map((row) => this.customerView(row)),
    };
  }

  async get(id: string) {
    const row = await this.prisma.user.findFirst({
      where: { id, role: UserRole.CUSTOMER },
      omit: { passwordHash: true },
      include: {
        addresses: { orderBy: [{ isPrimary: 'desc' }, { city: 'asc' }] },
        _count: { select: { customerRequests: true, orders: true } },
      },
    });
    if (!row) throw new NotFoundException('Customer not found');
    return this.customerView(row);
  }

  async update(id: string, dto: AdminUpdateCustomerDto) {
    const exists = await this.prisma.user.findFirst({
      where: { id, role: UserRole.CUSTOMER },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Customer not found');
    await this.prisma.user.update({ where: { id }, data: dto });
    return this.get(id);
  }

  private personSearch(search: string): Prisma.UserWhereInput[] {
    return [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { company: { contains: search, mode: 'insensitive' } },
      {
        addresses: {
          some: {
            OR: [
              { line1: { contains: search, mode: 'insensitive' } },
              { apartment: { contains: search, mode: 'insensitive' } },
              { city: { contains: search, mode: 'insensitive' } },
              { state: { contains: search, mode: 'insensitive' } },
              { zipCode: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      },
    ];
  }

  private customerView<T extends CustomerViewRow>(row: T) {
    const { _count, ...user } = row;
    return {
      ...user,
      requestCount: _count.customerRequests,
      orderCount: _count.orders,
    };
  }
}
