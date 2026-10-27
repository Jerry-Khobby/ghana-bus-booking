import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { CellType } from '../generated/prisma/enums.js';
import type { LayoutCell } from '../trips/trip-seats.js';

export const MAX_ROWS = 20;
export const MAX_COLS = 8;
const MAX_LABEL = 4;

/**
 * The layout editor's rules: a grid within 20 × 8, every cell inside it and
 * in its own square, exactly one driver, and at least one seat, each with a
 * unique label of up to 4 characters. Returns the seat count; throws
 * VALIDATION_FAILED listing every problem.
 */
export function validateLayout(layout: {
  rows: number;
  cols: number;
  cells: LayoutCell[];
}): number {
  const problems: string[] = [];
  const { rows, cols, cells } = layout;

  if (!Number.isInteger(rows) || rows < 1 || rows > MAX_ROWS) {
    problems.push(`rows must be 1 to ${MAX_ROWS}`);
  }
  if (!Number.isInteger(cols) || cols < 1 || cols > MAX_COLS) {
    problems.push(`cols must be 1 to ${MAX_COLS}`);
  }

  const squares = new Set<string>();
  const labels = new Set<string>();
  let drivers = 0;
  let seats = 0;
  for (const cell of cells) {
    const where = `row ${cell.r}, col ${cell.c}`;
    if (cell.r < 0 || cell.r >= rows || cell.c < 0 || cell.c >= cols) {
      problems.push(`The cell at ${where} is outside the grid`);
    }
    const square = `${cell.r}:${cell.c}`;
    if (squares.has(square)) problems.push(`Two cells share ${where}`);
    squares.add(square);

    if (cell.type === CellType.DRIVER) drivers++;
    if (cell.type !== CellType.SEAT) continue;
    seats++;
    const label = cell.label?.trim();
    if (!label) {
      problems.push(`The seat at ${where} has no label`);
    } else if (label.length > MAX_LABEL) {
      problems.push(
        `Seat label "${label}" is longer than ${MAX_LABEL} characters`,
      );
    } else if (labels.has(label)) {
      problems.push(`Seat label "${label}" is used twice`);
    } else {
      labels.add(label);
    }
  }
  if (drivers !== 1) problems.push('A layout needs exactly one driver cell');
  if (!seats) problems.push('A layout needs at least one seat');

  if (problems.length) {
    throw new AppException(
      'VALIDATION_FAILED',
      'This seat layout has problems',
      HttpStatus.BAD_REQUEST,
      { fields: { cells: problems } },
    );
  }
  return seats;
}
