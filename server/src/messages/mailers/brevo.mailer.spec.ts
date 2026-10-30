import {
  BrevoMailer,
  parseAddress,
  withoutInlineImages,
} from './brevo.mailer.js';

describe('BrevoMailer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the email to Brevo with the sender, recipient and QR attached', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"messageId":"x"}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await new BrevoMailer(
      'xkeysib-test',
      'Seatline <seatline@example.com>',
    ).send({
      to: 'ama@example.com',
      subject: 'Your ticket',
      html: '<p>Hi</p><img src="cid:qr" width="200">',
      text: 'Hi',
      attachments: [
        { filename: 'SL-2222-22.png', content: Buffer.from('png'), cid: 'qr' },
      ],
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers).toMatchObject({ 'api-key': 'xkeysib-test' });
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      sender: { name: 'Seatline', email: 'seatline@example.com' },
      to: [{ email: 'ama@example.com' }],
      subject: 'Your ticket',
      textContent: 'Hi',
      attachment: [
        {
          name: 'SL-2222-22.png',
          content: Buffer.from('png').toString('base64'),
        },
      ],
    });
    expect(body.htmlContent).not.toContain('cid:');
    expect(body.htmlContent).toContain('SL-2222-22.png');
  });

  it("throws Brevo's reason, so the outbox keeps the email for a retry", async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"code":"unauthorized","message":"Key not found"}', {
            status: 401,
          }),
        ),
    );
    await expect(
      new BrevoMailer('bad', 'seatline@example.com').send({
        to: 'a@b.co',
        subject: 's',
        html: 'h',
        text: 't',
      }),
    ).rejects.toThrow(
      'Brevo refused the email (401 unauthorized): Key not found',
    );
  });
});

describe('parseAddress', () => {
  it('reads "Name <email>" and a bare address', () => {
    expect(parseAddress('Seatline <you@gmail.com>')).toEqual({
      name: 'Seatline',
      email: 'you@gmail.com',
    });
    expect(parseAddress('you@gmail.com')).toEqual({ email: 'you@gmail.com' });
  });
});

describe('withoutInlineImages', () => {
  it('leaves HTML without attachments alone', () => {
    expect(withoutInlineImages('<img src="cid:qr">', undefined)).toBe(
      '<img src="cid:qr">',
    );
  });
});
