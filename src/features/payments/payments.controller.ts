import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Header,
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
  PreviewCheckoutDto,
  CheckoutPreviewResponseDto,
  ServiceAuthorizationResponseDto,
  StripePaymentResponseDto,
  StripeWebhookReceiptDto,
} from './dto/checkout.dto';
import { InvoiceResponseDto } from './dto/invoice.dto';
import { InvoiceService } from './invoice.service';
import { StripeService } from './stripe.service';

@ApiTags('Checkout')
@ApiBearerAuth()
@Controller('checkout')
@UseGuards(JwtAuthGuard)
export class CheckoutController {
  constructor(private readonly stripe: StripeService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview order totals without reserving inventory',
    description:
      'Use for the cart/Buy Now summary before opening Stripe. Omit items to preview the saved cart. Pass shippingAddressId to confirm the address that checkout will use.',
  })
  @ApiOkResponse({ type: CheckoutPreviewResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  previewCheckout(
    @CurrentUser() user: AuthUser,
    @Body() dto: PreviewCheckoutDto,
  ) {
    return this.stripe.previewCheckout(user, dto);
  }

  @Post('orders')
  @ApiOperation({
    summary: 'Create a hosted Stripe Checkout Session for shop items',
    description:
      'Returns checkoutUrl. Redirect the browser there immediately. Cards are entered only on Stripe. Payment completion comes from the webhook after FRONTEND_PAYMENT_SUCCESS_URL.',
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
      'Returns checkoutUrl. Redirect the browser there immediately. After payment Stripe sends the customer to FRONTEND_PAYMENT_SUCCESS_URL; this API marks the order paid from the webhook.',
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
  constructor(
    private readonly stripe: StripeService,
    private readonly invoices: InvoiceService,
  ) {}

  @Post('service-requests/:requestId/authorization')
  @ApiOperation({
    summary:
      'Open Stripe Checkout for an accepted service quote (hosted payment page)',
    description:
      'Returns checkoutUrl. The frontend must redirect the browser there immediately. After the customer pays, Stripe sends them to FRONTEND_PAYMENT_SUCCESS_URL and this API records the hold from the webhook. Do not collect cards or confirm a PaymentIntent in the app.',
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

  @Get(':id/invoice')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @ApiOperation({
    summary: 'Get a printable invoice assembled from an existing payment',
  })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiOkResponse({ type: InvoiceResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  invoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoices.forPayment(user, id);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
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
