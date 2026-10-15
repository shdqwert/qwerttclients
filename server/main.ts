// Точка входа сервера. Настройки — через переменные окружения (см. README).
import { join } from 'node:path';
import { buildApp } from './app.ts';

const env = process.env;
const production = env.NODE_ENV === 'production';
const port = Number(env.PORT ?? 4000);
const host = env.HOST ?? '127.0.0.1';

const { app } = buildApp({
  dbPath: env.DB_PATH ?? join(import.meta.dirname, '..', 'data', 'qwerttclients.db'),
  sessionIdleMin: Number(env.SESSION_IDLE_MIN ?? 30),
  demoLoad: env.DEMO_LOAD !== '0',
  seedDemo: env.SEED_DEMO !== '0',
  production,
});

app.listen({ port, host }).then((address) => {
  console.log(`[qwerttclients] API listening on ${address}`);
}).catch((err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[qwerttclients] Port ${port} is already in use: another copy of the server is running.`);
    console.error('[qwerttclients] Close the other terminal with "npm run dev" or set another port: PORT=4001 npm run dev');
  } else {
    console.error(err);
  }
  process.exit(1);
});
