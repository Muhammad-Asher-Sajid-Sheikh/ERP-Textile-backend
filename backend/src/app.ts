import express from 'express';
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes.js';
import customerRoutes from './routes/customer.routes.js';
import marketingRoutes from './routes/marketing.routes.js';
import workflowRoutes from './routes/workflow.routes.js';
import managementRoutes from './routes/management.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { notFound } from './middleware/notFound.middleware.js';

const app = express();
app.use((req, res, next) => {
  req.correlationId = randomUUID();
  res.setHeader('X-Request-ID', req.correlationId);
  if (process.env.ENABLE_REQUEST_LOGGING === 'true') res.on('finish', () => console.log({ requestId: req.correlationId, method: req.method, status: res.statusCode }));
  next();
});
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'], exposedHeaders: ['X-Request-ID'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());
app.get('/health', (_req, res) => res.json({ success: true, message: 'Server is running', timestamp: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
// New routes handle their own role checks before WF-01's narrower router.
app.use('/api/marketing', workflowRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/management', managementRoutes);
app.use(notFound);
app.use(errorHandler);
export default app;
