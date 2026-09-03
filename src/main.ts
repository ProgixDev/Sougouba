import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // Fastify's own logger (pino under the hood) rather than a separate
    // logging package — one less dependency, and it already understands
    // request/response lifecycle events Nest's default logger doesn't emit.
    new FastifyAdapter({ logger: true }),
    // Keeps the unparsed request body available as `request.rawBody`. Stripe
    // signs the exact bytes it sent, so the webhook's signature check cannot
    // work against a re-serialised JSON object — see
    // `orders/stripe-webhook.controller.ts`.
    { rawBody: true }
  );

  const config = app.get(ConfigService<Env, true>);

  app.useGlobalFilters(new HttpExceptionFilter());
  // No global `ValidationPipe` — this project standardized on Zod
  // (`ZodValidationPipe`, applied per-route via `@UsePipes`), not
  // `class-validator` decorators on DTO classes. A global `ValidationPipe`
  // would need `class-validator` installed for nothing: no DTO here uses its
  // decorators, so it would never actually validate anything.

  // Served in every non-production environment — never in prod, so the API
  // surface isn't handed out for free to anyone who finds the URL.
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Sougouba API')
        .setDescription('Backend for the Sougouba marketplace — see docs/BACKEND-BUILD-PHASES.md in the mobile repo.')
        .setVersion('0.0.1')
        .addBearerAuth()
        .build()
    );
    SwaggerModule.setup('docs', app, document);
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
}

await bootstrap();
