import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '../../../generated/prisma/enums';
import { getJwtSecret } from '../../common/config/jwt-secret';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: { sub: string; email: string; role: UserRole }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user?.isActive) throw new UnauthorizedException();
    return { id: user.id, email: user.email, role: user.role };
  }
}
