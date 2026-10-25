import {
  buildSeatMap,
  effectiveSeatStatus,
  seatsFromLayout,
  type LayoutCell,
} from './trip-seats.js';

const NOW = new Date('2026-10-25T12:00:00Z');
const minutes = (m: number) => new Date(NOW.getTime() + m * 60_000);

describe('seatsFromLayout', () => {
  it('returns one seat per SEAT cell and skips everything else', () => {
    const cells: LayoutCell[] = [
      { r: 0, c: 0, type: 'DRIVER' },
      { r: 0, c: 1, type: 'DOOR' },
      { r: 1, c: 0, type: 'SEAT', label: '1' },
      { r: 1, c: 1, type: 'AISLE' },
      { r: 1, c: 2, type: 'SEAT', label: '2' },
      { r: 2, c: 1, type: 'EMPTY' },
    ];

    expect(seatsFromLayout(cells)).toEqual([
      { label: '1', row: 1, col: 0 },
      { label: '2', row: 1, col: 2 },
    ]);
  });

  it('refuses a seat without a label', () => {
    expect(() => seatsFromLayout([{ r: 3, c: 1, type: 'SEAT' }])).toThrow(
      'Seat at row 3, col 1 has no label',
    );
  });
});

describe('effectiveSeatStatus', () => {
  it('treats a hold that ran out as available', () => {
    expect(
      effectiveSeatStatus({ status: 'HELD', holdExpiresAt: minutes(-1) }, NOW),
    ).toBe('AVAILABLE');
  });

  it('keeps a hold that is still running', () => {
    expect(
      effectiveSeatStatus({ status: 'HELD', holdExpiresAt: minutes(2) }, NOW),
    ).toBe('HELD');
  });

  it('leaves other statuses alone', () => {
    for (const status of ['AVAILABLE', 'SOLD', 'BLOCKED'] as const) {
      expect(
        effectiveSeatStatus({ status, holdExpiresAt: minutes(-5) }, NOW),
      ).toBe(status);
    }
  });
});

describe('buildSeatMap', () => {
  const snapshot = {
    rows: 2,
    cols: 3,
    cells: [
      { r: 0, c: 0, type: 'DRIVER' },
      { r: 0, c: 1, type: 'EMPTY' },
      { r: 0, c: 2, type: 'DOOR' },
      { r: 1, c: 0, type: 'SEAT', label: '1' },
      { r: 1, c: 1, type: 'AISLE' },
      { r: 1, c: 2, type: 'SEAT', label: '2' },
    ] satisfies LayoutCell[],
  };

  it('puts each seat status on its cell and leaves other cells bare', () => {
    const map = buildSeatMap(
      snapshot,
      [
        { label: '1', status: 'SOLD', holdExpiresAt: null },
        { label: '2', status: 'HELD', holdExpiresAt: minutes(-1) },
      ],
      NOW,
    );

    expect(map).toEqual({
      rows: 2,
      cols: 3,
      cells: [
        { r: 0, c: 0, type: 'DRIVER' },
        { r: 0, c: 1, type: 'EMPTY' },
        { r: 0, c: 2, type: 'DOOR' },
        { r: 1, c: 0, type: 'SEAT', label: '1', status: 'SOLD' },
        { r: 1, c: 1, type: 'AISLE' },
        { r: 1, c: 2, type: 'SEAT', label: '2', status: 'AVAILABLE' },
      ],
    });
  });

  it('blocks a seat that has no TripSeat row', () => {
    const map = buildSeatMap(
      snapshot,
      [{ label: '1', status: 'AVAILABLE', holdExpiresAt: null }],
      NOW,
    );
    expect(map.cells[5]).toMatchObject({ label: '2', status: 'BLOCKED' });
  });
});
