import { firstValueFrom, take, toArray } from 'rxjs';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from './realtime.service.js';

const past = new Date(Date.now() - 60_000);
const future = new Date(Date.now() + 60_000);

function serviceWith(prisma: Partial<Record<string, unknown>>) {
  return new RealtimeService(prisma as unknown as PrismaService);
}

describe('RealtimeService', () => {
  it('sends each changed seat with its effective status', async () => {
    const realtime = serviceWith({
      tripSeat: {
        findMany: vi.fn().mockResolvedValue([
          { label: '1', status: 'HELD', holdExpiresAt: future },
          // A hold that ran out goes out as AVAILABLE
          { label: '2', status: 'HELD', holdExpiresAt: past },
        ]),
      },
    });
    const events = firstValueFrom(
      realtime.seatEvents('trip-1').pipe(take(2), toArray()),
    );

    realtime.seatsChanged('trip-1', ['1', '2']);

    expect(await events).toEqual([
      { label: '1', status: 'HELD' },
      { label: '2', status: 'AVAILABLE' },
    ]);
  });

  it('only reaches listeners of the same trip', async () => {
    const realtime = serviceWith({
      tripSeat: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { label: '1', status: 'SOLD', holdExpiresAt: null },
          ]),
      },
    });
    const other = vi.fn();
    const subscription = realtime.seatEvents('trip-2').subscribe(other);
    const mine = firstValueFrom(realtime.seatEvents('trip-1'));

    realtime.seatsChanged('trip-1', ['1']);
    await mine;
    expect(other).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('never throws when the database read fails', async () => {
    const realtime = serviceWith({
      tripSeat: { findMany: vi.fn().mockRejectedValue(new Error('down')) },
    });
    expect(() => realtime.seatsChanged('trip-1', ['1'])).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it("gives a payment's ticket code only once it's paid", async () => {
    const realtime = serviceWith({
      payment: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'pay-1',
          status: 'SUCCESS',
          failureCode: null,
          failureMessage: null,
          booking: { status: 'CONFIRMED', code: 'SL-7Q4K-2M' },
        }),
      },
    });
    expect(await realtime.paymentSnapshot('pay-1')).toEqual({
      paymentId: 'pay-1',
      status: 'SUCCESS',
      failureCode: null,
      failureMessage: null,
      bookingStatus: 'CONFIRMED',
      bookingCode: 'SL-7Q4K-2M',
    });
  });
});
