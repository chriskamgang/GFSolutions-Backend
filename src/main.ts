import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  // Desactiver le bodyParser integre pour pouvoir definir notre propre limite
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  // Body parser avec limite 15mb pour les photos et signatures en base64
  app.use(require('express').json({ limit: '15mb' }));
  app.use(require('express').urlencoded({ limit: '15mb', extended: true }));

  // Prefix global
  app.setGlobalPrefix('api/v1');

  // Checkout page (hors prefix API) — sert le fichier HTML statique
  const express = require('express');
  const path = require('path');
  // __dirname = dist/src en prod, on remonte 2 niveaux pour atteindre /public
  const publicDir = path.join(__dirname, '..', '..', 'public');
  const checkoutPath = path.join(publicDir, 'checkout.html');
  app.getHttpAdapter().get('/checkout/:ref', (req: any, res: any) => {
    res.sendFile(checkoutPath);
  });

  // CORS — allow all origins (API consumed by mobile apps, dashboard, etc.)
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('MicroFinance API')
    .setDescription('API de gestion de microfinance - Cameroun')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Authentification')
    .addTag('Utilisateurs')
    .addTag('Clients')
    .addTag('Comptes')
    .addTag('Transactions')
    .addTag('Roles & Permissions')
    .addTag('Agences')
    .addTag('Entreprises & Salaires')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API MicroFinance demarree sur http://localhost:${port}`);
  console.log(`Documentation Swagger: http://localhost:${port}/api/docs`);
}
bootstrap();
