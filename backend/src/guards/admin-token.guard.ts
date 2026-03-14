import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

/**
 * 管理员接口鉴权：要求请求头 X-Admin-Token 与环境变量 ADMIN_TOKEN 一致。
 * 若未配置 ADMIN_TOKEN，则不校验（便于本地开发）。
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const adminToken = process.env.ADMIN_TOKEN;
    if (!adminToken || adminToken === '') {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request>();
    if (req.path && req.path.includes('admin/health')) {
      return true;
    }
    const token = req.headers['x-admin-token'] as string | undefined;
    if (token !== adminToken) {
      throw new UnauthorizedException('需要管理员密钥');
    }
    return true;
  }
}
