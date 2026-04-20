import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';

/**
 * 管理员接口鉴权：要求请求头 X-Admin-Token 与环境变量 ADMIN_TOKEN 一致（timingSafeEqual 防时序攻击）。
 * 开发环境未设 ADMIN_TOKEN 时放行；生产环境启动时已在 main.ts 强校验必须设置。
 * 放行白名单走精确路径匹配，避免 .includes() 的前缀/子串绕过。
 */
const ADMIN_PUBLIC_PATHS = new Set<string>([
  '/api/admin/health',
  '/api/admin/clear-settlement',
]);

@Injectable()
export class AdminTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const adminToken = process.env.ADMIN_TOKEN;
    const req = context.switchToHttp().getRequest<Request>();

    if (!adminToken || adminToken === '') {
      // 开发环境未设 → 放行（本地调试方便）。生产环境由 main.ts 启动校验兜底。
      return true;
    }

    // 精确路径白名单（如 clear-settlement 靠商家 Bearer 另行校验）
    if (req.path && ADMIN_PUBLIC_PATHS.has(req.path)) {
      return true;
    }

    const token = req.headers['x-admin-token'];
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException('需要管理员密钥');
    }

    // timingSafeEqual：长度不同直接拒绝；等长时常数时间比较，防止计时攻击逐字符爆破
    const a = Buffer.from(token, 'utf8');
    const b = Buffer.from(adminToken, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('需要管理员密钥');
    }

    return true;
  }
}
