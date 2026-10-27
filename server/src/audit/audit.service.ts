import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = PrismaService | Prisma.TransactionClient;

export interface AuditEntry {
  operatorId: string | null;
  /** STAFF, PASSENGER or SYSTEM (the tick). */
  actorType: 'STAFF' | 'PASSENGER' | 'SYSTEM';
  actorId: string | null;
  /** What happened, e.g. "booking.void". */
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

/** Who changed what. Written inside the transaction that made the change. */
@Injectable()
export class AuditService {
  record(db: Db, entry: AuditEntry) {
    return db.auditLog.create({
      data: {
        ...entry,
        before: (entry.before ?? undefined) as Prisma.InputJsonValue,
        after: (entry.after ?? undefined) as Prisma.InputJsonValue,
      },
    });
  }
}
