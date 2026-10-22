import {
  Body,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Controller,
  Get,
  InternalServerErrorException,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../../generated/prisma/enums';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import {
  ApiErrorResponseDto,
  SuccessResponseDto,
} from '../../common/dto/api-response.dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  ResetPasswordDto,
  ResendVerificationDto,
  SignupDto,
  TechnicianSignupDto,
  AdminSignupDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import {
  AuthSessionResponseDto,
  ForgotPasswordResponseDto,
  LogoutResponseDto,
  SignupResponseDto,
  AdminCreatedUserResponseDto,
  ResendVerificationResponseDto,
  VerifyEmailResponseDto,
} from './dto/auth-response.dto';
import { UserProfileResponseDto } from '../users/dto/user-response.dto';
import { EmailVerificationDeliveryService } from './email-verification-delivery.service';
import { PasswordResetDeliveryService } from './password-reset-delivery.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Generates a cryptographically random 5-digit OTP string (10000–99999). */
function generateOtp(): string {
  // Use randomBytes to avoid Math.random bias. Take a 3-byte value, map it
  // into [0, 90000) then add 10000 to guarantee exactly 5 digits.
  const n = randomBytes(3).readUIntBE(0, 3) % 90000;
  return (10000 + n).toString();
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwordResetDelivery: PasswordResetDeliveryService,
    private readonly emailVerificationDelivery: EmailVerificationDeliveryService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Signup ──────────────────────────────────────────────────────────────────

  @Post('customer/signup')
  @ApiOperation({
    summary: 'Register a customer — always sends a 5-digit verification OTP',
  })
  @ApiCreatedResponse({ type: SignupResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'The email address is already registered.',
  })
  signupCustomer(@Body() dto: SignupDto) {
    return this.signup(dto, UserRole.CUSTOMER);
  }

  @Post('technician/signup')
  @ApiOperation({
    summary: 'Register a technician — always sends a 5-digit verification OTP',
  })
  @ApiCreatedResponse({ type: SignupResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'The email address is already registered.',
  })
  signupTechnician(@Body() dto: TechnicianSignupDto) {
    return this.signup(dto, UserRole.TECHNICIAN);
  }

  @Post('admin/signup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create an active administrator account (admin only)',
    description:
      'The first administrator is created by seed. Additional admins must be created by an authenticated administrator and can sign in immediately.',
  })
  @ApiCreatedResponse({ type: AdminCreatedUserResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async signupAdmin(
    @CurrentUser() actor: AuthUser,
    @Body() dto: AdminSignupDto,
  ) {
    if (actor.role !== UserRole.ADMIN)
      throw new ForbiddenException(
        'Only administrators can create admin users',
      );

    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } }))
      throw new ConflictException('Email already registered');
    if (
      dto.phone &&
      (await this.prisma.user.findUnique({ where: { phone: dto.phone } }))
    )
      throw new ConflictException('Phone number already registered');

    const user = await this.prisma.user.create({
      data: {
        role: UserRole.ADMIN,
        email,
        passwordHash: await hash(dto.password, 12),
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    });
    await this.notifications.fanOutToActiveAdmins({
      title: 'Administrator added',
      body: `${user.firstName} ${user.lastName} was granted admin access.`,
      data: { userId: user.id },
    });
    return user;
  }

  private async signup(dto: SignupDto | TechnicianSignupDto, role: UserRole) {
    if (!dto.acceptTerms)
      throw new BadRequestException(
        'Terms acceptance is required to create an account',
      );

    // Check if email is already registered
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      // If user exists but is not verified, provide helpful message
      if (!existingUser.isActive) {
        await this.issueEmailVerificationOtp(
          existingUser.id,
          existingUser.email,
        );
        throw new ConflictException('Verification needed');
      }
      // If user exists and is verified
      throw new ConflictException('Email already registered');
    }

    if (
      dto.phone &&
      (await this.prisma.user.findUnique({ where: { phone: dto.phone } }))
    )
      throw new ConflictException('Phone number already registered');

    const technician =
      role === UserRole.TECHNICIAN ? (dto as TechnicianSignupDto) : undefined;

    // Account is always created inactive until the OTP is verified.
    const user = await this.prisma.user.create({
      data: {
        role,
        email: dto.email.toLowerCase(),
        passwordHash: await hash(dto.password, 12),
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        termsAcceptedAt: new Date(),
        termsVersion: dto.termsVersion,
        isActive: false,
        addresses: {
          create: {
            line1: dto.address,
            apartment: dto.apartment,
            city: dto.city,
            state: dto.state,
            zipCode: dto.zipCode,
            isPrimary: true,
          },
        },
        technician: technician
          ? {
              create: {
                serviceArea: technician.serviceArea,
                skills: technician.skills,
                employeeId: technician.employeeId,
                licenseNumber: technician.licenseNumber,
                yearsExperience: technician.yearsExperience,
                bio: technician.bio,
              },
            }
          : undefined,
      },
      include: { addresses: true, technician: true },
    });

    await this.issueEmailVerificationOtp(user.id, user.email);
    await this.notifications.fanOutToActiveAdmins({
      title:
        role === UserRole.TECHNICIAN
          ? 'New technician registration'
          : 'New customer registration',
      body: `${user.firstName} ${user.lastName} registered as a ${role.toLowerCase()}.`,
      data: { userId: user.id, role },
    });

    return {
      emailVerificationRequired: true,
      message: 'A 5-digit verification code has been sent to your email.',
    };
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  @Post('login')
  @ApiOperation({ summary: 'Login any customer, technician, or admin' })
  @ApiCreatedResponse({ type: AuthSessionResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: 'Credentials are invalid or the account is inactive.',
  })
  async login(@Body() dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { technician: true },
    });
    if (
      !user ||
      !user.isActive ||
      !(await compare(dto.password, user.passwordHash))
    )
      throw new UnauthorizedException('Invalid credentials');
    return this.session(user);
  }

  // ─── Token refresh / logout ──────────────────────────────────────────────────

  @Post('refresh')
  @ApiOperation({ summary: 'Exchange a refresh token for a new session' })
  @ApiCreatedResponse({ type: AuthSessionResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: 'The refresh token is invalid, expired, or revoked.',
  })
  async refresh(@Body() dto: RefreshTokenDto) {
    const tokenHash = createHash('sha256')
      .update(dto.refreshToken)
      .digest('hex');
    const stored = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
    if (!stored?.user?.isActive)
      throw new UnauthorizedException('Invalid refresh token');
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.session(stored.user);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current refresh token' })
  @ApiCreatedResponse({ type: LogoutResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: 'The refresh token is invalid, expired, or already revoked.',
  })
  async logout(@Body() dto: RefreshTokenDto) {
    const tokenHash = createHash('sha256')
      .update(dto.refreshToken)
      .digest('hex');
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
    });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  // ─── Email verification (signup OTP) ─────────────────────────────────────────

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify signup email with the 5-digit OTP' })
  @ApiCreatedResponse({ type: VerifyEmailResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: 'The OTP is invalid, expired, or already used.',
  })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const otpHash = createHash('sha256').update(dto.otp).digest('hex');
    const verification = await this.prisma.emailVerificationToken.findFirst({
      where: {
        tokenHash: otpHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
        user: { email: dto.email.toLowerCase() },
      },
    });
    if (!verification)
      throw new UnauthorizedException('Invalid or expired verification code');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: verification.userId },
        data: { isActive: true },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: verification.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Return a full session so the client can proceed immediately after verification.
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: verification.userId },
    });
    return {
      success: true,
      ...(await this.session(user)),
    };
  }

  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend the signup 5-digit verification OTP' })
  @ApiCreatedResponse({ type: ResendVerificationResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    // Return the same generic message regardless of whether the account exists
    // or is already active, to prevent user enumeration.
    if (!user || user.isActive) {
      return {
        message:
          'If that account exists and still needs verification, a new code has been sent.',
      };
    }

    await this.issueEmailVerificationOtp(user.id, user.email);

    return {
      message:
        'If that account exists and still needs verification, a new code has been sent.',
    };
  }

  // ─── Password reset ───────────────────────────────────────────────────────────

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a 5-digit password-reset OTP' })
  @ApiCreatedResponse({ type: ForgotPasswordResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    // Generic message to prevent email enumeration.
    if (!user)
      return { message: 'If that account exists, a reset code has been sent.' };

    const otp = generateOtp();
    const reset = await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      return tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: createHash('sha256').update(otp).digest('hex'),
          expiresAt: new Date(Date.now() + 15 * 60_000), // 15 minutes
        },
      });
    });

    try {
      await this.passwordResetDelivery.send(user.email, otp);
    } catch {
      await this.prisma.passwordResetToken.delete({ where: { id: reset.id } });
      throw new InternalServerErrorException(
        'Password reset email could not be sent',
      );
    }

    return {
      message: 'If that account exists, a reset code has been sent.',
    };
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using the 5-digit OTP' })
  @ApiCreatedResponse({ type: SuccessResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: 'The OTP is invalid, expired, or already used.',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const otpHash = createHash('sha256').update(dto.otp).digest('hex');
    const reset = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: otpHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
        user: { email: dto.email.toLowerCase() },
      },
    });
    if (!reset)
      throw new UnauthorizedException('Invalid or expired reset code');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash: await hash(dto.password, 12) },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  // ─── Authenticated user ───────────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiBearerAuth()
  @ApiOkResponse({ type: UserProfileResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.prisma.user.findUnique({
      where: { id: user.id },
      omit: { passwordHash: true },
      include: { addresses: true, technician: true },
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Invalidates any existing unused email-verification tokens for the user,
   * generates a new 5-digit OTP, persists its hash (10-minute TTL), delivers
   * the email, and returns the raw OTP so the controller can expose it outside
   * production.
   */
  private async issueEmailVerificationOtp(
    userId: string,
    email: string,
  ): Promise<string> {
    const otp = generateOtp();

    await this.prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const created = await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: createHash('sha256').update(otp).digest('hex'),
        expiresAt: new Date(Date.now() + 10 * 60_000), // 10 minutes
      },
    });

    try {
      await this.emailVerificationDelivery.send(email, otp);
    } catch {
      await this.prisma.emailVerificationToken.delete({
        where: { id: created.id },
      });
      throw new InternalServerErrorException(
        'Verification email could not be sent',
      );
    }

    return otp;
  }

  private async session(user: { id: string; email: string; role: UserRole }) {
    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(refreshToken).digest('hex'),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000), // 7 days
      },
    });
    return {
      accessToken,
      user: { id: user.id, email: user.email, role: user.role },
      refreshToken,
    };
  }
}
