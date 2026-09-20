import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { env } from './lib/env.js';
import { errorHandler, notFoundHandler } from './lib/http.js';
import { ensureUploadDir } from './lib/uploads.js';
import { prisma } from './lib/prisma.js';

import authRoutes from './modules/auth/routes.js';
import entityRoutes from './modules/entities/routes.js';
import userRoutes from './modules/users/routes.js';
import categoryRoutes from './modules/categories/routes.js';
import productRoutes from './modules/products/routes.js';
import inventoryRoutes from './modules/inventory/routes.js';
import supplierRoutes from './modules/suppliers/routes.js';
import saleRoutes from './modules/sales/routes.js';
import promotionRoutes from './modules/promotions/routes.js';
import customerRoutes from './modules/customers/routes.js';
import restaurantRoutes from './modules/restaurant/routes.js';
import kdsRoutes from './modules/kds/routes.js';
import onlineRoutes from './modules/online/routes.js';
import reportRoutes from './modules/reports/routes.js';
import settingsRoutes from './modules/settings/routes.js';
import uploadRoutes from './modules/uploads/routes.js';

export function createApp(): Express {
  const app = express();

  if (env.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      // The storefront serves product images to itself; the API is not an
      // HTML origin, so a strict CSP here would only break image embedding.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (env.corsOrigin.includes('*') || env.corsOrigin.includes(origin)) {
          return callback(null, true);
        }
        callback(new Error(`Origem nao permitida: ${origin}`));
      },
      credentials: true,
      exposedHeaders: ['X-Total-Count'],
    }),
  );

  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Uploaded product images are served straight off disk in the local driver.
  ensureUploadDir();
  app.use(
    env.publicUploadBase,
    express.static(env.uploadDir, {
      maxAge: '30d',
      immutable: true,
      fallthrough: true,
    }),
  );

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'up', uptime: process.uptime() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  // Brute-force protection on the only unauthenticated write surface.
  if (env.rateLimitEnabled) {
    app.use(
      '/api/auth/login',
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 20,
        /*
          Only FAILED attempts count. The limit is keyed by IP, and a shop has
          one internet connection: every till, tablet and phone in the building
          shares an address. Counting successes too meant an ordinary shift
          change - six people signing in across two registers - could reach the
          limit and lock the whole shop out of its own till for fifteen minutes.
          Guessing a password is a run of failures, so that is what we count.
        */
        skipSuccessfulRequests: true,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: {
          error: {
            code: 'rate_limited',
            message:
              'Demasiadas tentativas falhadas. Aguarde 15 minutos ou peca a um responsavel para repor a palavra-passe.',
            details: null,
          },
        },
      }),
    );
  }

  app.use('/api/auth', authRoutes);
  app.use('/api/entities', entityRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/suppliers', supplierRoutes);
  app.use('/api/sales', saleRoutes);
  app.use('/api/promotions', promotionRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/restaurant', restaurantRoutes);
  app.use('/api/kds', kdsRoutes);
  app.use('/api/online', onlineRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/uploads', uploadRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
