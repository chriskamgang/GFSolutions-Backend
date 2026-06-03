import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
  });

  // Augmenter la limite pour les photos et signatures en base64
  app.use(require('express').json({ limit: '15mb' }));
  app.use(require('express').urlencoded({ limit: '15mb', extended: true }));

  // Prefix global
  app.setGlobalPrefix('api/v1');

  // CORS
  app.enableCors({
    origin: (origin, callback) => {
      const allowed = [
        'https://admin.gfinancials.com',
        'https://gfinancials.com',
        'https://www.gfinancials.com',
      ];
      if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
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
