import { Controller, Get, Logger, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { once } from 'node:events';
import { adminContext } from '../admin/admin-context.js';
import type { StaffUser } from '../common/auth/auth-user.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { Roles, RolesGuard } from '../common/auth/roles.js';
import { StaffRole } from '../generated/prisma/enums.js';
import { ReportQueryDto } from './dto/report-query.dto.js';
import { resolveRange } from './report-range.js';
import { ReportsService } from './reports.service.js';

@ApiTags('Reports')
@ApiBearerAuth()
@Roles(StaffRole.OPERATOR_ADMIN)
@UseGuards(RolesGuard)
@Controller('reports')
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);

  constructor(private readonly reports: ReportsService) {}

  /** The four tiles: revenue, tickets, seat fill, no-shows. */
  @Get('summary')
  summary(@CurrentUser() user: StaffUser, @Query() query: ReportQueryDto) {
    return this.reports.summary(adminContext(user), resolveRange(query));
  }

  /** Tickets sold per day chart, online and walk-in. */
  @Get('daily')
  daily(@CurrentUser() user: StaffUser, @Query() query: ReportQueryDto) {
    return this.reports.daily(adminContext(user), resolveRange(query));
  }

  /** By route table. */
  @Get('by-route')
  byRoute(@CurrentUser() user: StaffUser, @Query() query: ReportQueryDto) {
    return this.reports.byRoute(adminContext(user), resolveRange(query));
  }

  /** Cash taken by each agent, and how much they still hold. */
  @Get('cash-by-agent')
  cashByAgent(@CurrentUser() user: StaffUser, @Query() query: ReportQueryDto) {
    return this.reports.cashByAgent(adminContext(user), resolveRange(query));
  }

  /** Export CSV: one row per ticket, streamed. */
  @Get('export.csv')
  @ApiProduces('text/csv')
  async exportCsv(
    @CurrentUser() user: StaffUser,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    // Checked before the first byte, so a bad range still gets a JSON error
    const ctx = adminContext(user);
    const range = resolveRange(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="seatline-tickets-${range.from}-to-${range.to}.csv"`,
    );

    try {
      for await (const line of this.reports.exportCsv(ctx, range)) {
        if (!res.write(line)) await once(res, 'drain');
      }
      res.end();
    } catch (error) {
      // Headers are gone, so the error can't become JSON: cut the download
      this.logger.error('CSV export failed', (error as Error).stack);
      res.destroy(error as Error);
    }
  }
}
