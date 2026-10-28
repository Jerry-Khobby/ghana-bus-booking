import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

// Totals, daily chart, by route, cash per agent, CSV export. Operator admins
// only, always for their own operator.
// Writes: — (reads only)
// Routes: /reports/*
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
