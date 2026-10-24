import { Controller } from '@nestjs/common';
import { AuthService } from './auth.service.js';

// Routes span several prefixes, so each handler sets its full path.
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}
}
