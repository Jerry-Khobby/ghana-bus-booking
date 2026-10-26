import {
  maskPhone,
  networkOf,
  normalizeGhanaPhone,
  toLocalPhone,
} from './phone.js';

describe('normalizeGhanaPhone', () => {
  it.each([
    '0241234567',
    '024 123 4567',
    '241234567',
    '+233241234567',
    '+233 24 123 4567',
    '233241234567',
    '(024) 123-4567',
  ])('turns %s into E.164', (input) => {
    expect(normalizeGhanaPhone(input)).toBe('+233241234567');
  });

  it.each(['', '12345', '02412345678', '+44 20 7946 0958', 'abc1234567'])(
    'rejects %s',
    (input) => {
      expect(normalizeGhanaPhone(input)).toBeNull();
    },
  );
});

describe('networkOf', () => {
  it.each([
    ['+233241234567', 'MTN'],
    ['+233531234567', 'MTN'],
    ['+233201234567', 'TELECEL'],
    ['+233501234567', 'TELECEL'],
    ['+233271234567', 'AIRTELTIGO'],
    ['+233571234567', 'AIRTELTIGO'],
    ['+233301234567', null], // a landline
  ])('%s belongs to %s', (phone, network) => {
    expect(networkOf(phone)).toBe(network);
  });
});

describe('formatting', () => {
  it('shows the local number and a masked one', () => {
    expect(toLocalPhone('+233241234567')).toBe('0241234567');
    expect(maskPhone('+233240000000')).toBe('024 *** 0000');
  });
});
