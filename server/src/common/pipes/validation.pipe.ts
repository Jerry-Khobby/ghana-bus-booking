import { HttpStatus, ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException } from '../errors/app.exception.js';

/**
 * Global DTO validation. Unknown fields are rejected, and query strings are
 * turned into the DTO's types (numbers, booleans, arrays).
 *
 * Failures become VALIDATION_FAILED with
 * `details.fields = { "from": ["from must be a UUID"], "contact.email": [...] }`.
 */
export function createValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new AppException(
        'VALIDATION_FAILED',
        'Some fields are invalid',
        HttpStatus.BAD_REQUEST,
        { fields: collectFieldErrors(errors) },
      ),
  });
}

// Flattens nested errors into dotted paths: `contact.email`, `seats.0.label`.
export function collectFieldErrors(
  errors: ValidationError[],
  parent = '',
  fields: Record<string, string[]> = {},
): Record<string, string[]> {
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      fields[path] = Object.values(error.constraints);
    }
    if (error.children?.length) {
      collectFieldErrors(error.children, path, fields);
    }
  }
  return fields;
}
