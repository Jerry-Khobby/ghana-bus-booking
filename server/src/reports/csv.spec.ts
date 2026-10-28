import { csvLine } from './reports.service.js';

describe('csvLine', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvLine(['plain', 'a,b', 'say "hi"', 'two\nlines'])).toBe(
      'plain,"a,b","say ""hi""","two\nlines"\r\n',
    );
  });

  it('stops spreadsheets running a cell as a formula', () => {
    expect(csvLine(['=HYPERLINK("x")', '+1', '@cmd', '-2'])).toBe(
      `"'=HYPERLINK(""x"")",'+1,'@cmd,'-2\r\n`,
    );
  });
});
