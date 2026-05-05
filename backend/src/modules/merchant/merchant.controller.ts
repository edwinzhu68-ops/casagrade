import { Controller, Post, Get, Delete, Patch, Body, Param, Query, Inject, Logger, Req, UnauthorizedException, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { DataSource, In, IsNull, Not } from 'typeorm';
import { User } from '../../entities/user.entity';
import { Shop } from '../../entities/shop.entity';
import { ShopBinding } from '../../entities/shop-binding.entity';
import { CardCode } from '../../entities/card-code.entity';
import { Order } from '../../entities/order.entity';
import { Draw } from '../../entities/draw.entity';
import { Session } from '../../entities/session.entity';
import { findNationalLastCompletedDraw, findNationalPendingDraw } from '../../utils/draw-queries';
import { LocalLotteryService } from '../local-lottery/local-lottery.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as nodemailer from 'nodemailer';
import { Repository } from 'typeorm';

// ─── 登录限流（内存计数器，防暴力破解） ────────────────────────────────────────
const loginFailMap = new Map<string, { count: number; until: number }>();
const LOGIN_MAX_FAIL = 10;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15分钟

// ─── 卡密激活限流（防暴力枚举） ──────────────────────────────────────────────
const cardFailMap = new Map<string, { count: number; until: number }>();
const CARD_MAX_FAIL = 5;               // 同一IP最多失败5次
const CARD_LOCKOUT_MS = 30 * 60 * 1000; // 锁定30分钟

// ─── 忘记密码限流（防被任意调用强制重置商家密码，导致账户持续锁定） ──────────
const forgotPwMap = new Map<string, { count: number; resetAt: number }>();
const FORGOT_PW_MAX_PER_HOUR = 3;
const FORGOT_PW_WINDOW_MS = 60 * 60 * 1000;

// 每小时清理过期记录，防止扫描器长期积累导致内存泄漏
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginFailMap) {
    if (entry.until < now) loginFailMap.delete(ip);
  }
  for (const [ip, entry] of cardFailMap) {
    if (entry.until < now) cardFailMap.delete(ip);
  }
  for (const [ip, entry] of forgotPwMap) {
    if (entry.resetAt < now) forgotPwMap.delete(ip);
  }
}, 60 * 60 * 1000);

// ─── Token 工具（HMAC-SHA256 签名） ─────────────────────────────────────────
const TOKEN_SECRET = () => process.env.TOKEN_SECRET || 'lottery-token-secret-change-in-prod';

/** 创建签名 Token：base64(userId:account).hmac32 */
function createSignedToken(userId: number, accountNumber: string): string {
  const payload = Buffer.from(`${userId}:${accountNumber}`).toString('base64');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET()).update(payload).digest('hex').slice(0, 32);
  return `${payload}.${sig}`;
}

/**
 * 解析并验证 Token。
 * 仅接受签名格式（payload.sig），HMAC 校验通过才返回 payload。
 * 旧格式（无 .）一律拒绝（已过过渡期；createSignedToken 始终输出新格式）。
 */
function parseSignedToken(token: string): { userId: number; accountNumber: string; signed: boolean } | null {
  if (!token) return null;
  const lastDot = token.lastIndexOf('.');
  if (lastDot <= 0) return null; // 旧格式（无签名）一律拒绝

  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = crypto.createHmac('sha256', TOKEN_SECRET()).update(payload).digest('hex').slice(0, 32);
  // 使用 timingSafeEqual 防止时序攻击
  try {
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  } catch { return null; }

  try {
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx < 1) return null;
    const userId = parseInt(decoded.slice(0, colonIdx), 10);
    const accountNumber = decoded.slice(colonIdx + 1);
    if (!userId || isNaN(userId)) return null;
    return { userId, accountNumber, signed: true };
  } catch { return null; }
}
// ────────────────────────────────────────────────────────────────────────────

/** 按店号查找店铺，同时检查主号和别名 */
/** 按店号查找店铺，同时检查主号和别名（避免全表扫描） */
async function findShopByNumber(shopRepo: Repository<Shop>, number: string): Promise<Shop | null> {
  const byPrimary = await shopRepo.findOne({ where: { shop_number: number } });
  if (byPrimary) return byPrimary;
  const safe = number.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return shopRepo
    .createQueryBuilder('s')
    .where(`s.shop_aliases LIKE :pattern`, { pattern: `%"${safe}"%` })
    .getOne() ?? null;
}

interface LoginDto {
  account?: string;
  accountNumber?: string;
  password: string;
  force_login?: boolean;
  device_type?: string; // 'web' | 'app'
  device_name?: string;
}

const MAX_SESSIONS = 3;

interface RegisterDto {
  account?: string;
  accountNumber?: string;
  password: string;
  passwordConfirm?: string;
  shop_name?: string;
  email?: string;
  device_id?: string;
}

@Controller('merchant')
export class MerchantController implements OnModuleInit {
  private readonly logger = new Logger(MerchantController.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly localLotteryService: LocalLotteryService,
  ) {}

  /** 生产环境 synchronize=false，启动时手动补列（SQLite ADD COLUMN 幂等） */
  async onModuleInit() {
    const qr = this.dataSource.createQueryRunner();
    for (const sql of [
      `ALTER TABLE users ADD COLUMN session_token VARCHAR(64)`,
      `ALTER TABLE users ADD COLUMN last_login_at DATETIME`,
      `ALTER TABLE users ADD COLUMN last_login_ua VARCHAR(512)`,
      `ALTER TABLE users ADD COLUMN device_id VARCHAR(64)`,
    ]) {
      try { await qr.query(sql); } catch {}
    }
    await qr.release();
  }

  /** 验证 X-Session-Token 请求头与 DB 中 user.session_token 一致（强制要求） */
  private async verifySession(req: any, userId: number): Promise<void> {
    const headerToken = req.headers?.['x-session-token'];
    const user = await this.dataSource.getRepository(User).findOne({ where: { user_id: userId } });
    // 用户已登录但 DB 没记录 session_token：异常状态拒绝
    if (!user?.session_token) {
      throw new UnauthorizedException('SESSION_EXPIRED');
    }
    if (!headerToken || user.session_token !== headerToken) {
      throw new UnauthorizedException('SESSION_EXPIRED');
    }
  }

