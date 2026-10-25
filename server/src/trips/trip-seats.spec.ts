import { seatsFromLayout, type LayoutCell } from './trip-seats.js';

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
