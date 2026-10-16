import { ConfigService } from '@nestjs/config';

import { createApp } from './app-factory.js';
import type { Env } from './config/env.js';

/**
 * The long-running entry point: a local run, a VPS, a container.
 *
 * The app itself is assembled in `app-factory.ts`, which the serverless entry
 * point (`serverless.ts`) also uses. All this file adds is the port.
 */
async function bootstrap() {
  const app = await createApp();
  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
}

await bootstrap();
