import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.useWebSocketAdapter(new WsAdapter(app));

  // Register body parsers in order: raw audio/wav must come before JSON
  app.use(express.raw({ type: 'audio/wav', limit: '100mb' }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const port = parseInt(process.env.WS_PORT ?? '8080', 10);
  const host = process.env.WS_HOST ?? '0.0.0.0';

  await app.listen(port, host);
  console.log(`Server running on ${host}:${port}`);
  console.log(`  WS  : ws://${host}:${port}`);
  console.log(`  HTTP: http://${host}:${port}/summarize`);
}

bootstrap();
