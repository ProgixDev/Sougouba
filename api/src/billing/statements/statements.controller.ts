import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { RequirePermission } from '../../admin/permissions.js';
import { AdminGuard } from '../../auth/admin.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../../auth/supabase-auth.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { StatementsService } from './statements.service.js';

const linkQuerySchema = z.object({ locale: z.enum(['fr', 'en']).default('fr') });
type LinkQuery = z.infer<typeof linkQuerySchema>;

const downloadQuerySchema = z.object({ token: z.string().min(1).max(1024) });
type DownloadQuery = z.infer<typeof downloadQuerySchema>;

/** The merchant's own statements: the month so far, the ones issued, and a link to each as a PDF. */
@ApiTags('merchant')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('vendors/me/statements')
export class MerchantStatementsController {
  constructor(private readonly statements: StatementsService) {}

  @Get()
  list(@CurrentUser() userId: string) {
    return this.statements.listFor(userId);
  }

  // A link and not the file, for the same reason as a receipt: the PDF opens in
  // a browser, which cannot send this session's token.
  @Get(':id/link')
  @Header('Cache-Control', 'no-store')
  link(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(linkQuerySchema)) query: LinkQuery
  ) {
    return this.statements.linkForMerchant(userId, id, query.locale);
  }
}

/** The back office reads any shop's statements. Both routes only read, so neither is an audited action. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, AdminGuard)
@Controller('admin')
export class AdminStatementsController {
  constructor(private readonly statements: StatementsService) {}

  @RequirePermission('vendors.view')
  @Get('vendors/:vendorId/statements')
  forVendor(@Param('vendorId', ParseUUIDPipe) vendorId: string) {
    return this.statements.issuedFor(vendorId);
  }

  @RequirePermission('vendors.view')
  @Get('statements/:id/link')
  @Header('Cache-Control', 'no-store')
  link(@Param('id', ParseUUIDPipe) id: string) {
    return this.statements.linkForAdmin(id);
  }
}

/**
 * Where a statement link lands. Public, like `/receipts/pdf`, and gated the
 * same way: the signed token is the credential, names one statement, and is
 * dead in minutes. A receipt link is refused here — the document kind is part
 * of what is signed.
 */
@ApiExcludeController()
@Controller('statements')
export class StatementDownloadController {
  constructor(private readonly statements: StatementsService) {}

  @Get('pdf')
  async download(
    @Query(new ZodValidationPipe(downloadQuerySchema)) query: DownloadQuery,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const { pdf, fileName } = await this.statements.pdfForLink(query.token);
    await reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${fileName}"`)
      // A shop's turnover. Nothing between here and the reader should keep it.
      .header('Cache-Control', 'private, no-store')
      .header('X-Robots-Tag', 'noindex')
      .header('Referrer-Policy', 'no-referrer')
      .send(pdf);
  }
}
