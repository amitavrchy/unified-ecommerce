import { ApiProperty } from '@nestjs/swagger';
import {
  PaymentPurpose,
  PaymentStatus,
  QuoteStatus,
  RequestStatus,
  TechnicianVerificationStatus,
  UserRole,
} from '../../../../generated/prisma/enums';

export class AddressResponseDto {
  @ApiProperty({ example: 'cm6f4m0xw0001s1a2b3c4d5e6' })
  id!: string;

  @ApiProperty({ example: 'cm6f4m0xw0000s1a2b3c4d5e6' })
  userId!: string;

  @ApiProperty({ example: '123 Main Street' })
  line1!: string;

  @ApiProperty({ nullable: true, example: 'Unit 4B' })
  apartment!: string | null;

  @ApiProperty({ example: 'Toronto' })
  city!: string;

  @ApiProperty({ example: 'ON' })
  state!: string;

  @ApiProperty({ example: 'M5V 2T6' })
  zipCode!: string;

  @ApiProperty({ example: 'Canada' })
  country!: string;

  @ApiProperty({ nullable: true, example: 43.6426 })
  latitude!: number | null;

  @ApiProperty({ nullable: true, example: -79.3871 })
  longitude!: number | null;

  @ApiProperty({ example: true })
  isPrimary!: boolean;
}

export class TechnicianProfileResponseDto {
  @ApiProperty({ example: 'cm6f4m0xw0002s1a2b3c4d5e6' })
  id!: string;

  @ApiProperty({ example: 'cm6f4m0xw0000s1a2b3c4d5e6' })
  userId!: string;

  @ApiProperty({ nullable: true, example: 'TECH-1001' })
  employeeId!: string | null;

  @ApiProperty({ example: 'Greater Toronto Area' })
  serviceArea!: string;

  @ApiProperty({ type: [String], example: ['Central vacuum repair'] })
  skills!: string[];

  @ApiProperty({ nullable: true, example: 'LIC-123456' })
  licenseNumber!: string | null;

  @ApiProperty({ nullable: true, example: 6 })
  yearsExperience!: number | null;

  @ApiProperty({ nullable: true, example: 'Certified technician.' })
  bio!: string | null;

  @ApiProperty({ example: 4.75 })
  rating!: number;

  @ApiProperty({ example: true })
  isAvailable!: boolean;

  @ApiProperty({
    enum: TechnicianVerificationStatus,
    enumName: 'TechnicianVerificationStatus',
  })
  verificationStatus!: TechnicianVerificationStatus;

  @ApiProperty({ nullable: true, example: 'Licence document verified.' })
  verificationNotes!: string | null;
}

export class UserResponseDto {
  @ApiProperty({ example: 'cm6f4m0xw0000s1a2b3c4d5e6' })
  id!: string;

  @ApiProperty({
    enum: UserRole,
    enumName: 'UserRole',
    example: UserRole.CUSTOMER,
  })
  role!: UserRole;

  @ApiProperty({ format: 'email', example: 'alex@example.com' })
  email!: string;

  @ApiProperty({ example: 'Alex' })
  firstName!: string;

  @ApiProperty({ example: 'Morgan' })
  lastName!: string;

  @ApiProperty({ nullable: true, example: '+1 416 555 0100' })
  phone!: string | null;

  @ApiProperty({ nullable: true, format: 'uri' })
  avatarUrl!: string | null;

  @ApiProperty({ nullable: true, example: 'Morgan Home Services' })
  company!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  termsAcceptedAt!: string | null;

  @ApiProperty({ nullable: true, example: '2026-08-17' })
  termsVersion!: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  onboardingCompletedAt!: string | null;

  @ApiProperty({ example: true })
  notificationEmail!: boolean;

  @ApiProperty({ example: true })
  notificationPush!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class UserProfileResponseDto extends UserResponseDto {
  @ApiProperty({ type: () => [AddressResponseDto] })
  addresses!: AddressResponseDto[];

  @ApiProperty({
    type: () => TechnicianProfileResponseDto,
    nullable: true,
  })
  technician!: TechnicianProfileResponseDto | null;
}

export class UserWithTechnicianResponseDto extends UserResponseDto {
  @ApiProperty({
    type: () => TechnicianProfileResponseDto,
    nullable: true,
  })
  technician!: TechnicianProfileResponseDto | null;
}

export class ServiceRequestPaymentSummaryResponseDto {
  @ApiProperty({ example: 'cm6f4m0xw0003s1a2b3c4d5e6' })
  id!: string;

