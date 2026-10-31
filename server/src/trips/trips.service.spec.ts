import { DepartureMode, TripStatus } from '../generated/prisma/enums.js';
import { isStatusStale, leavesAt } from './trips.service.js';

const now = new Date('2026-11-01T12:00:00Z');
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

const fixed = (departureAt: Date) => ({
  mode: DepartureMode.FIXED_TIME,
  departureAt,
  leaveBy: null,
});
const whenFull = (leaveBy: Date) => ({
  mode: DepartureMode.WHEN_FULL,
  departureAt: null,
  leaveBy,
});

describe('leavesAt', () => {
  it('is the departure time, or the leave-by deadline when the bus fills', () => {
    expect(leavesAt(fixed(minutes(30)))).toEqual(minutes(30));
    expect(leavesAt(whenFull(minutes(90)))).toEqual(minutes(90));
  });
});

describe('isStatusStale', () => {
  const loading = { status: TripStatus.LOADING, loadingStartsAt: minutes(-60) };

  it('departs a loading bus 30 minutes after it was due, whichever its mode', () => {
    expect(isStatusStale({ ...loading, ...fixed(minutes(-31)) }, now)).toBe(
      true,
    );
    expect(isStatusStale({ ...loading, ...whenFull(minutes(-31)) }, now)).toBe(
      true,
    );
  });

  it('leaves a bus alone inside those 30 minutes', () => {
    expect(isStatusStale({ ...loading, ...fixed(minutes(-29)) }, now)).toBe(
      false,
    );
    expect(isStatusStale({ ...loading, ...whenFull(minutes(-29)) }, now)).toBe(
      false,
    );
  });

  it('starts loading a scheduled bus once its loading time comes', () => {
    const scheduled = { status: TripStatus.SCHEDULED, ...fixed(minutes(60)) };
    expect(
      isStatusStale({ ...scheduled, loadingStartsAt: minutes(-1) }, now),
    ).toBe(true);
    expect(
      isStatusStale({ ...scheduled, loadingStartsAt: minutes(1) }, now),
    ).toBe(false);
  });
});
