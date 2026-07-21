import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Structured logs; never leak stack traces to clients (see filter).
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(AppConfig);

  app.setGlobalPrefix('api');

  // Security headers + strict CSP. The same process serves the SPA, so the CSP
  // applies to the console too. 'unsafe-inline' on style-src is required by
  // Radix Themes (inline styles); scripts stay locked to same-origin.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );

  // Small body limit — the API only receives short JSON DTOs.
  app.useBodyParser('json', { limit: '32kb' });
  app.useBodyParser('urlencoded', { extended: false, limit: '32kb' });

  // Global validation: nothing beyond the declared DTO shape may pass.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  const server = await app.listen(config.port, config.bindAddr);
  // Basic slowloris mitigation now that Node faces the network directly.
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;

  // eslint-disable-next-line no-console
  console.log(`OCM API listening on ${config.bindAddr}:${config.port}`);
}

void bootstrap();
