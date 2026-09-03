import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Only read by `drizzle-kit push`/`studio`, not by `generate` — generate
    // diffs against the committed migration snapshots in `./drizzle`, no
    // live connection needed, which is why CI can run it with no secrets.
    url: process.env.DATABASE_URL ?? 'postgresql://placeholder',
  },
  // Supabase owns `auth`/`storage`/`realtime` — never touch them from here.
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
});
