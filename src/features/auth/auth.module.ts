import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { getJwtSecret } from '../../common/config/jwt-secret';
import { AuthController } from './auth.controller';
import { EmailVerificationDeliveryService } from './email-verification-delivery.service';
import { JwtStrategy } from './jwt.strategy';
import { PasswordResetDeliveryService } from './password-reset-delivery.service';
@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '30m' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    JwtStrategy,
    PasswordResetDeliveryService,
    EmailVerificationDeliveryService,
  ],
})
export class AuthModule {}
