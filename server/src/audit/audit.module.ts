import { Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

// Records who changed what.
// Writes: AuditLog
// Routes: none
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
