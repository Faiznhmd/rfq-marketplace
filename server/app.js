import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { resolve } from 'node:path';
import { authRoutes } from './auth.js';
import { marketplaceRoutes } from './routes.js';
import { errorHandler, HttpError } from './errors.js';
import { allowedOrigins } from './origin.js';

export function createApp(
  db,
  {
    production = false,
    appOrigin = 'http://localhost:5173',
    serveClient = false,
    trustProxy = false,
  } = {},
) {
  const app = express();
  const origins = allowedOrigins(appOrigin, production);
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', 1);
  app.use(
    helmet({
      strictTransportSecurity: production ? undefined : false,
      contentSecurityPolicy: production ? undefined : false,
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('Origin');
      if ((origin && !origins.has(origin)) || req.get('Sec-Fetch-Site') === 'cross-site')
        throw new HttpError(403, 'Cross-site requests are not allowed.');
      if (!req.is('application/json'))
        throw new HttpError(415, 'Use application/json for this request.');
    }
    next();
  });
  app.get('/api/health', async (req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  });
  app.use('/api/auth', authRoutes(db, production));
  app.use('/api', marketplaceRoutes(db, production));
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  if (serveClient) {
    app.use(express.static(resolve('dist')));
    app.get('/{*path}', (req, res) => res.sendFile(resolve('dist/index.html')));
  }
  app.use(errorHandler);
  return app;
}
