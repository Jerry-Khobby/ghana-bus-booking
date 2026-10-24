import { Controller } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';

// Routes span several prefixes, so each handler sets its full path.
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}
}
