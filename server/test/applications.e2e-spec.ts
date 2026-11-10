import { INestApplication } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { MAILER, type Mailer } from './../src/messages/mailer.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createFixture, createTestApp, type Fixture } from './fixtures.js';

const PASSWORD = 'mango-bay-42-sunrise';

// Needs the database: `npm run db:up` first.
describe('Join Seatline applications (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fx: Fixture;
  let platformAdminId: string;
  let platform: string;
  let operatorAdmin: string;
  const inbox = new Map<string, string>();

  const http = () => request(app.getHttpServer());
  const emailFor = (name: string) => `${name}@${fx.suffix}.test`;
  const apply = (overrides: Record<string, unknown> = {}) =>
    http()
      .post('/api/v1/applications')
      .send({
        companyName: 'Volta Star Transport',
        contactName: 'Kwame Asante',
        email: emailFor('kwame'),
        phone: '024 123 4567',
        city: 'Ho',
        fleetSize: 6,
        message: 'Ho to Accra, six buses a day.',
        ...overrides,
      });
  const login = async (email: string) =>
    (
      await http()
        .post('/api/v1/staff/auth/login')
        .send({ email, password: PASSWORD, as: 'OPERATOR' })
        .expect(200)
    ).body.accessToken as string;
  const pending = async () =>
    (
      await http()
        .get('/api/v1/platform/applications')
        .set('Authorization', `Bearer ${platform}`)
        .expect(200)
    ).body.filter((a: { email: string }) =>
      a.email.endsWith(`@${fx.suffix}.test`),
    ) as { id: string; email: string; phone: string; companyName: string }[];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const mailer: Mailer = app.get(MAILER);
    mailer.send = async (m) => {
      inbox.set(m.to, m.text);
    };
    fx = await createFixture(prisma);
    const staff = await prisma.staffUser.create({
      data: {
        role: 'PLATFORM_ADMIN',
        email: emailFor('platform'),
        name: 'Seatline Platform',
        passwordHash: await hash(PASSWORD),
        status: 'ACTIVE',
      },
    });
    platformAdminId = staff.id;
    platform = await login(staff.email);
    const boss = await fx.createStaff({
      role: 'OPERATOR_ADMIN',
      password: PASSWORD,
    });
    operatorAdmin = await login(boss.email);
  });

  afterAll(async () => {
    const applications = await prisma.operatorApplication.findMany({
      where: { email: { endsWith: `@${fx.suffix}.test` } },
      select: { operatorId: true },
    });
    const operatorIds = applications
      .map((a) => a.operatorId)
      .filter((id): id is string => !!id);
    const staff = await prisma.staffUser.findMany({
      where: { operatorId: { in: operatorIds } },
      select: { id: true },
    });
    const staffIds = [...staff.map((s) => s.id), platformAdminId];
    await prisma.operatorApplication.deleteMany({
      where: { email: { endsWith: `@${fx.suffix}.test` } },
    });
    await prisma.refreshToken.deleteMany({
      where: { subjectId: { in: staffIds } },
    });
    await prisma.staffToken.deleteMany({
      where: { staffUserId: { in: staffIds } },
    });
    await prisma.outboundMessage.deleteMany({
      where: { to: { endsWith: `@${fx.suffix}.test` } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ actorId: platformAdminId }, { operatorId: { in: operatorIds } }],
      },
    });
    await prisma.staffUser.deleteMany({ where: { id: { in: staffIds } } });
    await prisma.operator.deleteMany({ where: { id: { in: operatorIds } } });
    await fx?.cleanup();
    await app.close();
  });

  it('files an application, thanks the company and tells the platform admins', async () => {
    const res = await apply().expect(202);
    expect(res.body).toEqual({ received: true });

    expect(inbox.get(emailFor('kwame'))).toContain(
      'We have your application to put Volta Star Transport on Seatline',
    );
    expect(inbox.get(emailFor('platform'))).toContain(
      'Volta Star Transport (Ho) has applied to join Seatline',
    );
    expect(await pending()).toMatchObject([
      { companyName: 'Volta Star Transport', phone: '+233241234567' },
    ]);
  });

  it("doesn't file the same email twice while it waits", async () => {
    await apply({ companyName: 'Volta Star (again)' }).expect(202);
    expect(await pending()).toHaveLength(1);
  });

  it('quietly drops a bot that fills the hidden field', async () => {
    await apply({ email: emailFor('bot'), website: 'spam.example' }).expect(
      202,
    );
    expect(
      await prisma.operatorApplication.count({
        where: { email: emailFor('bot') },
      }),
    ).toBe(0);
  });

  it('checks the phone number and the fields', async () => {
    const phone = await apply({ email: emailFor('ama'), phone: '12' }).expect(
      400,
    );
    expect(phone.body.error.code).toBe('INVALID_PHONE');
    const missing = await http()
      .post('/api/v1/applications')
      .send({ companyName: 'X' })
      .expect(400);
    expect(missing.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('is only for platform admins to review', async () => {
    await http().get('/api/v1/platform/applications').expect(401);
    await http()
      .get('/api/v1/platform/applications')
      .set('Authorization', `Bearer ${operatorAdmin}`)
      .expect(403);
  });

  it('puts the application back if approving fails', async () => {
    const [application] = await pending();
    const taken = await http()
      .post(`/api/v1/platform/applications/${application.id}/approve`)
      .set('Authorization', `Bearer ${platform}`)
      .send({ slug: fx.operator.slug })
      .expect(400);
    expect(taken.body.error.code).toBe('VALIDATION_FAILED');
    expect(await pending()).toHaveLength(1);
  });

  it('approves: the company is created and its contact invited as admin', async () => {
    const [application] = await pending();
    const slug = `volta-star-${fx.suffix}`;
    const res = await http()
      .post(`/api/v1/platform/applications/${application.id}/approve`)
      .set('Authorization', `Bearer ${platform}`)
      .send({ slug })
      .expect(200);
    expect(res.body).toMatchObject({
      operator: { name: 'Volta Star Transport', slug, status: 'ACTIVE' },
      admin: { email: emailFor('kwame'), status: 'INVITED' },
    });
    expect(inbox.get(emailFor('kwame'))).toContain(
      'Seatline has set up Volta Star Transport for you to run',
    );
    expect(await pending()).toHaveLength(0);

    const again = await http()
      .post(`/api/v1/platform/applications/${application.id}/approve`)
      .set('Authorization', `Bearer ${platform}`)
      .send({ slug: `${slug}-2` })
      .expect(409);
    expect(again.body.error.code).toBe('INVALID_STATE');

    const approved = await http()
      .get('/api/v1/platform/applications?status=APPROVED')
      .set('Authorization', `Bearer ${platform}`)
      .expect(200);
    expect(
      approved.body.find((a: { id: string }) => a.id === application.id),
    ).toMatchObject({ operator: { slug } });
  });

  it('declines, telling the company why', async () => {
    await apply({ email: emailFor('efua'), companyName: 'Efua Lines' }).expect(
      202,
    );
    const [application] = await pending();
    await http()
      .post(`/api/v1/platform/applications/${application.id}/decline`)
      .set('Authorization', `Bearer ${platform}`)
      .send({ reason: 'We only cover routes out of Accra for now.' })
      .expect(200);

    const text = inbox.get(emailFor('efua'));
    expect(text).toContain("We can't put Efua Lines on Seatline right now.");
    expect(text).toContain('We only cover routes out of Accra for now.');
    expect(await pending()).toHaveLength(0);
  });
});
