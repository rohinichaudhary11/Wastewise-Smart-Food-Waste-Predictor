import crypto from 'node:crypto';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import mongoose from 'mongoose';
import { config } from './config.js';
import { authRouter, outletRouter, userRouter } from './auth/routes.js';
import { calendarRouter, logsRouter, menuRouter } from './operations/routes.js';
import { requireCsrf } from './security/csrf.js';
import analyticsRouter from './analytics/routes.js';
import modelRoutes from './analytics/modelRoutes.js';
import forecastRoutes from './analytics/forecastRoutes.js';
import reportsRouter from './reports/routes.js';
import { scheduleWeeklyTraining } from './analytics/training.js';
import * as models from './models/index.js';

function rejectUnsafeKeys(value, depth = 0) {
  if (depth > 20) throw Object.assign(new Error('Request data is too deeply nested.'), { status: 400, code: 'INVALID_REQUEST' });
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.')) throw Object.assign(new Error('Invalid request field.'), { status: 400, code: 'INVALID_REQUEST' });
    rejectUnsafeKeys(child, depth + 1);
  }
}

export function createApp() {
  const app = express();
  if (config.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(pinoHttp({
    genReqId: req => req.headers['x-request-id']?.match(/^[a-zA-Z0-9-]{1,80}$/)?.[0] || crypto.randomUUID(),
    redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers.x-csrf-token'],
    customLogLevel: (_res, err) => err ? 'error' : 'info',
    autoLogging: config.NODE_ENV !== 'test'
  }));
  app.use(helmet());
  const allowedOrigins = new Set(config.clientOrigins);
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-ID'],
    maxAge: 600
  }));
  app.use(express.json({ limit: '64kb', type: ['application/json', 'application/*+json'] }));
  app.use((req, res, next) => {
    try { rejectUnsafeKeys(req.body); next(); }
    catch (error) { res.status(400).json({ error: { code: error.code || 'INVALID_REQUEST', message: error.message } }); }
  });
  app.use(cookieParser());

  const api = express.Router();
  api.use(requireCsrf);
  api.get('/health', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable', database: ready ? 'connected' : 'disconnected' });
  });
  api.use('/auth', authRouter);
  api.use('/outlets', outletRouter);
  api.use('/users', userRouter);
  api.use('/menu-items', menuRouter);
  api.use('/logs', logsRouter);
  api.use('/calendar', calendarRouter);
  api.use('/analytics', analyticsRouter);
  api.use('/model-runs', modelRoutes);
  api.use('/forecasts', forecastRoutes);
  api.use('/reports', reportsRouter);
  app.use('/api/v1', api);
  app.get('/api/cron/weekly-training', async (req, res, next) => {
    const secret = config.CRON_SECRET;
    const supplied = Buffer.from(req.get('authorization') || '');
    const expected = Buffer.from(secret ? `Bearer ${secret}` : '');
    if (!secret || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'The requested API route does not exist.' } });
    }
    try {
      await scheduleWeeklyTraining();
      res.json({ data: { status: 'complete' } });
    } catch (error) { next(error); }
  });
  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'The requested API route does not exist.' } }));
  app.use((error, req, res, _next) => {
    req.log?.error({ errorName: error?.name || 'Error', errorCode: error?.code, validationPaths: Object.keys(error?.errors || {}) }, 'request failed');
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.issues?.[0]?.message || 'Invalid request data.' } });
    }
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } });
    if (error?.status === 400) return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'The request could not be parsed.' } });
    if (error?.name === 'ValidationError' || error?.name === 'CastError') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'The submitted data is invalid.' } });
    }
    if (error?.code === 11000) {
      return res.status(409).json({ error: { code: 'DUPLICATE', message: 'A record with those details already exists.' } });
    }
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
    res.status(status).json({ error: { code: error?.code || 'INTERNAL_ERROR', message: status === 500 ? 'An unexpected error occurred.' : error.message } });
  });
  return app;
}

// Vercel detects this module as the Express entry point. Keep the database
// connection lazy so importing createApp() in local tests never requires Atlas.
let vercelAppPromise;
export default async function vercelHandler(req, res) {
  vercelAppPromise ??= mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
    .then(() => Promise.all(Object.values(models).map(model => model.createIndexes())))
    .then(() => createApp());
  const app = await vercelAppPromise;
  return app(req, res);
}