  /**
   * POST /merchant/register - 注册新门店账号（创建用户+店铺，店号从3位起自动分配）
   */
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const account = (dto.account || dto.accountNumber || '').trim().toLowerCase();
    const password = dto.password || '';
    const passwordConfirm = dto.passwordConfirm ?? dto.password;
    const shopName = (dto.shop_name || '').trim() || null;
    const email = (dto.email || '').trim() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('邮箱格式不正确');
    }

    if (!account || account.length < 4 || account.length > 32) {
      throw new BadRequestException('账号为4-32位字母或数字');
    }
    if (!/^[A-Za-z0-9]+$/.test(account)) {
      throw new BadRequestException('账号只能包含字母或数字');
    }
    if (/^\d+$/.test(account)) {
      throw new BadRequestException('账号不能为纯数字，纯数字保留为店号');
    }
    if (password.length < 6) {
      throw new BadRequestException('密码至少6位');
    }
    if (!/^[A-Za-z0-9]+$/.test(password) || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new BadRequestException('密码只能包含字母和数字，且必须同时包含字母和数字');
    }
    if (password !== passwordConfirm) {
      throw new BadRequestException('两次密码不一致');
    }

    const userRepo = this.dataSource.getRepository(User);
    const shopRepo = this.dataSource.getRepository(Shop);
    const existing = await userRepo.findOne({ where: { account_number: account } });
    if (existing) {
      throw new BadRequestException('该账号已存在');
    }

    // 一机一号：同一 device_id 不允许重复注册
    const deviceId = (dto.device_id || '').trim() || null;
    if (deviceId) {
      const deviceExisting = await userRepo.findOne({ where: { device_id: deviceId } as any });
      if (deviceExisting) {
        throw new BadRequestException(`此设备已注册账号，一台设备仅限注册一个账号。如忘记密码请联系客服。`);
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = userRepo.create({
      account_number: account,
      password_hash: passwordHash,
      role: 'merchant',
      email,
      device_id: deviceId,
    } as User);
    await userRepo.save(user);

    // 随机店号：3位（100–999）分配满才分配4位，4位满了再5位 … 直至9位。跳过全重复号（如111）保留给管理员手动分配。
    const allShops = await shopRepo.find({ select: ['shop_number'] as any });
    const taken = new Set(allShops.map(s => s.shop_number));

    let shopNumber: string | null = null;
    for (const len of [3, 4, 5, 6, 7, 8, 9]) {
      const min = Math.pow(10, len - 1);
      const max = Math.pow(10, len) - 1;
      const available: number[] = [];
      for (let n = min; n <= max; n++) {
        const sn = String(n);
        if (/^(.)\1+$/.test(sn)) continue; // 跳过111、2222等全重复号
        if (!taken.has(sn)) available.push(n);
      }
      if (available.length > 0) {
        shopNumber = String(available[Math.floor(Math.random() * available.length)]);
        break;
      }
    }
    if (!shopNumber) {
      throw new BadRequestException('暂无可用的随机店号，请稍后再试或联系管理员分配');
    }

    const trialExpires = new Date();
    trialExpires.setDate(trialExpires.getDate() + 30);
    const newShop = shopRepo.create({
      shop_number: shopNumber,
      owner_id: user.user_id,
      shop_name: shopName || `店铺${shopNumber}`,
      status: 'active',
      commission_rate: 0.1,
      subscription_expires_at: trialExpires,
    });
    await shopRepo.save(newShop);

    this.logger.log(`注册: 账号=${account}, 店号=${shopNumber}, 试用到期=${trialExpires.toISOString().slice(0,10)}`);

    return {
      success: true,
      message: '注册成功，免费试用30天。可用账号或店号登录，密码相同。',
      accountNumber: account,
      shopNumber,
      trialExpiresAt: trialExpires.toISOString().slice(0, 10),
    };
  }

  /**
   * POST /merchant/forgot-password - 通过邮箱找回密码
   */
  @Post('forgot-password')
  async forgotPassword(@Body() body: { email: string }, @Req() req: any) {
    const email = (body.email || '').trim().toLowerCase();
    if (!email) throw new BadRequestException('请输入邮箱');

    // IP 限流：防止匿名调用无限次强制重置商家密码（DoS + 账户锁定攻击）
    const ip = (req?.headers?.['x-forwarded-for'] || req?.ip || 'unknown').toString().split(',')[0].trim();
    const now = Date.now();
    const entry = forgotPwMap.get(ip);
    if (entry && entry.resetAt > now) {
      if (entry.count >= FORGOT_PW_MAX_PER_HOUR) {
        throw new BadRequestException('操作过于频繁，请 1 小时后再试');
      }
      entry.count++;
    } else {
      forgotPwMap.set(ip, { count: 1, resetAt: now + FORGOT_PW_WINDOW_MS });
    }

    const userRepo = this.dataSource.getRepository(User);
    const shopRepo = this.dataSource.getRepository(Shop);
    const user = await userRepo.findOne({ where: { email } as any });
    // 统一响应：不区分邮箱存在/不存在，避免用户枚举
    if (!user) {
      return { success: true, message: '如邮箱已注册，新密码邮件已发送' };
    }

    // 生成临时密码（12位，含字母+数字，使用密码学安全随机数）
    const lowerChars = 'abcdefghjkmnpqrstuvwxyz';
    const upperChars = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    const digitChars = '23456789';
    const allChars = lowerChars + upperChars + digitChars;
    const randByte = () => crypto.randomBytes(1)[0];
    const pick = (s: string) => s[randByte() % s.length];
    // 保证至少含1个大写、1个小写、2个数字，满足前端注册策略
    let newPassword = pick(upperChars) + pick(lowerChars) + pick(digitChars) + pick(digitChars);
    for (let i = 0; i < 8; i++) newPassword += pick(allChars);
    // Fisher-Yates 洗牌
    const arr = newPassword.split('');
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randByte() % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    newPassword = arr.join('');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    (user as any).password_hash = passwordHash;
    await userRepo.save(user);

    const shop = await shopRepo.findOne({ where: { owner_id: user.user_id } });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Lotería Sistema" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Tu nueva contraseña - Sistema de Lotería',
      text: `Tu nueva contraseña temporal es: ${newPassword}\n\nCuenta: ${user.account_number}\nTienda: ${shop?.shop_number || '-'}\n\nCambia tu contraseña después de iniciar sesión.`,
      html: `<p>Tu nueva contraseña temporal es: <strong>${newPassword}</strong></p><p>Cuenta: ${user.account_number}<br>Tienda: ${shop?.shop_number || '-'}</p><p style="color:#888;font-size:12px">Cambia tu contraseña después de iniciar sesión.</p>`,
    });

    this.logger.log(`找回密码: 账号=${user.account_number}, 邮箱=${email}`);
    return { success: true, message: '如邮箱已注册，新密码邮件已发送' };
  }

  /**
   * POST /merchant/login - 老板登录
   * 注册一次即有两个登录方式（同一密码）：账号（字母+数字）或 店号（纯数字），任选其一。
   */
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: any) {
    const account = String(dto.account ?? dto.accountNumber ?? '').trim().toLowerCase();
    if (!account) throw new UnauthorizedException('请输入账号或店号');

    // 限流：同一 IP 连续失败超过阈值则锁定
    const ip = (req.headers?.['x-forwarded-for'] || req.ip || 'unknown').toString().split(',')[0].trim();
    const failEntry = loginFailMap.get(ip);
    if (failEntry && failEntry.count >= LOGIN_MAX_FAIL) {
      if (Date.now() < failEntry.until) {
        const remainMin = Math.ceil((failEntry.until - Date.now()) / 60000);
        throw new UnauthorizedException(`登录失败次数过多，请 ${remainMin} 分钟后再试`);
      } else {
        loginFailMap.delete(ip);
      }
    }

    const userRepo = this.dataSource.getRepository(User);
    const shopRepo = this.dataSource.getRepository(Shop);
    let user = await userRepo.createQueryBuilder('u')
      .where('LOWER(u.account_number) = :account', { account })
      .getOne();

    // 输入是 1-9 位数字时：先按店号（含别名）查店铺再对应用户（店号登录）
    if (!user && /^\d{1,9}$/.test(account)) {
      const shop = await findShopByNumber(shopRepo, account);
      if (shop?.owner_id) {
        user = await userRepo.findOne({ where: { user_id: shop.owner_id } });
      }
    }

    if (!user) {
      throw new UnauthorizedException('账号不存在');
    }

    const stored = user.password_hash || '';
    const isBcrypt = /^\$2[aby]\$/.test(stored);
    let passwordOk = false;
    if (isBcrypt) {
      passwordOk = await bcrypt.compare(dto.password, stored);
    } else {
      const sha = crypto.createHash('sha256').update(dto.password).digest('hex');
      passwordOk = stored === sha || stored === dto.password;
    }
    if (!passwordOk) {
      // 累加失败计数
      const cur = loginFailMap.get(ip) ?? { count: 0, until: 0 };
      cur.count++;
      cur.until = Date.now() + LOGIN_LOCKOUT_MS;
      loginFailMap.set(ip, cur);
      throw new UnauthorizedException('密码错误');
    }

    // 登录成功：清除限流记录
    loginFailMap.delete(ip);

    // 多设备会话管理（最多3台，不分类型）
    const sessionRepo = this.dataSource.getRepository(Session);
    const ua = (req.headers?.['user-agent'] || '').slice(0, 200) || null;
    const deviceType = (dto.device_type || 'web').toLowerCase() === 'app' ? 'app' : 'web';
    const deviceName = dto.device_name || ua || deviceType;

    const existingSessions = await sessionRepo.find({
      where: { user_id: user.user_id },
      order: { created_at: 'ASC' },
    });

    // 超限则踢掉最早的
    if (existingSessions.length >= MAX_SESSIONS) {
      const toRemove = existingSessions.slice(0, existingSessions.length - MAX_SESSIONS + 1);
      await sessionRepo.remove(toRemove);
    }

    // 创建新会话
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const newSession = sessionRepo.create({
      user_id: user.user_id,
      token: sessionToken,
      device_type: deviceType,
      device_name: deviceName,
      last_active: new Date(),
    });
    await sessionRepo.save(newSession);

    // 同时更新 User 表（保持向后兼容）
    user.session_token = sessionToken;
    user.last_login_at = new Date();
    user.last_login_ua = ua;
    await userRepo.save(user);

    const token = createSignedToken(user.user_id, user.account_number);
    this.logger.log(`老板登录: ${user.account_number}, 设备: ${deviceType}, 角色: ${user.role}`);

    return {
      token,
      session_token: sessionToken,
      userId: user.user_id,
      accountNumber: user.account_number,
      role: user.role,
      last_login_at: user.last_login_at,
      last_login_ua: user.last_login_ua,
    };
  }

  /**
   * POST /merchant/logout - 登出（清除 session token）
   */
  @Post('logout')
  async logout(@Req() req: any) {
    try {
      const { userId } = this.parseTokenFull(req);
      const sessionToken = (req.headers?.['x-session-token'] || '').trim();
      const sessionRepo = this.dataSource.getRepository(Session);
      if (sessionToken) {
        await sessionRepo.delete({ user_id: userId, token: sessionToken });
      }
      // 同时清掉 User 表的 session_token（历史字段），避免旧 session 还能被 fallback 路径识别为有效
      try {
        await this.dataSource.getRepository(User).update(userId, { session_token: null, updated_at: new Date() } as any);
      } catch {}
    } catch {}
    return { success: true };
  }

  /**
   * GET /merchant/sessions - 获取当前用户所有在线设备
   */
  @Get('sessions')
  async getSessions(@Req() req: any) {
    const { userId } = this.parseTokenFull(req);
    const sessionRepo = this.dataSource.getRepository(Session);
    const sessions = await sessionRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
    const currentToken = (req.headers?.['x-session-token'] || '').trim();
    return sessions.map(s => ({
      session_id: s.session_id,
      device_type: s.device_type,
      device_name: s.device_name,
      created_at: s.created_at,
      is_current: s.token === currentToken,
    }));
  }

  /**
   * DELETE /merchant/sessions/:sessionId - 断开指定设备
   */
  @Delete('sessions/:sessionId')
  async deleteSession(@Param('sessionId') sessionId: string, @Req() req: any) {
    const { userId } = this.parseTokenFull(req);
    const sessionRepo = this.dataSource.getRepository(Session);
    const session = await sessionRepo.findOne({
      where: { session_id: Number(sessionId), user_id: userId },
    });
    if (!session) throw new NotFoundException('会话不存在');
    await sessionRepo.remove(session);
    return { success: true };
  }

  /**
   * GET /merchant/shops?userId=1 - 获取当前老板的店铺列表
   * 支持两种方式：
   * 1. query参数: /api/merchant/shops?userId=1
   * 2. Authorization header: Bearer token (token是 base64(userId:account))
   */
  @Get('shops')
  async getShops(
    @Query('userId') userId: string,
    @Req() req: any
  ) {
    let userIdNum: number;
    let accountNumber: string | null = null;

    // 优先从 query 获取 userId；否则从 Authorization Bearer 解析签名 token
    if (userId) {
      userIdNum = parseInt(userId, 10);
    } else {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
        throw new UnauthorizedException('请先登录');
      }
      const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
      if (!raw) throw new UnauthorizedException('无效的token');
      const parsed = parseSignedToken(raw);
      if (!parsed) throw new UnauthorizedException('无效或已过期的token，请重新登录');
      userIdNum = parsed.userId;
      accountNumber = parsed.accountNumber || null;
    }

    if (!userIdNum || isNaN(userIdNum)) {
      throw new UnauthorizedException('无效的用户ID');
    }

    // 验证 session token（如果客户端携带了）
    await this.verifySession(req, userIdNum);

    const shopRepo = this.dataSource.getRepository(Shop);
    const userRepo = this.dataSource.getRepository(User);
    let currentUser: User | null = null;
    if (!accountNumber) {
      currentUser = await userRepo.findOne({ where: { user_id: userIdNum } });
      if (currentUser?.account_number) accountNumber = currentUser.account_number.trim();
    } else {
      currentUser = await userRepo.findOne({ where: { user_id: userIdNum } });
    }

    // 登录用的是店号时：优先按店号查店铺（仅当该店铺已属于本用户时才走此快捷路径，禁止自动改写 owner_id）
    if (accountNumber && /^\d{1,9}$/.test(accountNumber)) {
      const shopByNumber = await shopRepo.findOne({
        where: { shop_number: accountNumber },
      });
      if (shopByNumber && shopByNumber.owner_id === userIdNum) {
        return {
          shops: [{
            shop_id: shopByNumber.shop_id,
            shop_number: shopByNumber.shop_number,
            shop_name: shopByNumber.shop_name,
            status: shopByNumber.status,
            commission_rate: shopByNumber.commission_rate,
            subscription_expires_at: shopByNumber.subscription_expires_at ?? null,
            limit_chance: (shopByNumber as any).limit_chance ?? null,
            limit_billete: (shopByNumber as any).limit_billete ?? null,
            tica_limit_chance: (shopByNumber as any).tica_limit_chance ?? null,
            tica_limit_palet: (shopByNumber as any).tica_limit_palet ?? null,
            nica_limit_chance: (shopByNumber as any).nica_limit_chance ?? null,
            nica_limit_palet: (shopByNumber as any).nica_limit_palet ?? null,
            tica_custom_period: (shopByNumber as any).tica_custom_period ?? null,
            nica_custom_period: (shopByNumber as any).nica_custom_period ?? null,
            rate_billete_1: (shopByNumber as any).rate_billete_1 ?? null,
            rate_billete_2: (shopByNumber as any).rate_billete_2 ?? null,
            rate_billete_3: (shopByNumber as any).rate_billete_3 ?? null,
            rate_chance_1: (shopByNumber as any).rate_chance_1 ?? null,
            rate_chance_2: (shopByNumber as any).rate_chance_2 ?? null,
            rate_chance_3: (shopByNumber as any).rate_chance_3 ?? null,
            tica_chance_1: (shopByNumber as any).tica_chance_1 ?? null,
            tica_chance_2: (shopByNumber as any).tica_chance_2 ?? null,
            tica_chance_3: (shopByNumber as any).tica_chance_3 ?? null,
            loteria_enabled: (shopByNumber as any).loteria_enabled !== false,
            tica_enabled: !!(shopByNumber as any).tica_enabled,
            nica_enabled: !!(shopByNumber as any).nica_enabled,
            accepting_tica_orders: (shopByNumber as any).accepting_tica_orders !== false,
            accepting_nica_orders: (shopByNumber as any).accepting_nica_orders !== false,
          }],
          last_login_at: currentUser?.last_login_at ?? null,
          last_login_ua: currentUser?.last_login_ua ?? null,
        };
      }
    }

    let shops = await shopRepo.find({
      where: { owner_id: userIdNum },
      order: { shop_id: 'DESC' },
    });

    return {
      shops: shops.map(shop => ({
        shop_id: shop.shop_id,
        shop_number: shop.shop_number,
        shop_name: shop.shop_name,
        status: shop.status,
        commission_rate: shop.commission_rate,
        limit_chance: (shop as any).limit_chance ?? null,
        limit_billete: (shop as any).limit_billete ?? null,
        tica_limit_chance: (shop as any).tica_limit_chance ?? null,
        tica_limit_palet: (shop as any).tica_limit_palet ?? null,
        nica_limit_chance: (shop as any).nica_limit_chance ?? null,
        nica_limit_palet: (shop as any).nica_limit_palet ?? null,
        tica_custom_period: (shop as any).tica_custom_period ?? null,
        nica_custom_period: (shop as any).nica_custom_period ?? null,
        rate_billete_1: (shop as any).rate_billete_1 ?? null,
        rate_billete_2: (shop as any).rate_billete_2 ?? null,
        rate_billete_3: (shop as any).rate_billete_3 ?? null,
        rate_chance_1: (shop as any).rate_chance_1 ?? null,
        rate_chance_2: (shop as any).rate_chance_2 ?? null,
        rate_chance_3: (shop as any).rate_chance_3 ?? null,
        tica_chance_1: (shop as any).tica_chance_1 ?? null,
        tica_chance_2: (shop as any).tica_chance_2 ?? null,
        tica_chance_3: (shop as any).tica_chance_3 ?? null,
        chain_1_2: (shop as any).chain_1_2 ?? 1000,
        chain_1_3: (shop as any).chain_1_3 ?? 1000,
        chain_2_1: (shop as any).chain_2_1 ?? 0,
        chain_2_3: (shop as any).chain_2_3 ?? 200,
        chain_3_1: (shop as any).chain_3_1 ?? 0,
        chain_3_2: (shop as any).chain_3_2 ?? 0,
        subscription_expires_at: shop.subscription_expires_at ?? null,
        loteria_enabled: (shop as any).loteria_enabled !== false,
        tica_enabled: !!(shop as any).tica_enabled,
        nica_enabled: !!(shop as any).nica_enabled,
        accepting_tica_orders: (shop as any).accepting_tica_orders !== false,
        accepting_nica_orders: (shop as any).accepting_nica_orders !== false,
      })),
      last_login_at: currentUser?.last_login_at ?? null,
      last_login_ua: currentUser?.last_login_ua ?? null,
    };
  }

  /**
   * GET /merchant/shops/:shopId - 获取单个店铺信息
   */
  @Get('shops/:shopId')
  async getShop(@Param('shopId') shopId: string) {
    const shop = await this.dataSource.getRepository(Shop).findOne({
      where: { shop_id: parseInt(shopId) },
    });

    if (!shop) {
      throw new NotFoundException('店铺不存在');
    }

    return {
      shop_id: shop.shop_id,
      shop_number: shop.shop_number,
      shop_name: shop.shop_name,
      status: shop.status,
      commission_rate: shop.commission_rate,
      single_bet_limit: shop.single_bet_limit,
      daily_bet_limit: shop.daily_bet_limit,
    };
  }

  // ─────────────────────────────────────────────
  //  分店铺绑定相关 API
  // ─────────────────────────────────────────────

  /**
   * POST /merchant/binding/request
   * 大庄主动邀请小庄绑定
   * body: { mainShopId, subShopNumber, commissionRate? }
   */
  @Post('binding/request')
  async bindingRequest(@Body() body: { mainShopId: number; subShopNumber: string; commissionRate?: number }, @Req() req: any) {
    const { mainShopId, subShopNumber } = body;
    if (!mainShopId || !subShopNumber) {
      throw new BadRequestException('缺少参数');
    }

    const shopRepo = this.dataSource.getRepository(Shop);
    const bindingRepo = this.dataSource.getRepository(ShopBinding);

    const mainShop = await shopRepo.findOne({ where: { shop_id: Number(mainShopId) } });
    if (!mainShop) throw new NotFoundException('大庄店铺不存在');

    // 验证请求者是否为大庄所有者，防止冒充他人发送绑定邀请
    const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
    if (!tokenInfo) throw new UnauthorizedException('请先登录');
    if (mainShop.owner_id !== tokenInfo.userId) {
      throw new UnauthorizedException('无权操作该店铺');
    }

    const subShop = await shopRepo.findOne({ where: { shop_number: String(subShopNumber) } });
    if (!subShop) throw new NotFoundException('小庄不存在，请确认店号正确');

    if (mainShop.shop_id === subShop.shop_id) {
      throw new BadRequestException('不能绑定自己');
    }

    // 检查小庄是否已有绑定（unique 约束在 sub_shop_id）
    const existing = await bindingRepo.findOne({ where: { sub_shop_id: subShop.shop_id } });
    if (existing) {
      const newRate = (body.commissionRate !== undefined && body.commissionRate >= 0 && body.commissionRate <= 100)
        ? body.commissionRate / 100
        : existing.commission_rate ?? 0.20;
      if (existing.status === 'active') throw new BadRequestException('此店号已被绑定');
      if (existing.status === 'pending') throw new BadRequestException('该小庄已有待确认的绑定邀请');
      // rejected 状态允许重新邀请
      existing.main_shop_id = mainShop.shop_id;
      existing.status = 'pending';
      existing.commission_rate = newRate;
      await bindingRepo.save(existing);
      return { success: true, message: '绑定邀请已重新发送，等待小庄确认' };
    }

    const rate = (body.commissionRate !== undefined && body.commissionRate >= 0 && body.commissionRate <= 100)
      ? body.commissionRate / 100
      : 0.20;
    const binding = bindingRepo.create({
      main_shop_id: mainShop.shop_id,
      sub_shop_id: subShop.shop_id,
      commission_rate: rate,
      status: 'pending',
    });
    await bindingRepo.save(binding);

    this.logger.log(`大庄邀请绑定: 大庄=${mainShop.shop_number} → 小庄=${subShop.shop_number}`);
    return { success: true, message: '绑定邀请已发送，等待小庄确认' };
  }

  /**
   * GET /merchant/binding/pending?shopId=
   * 小庄获取收到的待确认绑定邀请（大庄发来的）
   */
  @Get('binding/pending')
  async bindingPending(@Query('shopId') shopId: string, @Req() req: any) {
    if (!shopId) throw new BadRequestException('缺少 shopId');
    const bindingRepo = this.dataSource.getRepository(ShopBinding);
    const shopRepo = this.dataSource.getRepository(Shop);

    // 权限：tokenUserId 必须是 shopId 的 owner（子店老板查自己收到的邀请）
    const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
    if (!tokenInfo) throw new UnauthorizedException('请先登录');
    const subShop = await shopRepo.findOne({ where: { shop_id: Number(shopId) } });
    if (!subShop || subShop.owner_id !== tokenInfo.userId) {
      throw new UnauthorizedException('无权查看该店铺数据');
    }

    // 小庄查自己收到的邀请
    const pending = await bindingRepo.find({
      where: { sub_shop_id: Number(shopId), status: 'pending' },
      order: { created_at: 'ASC' },
    });

    const result = await Promise.all(pending.map(async (b) => {
      const main = await shopRepo.findOne({ where: { shop_id: b.main_shop_id } });
      return {
        binding_id: b.binding_id,
        main_shop_id: b.main_shop_id,
        main_shop_number: main?.shop_number ?? '',
        main_shop_name: main?.shop_name ?? '',
        commission_rate: Number(b.commission_rate),
        created_at: b.created_at,
      };
    }));

    return { pending: result };
  }

  /**
   * POST /merchant/binding/sub-request
   * 小庄主动申请加入大庄（输入大庄店号）
   * body: { subShopId, mainShopNumber }
   */
  @Post('binding/sub-request')
  async bindingSubRequest(@Body() body: { subShopId: number; mainShopNumber: string }) {
    const { subShopId, mainShopNumber } = body;
    if (!subShopId || !mainShopNumber) throw new BadRequestException('缺少参数');

    const shopRepo = this.dataSource.getRepository(Shop);
    const bindingRepo = this.dataSource.getRepository(ShopBinding);

    const subShop = await shopRepo.findOne({ where: { shop_id: Number(subShopId) } });
    if (!subShop) throw new NotFoundException('小庄不存在');

    const mainShop = await findShopByNumber(shopRepo, String(mainShopNumber));
    if (!mainShop) throw new NotFoundException(`找不到店号 ${mainShopNumber}`);

    if (mainShop.shop_id === subShop.shop_id) throw new BadRequestException('不能绑定自己');

    const existing = await bindingRepo.findOne({ where: { sub_shop_id: subShop.shop_id } });
    if (existing) {
      if (existing.status === 'active') throw new BadRequestException('您已绑定大庄，请先解绑');
      if (existing.status === 'pending') throw new BadRequestException('已有待确认的申请，请等待大庄审批');
      existing.main_shop_id = mainShop.shop_id;
      existing.status = 'pending';
      existing.commission_rate = 0.20;
      await bindingRepo.save(existing);
      return { success: true, message: `申请已发送，等待大庄 ${mainShop.shop_number} 确认` };
    }

    const binding = bindingRepo.create({
      main_shop_id: mainShop.shop_id,
      sub_shop_id: subShop.shop_id,
      commission_rate: 0.20,
      status: 'pending',
    });
    await bindingRepo.save(binding);
    this.logger.log(`小庄申请绑定: 小庄=${subShop.shop_number} → 大庄=${mainShop.shop_number}`);
    return { success: true, message: `申请已发送，等待大庄 ${mainShop.shop_number} 确认` };
  }

  /**
   * GET /merchant/binding/incoming?mainShopId=
   * 大庄查看收到的待审绑定申请（小庄发来的）
   */
  @Get('binding/incoming')
  async bindingIncoming(@Query('mainShopId') mainShopId: string, @Req() req: any) {
    if (!mainShopId) throw new BadRequestException('缺少 mainShopId');
    const bindingRepo = this.dataSource.getRepository(ShopBinding);
    const shopRepo = this.dataSource.getRepository(Shop);

    // 权限：tokenUserId 必须是 mainShopId 的 owner
    const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
    if (!tokenInfo) throw new UnauthorizedException('请先登录');
    const mainShop = await shopRepo.findOne({ where: { shop_id: Number(mainShopId) } });
    if (!mainShop || mainShop.owner_id !== tokenInfo.userId) {
      throw new UnauthorizedException('无权查看该店铺数据');
    }

    const incoming = await bindingRepo.find({
      where: { main_shop_id: Number(mainShopId), status: 'pending' },
      order: { created_at: 'ASC' },
    });

    const result = await Promise.all(incoming.map(async (b) => {
      const sub = await shopRepo.findOne({ where: { shop_id: b.sub_shop_id } });
      return {
        binding_id: b.binding_id,
        sub_shop_id: b.sub_shop_id,
        sub_shop_number: sub?.shop_number ?? '',
        sub_shop_name: sub?.shop_name ?? '',
        commission_rate: Number(b.commission_rate),
        created_at: b.created_at,
      };
    }));

    return { incoming: result };
  }

  /**
   * POST /merchant/binding/:id/approve
   * 主店铺审批通过绑定申请（可同时设置佣金率）
   */
  @Post('binding/:id/approve')
  async bindingApprove(
    @Param('id') id: string,
    @Body() body: { commission_rate?: number },
    @Req() req: any,
  ) {
    const bindingRepo = this.dataSource.getRepository(ShopBinding);
    const shopRepo = this.dataSource.getRepository(Shop);
    const binding = await bindingRepo.findOne({ where: { binding_id: Number(id) } });
    if (!binding) throw new NotFoundException('绑定申请不存在');
    if (binding.status !== 'pending') throw new BadRequestException('该申请不是待审批状态');

    // 验证操作者是否为大庄或小庄所有者之一
    const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
    if (!tokenInfo) throw new UnauthorizedException('请先登录');
    const mainShop = await shopRepo.findOne({ where: { shop_id: binding.main_shop_id } });
    const subShop = await shopRepo.findOne({ where: { shop_id: binding.sub_shop_id } });
    const isMain = mainShop?.owner_id === tokenInfo.userId;
    const isSub = subShop?.owner_id === tokenInfo.userId;
    if (!isMain && !isSub) throw new UnauthorizedException('无权操作该绑定');

    binding.status = 'active';
    // 仅允许大庄修改佣金率；被邀请方只能接受现有佣金
    if (body.commission_rate !== undefined) {
      if (!isMain) throw new UnauthorizedException('仅大庄可修改佣金率');
      const rate = Number(body.commission_rate);
      if (rate < 0 || rate > 1) throw new BadRequestException('佣金率需在 0~1 之间');
      binding.commission_rate = rate;
    }
    await bindingRepo.save(binding);

    this.logger.log(`绑定审批通过: bindingId=${id}`);
    return { success: true, message: '已批准绑定申请' };
  }

  /**
   * POST /merchant/binding/:id/reject
   * 主店铺拒绝绑定申请
   */
  @Post('binding/:id/reject')
  async bindingReject(@Param('id') id: string, @Req() req: any) {
    const bindingRepo = this.dataSource.getRepository(ShopBinding);
    const shopRepo = this.dataSource.getRepository(Shop);
    const binding = await bindingRepo.findOne({ where: { binding_id: Number(id) } });
    if (!binding) throw new NotFoundException('绑定申请不存在');
    if (binding.status !== 'pending') throw new BadRequestException('该申请不是待审批状态');

    // 验证操作者是否为大庄或小庄所有者之一
    const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
    if (!tokenInfo) throw new UnauthorizedException('请先登录');
    const mainShop = await shopRepo.findOne({ where: { shop_id: binding.main_shop_id } });
    const subShop = await shopRepo.findOne({ where: { shop_id: binding.sub_shop_id } });
    const isMain = mainShop?.owner_id === tokenInfo.userId;
    const isSub = subShop?.owner_id === tokenInfo.userId;
    if (!isMain && !isSub) throw new UnauthorizedException('无权操作该绑定');

    binding.status = 'rejected';
    await bindingRepo.save(binding);

    this.logger.log(`绑定拒绝: bindingId=${id}`);
    return { success: true, message: '已拒绝绑定申请' };
  }

  /**
   * DELETE /merchant/binding/:id
   * 解绑（主店铺或分店铺均可操作，但必须是关联方之一）
   */
  @Delete('binding/:id')
  async bindingDelete(@Param('id') id: string, @Req() req: any) {
    const bindingRepo = this.dataSource.getRepository(ShopBinding);
    const shopRepo = this.dataSource.getRepository(Shop);
    const binding = await bindingRepo.findOne({ where: { binding_id: Number(id) } });
    if (!binding) throw new NotFoundException('绑定关系不存在');

    // 验证操作者是大庄或小庄的所有者之一
    const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
    if (!tokenInfo) throw new UnauthorizedException('请先登录');
    const mainShop = await shopRepo.findOne({ where: { shop_id: binding.main_shop_id } });
    const subShop = await shopRepo.findOne({ where: { shop_id: binding.sub_shop_id } });
    const isMain = mainShop?.owner_id === tokenInfo.userId;
    const isSub = subShop?.owner_id === tokenInfo.userId;
    if (!isMain && !isSub) throw new UnauthorizedException('无权解除该绑定');

    await bindingRepo.remove(binding);
    this.logger.log(`解绑: bindingId=${id}`);
    return { success: true, message: '已解绑' };
  }

  /**
   * PATCH /merchant/binding/:id/commission
   * 主店铺修改分店铺佣金率
   * body: { commission_rate: 0.20 }
   */
  @Patch('binding/:id/commission')
  async bindingSetCommission(
    @Param('id') id: string,
    @Body() body: { commission_rate: number },
    @Req() req: any,
  ) {
    const bindingRepo = this.dataSource.getRepository(ShopBinding);
    const shopRepo = this.dataSource.getRepository(Shop);
    const binding = await bindingRepo.findOne({ where: { binding_id: Number(id) } });
    if (!binding) throw new NotFoundException('绑定关系不存在');
    if (binding.status !== 'active') throw new BadRequestException('绑定关系未激活');

    // 只有大庄所有者才能修改佣金率
    const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
    if (!tokenInfo) throw new UnauthorizedException('请先登录');
    const mainShop = await shopRepo.findOne({ where: { shop_id: binding.main_shop_id } });
    if (!mainShop || mainShop.owner_id !== tokenInfo.userId) throw new UnauthorizedException('无权修改该绑定佣金率');

    const rate = Number(body.commission_rate);
    if (isNaN(rate) || rate < 0 || rate > 1) throw new BadRequestException('佣金率需在 0~1 之间');
    binding.commission_rate = rate;
    await bindingRepo.save(binding);

    return { success: true, commission_rate: rate };
  }

  /**
   * GET /merchant/binding/my-binding?shopId=
   * 分店铺查自己的绑定状态
   */
  @Get('binding/my-binding')
  async myBinding(@Query('shopId') shopId: string, @Req() req: any) {
    if (!shopId) throw new BadRequestException('缺少 shopId');
    const bindingRepo = this.dataSource.getRepository(ShopBinding);
    const shopRepo = this.dataSource.getRepository(Shop);

    // 权限：tokenUserId 必须是 shopId 的 owner
    const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
    if (!tokenInfo) throw new UnauthorizedException('请先登录');
    const subShop = await shopRepo.findOne({ where: { shop_id: Number(shopId) } });
    if (!subShop || subShop.owner_id !== tokenInfo.userId) {
      throw new UnauthorizedException('无权查看该店铺数据');
    }

    const binding = await bindingRepo.findOne({ where: { sub_shop_id: Number(shopId) } });
    if (!binding) return { binding: null };

    const mainShop = await shopRepo.findOne({ where: { shop_id: binding.main_shop_id } });
    return {
      binding: {
        binding_id: binding.binding_id,
        status: binding.status,
        commission_rate: Number(binding.commission_rate),
        main_shop_id: binding.main_shop_id,
        main_shop_number: mainShop?.shop_number ?? '',
        main_shop_name: mainShop?.shop_name ?? '',
      },
    };
  }

  /**
   * POST /merchant/binding/batch-create-subs
   * 大庄批量创建小庄账号并直接绑定（自动激活，跳过邀请确认）
   * Body: { mainShopId, count, password? }
   * - 店号从10000起，自动找到下一个可用的5位数号
   * - 账号 = 店号字符串
   * - 密码未传则使用店号本身（店主拿到账号后应自行修改）
   */
  @Post('binding/batch-create-subs')
  async batchCreateSubs(
    @Body() body: { mainShopId: number; count: number; password?: string; adminOverride?: boolean },
    @Req() req: any,
  ) {
    const { mainShopId, count, password, adminOverride } = body;
    if (!mainShopId) throw new BadRequestException('缺少 mainShopId');

    // 管理员带 X-Admin-Token 且传 adminOverride=true 时不限数量
    const isAdmin = adminOverride && !!req.headers?.['x-admin-token'];
    const n = isAdmin
      ? Math.max(parseInt(String(count)) || 1, 1)
      : Math.min(Math.max(parseInt(String(count)) || 1, 1), 10);

    const shopRepo = this.dataSource.getRepository(Shop);
    const userRepo = this.dataSource.getRepository(User);
    const bindingRepo = this.dataSource.getRepository(ShopBinding);

    const mainShop = await shopRepo.findOne({ where: { shop_id: Number(mainShopId) } });
    if (!mainShop) throw new NotFoundException('大庄店铺不存在');

    // 管理员 adminOverride 跳过大庄所有权验证；普通大庄必须验证 token
    if (!isAdmin) {
      const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
      if (!tokenInfo) throw new UnauthorizedException('请先登录');
      if (mainShop.owner_id !== tokenInfo.userId) throw new UnauthorizedException('无权操作该店铺');
    }

    // 密码强度校验（调用方传的自定义密码必须 6+ 位且含字母+数字）
    if (password != null && String(password).trim() !== '') {
      const trimmed = String(password).trim();
      if (trimmed.length < 6 || !/[A-Za-z]/.test(trimmed) || !/\d/.test(trimmed)) {
        throw new BadRequestException('密码需 6+ 位，且同时包含字母和数字');
      }
    }

    // 找最大的5位数店号（≥10000），从它+1开始分配
    const allShops = await shopRepo.find({ select: ['shop_number'] });
    const usedShopNumbers = new Set(allShops.map(s => s.shop_number));
    // 同时检查 account_number（两者值相同，避免历史遗留账号冲突）
    const allUsers = await userRepo.find({ select: ['account_number'] });
    const usedAccounts = new Set(allUsers.map(u => u.account_number));
    // 从10000起找最大已用号，下一个从它+1开始（不限制位数，5位满了自动升6位、7位）
    const allExistingNums = allShops
      .map(s => parseInt(s.shop_number, 10))
      .filter(n => n >= 10000 && !isNaN(n));
    let next = allExistingNums.length > 0 ? Math.max(...allExistingNums) + 1 : 10000;

    const created: { shopNumber: string; account: string; password: string }[] = [];

    for (let i = 0; i < n; i++) {
      // 跳过店号或账号已被占用的号
      while (usedShopNumbers.has(String(next)) || usedAccounts.has(String(next))) next++;
      if (next > 9999999999) throw new BadRequestException('店号已用尽'); // 几乎不可能

      const shopNumber = String(next);
      const accountNumber = shopNumber;
      // 密码：用统一密码 or 每个随机生成（8 位：字母+数字混合，去掉易混淆字符 O/0/I/l/1）
      const customPwd = (password || '').trim();
      const pwd = customPwd || (() => {
        const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let s = '';
        for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
        return s;
      })();
      const passwordHash = await bcrypt.hash(pwd, 10);

      // 创建用户
      const user = userRepo.create({ account_number: accountNumber, password_hash: passwordHash });
      await userRepo.save(user);

      // 创建店铺
      const shop = shopRepo.create({
        shop_number: shopNumber,
        owner_id: user.user_id,
        shop_name: `小庄${shopNumber}`,
        status: 'active',
        commission_rate: 0.1,
      });
      await shopRepo.save(shop);

      // 直接创建已激活绑定（status=active，跳过邀请）
      const binding = bindingRepo.create({
        main_shop_id: mainShop.shop_id,
        sub_shop_id: shop.shop_id,
        commission_rate: 0.20,
        status: 'active',
      });
      await bindingRepo.save(binding);

      usedShopNumbers.add(shopNumber);
      usedAccounts.add(accountNumber);
      created.push({ shopNumber, account: accountNumber, password: pwd });
      next++;
    }

    this.logger.log(`大庄批量注册小庄: 大庄=${mainShop.shop_number} 创建${n}个 [${created.map(c=>c.shopNumber).join(',')}]`);
    return { success: true, created, count: created.length };
  }

  /**
   * GET /merchant/binding/sub-shops?mainShopId=
   * 主店铺获取所有已绑定分店铺列表（含基本信息）
   */
  @Get('binding/sub-shops')
  async subShops(@Query('mainShopId') mainShopId: string, @Req() req: any) {
    if (!mainShopId) throw new BadRequestException('缺少 mainShopId');
    const bindingRepo = this.dataSource.getRepository(ShopBinding);
    const shopRepo = this.dataSource.getRepository(Shop);

    // 权限：tokenUserId 必须是 mainShopId 的 owner
    const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
    if (!tokenInfo) throw new UnauthorizedException('请先登录');
    const mainShop = await shopRepo.findOne({ where: { shop_id: Number(mainShopId) } });
    if (!mainShop || mainShop.owner_id !== tokenInfo.userId) {
      throw new UnauthorizedException('无权查看该店铺数据');
    }

    const bindings = await bindingRepo.find({
      where: { main_shop_id: Number(mainShopId), status: 'active' },
      order: { created_at: 'ASC' },
    });

    const result = await Promise.all(bindings.map(async (b) => {
      const sub = await shopRepo.findOne({ where: { shop_id: b.sub_shop_id } });
      return {
        binding_id: b.binding_id,
        sub_shop_id: b.sub_shop_id,
        sub_shop_number: sub?.shop_number ?? '',
        sub_shop_name: sub?.shop_name ?? '',
        commission_rate: Number(b.commission_rate),
      };
    }));

    return { sub_shops: result };
  }

  /**
   * GET /merchant/binding/sub-shop-data?mainShopId=&drawId=&lotteryKind=
   * 主店铺获取指定期次各分店铺的销售/利润/佣金数据
   * drawId 为 0 或不传 = 当前期次（仅全国 Lotería）
   * lotteryKind=NACIONAL|TICA|NICA，默认 NACIONAL；TICA/NICA 与结算页一致按各店当期店内彩期统计
   */
  @Get('binding/sub-shop-data')
  async subShopData(
    @Query('mainShopId') mainShopId: string,
    @Query('drawId') drawId: string,
    @Query('lotteryKind') lotteryKind: string | undefined,
    @Req() req: any,
  ) {
    if (!mainShopId) throw new BadRequestException('缺少 mainShopId');

    const kind = (lotteryKind || 'NACIONAL').toString().toUpperCase();
    if (kind !== 'NACIONAL' && kind !== 'TICA' && kind !== 'NICA') {
      throw new BadRequestException('无效的 lotteryKind');
    }

    const bindingRepo = this.dataSource.getRepository(ShopBinding);
    const shopRepo = this.dataSource.getRepository(Shop);
    const orderRepo = this.dataSource.getRepository(Order);
    const drawRepo = this.dataSource.getRepository(Draw);

    // 权限：tokenUserId 必须是 mainShopId 的 owner
    const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
    if (!tokenInfo) throw new UnauthorizedException('请先登录');
    const mainShopAuth = await shopRepo.findOne({ where: { shop_id: Number(mainShopId) } });
    if (!mainShopAuth || mainShopAuth.owner_id !== tokenInfo.userId) {
      throw new UnauthorizedException('无权查看该店铺数据');
    }

    const bindings = await bindingRepo.find({
      where: { main_shop_id: Number(mainShopId), status: 'active' },
    });

    const emptyPayload = (drawIdVal: number | null, st: string, dt: Date | null) => ({
      draw_id: drawIdVal,
      draw_status: st,
      draw_date: dt,
      lottery_kind: kind,
      sub_shops: [] as any[],
      summary: { total_sales: 0, total_commission_paid: 0, main_total_net: 0 },
    });

    if (bindings.length === 0) return emptyPayload(null, 'pending', null);

    const subShopIds = bindings.map(b => b.sub_shop_id);

    let targetDrawId: number | null = null;
    let drawStatus: string = 'pending';
    let drawDate: Date | null = null;
    let allOrders: Order[] = [];
    /** 各小庄当前店内彩期 draw_id，供大庄页号码汇总请求 */
    const periodDrawBySub = new Map<number, number | null>();

    if (kind === 'NACIONAL') {
      if (drawId && Number(drawId) > 0) {
        targetDrawId = Number(drawId);
        const dr = await drawRepo.findOne({ where: { draw_id: targetDrawId } });
        drawStatus = dr?.status ?? 'pending';
        drawDate = dr?.draw_date ?? null;
      } else {
        const completed = await findNationalLastCompletedDraw(drawRepo);

        if (completed) {
          const base = new Date(
            typeof completed.draw_date === 'string'
              ? completed.draw_date + 'T09:00:00'
              : completed.draw_date,
          );
          const archiveAt = new Date(base);
          archiveAt.setDate(archiveAt.getDate() + 1);
          archiveAt.setHours(9, 0, 0, 0);

          const shouldArchive = (completed as any).main_shop_archived || new Date() >= archiveAt;

          if (!shouldArchive) {
            targetDrawId = completed.draw_id;
            drawStatus = 'completed';
            drawDate = completed.draw_date ?? null;
          } else {
            const pending = await findNationalPendingDraw(drawRepo);
            if (pending) {
              targetDrawId = pending.draw_id;
              drawStatus = 'pending';
              drawDate = pending.draw_date ?? null;
            }
          }
        } else {
          const pending = await findNationalPendingDraw(drawRepo);
          if (pending) {
            targetDrawId = pending.draw_id;
            drawStatus = 'pending';
            drawDate = pending.draw_date ?? null;
          }
        }
      }

      allOrders = await orderRepo.find({
        where: {
          shop_id: In(subShopIds),
          ...(targetDrawId ? { draw_id: targetDrawId } : {}),
          status: In([1, 2, 3]),
        },
        select: ['order_id', 'shop_id', 'draw_id', 'amount', 'win_amount', 'status', 'lottery_type'] as any,
      });
      // 全国期：排除店内彩订单，避免混入 TICA/NICA
      allOrders = allOrders.filter(o => {
        const lt = String((o as any).lottery_type ?? 'NACIONAL').toUpperCase();
        return lt === 'NACIONAL' || lt === '' || lt === 'NULL';
      });
    } else {
      const localKind = kind as 'TICA' | 'NICA';
      let mainPeriod: Draw | null = null;
      try {
        mainPeriod = await this.localLotteryService.ensureShopPendingDraw(Number(mainShopId), localKind, true);
      } catch {
        mainPeriod = null;
      }
      targetDrawId = mainPeriod?.draw_id ?? null;
      drawStatus = (mainPeriod?.status as string) || 'pending';
      drawDate = mainPeriod?.draw_date ?? null;

      await Promise.all(
        bindings.map(async b => {
          try {
            const d = await this.localLotteryService.ensureShopPendingDraw(b.sub_shop_id, localKind, true);
            periodDrawBySub.set(b.sub_shop_id, d.draw_id);
          } catch {
            periodDrawBySub.set(b.sub_shop_id, null);
          }
        }),
      );

      const raw = await orderRepo.find({
        where: {
          shop_id: In(subShopIds),
          lottery_type: localKind,
          status: In([1, 2, 3]),
        },
        select: ['order_id', 'shop_id', 'draw_id', 'amount', 'win_amount', 'status', 'lottery_type'] as any,
      });
      allOrders = raw.filter(o => periodDrawBySub.get(o.shop_id) != null && o.draw_id === periodDrawBySub.get(o.shop_id));
    }

    const [subShops] = await Promise.all([shopRepo.find({ where: { shop_id: In(subShopIds) } })]);

    const subShopMap = new Map(subShops.map(s => [s.shop_id, s]));
    const ordersByShop = new Map<number, typeof allOrders>();
    for (const o of allOrders) {
      if (!ordersByShop.has(o.shop_id)) ordersByShop.set(o.shop_id, []);
      ordersByShop.get(o.shop_id)!.push(o);
    }

    const result = bindings.map(b => {
      const sub = subShopMap.get(b.sub_shop_id);
      const validOrders = ordersByShop.get(b.sub_shop_id) ?? [];

      const totalSales = validOrders.reduce((sum, o) => sum + Number(o.amount), 0);
      const totalPayout = validOrders.reduce((sum, o) => sum + Number(o.win_amount || 0), 0);
      const commissionRate = Number(b.commission_rate);

      const xiaozhuangCommission = totalSales * commissionRate;
      const dazhuangNet = totalSales * (1 - commissionRate) - totalPayout;

      const pd = kind === 'NACIONAL' ? targetDrawId : periodDrawBySub.get(b.sub_shop_id) ?? null;

      return {
        binding_id: b.binding_id,
        sub_shop_id: b.sub_shop_id,
        sub_shop_number: sub?.shop_number ?? '',
        sub_shop_name: sub?.shop_name ?? '',
        commission_rate: commissionRate,
        total_sales: Math.round(totalSales * 100) / 100,
        total_payout: Math.round(totalPayout * 100) / 100,
        sub_commission: Math.round(xiaozhuangCommission * 100) / 100,
        main_net_profit: Math.round(dazhuangNet * 100) / 100,
        order_count: validOrders.length,
        period_draw_id: pd,
      };
    });

    const totalMainNet = result.reduce((s, r) => s + r.main_net_profit, 0);
    const totalSalesAll = result.reduce((s, r) => s + r.total_sales, 0);
    const totalCommission = result.reduce((s, r) => s + r.sub_commission, 0);

    return {
      draw_id: targetDrawId,
      draw_status: drawStatus,
      draw_date: drawDate,
      lottery_kind: kind,
      sub_shops: result,
      summary: {
        total_sales: Math.round(totalSalesAll * 100) / 100,
        total_commission_paid: Math.round(totalCommission * 100) / 100,
        main_total_net: Math.round(totalMainNet * 100) / 100,
      },
    };
  }

  /**
   * GET /merchant/binding/history?mainShopId=&limit=&lotteryKind=
   * 大庄获取历史已完成期次的汇总数据（每期合计，不含小庄明细）
   * lotteryKind 默认 NACIONAL；TICA/NICA 仅店内彩已归档期次
   */
  @Get('binding/history')
  async bindingHistory(
    @Query('mainShopId') mainShopId: string,
    @Query('limit') limit: string,
    @Query('lotteryKind') lotteryKind: string | undefined,
    @Req() req: any,
  ) {
    if (!mainShopId) throw new BadRequestException('缺少 mainShopId');

    const kind = (lotteryKind || 'NACIONAL').toString().toUpperCase();
    if (kind !== 'NACIONAL' && kind !== 'TICA' && kind !== 'NICA') {
      throw new BadRequestException('无效的 lotteryKind');
    }

    const drawRepo = this.dataSource.getRepository(Draw);
    const bindingRepo = this.dataSource.getRepository(ShopBinding);
    const orderRepo = this.dataSource.getRepository(Order);
    const shopRepo = this.dataSource.getRepository(Shop);

    // 权限：tokenUserId 必须是 mainShopId 的 owner
    const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
    if (!tokenInfo) throw new UnauthorizedException('请先登录');
    const mainShopAuth = await shopRepo.findOne({ where: { shop_id: Number(mainShopId) } });
    if (!mainShopAuth || mainShopAuth.owner_id !== tokenInfo.userId) {
      throw new UnauthorizedException('无权查看该店铺数据');
    }

    const bindings = await bindingRepo.find({
      where: { main_shop_id: Number(mainShopId), status: 'active' },
    });

    if (bindings.length === 0) return { history: [], lottery_kind: kind };

    const subShopIds = bindings.map(b => b.sub_shop_id);
    const commissionRateMap = new Map(bindings.map(b => [b.sub_shop_id, Number(b.commission_rate)]));
    const lim = Number(limit) || 20;

    if (kind === 'NACIONAL') {
      const completedDraws = await drawRepo.find({
        where: {
          status: In(['completed', 'COMPLETED']),
          archived_at: Not(IsNull()),
          shop_id: IsNull(),
        } as any,
        order: { draw_id: 'DESC' },
        take: lim,
      });

      if (completedDraws.length === 0) return { history: [], lottery_kind: kind };

      const drawIds = completedDraws.map(d => d.draw_id);
      let allHistoryOrders = await orderRepo.find({
        where: {
          draw_id: In(drawIds),
          shop_id: In(subShopIds),
          status: In([1, 2, 3]),
        },
        select: ['shop_id', 'draw_id', 'amount', 'win_amount', 'status', 'lottery_type'] as any,
      });
      allHistoryOrders = allHistoryOrders.filter(o => {
        const lt = String((o as any).lottery_type ?? 'NACIONAL').toUpperCase();
        return lt === 'NACIONAL' || lt === '' || lt === 'NULL';
      });

      const ordersByDraw = new Map<number, typeof allHistoryOrders>();
      for (const o of allHistoryOrders) {
        if (!ordersByDraw.has(o.draw_id)) ordersByDraw.set(o.draw_id, []);
        ordersByDraw.get(o.draw_id)!.push(o);
      }

      const history = completedDraws.map(draw => {
        const validOrders = ordersByDraw.get(draw.draw_id) ?? [];

        const totalSales = validOrders.reduce((s, o) => s + Number(o.amount), 0);
        const totalPayout = validOrders.reduce((s, o) => s + Number(o.win_amount || 0), 0);

        let totalCommission = 0;
        for (const o of validOrders) {
          const rate = commissionRateMap.get(o.shop_id) ?? 0;
          totalCommission += Number(o.amount) * rate;
        }
        const mainNet = totalSales - totalPayout - totalCommission;

        return {
          draw_id: draw.draw_id,
          draw_date: draw.draw_date,
          total_sales: Math.round(totalSales * 100) / 100,
          total_payout: Math.round(totalPayout * 100) / 100,
          total_commission: Math.round(totalCommission * 100) / 100,
          main_net_profit: Math.round(mainNet * 100) / 100,
          order_count: validOrders.length,
        };
      });

      return { history, lottery_kind: kind };
    }

    const localKind = kind as 'TICA' | 'NICA';
    const localDraws = await drawRepo.find({
      where: {
        shop_id: In(subShopIds),
        lottery_type: localKind,
        status: In(['completed', 'COMPLETED']),
        archived_at: Not(IsNull()),
      } as any,
      order: { draw_id: 'DESC' },
      take: Math.min(Math.max(lim * 8, lim), 300),
    });

    const history: any[] = [];
    for (const draw of localDraws) {
      if (history.length >= lim) break;
      const validOrders = await orderRepo.find({
        where: {
          draw_id: draw.draw_id,
          shop_id: draw.shop_id,
          lottery_type: localKind,
          status: In([1, 2, 3]),
        },
        select: ['shop_id', 'draw_id', 'amount', 'win_amount', 'status'] as any,
      });
      if (!validOrders.length) continue;

      const totalSales = validOrders.reduce((s, o) => s + Number(o.amount), 0);
      const totalPayout = validOrders.reduce((s, o) => s + Number(o.win_amount || 0), 0);
      let totalCommission = 0;
      for (const o of validOrders) {
        const rate = commissionRateMap.get(o.shop_id) ?? 0;
        totalCommission += Number(o.amount) * rate;
      }
      const mainNet = totalSales - totalPayout - totalCommission;

      history.push({
        draw_id: draw.draw_id,
        draw_date: draw.draw_date,
        sub_shop_id: draw.shop_id,
        total_sales: Math.round(totalSales * 100) / 100,
        total_payout: Math.round(totalPayout * 100) / 100,
        total_commission: Math.round(totalCommission * 100) / 100,
        main_net_profit: Math.round(mainNet * 100) / 100,
        order_count: validOrders.length,
      });
    }

    return { history, lottery_kind: kind };
  }

  /**
   * GET /merchant/binding/pending-count?shopId=
   * 小庄获取收到的待确认绑定邀请数量（用于 merchant.html 角标提示）
   */
  @Get('binding/pending-count')
  async bindingPendingCount(@Query('shopId') shopId: string) {
    if (!shopId) return { count: 0 };
    const bindingRepo = this.dataSource.getRepository(ShopBinding);
    const count = await bindingRepo.count({
      where: { sub_shop_id: Number(shopId), status: 'pending' },
    });
    return { count };
  }

  /**
   * POST /api/merchant/activate-card - 激活卡密
   * Body: { shopId, code }
   */
  @Post('activate-card')
  async activateCard(
    @Body('shopId') shopId: number,
    @Body('code') code: string,
    @Req() req: any,
  ) {
    const normalizedCode = (code || '').trim().toUpperCase();
    if (!shopId) throw new BadRequestException('缺少 shopId');
    if (!normalizedCode) throw new BadRequestException('请输入卡密');

    // 卡密激活限流：同一IP失败5次后锁定30分钟
    const ip = (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
    const cardFail = cardFailMap.get(ip);
    if (cardFail && cardFail.count >= CARD_MAX_FAIL && Date.now() < cardFail.until) {
      const mins = Math.ceil((cardFail.until - Date.now()) / 60000);
      throw new BadRequestException(`尝试次数过多，请 ${mins} 分钟后再试`);
    }

    const CARD_DAYS: Record<string, number> = { monthly: 30, half_yearly: 180, yearly: 365 };

    // 预读一次做友好错误提示（store 不存在直接返回，不走事务）
    const shopRepo = this.dataSource.getRepository(Shop);
    const shop = await shopRepo.findOne({ where: { shop_id: Number(shopId) } });
    if (!shop) throw new NotFoundException('店铺不存在');

    let resultBase: Date;
    let cardType: string;
    try {
      // 全流程包在事务里：SQLite 事务序列化写入，避免并发激活两张卡只加一张的天数
      resultBase = await this.dataSource.transaction(async (manager) => {
        // 1) 锁卡：条件 UPDATE，只有 used_at IS NULL 时才成功
        const card = await manager.findOne(CardCode, { where: { code: normalizedCode } });
        if (!card) {
          throw new BadRequestException('__CARD_NOT_FOUND__');
        }
        cardType = card.type;
        const claim = await manager.createQueryBuilder()
          .update(CardCode)
          .set({ used_by_shop_id: shop.shop_id, used_at: new Date() })
          .where('id = :id AND used_at IS NULL', { id: card.id })
          .execute();
        if (!claim.affected) {
          throw new BadRequestException('__CARD_USED__');
        }

        // 2) 在同一事务里读 shop 的最新到期日并累加（避免脏读）
        const freshShop = await manager.findOne(Shop, { where: { shop_id: shop.shop_id } });
        const now = new Date();
        const base = (freshShop as any)?.subscription_expires_at && (freshShop as any).subscription_expires_at > now
          ? new Date((freshShop as any).subscription_expires_at)
          : now;
        base.setDate(base.getDate() + (CARD_DAYS[card.type] || 30));
        await manager.update(Shop, shop.shop_id, { subscription_expires_at: base });
        return base;
      });
    } catch (err: any) {
      // 失败计数 + 友好提示
      const msg = String(err?.message || '');
      if (msg === '__CARD_NOT_FOUND__' || msg === '__CARD_USED__') {
        const entry = cardFailMap.get(ip) || { count: 0, until: 0 };
        entry.count += 1;
        if (entry.count >= CARD_MAX_FAIL) entry.until = Date.now() + CARD_LOCKOUT_MS;
        cardFailMap.set(ip, entry);
        throw new BadRequestException(msg === '__CARD_NOT_FOUND__' ? '卡密不存在' : '该卡密已被使用');
      }
      throw err;
    }

    cardFailMap.delete(ip);
    this.logger.log(`卡密激活成功：code=${normalizedCode} shop=${shop.shop_number} expires=${resultBase.toISOString().slice(0, 10)}`);
    return {
      success: true,
      type: cardType!,
      subscription_expires_at: resultBase,
      message: `激活成功，到期日：${resultBase.toISOString().slice(0, 10)}`,
    };
  }

  /** 从 Authorization Bearer token 解析 userId（验证 HMAC 签名） */
  private parseTokenUserId(req: any): number {
    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('请先登录');
    }
    const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
    if (!raw) throw new UnauthorizedException('无效的token');
    const parsed = parseSignedToken(raw);
    if (!parsed) throw new UnauthorizedException('无效或已过期的token，请重新登录');
    return parsed.userId;
  }

  /** 从 Authorization Bearer token 解析完整信息（含 accountNumber，用于所有权验证） */
  private parseTokenFull(req: any): { userId: number; accountNumber: string } {
    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('请先登录');
    }
    const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
    if (!raw) throw new UnauthorizedException('无效的token');
    const parsed = parseSignedToken(raw);
    if (!parsed) throw new UnauthorizedException('无效或已过期的token，请重新登录');
    return { userId: parsed.userId, accountNumber: parsed.accountNumber };
  }

  /**
   * POST /merchant/change-password - 修改密码（需登录）
   * body: { currentPassword, newPassword }
   */
  @Post('change-password')
  async changePassword(@Body() body: { currentPassword: string; newPassword: string }, @Req() req: any) {
    const { userId, accountNumber } = this.parseTokenFull(req);
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword) throw new BadRequestException('请填写当前密码和新密码');
    if (newPassword.length < 6) throw new BadRequestException('新密码不能少于6位');
    if (!/^[A-Za-z0-9]+$/.test(newPassword) || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      throw new BadRequestException('新密码只能包含字母和数字，且必须同时包含字母和数字');
    }
    const userRepo = this.dataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { user_id: userId } });
    if (!user) throw new UnauthorizedException('用户不存在');
    // 验证 token 中的 accountNumber 与 DB 一致，防止 userId 枚举攻击
    if (accountNumber && user.account_number.toLowerCase() !== accountNumber.toLowerCase()) {
      throw new UnauthorizedException('无效的token，请重新登录');
    }
    const ok = await bcrypt.compare(currentPassword, (user as any).password_hash);
    if (!ok) throw new BadRequestException('当前密码不正确');
    (user as any).password_hash = await bcrypt.hash(newPassword, 10);
    await userRepo.save(user);
    return { success: true, message: '密码已修改' };
  }

  /**
   * POST /merchant/change-email - 修改/绑定邮箱（需登录）
   * body: { email }
   */
  @Post('change-email')
  async changeEmail(@Body() body: { email: string; currentPassword?: string }, @Req() req: any) {
    const { userId, accountNumber } = this.parseTokenFull(req);
    const email = (body.email || '').trim().toLowerCase();
    const currentPassword = (body.currentPassword || '').trim();
    if (!email) throw new BadRequestException('请输入邮箱');
    if (!currentPassword) throw new BadRequestException('请输入当前密码');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('邮箱格式不正确');
    const userRepo = this.dataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { user_id: userId } });
    if (!user) throw new UnauthorizedException('用户不存在');
    if (accountNumber && user.account_number.toLowerCase() !== accountNumber.toLowerCase()) {
      throw new UnauthorizedException('无效的token，请重新登录');
    }
    // 验证当前密码
    const passwordOk = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordOk) throw new BadRequestException('当前密码不正确');
    // 验证 session token
    await this.verifySession(req, userId);
    // 检查邮箱是否已被其他账号使用
    const existing = await userRepo.findOne({ where: { email } as any });
    if (existing && existing.user_id !== userId) throw new BadRequestException('该邮箱已被其他账号使用');
    (user as any).email = email;
    await userRepo.save(user);
    return { success: true, message: '邮箱已更新' };
  }
}
