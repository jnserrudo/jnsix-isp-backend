import dotenv from 'dotenv';
// Load environment variables before any other module imports
dotenv.config();

import app from './app';
import logger from './utils/logger';
import prisma from './services/db.service';
import { SchedulerService } from './services/scheduler.service';

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    // Validate database connection
    logger.info('Comprobando conexión con base de datos...');
    await prisma.$connect();
    logger.info('Conexión con PostgreSQL/Supabase establecida.');

    // Initialize daily cron jobs
    SchedulerService.init();

    // Start server listening
    app.listen(PORT, () => {
      logger.info(`Servidor backend corriendo en puerto ${PORT}`);
    });
  } catch (error: any) {
    logger.error(`Error crítico iniciando servidor: ${error.message || error}`);
    process.exit(1);
  }
}

startServer();
