import { Prisma } from '../../../generated/prisma/client';

export const orderDetailInclude = {
  customer: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  },
  items: { include: { product: true } },
  returnRequests: true,
  statusHistory: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { updatedAt: 'desc' } },
} satisfies Prisma.OrderInclude;
