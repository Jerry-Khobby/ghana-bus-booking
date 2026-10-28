import { SetMetadata } from '@nestjs/common';

export const ALLOW_QUERY_TOKEN = 'allowQueryToken';

/**
 * For SSE routes only: browsers can't send an Authorization header on an
 * EventSource, so the access token may come as ?accessToken= instead. It's
 * checked once, when the stream opens.
 */
export const AllowQueryToken = () => SetMetadata(ALLOW_QUERY_TOKEN, true);
