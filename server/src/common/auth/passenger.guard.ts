import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../errors/app.exception.js';

/** Routes for signed-in passengers only (/me, My tickets). */
@Injectable()
export class PassengerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<Request>();
    if (user?.typ !== 'passenger') {
      throw new AppException(
        'FORBIDDEN',
        'Only passengers can do this',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
