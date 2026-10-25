import { generateTicketCode } from './ticket-code.js';

describe('generateTicketCode', () => {
  it('looks like SL-XXXX-XX using only unambiguous characters', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateTicketCode()).toMatch(
        /^SL-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{2}$/,
      );
    }
  });
});
