import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/public.decorator.js';
import type { Request } from 'express';
import { HoldTokenGuard } from '../bookings/hold-token.guard.js';
import { AppException } from '../common/errors/app.exception.js';
import { HoldStreamQueryDto } from '../realtime/stream-query.dto.js';
import { PayHoldDto } from './dto/pay-hold.dto.js';
import { PaymentOwnerGuard } from './payment-owner.guard.js';
import { PaymentsService } from './payments.service.js';

const holdTokenHeader = {
  name: 'X-Hold-Token',
  required: true,
  description: 'The holdToken from POST /holds',
};

// The hold owner pays and watches the payment with their X-Hold-Token.
// Routes span several prefixes, so each handler sets its full path.
@ApiTags('Payments')
@Public()
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** Pay → "Pay GH¢…". Sends the mobile money prompt or starts a card payment. */
  @Post('holds/:id/pay')
  @UseGuards(HoldTokenGuard)
  @ApiHeader(holdTokenHeader)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Repeat with the same key and body to get the same payment',
  })
  pay(
    @Param('id') id: string,
    @Body() dto: PayHoldDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (
      idempotencyKey !== undefined &&
      !/^[\w-]{8,100}$/.test(idempotencyKey)
    ) {
      throw new AppException(
        'VALIDATION_FAILED',
        'Idempotency-Key must be 8–100 letters, digits, - or _',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.paymentsService.pay(id, dto, idempotencyKey);
  }

  /** Waiting for payment / Payment failed. Poll every few seconds. */
  @Get('payments/:id')
  @UseGuards(PaymentOwnerGuard)
  @ApiHeader(holdTokenHeader)
  getPayment(@Param('id') id: string) {
    return this.paymentsService.getPayment(id);
  }

  /** Paystack calls this; the signature proves it. Not for the frontend. */
  @Post('webhooks/paystack')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async paystackWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    await this.paymentsService.handleWebhook(req.rawBody, signature);
    return { received: true };
  }

  /**
   * Waiting for payment, live: `event: payment` on every change, then the
   * stream ends once it is settled. Send the hold token as ?holdToken=.
   */
  @Sse('payments/:id/stream')
  @UseGuards(PaymentOwnerGuard)
  paymentStream(
    @Param('id') id: string,
    // Read by PaymentOwnerGuard; declared so validation allows it
    @Query() _query: HoldStreamQueryDto,
  ) {
    return this.paymentsService.paymentStream(id);
  }

  /** "I have approved it": checks with the provider right away. */
  @Post('payments/:id/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PaymentOwnerGuard)
  @ApiHeader(holdTokenHeader)
  verify(@Param('id') id: string) {
    return this.paymentsService.verify(id);
  }
}
