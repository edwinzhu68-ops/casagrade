import 'reflect-metadata';
try { require('dotenv/config'); } catch { /* 未安装 dotenv 时忽略，使用系统环境变量 */ }
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const logger = new Logger('Bootstrap');

// 写入错误日志到文件
function writeErrorLog(msg: string) {
  // __dirname 是 dist 目录，往上一级到 backend
  const logDir = path.join(__dirname, '..', 'logs');
  const logFile = path.join(logDir, `error-${new Date().toISOString().split('T')[0]}.log`);
  const logMsg = `[${new Date().toISOString()}] ${msg}\n`;
  
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(logFile, logMsg);
  } catch (e) {
    console.error('Failed to write error log:', e);
  }
  console.error(msg); // 同时输出到控制台，PM2 会捕获
}

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
    
    // 生产环境也记录完整错误信息
    const isDev = process.env.NODE_ENV !== 'production';
    
    if (exception instanceof Error) {
      const errorMsg = isDev 
        ? `${exception.message}\n${exception.stack}`
        : `${exception.message}`;
      
      writeErrorLog(`[UnhandledException] ${errorMsg}`);
      
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: isDev ? exception.message : 'Internal server error',
        error: 'Internal Server Error',
      });
    } else {
      writeErrorLog(`[UnhandledException] Unknown error: ${JSON.stringify(exception)}`);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        error: 'Internal Server Error',
      });
    }
  }
}

// 捕获未处理的进程错误
process.on('uncaughtException', (error) => {
  writeErrorLog(`[Process-uncaughtException] ${error.message}\n${error.stack}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  const msg = reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason);
  writeErrorLog(`[Process-unhandledRejection] ${msg}`);
});

async function bootstrap() {
  // 生产环境必须设置这两个敏感 env；缺失则直接拒绝启动（防止硬编码默认值泄漏导致全系统裸奔）
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    const missing: string[] = [];
    if (!process.env.TOKEN_SECRET || process.env.TOKEN_SECRET.trim() === '') missing.push('TOKEN_SECRET');
    if (!process.env.ADMIN_TOKEN || process.env.ADMIN_TOKEN.trim() === '') missing.push('ADMIN_TOKEN');
    if (missing.length > 0) {
      const msg = `❌ 生产环境必须设置环境变量: ${missing.join(', ')}。拒绝启动，防止使用硬编码默认值导致安全裸奔。`;
      writeErrorLog(msg);
      throw new Error(msg);
    }
  }

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'], // 开启所有日志级别
  });
  app.useGlobalFilters(new AllExceptionsFilter());

  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  const isDev = process.env.NODE_ENV !== 'production';
  const localDevOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3005',
    'http://127.0.0.1:3005',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];
  const prodOrigins = ['https://www.casagrade.com', 'https://casagrade.com', 'https://api.casagrade.com'];
  // 本地用 NODE_ENV=production 跑 build 时，可加 ALLOW_LOCAL_CORS=1 放行 localhost 页面访问 API
  const allowLocalCors = isDev || process.env.ALLOW_LOCAL_CORS === '1' || process.env.ALLOW_LOCAL_CORS === 'true';
  const defaultOrigins = allowLocalCors ? [...prodOrigins, ...localDevOrigins] : prodOrigins;
  const origins = allowedOrigins
    ? allowedOrigins.split(',').map((s) => s.trim()).filter(Boolean)
    : defaultOrigins;
  app.enableCors({ origin: origins, credentials: true });
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 Lottery API running on http://localhost:${port}`);
}
bootstrap();
