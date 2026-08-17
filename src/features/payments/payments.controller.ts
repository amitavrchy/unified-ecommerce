import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import {
  CheckoutSessionResponseDto,
  CreateCartCheckoutDto,
  CreateOrderCheckoutDto,
  ServiceAuthorizationResponseDto,
  StripePaymentResponseDto,
  StripeWebhookReceiptDto,
} from './dto/checkout.dto';
import { StripeService } from './stripe.service';

@ApiTags('Checkout')
@ApiBearerAuth()
@Controller('checkout')
@UseGuards(JwtAuthGuard)
export class CheckoutController {
  constructor(private readonly stripe: StripeService) {}

  @Post('orders')
  @ApiOperation({
    summary: 'Create a hosted Stripe Checkout Session for shop items',
    description:
      'Prices, tax, shipping address ownership, and stock are verified by the server. The returned URL is opened by the client; payment completion comes only from the Stripe webhook.',
  })
  @ApiCreatedResponse({ type: CheckoutSessionResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  createOrderCheckout(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderCheckoutDto,
  ) {
    return this.stripe.createOrderCheckout(user, dto);
  }

  @Post('cart')
  @ApiOperation({
    summary: 'Create a hosted Stripe Checkout Session from the saved cart',
    description:
      'The server reads the saved cart, recalculates prices, and reserves inventory before creating the Stripe Checkout Session.',
  })
  @ApiCreatedResponse({ type: CheckoutSessionResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  createCartCheckout(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCartCheckoutDto,
  ) {
    return this.stripe.createCartCheckout(user, dto);
  }
}

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly stripe: StripeService) {}

  @Post('service-requests/:requestId/authorization')
  @ApiOperation({
    summary:
      'Create a Stripe manual-capture authorization for an accepted service quote',
    description:
      'The client confirms the returned PaymentIntent client secret using Stripe SDK. It must never submit a provider reference or card details to this API.',
  })
  @ApiParam({ name: 'requestId', description: 'Service request ID' })
  @ApiCreatedResponse({ type: ServiceAuthorizationResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  authorizeServicePayment(
    @CurrentUser() user: AuthUser,
    @Param('requestId') requestId: string,
  ) {
    return this.stripe.createServiceAuthorization(user, requestId);
  }

  @Post(':id/capture')
  @ApiOperation({
    summary:
      'Capture an authorized service payment after final approval (admin only)',
  })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiOkResponse({ type: StripePaymentResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  capture(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stripe.captureServicePayment(user, id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a payment visible to the customer or an admin',
  })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiOkResponse({ type: StripePaymentResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stripe.paymentForUser(user, id);
  }
}

@ApiTags('Stripe webhooks')
@Controller('webhooks')
export class StripeWebhooksController {
  constructor(private readonly stripe: StripeService) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive a signed Stripe event',
    description:
      'Public endpoint for Stripe only. The signature is verified against the unmodified raw request body and duplicate event IDs are ignored.',
  })
  @ApiHeader({
    name: 'stripe-signature',
    required: true,
    description:
      'Signature generated by Stripe. Do not construct this in a client.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: true,
      example: { id: 'evt_...', type: 'checkout.session.completed' },
    },
  })
  @ApiOkResponse({ type: StripeWebhookReceiptDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!request.rawBody)
      throw new BadRequestException('Raw webhook body was not available');
    return this.stripe.handleWebhook(request.rawBody, signature);
  }
}
