// Loads .env for local runs; in Docker the variables come from compose.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule, ObserveInstrument } from './app.module.js';
import { assertEnv } from './config/env.js';
import {
  allowedOrigins,
  clientIpFrom,
  clientIpHeaders,
  trustedProxies,
} from './config/origins.js';

async function bootstrap() {
  // A missing secret or key stops the boot here, with the full list
  assertEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    instrument: ObserveInstrument,
    // Keep the exact request bytes: Paystack signs the raw webhook body
    rawBody: true,
    // Hold startup logs until pino takes over, so every line is structured
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  // Every route lives under /api/v1 (see Conventions in the backend plan).
  // The validation pipe and error filter are registered in AppModule, so
  // e2e tests get them too.
  app.setGlobalPrefix('api/v1');
  // The refresh token arrives in a cookie
  app.use(cookieParser());

  // Rate limits, OTP limits and the audit log all read req.ip. With a fixed
  // chain of proxies, counting hops finds the visitor; behind Vercel and
  // Render's Cloudflare, headers they set name the visitor instead.
  const proxies = trustedProxies();
  if (proxies) app.set('trust proxy', proxies);
  const ipHeaders = clientIpHeaders();
  if (ipHeaders.length) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const ip = clientIpFrom(req.headers, ipHeaders);
      if (ip)
        Object.defineProperty(req, 'ip', { value: ip, configurable: true });
      next();
    });
  }

  app.use(
    helmet({
      // A JSON API: no pages to protect with a CSP, and Swagger UI's inline
      // script needs it off
      contentSecurityPolicy: false,
      // The web app (another origin) may embed ticket PDFs
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  // Only the web app may call the API from a browser, with cookies
  app.enableCors({
    origin: allowedOrigins(),
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'Content-Disposition'],
  });

  // API docs at /api/docs; the frontend reads the contract from here.
  const config = new DocumentBuilder()
    .setTitle('Seatline API')
    .setDescription('Ghana bus booking: passengers, agents and operators')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, () =>
    SwaggerModule.createDocument(app, config),
  );

  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();
