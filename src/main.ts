import 'dotenv/config';
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PrismaDecimalInterceptor } from './common/interceptors/prisma-decimal.interceptor';
import { PrismaClientExceptionFilter } from './common/filters/prisma-client-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const corsOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new PrismaClientExceptionFilter(httpAdapter));
  app.useGlobalInterceptors(new PrismaDecimalInterceptor());
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Central Care Customer & Technician API')
    .setDescription(
      'Customer, technician, service request, quotation, shop, notification, and Agora calling APIs.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    useGlobalPrefix: true,
    swaggerOptions: {
      filter: true,
      persistAuthorization: true,
    },
  });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 5000, '0.0.0.0');

  console.log(`Server running on http://localhost:${process.env.PORT || 5000}`);
  console.log(
    `Swagger UI available at http://localhost:${process.env.PORT || 5000}/api/docs`,
  );
}
void bootstrap();
