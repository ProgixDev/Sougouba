import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import { CurrentUser } from '../../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../../auth/supabase-auth.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  receiptDownloadQuerySchema,
  receiptLinkQuerySchema,
  type ReceiptDownloadQuery,
  type ReceiptLinkQuery,
} from '../dto/order.dto.js';
import { ReceiptsService } from './receipts.service.js';

/**
 * The shopper asks for their receipt.
 *
 * Two steps because a browser is in the middle: the app calls this with its
 * token and gets a short-lived link, then hands the link to the system browser
 * — which could never have sent the token itself. See `receipt-link.ts`.
 */
@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('orders')
export class OrderReceiptController {
  constructor(private readonly receipts: ReceiptsService) {}

  // The answer is a credential, however short-lived: nothing should keep it.
  @Get(':id/receipt-link')
  @Header('Cache-Control', 'no-store')
  link(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(receiptLinkQuerySchema)) query: ReceiptLinkQuery
  ) {
    return this.receipts.linkForCustomer(userId, id, query.locale);
  }
}

/**
 * Where a receipt link lands.
 *
 * Public on purpose — the link is opened by a browser that holds no session —
 * and the token is the whole gate: signed, naming one order, dead in minutes.
 *
 * The token rides in the query string, not the path: Fastify's router refuses
 * a path parameter longer than 100 characters, and a signed token is twice that.
 */
@ApiExcludeController()
@Controller('receipts')
export class ReceiptDownloadController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get('pdf')
  async download(
    @Query(new ZodValidationPipe(receiptDownloadQuerySchema)) query: ReceiptDownloadQuery,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const { pdf, fileName } = await this.receipts.pdfForLink(query.token);
    await reply
      .header('Content-Type', 'application/pdf')
      // `inline`: the in-app browser shows it, with its own share and print
      // buttons, instead of dropping a file the shopper then has to find.
      .header('Content-Disposition', `inline; filename="${fileName}"`)
      // A receipt carries a name and an address. Nothing between here and the
      // reader should keep a copy, index it, or pass the link on as a referrer.
      .header('Cache-Control', 'private, no-store')
      .header('X-Robots-Tag', 'noindex')
      .header('Referrer-Policy', 'no-referrer')
      .send(pdf);
  }
}