  @ApiProperty({ example: 'SR-12345678' })
  requestNumber!: string;

  @ApiProperty({ example: 'cm6f4m0xw0000s1a2b3c4d5e6' })
  customerId!: string;

  @ApiProperty({ nullable: true })
  technicianId!: string | null;

  @ApiProperty({ example: 'cm6f4m0xw0004s1a2b3c4d5e6' })
  categoryId!: string;

  @ApiProperty({ nullable: true })
  issueId!: string | null;

  @ApiProperty({ example: 'cm6f4m0xw0001s1a2b3c4d5e6' })
  addressId!: string;

  @ApiProperty({ example: 'The central vacuum has low suction.' })
  description!: string;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  preferredDate!: string | null;

  @ApiProperty({ nullable: true, example: '09:00-12:00' })
  preferredTime!: string | null;

  @ApiProperty({ enum: RequestStatus, enumName: 'RequestStatus' })
  status!: RequestStatus;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  scheduledStart!: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  scheduledEnd!: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  startedAt!: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  completedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class QuotationPaymentSummaryResponseDto {
  @ApiProperty({ example: 'cm6f4m0xw0005s1a2b3c4d5e6' })
  id!: string;

  @ApiProperty({ example: 'QT-12345678' })
  quoteNumber!: string;

  @ApiProperty({ example: 'cm6f4m0xw0003s1a2b3c4d5e6' })
  requestId!: string;

  @ApiProperty({ example: 125 })
  laborAmount!: number;

  @ApiProperty({ example: 45 })
  partsAmount!: number;

  @ApiProperty({ example: 22.1 })
  taxAmount!: number;

  @ApiProperty({ example: 0 })
  discountAmount!: number;

  @ApiProperty({ example: 192.1 })
  totalAmount!: number;

  @ApiProperty({
    nullable: true,
    example: 'Includes replacement filter.',
  })
  notes!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  validUntil!: string;

  @ApiProperty({ enum: QuoteStatus, enumName: 'QuoteStatus' })
  status!: QuoteStatus;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  acceptedAt!: string | null;

  @ApiProperty({ nullable: true, example: 'pi_3Example' })
  paymentReference!: string | null;

  @ApiProperty({ type: () => ServiceRequestPaymentSummaryResponseDto })
  request!: ServiceRequestPaymentSummaryResponseDto;
}

export class PaymentResponseDto {
  @ApiProperty({ example: 'cm6f4m0xw0006s1a2b3c4d5e6' })
  id!: string;

  @ApiProperty({ example: 'cm6f4m0xw0000s1a2b3c4d5e6' })
  userId!: string;

  @ApiProperty({ nullable: true, example: 'cm6f4m0xw0005s1a2b3c4d5e6' })
  quotationId!: string | null;

  @ApiProperty({ nullable: true, example: 'order-id' })
  orderId!: string | null;

  @ApiProperty({ enum: PaymentPurpose, enumName: 'PaymentPurpose' })
  purpose!: PaymentPurpose;

  @ApiProperty({ example: 'stripe' })
  provider!: string;

  @ApiProperty({ nullable: true, example: 'pi_3Example' })
  providerReference!: string | null;

  @ApiProperty({ example: 'cad' })
  currency!: string;

  @ApiProperty({ nullable: true, example: 'cs_test_...' })
  stripeCheckoutSessionId!: string | null;

  @ApiProperty({ nullable: true, example: 'pi_3Example' })
  stripePaymentIntentId!: string | null;

  @ApiProperty({ example: 192.1 })
  amount!: number;

  @ApiProperty({ enum: PaymentStatus, enumName: 'PaymentStatus' })
  status!: PaymentStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({
    type: () => QuotationPaymentSummaryResponseDto,
    nullable: true,
  })
  quotation!: QuotationPaymentSummaryResponseDto | null;
}
