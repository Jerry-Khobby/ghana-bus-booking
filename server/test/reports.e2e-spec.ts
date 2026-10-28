import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createFixture,
  createTestApp,
  minutesFromNow,
  type Fixture,
} from './fixtures.js';

const PASSWORD = 'mango-bay-42-sunrise';
const day = (date: Date) => date.toISOString().slice(0, 10);

/**
 * A hand-countable day for one operator:
 * - a bus that left: seat 1 online, boarded (GH¢ 51); seat 2 a cash walk-in
 *   who didn't show (GH¢ 50); seat 3 online, boarded (GH¢ 51); seat 4 empty
 * - a bus later on: seat 1 online, confirmed (GH¢ 51)
 * - noise that must not count: an expired hold and a failed payment
 * So: 4 tickets, GH¢ 203.00, 75% fill (3 of 4 on the bus that left), 1 no-show.
 */
describe('Reports (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fx: Fixture;
  let admin: string;
  let agentToken: string;
  let agentId: string;
  const codes: string[] = [];
  const query = {
    from: day(minutesFromNow(-2 * 24 * 60)),
    to: day(minutesFromNow(2 * 24 * 60)),
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    fx = await createFixture(prisma);
    const login = async (email: string, as: string) =>
      (
        await request(app.getHttpServer())
          .post('/api/v1/staff/auth/login')
          .send({ email, password: PASSWORD, as })
          .expect(200)
      ).body.accessToken as string;
    const boss = await fx.createStaff({
      role: 'OPERATOR_ADMIN',
      password: PASSWORD,
    });
    const agent = await fx.createStaff({ password: PASSWORD, name: 'Kofi A.' });
    agentId = agent.id;
    admin = await login(boss.email, 'OPERATOR');
    agentToken = await login(agent.email, 'AGENT');

    const left = await fx.createTrip({
      status: 'DEPARTED',
      loadingStartsAt: minutesFromNow(-240),
      departureAt: minutesFromNow(-180),
      seatsSold: 3,
    });
    const later = await fx.createTrip({
      loadingStartsAt: minutesFromNow(120),
      departureAt: minutesFromNow(180),
      seatsSold: 1,
    });

    const sale = async (
      tripId: string,
      seat: string,
      opts: {
        status: 'CONFIRMED' | 'BOARDED' | 'NO_SHOW';
        channel?: 'ONLINE' | 'WALK_IN';
      },
    ) => {
      const booking = await fx.createBooking(tripId, seat, 'CONFIRMED');
      const walkIn = opts.channel === 'WALK_IN';
      const amount = walkIn ? 5000 : 5100;
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: opts.status,
          channel: opts.channel ?? 'ONLINE',
          confirmedAt: minutesFromNow(-200),
          feePesewas: walkIn ? 0 : 100,
          totalPesewas: amount,
          soldById: walkIn ? agentId : null,
        },
      });
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          method: walkIn ? 'CASH' : 'MOMO',
          provider: walkIn ? 'CASH' : 'FAKE',
          providerRef: `rep_${booking.code}`,
          status: 'SUCCESS',
          amountPesewas: amount,
        },
      });
      if (walkIn) {
        await prisma.cashEntry.create({
          data: {
            bookingId: booking.id,
            agentId,
            operatorId: fx.operator.id,
            amountPesewas: amount,
          },
        });
      }
      codes.push(booking.code);
      return booking;
    };

    await sale(left.id, '1', { status: 'BOARDED' });
    await sale(left.id, '2', { status: 'NO_SHOW', channel: 'WALK_IN' });
    await sale(left.id, '3', { status: 'BOARDED' });
    const lastSale = await sale(later.id, '1', { status: 'CONFIRMED' });

    // Noise: an expired hold, and a failed payment on a real ticket
    const expired = await fx.createBooking(
      later.id,
      '2',
      'HELD',
      minutesFromNow(-5),
    );
    await prisma.booking.update({
      where: { id: expired.id },
      data: { status: 'EXPIRED' },
    });
    await prisma.payment.create({
      data: {
        bookingId: lastSale.id,
        method: 'MOMO',
        provider: 'FAKE',
        providerRef: `rep_failed_${lastSale.code}`,
        status: 'FAILED',
        amountPesewas: 5100,
      },
    });
  });

  afterAll(async () => {
    await fx?.cleanup();
    await app.close();
  });

  const get = (path: string, params: object = query) =>
    request(app.getHttpServer())
      .get(`/api/v1/reports${path}`)
      .query(params)
      .set('Authorization', `Bearer ${admin}`);

  it('is for operator admins', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/reports/summary')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(403);
  });

  it('adds up the four tiles', async () => {
    const res = await get('/summary').expect(200);
    expect(res.body).toEqual({
      ...query,
      revenuePesewas: 20_300,
      currency: 'GHS',
      ticketsSold: 4,
      avgSeatFillPercent: 75,
      noShows: 1,
    });
  });

  it('lists every day, zeros included', async () => {
    const res = await get('/daily').expect(200);
    expect(res.body).toHaveLength(5);
    expect(res.body[0]).toEqual({
      date: query.from,
      online: expect.any(Number),
      walkIn: expect.any(Number),
    });
    const total = (key: 'online' | 'walkIn') =>
      res.body.reduce((n: number, d: Record<string, number>) => n + d[key], 0);
    expect(total('online')).toBe(3);
    expect(total('walkIn')).toBe(1);
  });

  it('breaks the money down by route', async () => {
    const res = await get('/by-route').expect(200);
    expect(res.body).toEqual([
      {
        route: {
          id: fx.route.id,
          origin: { name: 'North', city: `Testville ${fx.suffix}` },
          destination: { name: 'South', city: `Testtown ${fx.suffix}` },
        },
        trips: 2,
        seatFillPercent: 75,
        revenuePesewas: 20_300,
        currency: 'GHS',
      },
    ]);
  });

  it('shows the cash each agent took and still holds', async () => {
    const res = await get('/cash-by-agent').expect(200);
    expect(res.body).toEqual([
      {
        agent: { id: agentId, name: 'Kofi A.', email: expect.any(String) },
        tickets: 1,
        cashPesewas: 5000,
        unsettledPesewas: 5000,
        currency: 'GHS',
      },
    ]);
  });

  it('exports one CSV row per ticket', async () => {
    const res = await get('/export.csv').expect(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="seatline-tickets-${query.from}-to-${query.to}.csv"`,
    );
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toBe(
      'date,code,route,plate,seat,channel,method,amount GHS,status,agent',
    );
    expect(lines).toHaveLength(5);
    for (const code of codes) expect(res.text).toContain(code);
    expect(lines.find((l) => l.includes('WALK_IN'))).toMatch(
      /,WALK_IN,CASH,50\.00,NO_SHOW,Kofi A\.$/,
    );
  });

  it('rejects a backwards range before streaming', async () => {
    const res = await get('/export.csv', {
      from: query.to,
      to: query.from,
    }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
