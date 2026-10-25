import { CellType } from '../generated/prisma/enums.js';

/** One square of a seat layout grid, as stored in SeatLayout.cells. */
export interface LayoutCell {
  r: number;
  c: number;
  type: CellType;
  /** Only on SEAT cells; unique within the layout. */
  label?: string;
}

/**
 * What a trip keeps in Trip.layoutSnapshot: the grid at the moment the trip
 * was created, so later layout edits never change it. rows and cols are kept
 * with the cells so the seat map can be drawn without joining to the layout.
 */
export interface LayoutSnapshot {
  rows: number;
  cols: number;
  cells: LayoutCell[];
}

export interface TripSeatInput {
  label: string;
  row: number;
  col: number;
}

/** One TripSeat row per SEAT cell, in the order the cells are stored. */
export function seatsFromLayout(cells: LayoutCell[]): TripSeatInput[] {
  return cells
    .filter((cell) => cell.type === CellType.SEAT)
    .map((cell) => {
      if (!cell.label) {
        throw new Error(`Seat at row ${cell.r}, col ${cell.c} has no label`);
      }
      return { label: cell.label, row: cell.r, col: cell.c };
    });
}
