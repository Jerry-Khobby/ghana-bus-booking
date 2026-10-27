// Shared wording for tickets, PDFs and emails, so they always agree.

// Ghana is UTC+0, but format in its own zone in case the service expands
const time = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Accra',
  hour: '2-digit',
  minute: '2-digit',
});
const day = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Accra',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export const formatTime = (date: Date) => time.format(date);
export const formatDay = (date: Date) => day.format(date);

/** 15100 → "GH¢ 151.00" */
export const cedis = (pesewas: number) => `GH¢ ${(pesewas / 100).toFixed(2)}`;

/** "Accra (Circle)", or just "Takoradi" for a city's main station. */
export const place = (station: { name: string; city: string }) =>
  station.name === 'Main station'
    ? station.city
    : `${station.city} (${station.name})`;

/** When the bus leaves, in the words the ticket screen uses. */
export function departureLine(trip: {
  mode: 'FIXED_TIME' | 'WHEN_FULL';
  departureAt: Date | null;
  loadingStartsAt: Date | null;
  leaveBy: Date | null;
}): string {
  if (trip.mode === 'FIXED_TIME' && trip.departureAt) {
    return `${formatDay(trip.departureAt)} at ${formatTime(trip.departureAt)}`;
  }
  const from = trip.loadingStartsAt ?? trip.leaveBy;
  const by = trip.leaveBy
    ? `, by ${formatTime(trip.leaveBy)} at the latest`
    : '';
  return from
    ? `${formatDay(from)}, leaves when full${by}`
    : 'Leaves when full';
}
