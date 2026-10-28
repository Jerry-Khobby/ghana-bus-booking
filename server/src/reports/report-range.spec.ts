import { resolveRange } from './report-range.js';

const NOW = new Date('2026-10-28T15:00:00Z');

describe('resolveRange', () => {
  it('defaults to the last 7 days, today included', () => {
    expect(resolveRange({}, NOW)).toMatchObject({
      from: '2026-10-22',
      to: '2026-10-28',
      days: 7,
      start: new Date('2026-10-22T00:00:00Z'),
      end: new Date('2026-10-29T00:00:00Z'),
    });
  });

  it('reads the presets', () => {
    expect(resolveRange({ range: 'today' }, NOW)).toMatchObject({
      from: '2026-10-28',
      to: '2026-10-28',
      days: 1,
    });
    expect(resolveRange({ range: '30d' }, NOW).from).toBe('2026-09-29');
  });

  it('takes an inclusive from/to', () => {
    expect(
      resolveRange({ from: '2026-10-01', to: '2026-10-31' }, NOW),
    ).toMatchObject({ days: 31, end: new Date('2026-11-01T00:00:00Z') });
    // from alone runs to today
    expect(resolveRange({ from: '2026-10-27' }, NOW).days).toBe(2);
  });

  it('refuses backwards and over-long ranges', () => {
    expect(() =>
      resolveRange({ from: '2026-10-10', to: '2026-10-01' }, NOW),
    ).toThrow();
    expect(() =>
      resolveRange({ from: '2024-01-01', to: '2026-10-01' }, NOW),
    ).toThrow();
  });
});
