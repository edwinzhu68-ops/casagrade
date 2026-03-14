try { require('dotenv/config'); } catch { /* 未安装 dotenv 时忽略，使用系统环境变量 */ }
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, HttpException } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      return res.status(status).json(typeof body === 'object' ? body : { message: body });
    }
    const message = exception instanceof Error ? exception.message : 'Internal server error';
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      error: 'Internal Server Error',
    });
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new AllExceptionsFilter());

  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  const origins = allowedOrigins
    ? allowedOrigins.split(',').map((s) => s.trim()).filter(Boolean)
    : [
        'https://www.casagrade.com',
        'https://api.casagrade.com',
        'http://localhost:3005',
        'http://localhost:8080',
      ];
  app.enableCors({ origin: origins, credentials: true });
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Lottery API running on http://localhost:${port}`);
}
bootstrap();
