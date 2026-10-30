/**
 * Every setting the app reads, checked once at startup so a missing or wrong
 * one stops the boot with a clear list, instead of failing on the first
 * request that needs it. Production is stricter: real-looking secrets, no fake
 * payments, and a WEB_URL for emails and CORS.
 */

type Env = Record<string, string | undefined>;

export interface EnvReport {
  errors: string[];
  warnings: string[];
}

const SECRETS = [
  'JWT_ACCESS_SECRET',
  'REFRESH_TOKEN_PEPPER',
  'OTP_PEPPER',
  'QR_SIGNING_SECRET',
  'TICKET_LINK_SECRET',
];

export function checkEnv(env: Env): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = env.NODE_ENV === 'production';
  const value = (name: string) => env[name]?.trim() || undefined;

  const database = value('DATABASE_URL');
  if (!database) errors.push('DATABASE_URL is missing');
  else if (!/^postgres(ql)?:\/\//.test(database)) {
    errors.push('DATABASE_URL must be a postgresql:// URL');
  }

  for (const name of SECRETS) {
    const secret = value(name);
    if (!secret) {
      errors.push(`${name} is missing`);
    } else if (production && (secret.length < 32 || /replace/i.test(secret))) {
      errors.push(`${name} must be a long random string in production`);
    }
  }

  const payments = value('PAYMENT_PROVIDER') ?? 'paystack';
  if (payments === 'paystack') {
    const key = value('PAYSTACK_SECRET_KEY');
    if (!key) errors.push('PAYSTACK_SECRET_KEY is missing');
    else if (!/^sk_(test|live)_\w+$/.test(key)) {
      errors.push('PAYSTACK_SECRET_KEY must be an sk_test_ or sk_live_ key');
    }
  } else if (payments === 'fake') {
    if (production) errors.push('PAYMENT_PROVIDER=fake is for tests only');
  } else {
    errors.push(`PAYMENT_PROVIDER must be paystack or fake, not "${payments}"`);
  }

  const mail = value('MAIL_PROVIDER') ?? 'log';
  if (mail === 'gmail') {
    if (!/^\S+@\S+\.\S+$/.test(value('GMAIL_USER') ?? '')) {
      errors.push('GMAIL_USER must be the Gmail address that sends');
    }
    const password = (env.GMAIL_APP_PASSWORD ?? '').replace(/\s/g, '');
    if (!/^[a-z]{16}$/i.test(password)) {
      errors.push('GMAIL_APP_PASSWORD must be the 16-letter app password');
    }
  } else if (mail === 'brevo') {
    if (!value('BREVO_API_KEY')) {
      errors.push('BREVO_API_KEY is missing (Brevo → SMTP & API → API keys)');
    }
    if (!/\S+@\S+\.\S+/.test(value('MAIL_FROM') ?? '')) {
      errors.push(
        'MAIL_FROM must be a sender verified in Brevo, e.g. "Seatline <you@gmail.com>"',
      );
    }
  } else if (mail === 'log') {
    if (production) warnings.push('MAIL_PROVIDER=log: no email will be sent');
  } else {
    errors.push(`MAIL_PROVIDER must be brevo, gmail or log, not "${mail}"`);
  }

  const web = value('WEB_URL');
  if (web && !/^https?:\/\/[^/\s]+/.test(web)) {
    errors.push('WEB_URL must be a URL like https://seatline.example');
  } else if (!web && production) {
    errors.push('WEB_URL is missing (ticket links and CORS need it)');
  }

  const port = value('PORT');
  if (port && !/^\d{2,5}$/.test(port)) errors.push('PORT must be a number');

  if (!value('TICK_SECRET')) {
    warnings.push('TICK_SECRET is not set: POST /internal/tick stays closed');
  }
  return { errors, warnings };
}

/** Stops the boot if anything is wrong; prints warnings otherwise. */
export function assertEnv(env: Env = process.env) {
  const { errors, warnings } = checkEnv(env);
  for (const warning of warnings) console.warn(`[config] ${warning}`);
  if (errors.length) {
    throw new Error(
      `Seatline can't start; fix these settings:\n${errors
        .map((e) => `  - ${e}`)
        .join('\n')}`,
    );
  }
}
