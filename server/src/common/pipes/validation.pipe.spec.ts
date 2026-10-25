import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsUUID, ValidateNested } from 'class-validator';
import { AppException } from '../errors/app.exception.js';
import { createValidationPipe } from './validation.pipe.js';

class ContactDto {
  @IsEmail()
  email: string;
}

class ExampleDto {
  @IsUUID()
  from: string;

  @IsInt()
  limit: number;

  @ValidateNested()
  @Type(() => ContactDto)
  contact: ContactDto;
}

const metadata = { type: 'body' as const, metatype: ExampleDto };

describe('createValidationPipe', () => {
  const pipe = createValidationPipe();

  it('reports every bad field, unknown fields included, as VALIDATION_FAILED', async () => {
    const error = await pipe
      .transform(
        { from: 'nope', limit: 5, contact: { email: 'x' }, extra: 1 },
        metadata,
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    const { code, details } = error as AppException;
    expect(code).toBe('VALIDATION_FAILED');
    expect(details.fields).toEqual({
      from: ['from must be a UUID'],
      'contact.email': ['email must be an email'],
      extra: ['property extra should not exist'],
    });
  });

  it('passes valid input through as an instance of the DTO', async () => {
    const value = await pipe.transform(
      {
        from: '0199f5b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b',
        limit: 5,
        contact: { email: 'kofi@example.com' },
      },
      metadata,
    );
    expect(value).toBeInstanceOf(ExampleDto);
  });
});
