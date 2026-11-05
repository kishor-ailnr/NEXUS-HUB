// Polyfill native WebSocket for Node environments where globalThis.WebSocket is not defined
if (typeof (globalThis as any).WebSocket === 'undefined') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    (globalThis as any).WebSocket = require('ws');
  } catch {
    // Ignore if not present
  }
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser = require('cookie-parser');
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { AppModule } from './app.module';
import { initSentry } from './common/sentry';
import { SpaFallbackFilter } from './common/filters/spa-fallback.filter';

async function bootstrap() {
  initSentry();
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const port = process.env.PORT
    ? parseInt(process.env.PORT, 10)
    : configService.get<number>('PORT') || 3000;

  // Validate required environment variables
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_JWT_SECRET',
  ];
  const missingVars = requiredEnvVars.filter(
    (key) => !process.env[key] && !configService.get<string>(key),
  );
  if (missingVars.length > 0) {
    logger.warn(
      `⚠️ Missing environment variable(s): ${missingVars.join(', ')}. ` +
      `Supabase database operations will fail until these are configured in your deployment settings (Render Environment tab).`,
    );
  }
  const defaultOrigins = [
    'https://smart-supply-chain-v3.web.app',
    'https://smart-supply-chain-v3.firebaseapp.com',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
  ];
  const envOrigins = configService.get<string>('FRONTEND_ORIGIN')
    ? configService.get<string>('FRONTEND_ORIGIN')!.split(',').map((o) => o.trim()).filter(Boolean)
    : [];
  const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

  app.use(cookieParser());

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin) ||
        origin.endsWith('.web.app') ||
        origin.endsWith('.firebaseapp.com') ||
        origin.endsWith('.vercel.app') ||
        origin.endsWith('.onrender.com') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'X-NW-Mode',
      'x-nw-mode',
      'X-NW-Admin',
      'x-nw-admin',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new SpaFallbackFilter());

  // Serve compiled web frontend SPA when distribution directory exists
  const candidates = [
    path.resolve(__dirname, 'public'),
    path.resolve(__dirname, '../public'),
    path.resolve(__dirname, '../../public'),
    path.resolve(process.cwd(), 'public'),
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(__dirname, '../../../apps/web/dist'),
    path.resolve(__dirname, '../../apps/web/dist'),
    path.resolve(__dirname, '../web/dist'),
    path.resolve(__dirname, '../../web/dist'),
  ];
  const webDistPath = candidates.find((p) => fs.existsSync(path.join(p, 'index.html')));

  if (webDistPath) {
    logger.log(`Serving static web assets from: ${webDistPath}`);
    app.use(express.static(webDistPath));

    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.get('*', (req: any, res: any, next: any) => {
      const url = req.path || '';
      const apiPrefixes = [
        '/api',
        '/auth',
        '/health',
        '/ai',
        '/trips',
        '/vehicles',
        '/drivers',
        '/geofences',
        '/convoys',
        '/dashboard',
        '/notifications',
        '/routing',
        '/geocoding',
        '/stations',
        '/trains',
        '/locomotives',
        '/rakes',
        '/loco-pilots',
        '/train-movements',
        '/airports',
        '/aircraft',
        '/flight-crew',
        '/flights',
        '/flight-movements',
        '/platform',
        '/vessels',
        '/ports',
        '/sea-crew',
        '/voyages',
        '/voyage-movements',
        '/sea-convoys',
        '/admin',
        '/socket.io',
      ];
      if (apiPrefixes.some((prefix) => url.startsWith(prefix))) {
        return next();
      }
      res.sendFile(path.join(webDistPath, 'index.html'));
    });
  }

  await app.listen(port, '0.0.0.0');
  logger.log(`NEXUS WAYS API listening on 0.0.0.0:${port}`);
  logger.log(`CORS enabled for origins: ${allowedOrigins.join(', ')}`);
}

bootstrap();
