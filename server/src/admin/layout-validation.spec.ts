import type { LayoutCell } from '../trips/trip-seats.js';
import { validateLayout } from './layout-validation.js';

const good: LayoutCell[] = [
  { r: 0, c: 0, type: 'DRIVER' },
  { r: 0, c: 2, type: 'DOOR' },
  { r: 1, c: 0, type: 'SEAT', label: '1' },
  { r: 1, c: 1, type: 'AISLE' },
  { r: 1, c: 2, type: 'SEAT', label: '2' },
];

const problems = (layout: Parameters<typeof validateLayout>[0]) => {
  try {
    validateLayout(layout);
    return [];
  } catch (error) {
    return (error as { details: { fields: { cells: string[] } } }).details
      .fields.cells;
  }
};

describe('validateLayout', () => {
  it('counts the seats of a valid layout', () => {
    expect(validateLayout({ rows: 2, cols: 3, cells: good })).toBe(2);
  });

  it('keeps the grid within 20 × 8', () => {
    expect(problems({ rows: 21, cols: 9, cells: good })).toEqual(
      expect.arrayContaining(['rows must be 1 to 20', 'cols must be 1 to 8']),
    );
  });

  it('lists every problem at once', () => {
    expect(
      problems({
        rows: 2,
        cols: 3,
        cells: [
          { r: 1, c: 0, type: 'SEAT', label: '1' },
          { r: 1, c: 0, type: 'SEAT', label: '2' },
          { r: 1, c: 2, type: 'SEAT', label: '1' },
          { r: 0, c: 1, type: 'SEAT', label: '12345' },
          { r: 0, c: 2, type: 'SEAT' },
          { r: 5, c: 5, type: 'AISLE' },
        ],
      }),
    ).toEqual([
      'Two cells share row 1, col 0',
      'Seat label "1" is used twice',
      'Seat label "12345" is longer than 4 characters',
      'The seat at row 0, col 2 has no label',
      'The cell at row 5, col 5 is outside the grid',
      'A layout needs exactly one driver cell',
    ]);
  });

  it('needs at least one seat', () => {
    expect(
      problems({ rows: 1, cols: 1, cells: [{ r: 0, c: 0, type: 'DRIVER' }] }),
    ).toEqual(['A layout needs at least one seat']);
  });
});
