import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './lib/env.js';
import { initRealtime } from './lib/realtime.js';
import { disconnectPrisma, prisma } from './lib/prisma.js';

async function main(): Promise<void> {
  const app = createApp();
  const server = createServer(app);

  initRealtime(server);

  await prisma.$connect();

  server.listen(env.port, env.host, () => {
    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        `  POS API  ->  http://localhost:${env.port}`,
        `  health   ->  http://localhost:${env.port}/api/health`,
        `  database ->  ${env.databaseProvider}`,
        `  mode     ->  ${env.nodeEnv}`,
        '',
      ].join('\n'),
    );
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`\n[api] ${signal} received, shutting down...`);
    server.close();
    await disconnectPrisma();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[api] failed to start:', error);
  process.exit(1);
});
