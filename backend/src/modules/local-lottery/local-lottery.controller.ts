import { Body, Controller, Get, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';
import { badBilingual, unauthorizedBilingual } from '../../utils/api-bilingual';
import { LocalLotteryService, LocalCreateOrderDto } from './local-lottery.service';

const TOKEN_SECRET = () => process.env.TOKEN_SECRET || 'lottery-token-secret-change-in-prod';

function parseOrderToken(token: string): number | null {
  if (!token) return null;
  const lastDot = token.lastIndexOf('.');
  if (lastDot <= 0) return null;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = crypto.createHmac('sha256', TOKEN_SECRET()).update(payload).digest('hex').slice(0, 32);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx < 1) return null;
    const userId = parseInt(decoded.slice(0, colonIdx), 10);
    return isNaN(userId) ? null : userId;
  } catch {
    return null;
  }
}

function requireUserId(req: Request): number {
  const authHeader = (req.headers?.['authorization'] || '') as string;
  const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
  const uid = parseOrderToken(raw);
  if (!uid) {
    throw unauthorizedBilingual('Inicie sesión para continuar.', '请先登录');
  }
  return uid;
}

@Controller('local-lottery')
export class LocalLotteryController {
  constructor(private readonly localLotteryService: LocalLotteryService) {}

  /** GET /api/local-lottery/current?shopId=1&kind=TICA|NICA */
  @Get('current')
  async current(@Query('shopId') shopId: string, @Query('kind') kind: string) {
    const sid = parseInt(String(shopId || ''), 10);
    if (!sid || isNaN(sid)) {
      throw badBilingual('Falta shopId.', '缺少 shopId');
    }
    const k = String(kind || '').toUpperCase();
    if (k !== 'TICA' && k !== 'NICA') {
      throw badBilingual('kind debe ser TICA o NICA.', 'kind 须为 TICA 或 NICA');
    }
    return this.localLotteryService.getCurrent(sid, k as 'TICA' | 'NICA');
  }

  /** POST /api/local-lottery/orders — TICA/NICA 下单（不受巴拿马 Lotería 全国停售窗口影响） */
  @Post('orders')
  async create(@Body() dto: LocalCreateOrderDto, @Req() req: Request) {
    return this.localLotteryService.createOrder(dto, req);
  }

  /**
   * POST /api/local-lottery/settle
   * body: { shopId, kind: TICA|NICA, n1, n2, n3, drawId? }，须店铺 owner Bearer token
   *
   * drawId 是乐观锁：前端从 GET /current 拿到 draw_id 后必须回传，
   * 后端校验该期仍是 pending，否则返回 ALREADY_SETTLED，UI 立即锁定。
   * 不传 drawId 时兼容旧前端，走"当前 pending"路径。
   */
  @Post('settle')
  async settle(
    @Body() body: { shopId: number; kind: string; n1: string; n2: string; n3: string; drawId?: number },
    @Req() req: Request,
  ) {
    const shopId = Number(body?.shopId);
    if (!shopId || isNaN(shopId)) {
      throw badBilingual('Falta shopId.', '缺少 shopId');
    }
    const uid = requireUserId(req);
    await this.localLotteryService.assertShopOwner(shopId, uid);
    const k = String(body.kind || '').toUpperCase();
    if (k !== 'TICA' && k !== 'NICA') {
      throw badBilingual('kind debe ser TICA o NICA.', 'kind 须为 TICA 或 NICA');
    }
    const expectedDrawId = body.drawId != null && !isNaN(Number(body.drawId)) && Number(body.drawId) > 0
      ? Number(body.drawId)
      : undefined;
    return this.localLotteryService.settleAndRollNext(
      shopId,
      k as 'TICA' | 'NICA',
      body.n1,
      body.n2,
      body.n3,
      expectedDrawId,
    );
  }

  /** PATCH /api/local-lottery/accepting?shopId=1 body: { acceptingTicaOrders?, acceptingNicaOrders? } */
  @Patch('accepting')
  async accepting(
    @Query('shopId') shopId: string,
    @Body() body: { acceptingTicaOrders?: boolean; acceptingNicaOrders?: boolean },
    @Req() req: Request,
  ) {
    const sid = parseInt(String(shopId || ''), 10);
    if (!sid || isNaN(sid)) {
      throw badBilingual('Falta shopId.', '缺少 shopId');
    }
    const uid = requireUserId(req);
    return this.localLotteryService.patchAccepting(sid, body, uid);
  }

  /**
   * PATCH /api/local-lottery/shop-settings?shopId=1
   * 店主：开通/关闭 TICA、NICA；可选同时改停接
   */
  @Patch('shop-settings')
  async shopSettings(
    @Query('shopId') shopId: string,
    @Body()
    body: {
      ticaEnabled?: boolean;
      nicaEnabled?: boolean;
      acceptingTicaOrders?: boolean;
      acceptingNicaOrders?: boolean;
    },
    @Req() req: Request,
  ) {
    const sid = parseInt(String(shopId || ''), 10);
    if (!sid || isNaN(sid)) {
      throw badBilingual('Falta shopId.', '缺少 shopId');
    }
    const uid = requireUserId(req);
    return this.localLotteryService.patchShopSettings(sid, body, uid);
  }
}
