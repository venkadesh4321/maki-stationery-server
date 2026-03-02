import { app } from './app';
import { env } from './infrastructure/config/env';
import { prisma } from './infrastructure/db/prisma';
import { logger } from './infrastructure/logger/logger';

async function bootstrap(): Promise<void> {
  await prisma.$connect();

  app.listen(env.PORT, () => {
    logger.info('server_started', {
      port: env.PORT,
      env: env.NODE_ENV,
    });
  });
}

bootstrap().catch(async (error) => {
  logger.error('bootstrap_failed', { error: error instanceof Error ? error.message : String(error) });
  await prisma.$disconnect();
  process.exit(1);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
