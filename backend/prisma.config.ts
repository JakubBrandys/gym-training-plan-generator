import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Prisma CLI (migrate/db push/studio) needs a non-pooled connection —
    // Supabase's session pooler (port 5432) or direct string, never the
    // transaction pooler used by DATABASE_URL at runtime.
    url: env('DIRECT_URL'),
  },
});
