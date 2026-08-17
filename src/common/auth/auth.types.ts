import { UserRole } from '../../../generated/prisma/enums';

export type AuthUser = { id: string; email: string; role: UserRole };
