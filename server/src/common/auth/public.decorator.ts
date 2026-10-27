import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/**
 * No sign-in needed. A valid access token is still read (so a signed-in
 * passenger is recognised), but a missing or expired one is fine.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
