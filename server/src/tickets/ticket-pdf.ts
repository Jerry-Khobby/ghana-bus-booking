import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { Ticket } from './tickets.service.js';

const INK = '#1f2328';
const MUTED = '#5c6470';

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

const cedis = (pesewas: number) => `GH¢ ${(pesewas / 100).toFixed(2)}`;
const place = (station: { name: string; city: string }) =>
  station.name === 'Main station'
    ? station.city
    : `${station.city} (${station.name})`;

/** When the bus leaves, in the words the ticket screen uses. */
function departureLine(ticket: Ticket): string {
  if (ticket.mode === 'FIXED_TIME' && ticket.departureAt) {
    return `${day.format(ticket.departureAt)} at ${time.format(ticket.departureAt)}`;
  }
  const from = ticket.loadingStartsAt ?? ticket.leaveBy;
  const by = ticket.leaveBy
    ? `, by ${time.format(ticket.leaveBy)} at the latest`
    : '';
  return from
    ? `${day.format(from)}, leaves when full${by}`
    : 'Leaves when full';
}

/** A one-page A5 ticket with the boarding QR. */
export async function renderTicketPdf(ticket: Ticket): Promise<Buffer> {
  const qr = await QRCode.toBuffer(ticket.qrPayload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 480,
  });

  const doc = new PDFDocument({
    size: 'A5',
    margin: 40,
    info: { Title: `Seatline ticket ${ticket.code}`, Author: 'Seatline' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(10)
    .text(`SEATLINE · ${ticket.operator.name.toUpperCase()}`, left, 40);
  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(
      `${place(ticket.route.origin)} to ${place(ticket.route.destination)}`,
      { width },
    );
  doc.moveDown(0.3).font('Helvetica').fontSize(12).text(departureLine(ticket));

  // Boarding QR, centred
  const qrSize = 200;
  const qrTop = doc.y + 18;
  doc.image(qr, left + (width - qrSize) / 2, qrTop, {
    width: qrSize,
    height: qrSize,
  });
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(ticket.code, left, qrTop + qrSize + 8, {
      width,
      align: 'center',
      characterSpacing: 1,
    });

  // Details in two columns
  const rows: [string, string][] = [
    ['Seat', ticket.seatLabel],
    ['Bay', ticket.bay ? String(ticket.bay.number) : '-'],
    ['Bus', ticket.bus.plate],
    ['Passenger', ticket.passengerName ?? '-'],
    ['Paid', cedis(ticket.totalPesewas)],
  ];
  let y = doc.y + 18;
  for (const [label, value] of rows) {
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(label, left, y);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(INK)
      .text(value, left + 110, y, { width: width - 110 });
    y += 20;
  }

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      `Show this QR code to the agent at bay ${ticket.bay?.number ?? ''} to board. ` +
        'One ticket boards once.',
      left,
      y + 14,
      { width },
    );

  doc.end();
  return done;
}
