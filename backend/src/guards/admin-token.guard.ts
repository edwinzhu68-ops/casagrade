import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { User } from '../entities/user.entity';

/**
 * 管理员接口鉴权：
 *   Bearer token 有效 + 对应用户 role='admin'。
 *
 * 路径白名单（ADMIN_PUBLIC_PATHS）跳过此 guard。
 */
const ADMIN_PUBLIC_PATHS = new Set<string>([
  '/api/admin/health',
]);

const TOKEN_SECRET = () => process.env.TOKEN_SECRET || 'lottery-token-secret-change-in-prod';

function parseUserIdFromBearer(auth: string): number | null {
  const raw = auth.replace(/^\s*bearer\s+/i, '').trim();
  if (!raw) return null;
  const lastDot = raw.lastIndexOf('.');
  if (lastDot <= 0) return null;
  const payload = raw.slice(0, lastDot);
  const sig = raw.slice(lastDot + 1);
  const expected = crypto.createHmac('sha256', TOKEN_SECRET()).update(payload).digest('hex').slice(0, 32);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    const userId = colonIdx > 0 ? parseInt(decoded.slice(0, colonIdx), 10) : NaN;
    return isNaN(userId) ? null : userId;
  } catch { return null; }
}

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    // 白名单路径：不在此 guard 校验（方法内部可能自行校验 Bearer）
    if (req.path && ADMIN_PUBLIC_PATHS.has(req.path)) return true;

    // Bearer token + user.role='admin'
    const authHeader = (req.headers?.['authorization'] || '') as string;
    const userId = parseUserIdFromBearer(authHeader);
    if (userId) {
      const user = await this.dataSource.getRepository(User).findOne({ where: { user_id: userId } });
      if (user && user.role === 'admin') return true;
    }

    throw new UnauthorizedException('需要管理员账号登录');
  }
}
