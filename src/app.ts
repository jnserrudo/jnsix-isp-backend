import express from 'express';
import cors from 'cors';
import logger from './utils/logger';

// Route imports
import authRoutes from './routes/auth.routes';
import clientRoutes from './routes/client.routes';
import planRoutes from './routes/plan.routes';
import nodeRoutes from './routes/node.routes';
import contractRoutes from './routes/contract.routes';
import invoiceRoutes from './routes/invoice.routes';
import paymentRoutes from './routes/payment.routes';
import dashboardRoutes from './routes/dashboard.routes';
import auditRoutes from './routes/audit.routes';
import mikrotikTestRoutes from './routes/mikrotik-test.routes';
import mikrotikManagerRoutes from './routes/mikrotik-manager.routes';
import migrationRoutes from './routes/migration.routes';
import ticketRoutes from './routes/ticket.routes';
import notificationRoutes from './routes/notification.routes';
import portalRoutes from './routes/portal.routes';
import inventoryRoutes from './routes/inventory.routes';
import settingsRoutes from './routes/settings.routes';
const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`HTTP ${req.method} ${req.url}`);
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/nodes', nodeRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/mikrotik-test', mikrotikTestRoutes);
app.use('/api/nodes/:nodeId/mikrotik', mikrotikManagerRoutes);
app.use('/api/migration', migrationRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/settings', settingsRoutes);

// Base route
app.get('/', (req, res) => {
  res.json({
    name: 'JNSIX ISP Manager API',
    version: '1.0.0',
    status: 'online',
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(`Error no controlado: ${err.message || err}`);
  res.status(500).json({ error: 'Ha ocurrido un error interno en el servidor.' });
});

export default app;
