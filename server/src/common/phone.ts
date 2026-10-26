import { MomoNetwork } from '../generated/prisma/enums.js';

// Number prefixes each mobile money network owns (from the backend plan)
export const MOMO_PREFIXES: Record<MomoNetwork, string[]> = {
  MTN: ['024', '054', '055', '059', '053'],
  TELECEL: ['020', '050'],
  AIRTELTIGO: ['026', '056', '027', '057'],
};

export const NETWORK_NAMES: Record<MomoNetwork, string> = {
  MTN: 'MTN',
  TELECEL: 'Telecel',
  AIRTELTIGO: 'AirtelTigo',
};

/**
 * A Ghana number in E.164 (+233241234567), or null if it isn't one.
 * Accepts 024 123 4567, 24 123 4567, +233 24 123 4567 and 233241234567.
 */
export function normalizeGhanaPhone(input: string): string | null {
  const compact = input.replace(/[\s().-]/g, '');
  const national =
    /^\+233(\d{9})$/.exec(compact)?.[1] ??
    /^233(\d{9})$/.exec(compact)?.[1] ??
    /^0(\d{9})$/.exec(compact)?.[1] ??
    /^(\d{9})$/.exec(compact)?.[1];
  return national ? `+233${national}` : null;
}

/** +233241234567 → 0241234567 */
export function toLocalPhone(e164: string): string {
  return `0${e164.slice(4)}`;
}

/** The mobile money network a number belongs to, from its prefix. */
export function networkOf(e164: string): MomoNetwork | null {
  const prefix = toLocalPhone(e164).slice(0, 3);
  const entry = Object.entries(MOMO_PREFIXES).find(([, prefixes]) =>
    prefixes.includes(prefix),
  );
  return entry ? (entry[0] as MomoNetwork) : null;
}

/** +233241234567 → "024 *** 4567", for messages that shouldn't show the number. */
export function maskPhone(e164: string): string {
  const local = toLocalPhone(e164);
  return `${local.slice(0, 3)} *** ${local.slice(-4)}`;
}
