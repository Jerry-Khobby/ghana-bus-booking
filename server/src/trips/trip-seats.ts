import { CellType, SeatStatus } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';

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

// ─── Availability ────────────────────────────────────────────────────────────
// A HELD seat whose hold has run out is free, even before
// BookingsService.expireStaleHolds() gets round to releasing it.

/** Prisma filter for seats a passenger can take right now. */
export function availableSeatWhere(now: Date): Prisma.TripSeatWhereInput {
  return {
    OR: [
      { status: SeatStatus.AVAILABLE },
      { status: SeatStatus.HELD, holdExpiresAt: { lt: now } },
    ],
  };
}

/** The status a passenger should see for one seat. */
export function effectiveSeatStatus(
  seat: { status: SeatStatus; holdExpiresAt: Date | null },
  now: Date,
): SeatStatus {
  const holdRanOut =
    seat.status === SeatStatus.HELD &&
    seat.holdExpiresAt !== null &&
    seat.holdExpiresAt < now;
  return holdRanOut ? SeatStatus.AVAILABLE : seat.status;
}

/** MINE: the seat the caller is holding. */
export type SeatMapStatus = SeatStatus | 'MINE';

export interface SeatMapCell extends LayoutCell {
  /** Only on SEAT cells. */
  status?: SeatMapStatus;
}

export interface SeatMap {
  rows: number;
  cols: number;
  cells: SeatMapCell[];
}

/**
 * The trip's layout with each seat's live status merged in. Only the status
 * goes out: never who holds or bought a seat. `mine` are the seats the
 * caller holds, shown as MINE while the hold lasts.
 */
export function buildSeatMap(
  snapshot: LayoutSnapshot,
  seats: { label: string; status: SeatStatus; holdExpiresAt: Date | null }[],
  now: Date,
  mine: string[] = [],
): SeatMap {
  const statusByLabel = new Map(
    seats.map((seat): [string, SeatMapStatus] => {
      const status = effectiveSeatStatus(seat, now);
      const isMine = mine.includes(seat.label) && status === SeatStatus.HELD;
      return [seat.label, isMine ? 'MINE' : status];
    }),
  );

  return {
    rows: snapshot.rows,
    cols: snapshot.cols,
    cells: snapshot.cells.map((cell) =>
      cell.type === CellType.SEAT && cell.label
        ? {
            ...cell,
            // A seat in the snapshot with no TripSeat row can't be sold
            status: statusByLabel.get(cell.label) ?? SeatStatus.BLOCKED,
          }
        : cell,
    ),
  };
}
