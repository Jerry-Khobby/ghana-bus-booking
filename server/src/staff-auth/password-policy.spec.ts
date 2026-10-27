import { checkPassword } from './password-policy.js';

const codeOf = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (error) {
    return (error as { code: string }).code;
  }
};

describe('checkPassword', () => {
  it('accepts a long, uncommon password', () => {
    expect(codeOf(() => checkPassword('mango-bay-42-sunrise'))).toBeNull();
  });

  it.each(['short', 'basketball', 'BASKETBALL', '1234567890'])(
    'rejects %s',
    (password) => {
      expect(codeOf(() => checkPassword(password))).toBe('WEAK_PASSWORD');
    },
  );

  it('rejects a password built from the email', () => {
    expect(
      codeOf(() => checkPassword('kofi.a-2026-ok', 'kofi.a@coastline.example')),
    ).toBe('WEAK_PASSWORD');
  });
});
