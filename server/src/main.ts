// Loads .env for local runs; in Docker the variables come from compose.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  // Every route lives under /api/v1 (see Conventions in the backend plan).
  // The validation pipe and error filter are registered in AppModule, so
  // e2e tests get them too.
  app.setGlobalPrefix('api/v1');

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
