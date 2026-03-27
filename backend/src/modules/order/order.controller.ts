import { Controller, Post, Get, Patch, Delete, Param, Body, Inject, Logger, Query, Req, BadRequestException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Request } from 'express';
import { DataSource, Repository } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { Shop } from '../../entities/shop.entity';

/** 按店号查找店铺，同时检查主号和别名（避免全表扫描） */
async function findShopByNumber(shopRepo: Repository<Shop>, number: string): Promise<Shop | null> {
  const byPrimary = await shopRepo.findOne({ where: { shop_number: number } });
  if (byPrimary) return byPrimary;
  // simple-json 别名数组存储为 ["123","456"]，用 LIKE + 引号确保精确匹配，不加载全表
  const safe = number.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return shopRepo
    .createQueryBuilder('s')
    .where(`s.shop_aliases LIKE :pattern`, { pattern: `%"${safe}"%` })
    .getOne() ?? null;
}
import { Draw } from '../../entities/draw.entity';
import { DrawDayService } from '../draw/draw-day.service';
import { LocalLotteryService } from '../local-lottery/local-lottery.service';
import { findNationalLastCompletedDraw, findNationalPendingDraw } from '../../utils/draw-queries';
import { withShopLock } from '../../utils/shop-order-lock';
import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';

const TOKEN_SECRET = () => process.env.TOKEN_SECRET || 'lottery-token-secret-change-in-prod';

/** 解析并验证签名 token，返回 userId；验证失败返回 null */
function parseOrderToken(token: string): number | null {
  if (!token) return null;
  const lastDot = token.lastIndexOf('.');
  if (lastDot <= 0) return null;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = crypto.createHmac('sha256', TOKEN_SECRET()).update(payload).digest('hex').slice(0, 32);
  try {
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch { return null; }
  try {
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx < 1) return null;
    const userId = parseInt(decoded.slice(0, colonIdx), 10);
    return isNaN(userId) ? null : userId;
  } catch { return null; }
}

interface CreateOrderDto {
  shopId?: number;
  shop_id?: number;
  /** TICA / NICA：走店内彩种下单（与 POST /api/local-lottery/orders 同逻辑，便于只暴露了 /api/orders 的网关） */
  lotteryKind?: 'TICA' | 'NICA';
  numbers: { n: string; q: number }[];
  amount: number;
  gameType?: string;
  game_type?: string;
  clientId?: string;
  ipAddress?: string;
  idempotency_key?: string;
}

@Controller('orders')
export class OrderController implements OnModuleInit {
  private readonly logger = new Logger(OrderController.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly localLotteryService: LocalLotteryService,
  ) {}

  async onModuleInit() {
    const qr = this.dataSource.createQueryRunner();
    for (const sql of [
      `ALTER TABLE orders ADD COLUMN idempotency_key VARCHAR(64)`,
    ]) {
      try { await qr.query(sql); } catch {}
    }
    await qr.release();
  }

  /**
   * POST /api/orders - 顾客下单
   * 兼容前端格式；IP 优先从请求头/连接取真实 IP（统计用）
   */
  @Post()
  async createOrder(@Body() dto: CreateOrderDto, @Req() req: Request) {
    const kind = dto.lotteryKind;
    if (kind === 'TICA' || kind === 'NICA') {
      return this.localLotteryService.createOrder(
        {
          shopId: dto.shopId ?? dto.shop_id,
          lotteryKind: kind,
          numbers: dto.numbers,
          amount: dto.amount,
          gameType: dto.gameType || dto.game_type,
          clientId: dto.clientId,
          ipAddress: dto.ipAddress,
          idempotency_key: dto.idempotency_key,
        },
        req,
      );
    }

    const shopId = dto.shopId ?? dto.shop_id;
    const numbers = dto.numbers;
    const amount = Number(dto.amount);
    const gameTypeValue = dto.gameType || dto.game_type;
    const clientId = dto.clientId;
    const dtoIp = dto.ipAddress;
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      (req.socket && req.socket.remoteAddress) ||
      dtoIp ||
      '127.0.0.1';

    if (shopId == null || Number.isNaN(Number(shopId))) {
      throw new BadRequestException('缺少店铺ID');
    }
    if (!Array.isArray(numbers) || numbers.length === 0 || numbers.length > 500) {
      throw new BadRequestException('号码列表无效或超过500条');
    }
    if (Number.isNaN(amount) || amount <= 0 || amount > 100000) {
      throw new BadRequestException('金额无效');
    }
    for (const item of numbers) {
      if (typeof item.n !== 'string' || item.n.length > 10 || typeof item.q !== 'number' || item.q < 1 || item.q > 999) {
        throw new BadRequestException('号码或数量格式无效');
      }
    }

    // 0a. 金额后端验算：按 numbers 重新计算期望金额，防止前端篡改
    const BILLETE_PRICE = 1.00;
    const CHANCE_PRICE  = 0.25;
    let expectedAmount = 0;
    for (const item of numbers) {
      const numLen = String(item.n).replace(/\D/g, '').length;
      const price  = numLen >= 4 ? BILLETE_PRICE : CHANCE_PRICE;
      expectedAmount += price * Number(item.q);
    }
    expectedAmount = Math.round(expectedAmount * 100) / 100;
    if (Math.abs(expectedAmount - amount) > 0.01) {
      throw new BadRequestException(`金额不符：期望 $${expectedAmount}，实际 $${amount}`);
    }

    // 0b. 幂等校验：同一 idempotency_key + shop_id + draw_id 已存在则直接返回原订单
    const idempotencyKey = (dto.idempotency_key || '').trim().substring(0, 64) || null;
    if (idempotencyKey) {
      const orderRepo0 = this.dataSource.getRepository(Order);
      const existing = await orderRepo0
        .createQueryBuilder('o')
        .where('o.idempotency_key = :k', { k: idempotencyKey })
        .andWhere('o.shop_id = :s', { s: Number(shopId) })
        .andWhere('(o.lottery_type IS NULL OR o.lottery_type = :nac)', { nac: 'NACIONAL' })
        .andWhere('o.status != :canceled', { canceled: -1 })
        .getOne();
      if (existing) {
        this.logger.log(`幂等重复请求，返回已有订单 #${existing.order_number}`);
        return {
          order_id: existing.order_id,
          order_number: existing.order_number,
          order_hash: existing.order_hash,
          verification_code: existing.verification_code,
          amount: existing.amount,
          status: existing.status,
          created_at: existing.created_at,
          _idempotent: true,
        };
      }
    }

    // 1. 检查店铺是否存在
    const shop = await this.dataSource.getRepository(Shop).findOne({
      where: { shop_id: Number(shopId) },
    });

    if (!shop) {
      throw new NotFoundException('店铺不存在');
    }

    if (shop.status !== 'active') {
      throw new BadRequestException('店铺已停业');
    }

    // 订阅到期拦截
    const expiresAt = (shop as any).subscription_expires_at;
    if (expiresAt && new Date(expiresAt) < new Date()) {
      throw new BadRequestException('Su suscripción ha vencido. Contacte al administrador para renovar.');
    }

    // 2. 获取当前全国待开奖期次（不含店内 TICA/NICA）
    const drawRepo = this.dataSource.getRepository(Draw);
    const currentDraw = await findNationalPendingDraw(drawRepo);

    // 无待开奖期 → 停售（次日07:00自动创建）
    if (!currentDraw) {
      throw new BadRequestException('当前处于停售期，暂停下单');
    }

    // 2a. 服务端停售窗口验证（开奖前5分钟 到 次日07:00，拒绝下单）
    if (currentDraw) {
      const timeStr = String(currentDraw.draw_time || '').trim();
      let drawHour = -1, drawMin = 0;
      let dy: number, dm: number, dd: number;
      if (timeStr.includes('T') && /^\d{4}-\d{2}-\d{2}/.test(timeStr)) {
        // ISO 格式：2026-03-18T15:00:00
        const iso = timeStr.substring(0, 10);
        dy = parseInt(iso.slice(0, 4), 10);
        dm = parseInt(iso.slice(5, 7), 10);
        dd = parseInt(iso.slice(8, 10), 10);
        const dt = new Date(timeStr);
        if (!isNaN(dt.getTime())) { drawHour = dt.getHours(); drawMin = dt.getMinutes(); }
      } else {
        // HH:mm 或 HH:mm:ss 格式：从 draw_date 字段取日期
        const parts = timeStr.split(':').map(Number);
        if (parts.length >= 2 && !isNaN(parts[0])) { drawHour = parts[0]; drawMin = parts[1] || 0; }
        const rawDate = String((currentDraw as any).draw_date || '').slice(0, 10);
        if (rawDate && /^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
          dy = parseInt(rawDate.slice(0, 4), 10);
          dm = parseInt(rawDate.slice(5, 7), 10);
          dd = parseInt(rawDate.slice(8, 10), 10);
        } else { drawHour = -1; } // 无法解析日期则跳过
      }
      if (drawHour >= 0) {
        const panama = getPanamaNow();
        const todayStr = `${String(panama.d).padStart(2,'0')}-${String(panama.m).padStart(2,'0')}-${panama.y}`;
        const confirmedDrawDay = `${String(dd).padStart(2,'0')}-${String(dm).padStart(2,'0')}-${dy}`;
        const drawDateISO2 = `${dy}-${String(dm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
        const todayISO2 = `${panama.y}-${String(panama.m).padStart(2,'0')}-${String(panama.d).padStart(2,'0')}`;
        const totalMins = panama.h * 60 + panama.min;
        const drawMins = drawHour * 60 + drawMin;
        const stopStart = drawMins - 5;
        const RESUME = 7 * 60;

        const drawDateObj2 = new Date(`${drawDateISO2}T12:00:00`);
        drawDateObj2.setDate(drawDateObj2.getDate() + 1);
        const dayAfterISO2 = `${drawDateObj2.getFullYear()}-${String(drawDateObj2.getMonth()+1).padStart(2,'0')}-${String(drawDateObj2.getDate()).padStart(2,'0')}`;

        const inStop =
          (drawDateISO2 === todayISO2 && totalMins >= stopStart) ||
          (dayAfterISO2 === todayISO2 && totalMins < RESUME);

        if (inStop) {
          throw new BadRequestException('当前处于开奖窗口期，暂停下单');
        }
      }
    }

    // 2b. 每号限额校验 + 订单写入，用 per-shop mutex 串行化，防并发超卖
    const limitChance = (shop as any).limit_chance as number | null;
    const limitBillete = (shop as any).limit_billete as number | null;

    return withShopLock(Number(shopId), async () => {
      if (currentDraw && (limitChance != null || limitBillete != null)) {
        // 用数据库聚合统计每个号码的已售总量（在锁内执行，读到的是最新值）
        const dbType = (this.dataSource.options as any).type as string;
        let soldRows: { num: string; qty: string }[] = [];
        if (dbType === 'postgres') {
          soldRows = await this.dataSource.query(
            `SELECT item->>'n' AS num, SUM((item->>'q')::int) AS qty
             FROM orders, jsonb_array_elements(numbers::jsonb) AS item
             WHERE draw_id = $1 AND shop_id = $2 AND status != -1
             GROUP BY item->>'n'`,
            [currentDraw.draw_id, Number(shopId)],
          );
        } else {
          soldRows = await this.dataSource.query(
            `SELECT json_extract(value, '$.n') AS num,
                    SUM(CAST(json_extract(value, '$.q') AS INTEGER)) AS qty
             FROM orders, json_each(numbers)
             WHERE draw_id = ? AND shop_id = ? AND status != -1
             GROUP BY json_extract(value, '$.n')`,
            [currentDraw.draw_id, Number(shopId)],
          );
        }
        const soldMap: Record<string, number> = Object.fromEntries(
          soldRows.map(r => [r.num, Number(r.qty)]),
        );

        const overLimitItems: Array<{ n: string | number; alreadySold: number; limit: number }> = [];
        for (const item of numbers) {
          const numStr = String(item.n).replace(/\D/g, '');
          const isBillete = numStr.length >= 4;
          const limit = isBillete ? limitBillete : limitChance;
          if (limit == null) continue;
          const alreadySold = soldMap[item.n] || 0;
          if (alreadySold + item.q > limit) {
            overLimitItems.push({ n: item.n, alreadySold, limit });
          }
        }
        if (overLimitItems.length > 0) {
          throw new BadRequestException({ message: '部分号码超出限额', overLimitItems });
        }
      }

      // 3. 生成订单号和hash
      const orderNumber = this.generateOrderNumber();
      const orderHash = crypto.createHash('sha256').update(orderNumber + Date.now()).digest('hex').substring(0, 64);

      // 4. 生成核销码（5位数字）
      const verificationCode = this.generateVerificationCode();

      // 5. 创建订单
      const orderRepo = this.dataSource.getRepository(Order);
      const orderData: any = {
        order_number: orderNumber,
        order_hash: orderHash,
        shop_id: Number(shopId),
        numbers,
        amount,
        game_type: gameTypeValue,
        lottery_type: 'NACIONAL',
        status: 0,
        verification_code: verificationCode,
        customer_info: { clientId },
        ip_address: ipAddress,
        draw_id: currentDraw?.draw_id || null,
      };
      if (idempotencyKey) orderData.idempotency_key = idempotencyKey;
      const order = orderRepo.create(orderData) as unknown as Order;

      await orderRepo.save(order);

      this.logger.log(`订单创建: #${orderNumber}, 店铺: ${shopId}, 金额: $${amount}`);

      return {
        order_id: order.order_id,
        order_number: order.order_number,
        order_hash: order.order_hash,
        verification_code: order.verification_code,
        amount: order.amount,
        status: 0,
        created_at: order.created_at,
      };
    });
  }

  /**
   * DELETE /api/orders/:orderNumber - 彻底删除订单（老板端操作，不可撤回）
   * 必须提供 body.shopId 且该店铺必须是订单归属店铺，防止跨店删单。
   */
  @Delete(':orderNumber')
  async deleteOrder(
    @Param('orderNumber') orderNumber: string,
    @Body() body: { shopId?: number },
    @Req() req: Request,
  ) {
    const shopId = body?.shopId != null ? Number(body.shopId) : undefined;
    if (!shopId || isNaN(shopId)) {
      throw new BadRequestException('缺少 shopId');
    }

    // 验证 Authorization token，确认操作者身份
    const authHeader = (req.headers?.['authorization'] || '') as string;
    const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
    const tokenUserId = parseOrderToken(raw);
    if (!tokenUserId) {
      throw new UnauthorizedException('请先登录');
    }

    // 验证 token 持有者是否是该店铺的 owner
    const shop = await this.dataSource.getRepository(Shop).findOne({ where: { shop_id: shopId } });
    if (!shop) throw new NotFoundException('店铺不存在');
    if (shop.owner_id !== tokenUserId) {
      throw new UnauthorizedException('无权操作此店铺');
    }

    const orderRepo = this.dataSource.getRepository(Order);
    const order = await orderRepo.findOne({ where: { order_number: orderNumber } });
    if (!order) throw new NotFoundException('订单不存在');

    // 必须是本店订单，防止跨店删单
    if (order.shop_id !== shopId) {
      throw new BadRequestException('无权删除其他店铺的订单');
    }

    // 已结算/已中奖订单不允许删除（防止规避账目），已付款可以删除
    if (order.status === 2 || order.status === 3) {
      throw new BadRequestException('已结算或已中奖的订单不允许删除');
    }

    this.logger.log(`订单删除: #${order.order_number}, 店铺: ${shopId}, 状态: ${order.status}`);
    await orderRepo.remove(order);
    return { success: true, message: '订单已删除' };
  }

  /**
   * PATCH /api/orders/:orderNumber - 店主修改订单号码与数量（原单更新，不换单号；金额后端按票价重算）
   * 仅待付款(0)/已付款(1)且未开奖结算；已结算(2)、已中奖(3)不可改。须登录且为店铺 owner。
   */
  @Patch(':orderNumber')
  async patchOrder(
    @Param('orderNumber') orderNumber: string,
    @Body() body: { shopId?: number; numbers?: { n: string; q: number }[] },
    @Req() req: Request,
  ) {
    const shopId = body?.shopId != null ? Number(body.shopId) : undefined;
    if (!shopId || isNaN(shopId)) {
      throw new BadRequestException('缺少 shopId');
    }

    const authHeader = (req.headers?.['authorization'] || '') as string;
    const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
    const tokenUserId = parseOrderToken(raw);
    if (!tokenUserId) {
      throw new UnauthorizedException('请先登录');
    }

    const shopRepo = this.dataSource.getRepository(Shop);
    const shop = await shopRepo.findOne({ where: { shop_id: shopId } });
    if (!shop) throw new NotFoundException('店铺不存在');
    if (shop.owner_id !== tokenUserId) {
      throw new UnauthorizedException('无权操作此店铺');
    }

    const numbers = body.numbers;
    if (!Array.isArray(numbers) || numbers.length === 0 || numbers.length > 500) {
      throw new BadRequestException('号码列表无效或超过500条');
    }
    for (const item of numbers) {
      if (typeof item.n !== 'string' || item.n.length > 10 || typeof item.q !== 'number' || item.q < 1 || item.q > 999) {
        throw new BadRequestException('号码或数量格式无效');
      }
    }

    const BILLETE_PRICE = 1.0;
    const CHANCE_PRICE = 0.25;
    let amount = 0;
    for (const item of numbers) {
      const numLen = String(item.n).replace(/\D/g, '').length;
      const price = numLen >= 4 ? BILLETE_PRICE : CHANCE_PRICE;
      amount += price * Number(item.q);
    }
    amount = Math.round(amount * 100) / 100;
    if (Number.isNaN(amount) || amount <= 0 || amount > 100000) {
      throw new BadRequestException('金额无效');
    }

    const orderRepo = this.dataSource.getRepository(Order);
    const orderPre = await orderRepo.findOne({ where: { order_number: orderNumber } });
    if (!orderPre) throw new NotFoundException('订单不存在');
    if (orderPre.shop_id !== shopId) {
      throw new BadRequestException('无权操作其他店铺的订单');
    }

    const ltPre = String((orderPre as any).lottery_type || 'NACIONAL').toUpperCase();
    if (ltPre === 'TICA' || ltPre === 'NICA') {
      return this.localLotteryService.updateMerchantOrderLines(orderNumber, shopId, numbers, tokenUserId);
    }

    const limitChance = (shop as any).limit_chance as number | null;
    const limitBillete = (shop as any).limit_billete as number | null;

    return withShopLock(shopId, async () => {
      const fresh = await orderRepo.findOne({ where: { order_number: orderNumber } });
      if (!fresh) throw new NotFoundException('订单不存在');
      if (fresh.shop_id !== shopId) {
        throw new BadRequestException('无权操作其他店铺的订单');
      }
      const lt2 = String((fresh as any).lottery_type || 'NACIONAL').toUpperCase();
      if (lt2 === 'TICA' || lt2 === 'NICA') {
        return this.localLotteryService.updateMerchantOrderLines(orderNumber, shopId, numbers, tokenUserId);
      }
      if (fresh.status !== 0 && fresh.status !== 1) {
        throw new BadRequestException('仅待付款或已付款（未开奖结算）的订单可修改');
      }

      if (fresh.draw_id != null && (limitChance != null || limitBillete != null)) {
        const dbType = (this.dataSource.options as any).type as string;
        let soldRows: { num: string; qty: string }[] = [];
        if (dbType === 'postgres') {
          soldRows = await this.dataSource.query(
            `SELECT item->>'n' AS num, SUM((item->>'q')::int) AS qty
             FROM orders, jsonb_array_elements(numbers::jsonb) AS item
             WHERE draw_id = $1 AND shop_id = $2 AND status != -1 AND order_id <> $3
             GROUP BY item->>'n'`,
            [fresh.draw_id, fresh.shop_id, fresh.order_id],
          );
        } else {
          soldRows = await this.dataSource.query(
            `SELECT json_extract(value, '$.n') AS num,
                    SUM(CAST(json_extract(value, '$.q') AS INTEGER)) AS qty
             FROM orders, json_each(numbers)
             WHERE draw_id = ? AND shop_id = ? AND status != -1 AND order_id != ?
             GROUP BY json_extract(value, '$.n')`,
            [fresh.draw_id, fresh.shop_id, fresh.order_id],
          );
        }
        const soldMap: Record<string, number> = Object.fromEntries(
          soldRows.map(r => [r.num, Number(r.qty)]),
        );
        const overLimitItems: Array<{ n: string | number; alreadySold: number; limit: number }> = [];
        for (const item of numbers) {
          const numStr = String(item.n).replace(/\D/g, '');
          const isBillete = numStr.length >= 4;
          const limit = isBillete ? limitBillete : limitChance;
          if (limit == null) continue;
          const alreadySold = soldMap[item.n] || 0;
          if (alreadySold + item.q > limit) {
            overLimitItems.push({ n: item.n, alreadySold, limit });
          }
        }
        if (overLimitItems.length > 0) {
          throw new BadRequestException({ message: '部分号码超出限额', overLimitItems });
        }
      }

      const gameType = inferMerchantPatchGameType(numbers);
      await orderRepo.update(fresh.order_id, {
        numbers,
        amount,
        game_type: gameType,
        win_amount: 0,
        win_breakdown: null,
      } as any);

      this.logger.log(`订单修改: #${fresh.order_number}, 店铺: ${shopId}, 新金额: $${amount}`);
      return {
        success: true,
        order_number: fresh.order_number,
        amount,
        numbers,
        game_type: gameType,
        lottery_type: 'NACIONAL',
      };
    });
  }

  /**
   * GET /api/orders/:orderNumber - 查询订单
   */
  @Get(':orderNumber')
  async getOrder(@Param('orderNumber') orderNumber: string) {
    const order = await this.dataSource.getRepository(Order).findOne({
      where: { order_number: orderNumber },
      relations: ['shop', 'draw'],
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    const statusMap: { [key: number]: string } = {
      0: 'pending',
      1: 'paid',
      2: 'settled',
      3: 'won',
      [-1]: 'canceled',
    };

    return {
      order_id: order.order_id,
      order_number: order.order_number,
      order_hash: order.order_hash,
      amount: order.amount,
      numbers: order.numbers,
      game_type: order.game_type,
      lottery_type: (order as any).lottery_type ?? 'NACIONAL',
      status: statusMap[order.status] || 'pending',
      verification_code: order.verification_code,
      shop_id: order.shop_id,
      shopId: order.shop_id,
      shopNumber: order.shop?.shop_number,
      win_amount: order.win_amount,
      win_breakdown: (order as any).win_breakdown ?? null,
      redeemed_at: (order as any).redeemed_at ?? null,
      note: (order as any).note ?? null,
      draw_date: order.draw?.draw_date ?? null,
      created_at: order.created_at,
      paid_at: order.paid_at,
    };
  }

  /**
   * POST /api/orders/:orderNumber/confirm - 老板确认收款
   */
  @Post(':orderNumber/confirm')
  async confirmOrder(@Param('orderNumber') orderNumber: string, @Body() body: { shopId: number; note?: string }, @Req() req: any) {
    // 鉴权：验证 Bearer token
    const authHeader = (req.headers?.['authorization'] || '') as string;
    const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
    const tokenUserId = parseOrderToken(raw);
    if (!tokenUserId) {
      throw new UnauthorizedException('请先登录');
    }
    const orderRepo = this.dataSource.getRepository(Order);
    const order = await orderRepo.findOne({
      where: { order_number: orderNumber },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    if (order.status !== 0) {
      if (order.status === 1) {
        return { success: true, message: '订单已确认付款' };
      }
      throw new BadRequestException('订单状态不是待支付');
    }

    // 若订单没有归属期（draw_id 为空），归入当前待开奖期，以便老板端「本期订单」正确统计
    const drawRepo = this.dataSource.getRepository(Draw);
    const orderLt = String((order as any).lottery_type || 'NACIONAL').toUpperCase();
    const currentNational = await findNationalPendingDraw(drawRepo);
    const updatePayload: any = {
      status: 1, // Paid
      paid_at: new Date(),
    };
    if (body.note != null) updatePayload.note = String(body.note).slice(0, 200);
    if (
      order.draw_id == null &&
      currentNational?.draw_id != null &&
      (orderLt === 'NACIONAL' || orderLt === '')
    ) {
      updatePayload.draw_id = currentNational.draw_id;
    }

    await orderRepo.update(order.order_id, updatePayload);

    this.logger.log(`订单确认: #${order.order_number}, 店铺: ${body.shopId}`);

    return {
      success: true,
      order_id: order.order_id,
      order_number: order.order_number,
      status: 'paid',
    };
  }

  /**
   * POST /api/orders/:orderNumber/redeem - 老板兑奖
   * 校验：订单存在、店号匹配（不能拿其他店的兑奖单到本店兑）、已中奖、未兑奖。
   */
  @Post(':orderNumber/redeem')
  async redeemOrder(
    @Param('orderNumber') orderNumber: string,
    @Body() body: { shopId: number },
    @Req() req: any,
  ) {
    // 鉴权：验证 Bearer token
    const authHeader = (req.headers?.['authorization'] || '') as string;
    const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
    const tokenUserId = parseOrderToken(raw);
    if (!tokenUserId) {
      throw new UnauthorizedException('请先登录');
    }
    const orderRepo = this.dataSource.getRepository(Order);
    const order = await orderRepo.findOne({
      where: { order_number: orderNumber },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }
    if (order.shop_id !== body.shopId) {
      throw new BadRequestException('店号不匹配：该订单属于其他店铺，不能在本店兑奖');
    }
    if (order.status !== 3) {
      throw new BadRequestException(order.status === 1 ? '尚未开奖，无法兑奖' : '该订单未中奖或状态异常');
    }
    // 原子操作：WHERE redeemed_at IS NULL，防止并发双击导致重复兑奖
    const redeemResult = await orderRepo
      .createQueryBuilder()
      .update(Order)
      .set({ redeemed_at: new Date() } as any)
      .where('order_id = :id AND redeemed_at IS NULL', { id: order.order_id })
      .execute();

    if (!redeemResult.affected || redeemResult.affected === 0) {
      throw new BadRequestException('该订单已兑奖，请勿重复操作');
    }

    this.logger.log(`兑奖完成: #${order.order_number}, 店铺: ${body.shopId}, 金额: $${order.win_amount}`);

    return {
      success: true,
      order_number: order.order_number,
      win_amount: Number(order.win_amount),
      message: '兑奖成功',
    };
  }

  /**
   * 生成订单号 (时间戳+随机数)
   */
  private generateOrderNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${timestamp}${random}`;
  }

  /**
   * 生成5位核销码
   */
  private generateVerificationCode(): string {
    return Math.floor(10000 + Math.random() * 90000).toString();
  }
}

function inferMerchantPatchGameType(numbers: { n: string; q: number }[]): string {
  let hasB = false;
  let hasC = false;
  for (const item of numbers) {
    const numLen = String(item.n).replace(/\D/g, '').length;
    if (numLen >= 4) hasB = true;
    else hasC = true;
  }
  if (hasB && hasC) return 'MIXTO';
  if (hasB) return 'BILLETE';
  return 'CHANCE';
}

/**
 * 店铺Controller - 处理店铺相关接口
 */
@Controller('shop')
export class ShopController {
  private readonly logger = new Logger(ShopController.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * GET /api/shop/orders?shopId=&limit= — 收银台拉订单列表（静态路径，绝不与 :shopNumber 冲突）
   */
  @Get('orders')
  async listShopOrdersByQuery(
    @Query('shopId') shopId: string,
    @Query('limit') limit: string = '100',
    @Query('status') status?: string,
    @Query('suffix') suffix?: string,
    @Query('drawId') drawId?: string,
    @Query('lotteryKind') lotteryKind?: string,
  ) {
    const id = parseInt(String(shopId || '').trim(), 10);
    if (!shopId || isNaN(id) || id <= 0) {
      throw new BadRequestException('缺少或无效的 shopId');
    }
    return this.buildShopOrdersList(id, limit, status, suffix, drawId, lotteryKind);
  }

  /** 内部：按店铺数字 ID 查订单列表（与 GET :shopId/orders 同逻辑） */
  private async buildShopOrdersList(
    shopIdNum: number,
    limit: string,
    status?: string,
    suffix?: string,
    drawId?: string,
    lotteryKind?: string,
  ) {
    const shopRepo = this.dataSource.getRepository(Shop);
    const orderRepo = this.dataSource.getRepository(Order);

    let shop = await shopRepo.findOne({ where: { shop_id: shopIdNum } });
    if (!shop) {
      // shopId 为纯数字但找不到时，尝试按 shop_number（店号）查找
      shop = await shopRepo.findOne({ where: { shop_number: String(shopIdNum) } as any });
    }
    if (!shop) {
      throw new NotFoundException('店铺不存在');
    }

    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    const query = orderRepo.createQueryBuilder('order')
      .where('order.shop_id = :shopId', { shopId: shop.shop_id })
      .orderBy('order.created_at', 'DESC')
      .take(limitNum);

    if (drawId && Number(drawId) > 0) {
      query.andWhere('order.draw_id = :drawId', { drawId: Number(drawId) });
    }

    const lk = (lotteryKind || '').toString().toUpperCase();
    if (lk === 'TICA' || lk === 'NICA') {
      query.andWhere('order.lottery_type = :lotteryTypeFilter', { lotteryTypeFilter: lk });
    } else if (lk === 'NACIONAL') {
      query.andWhere('(order.lottery_type = :nac OR order.lottery_type IS NULL)', { nac: 'NACIONAL' });
    }

    if (status) {
      const statusMap: { [key: string]: number } = {
        'pending': 0,
        'paid': 1,
        'settled': 2,
        'won': 3,
      };
      if (statusMap[status] !== undefined) {
        query.andWhere('order.status = :status', { status: statusMap[status] });
      }
    }

    if (suffix && suffix.trim()) {
      const safe = String(suffix.trim()).replace(/%/g, '\\%').replace(/_/g, '\\_');
      query.andWhere('order.order_number LIKE :suffixPattern', { suffixPattern: '%' + safe });
      query.andWhere('order.status = 3');
      query.andWhere('order.redeemed_at IS NULL');
    }

    const orders = await query.getMany();

    const statusMap: { [key: number]: string } = {
      0: 'pending',
      1: 'paid',
      2: 'settled',
      3: 'won',
      [-1]: 'canceled',
    };

    return {
      shop_id: shop.shop_id,
      shopId: shop.shop_id,
      shopNumber: shop.shop_number,
      shopName: shop.shop_name,
      orders: orders.map(order => ({
        order_id: order.order_id,
        shop_id: order.shop_id,
        order_number: order.order_number,
        order_hash: order.order_hash,
        numbers: order.numbers,
        amount: order.amount,
        game_type: order.game_type,
        lottery_type: (order as any).lottery_type ?? 'NACIONAL',
        status: statusMap[order.status] || 'pending',
        draw_id: order.draw_id ?? null,
        win_amount: order.win_amount,
        win_breakdown: (order as any).win_breakdown ?? null,
        redeemed_at: (order as any).redeemed_at ?? null,
        note: (order as any).note ?? null,
        verification_code: order.verification_code,
        created_at: order.created_at,
        paid_at: order.paid_at,
      })),
    };
  }

  /**
   * PATCH /api/shop/:shopId/limits - 保存每号销售限额
   */
  @Patch(':shopId/limits')
  async updateShopLimits(
    @Param('shopId') shopId: string,
    @Body()
    body: {
      limitChance?: number | null;
      limitBillete?: number | null;
      /** 顾客端是否展示 TICA（与 local-lottery/shop-settings 同效，便于未挂载 LocalLottery 模块的环境） */
      ticaEnabled?: boolean;
      nicaEnabled?: boolean;
    },
    @Req() req: Request,
  ) {
    const parsedShopId = parseInt(shopId, 10);
    if (isNaN(parsedShopId)) throw new BadRequestException('shopId 无效');

    const authHeader = (req.headers?.['authorization'] || '') as string;
    const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
    const tokenUserId = parseOrderToken(raw);
    if (!tokenUserId) {
      throw new UnauthorizedException('请先登录');
    }

    const shopRepo = this.dataSource.getRepository(Shop);
    const shop = await shopRepo.findOne({ where: { shop_id: parsedShopId } });
    if (!shop) throw new NotFoundException('店铺不存在');
    if (shop.owner_id !== tokenUserId) {
      throw new UnauthorizedException('无权操作此店铺');
    }
    if (body.limitChance !== undefined) (shop as any).limit_chance = body.limitChance || null;
    if (body.limitBillete !== undefined) (shop as any).limit_billete = body.limitBillete || null;
    if (body.ticaEnabled !== undefined) shop.tica_enabled = !!body.ticaEnabled;
    if (body.nicaEnabled !== undefined) shop.nica_enabled = !!body.nicaEnabled;
    await shopRepo.save(shop);
    return {
      success: true,
      limit_chance: (shop as any).limit_chance,
      limit_billete: (shop as any).limit_billete,
      tica_enabled: shop.tica_enabled,
      nica_enabled: shop.nica_enabled,
    };
  }

  /**
   * PATCH /api/shop/:shopId/rates - 保存店铺自定义赔率
   */
  @Patch(':shopId/rates')
  async updateShopRates(
    @Param('shopId') shopId: string,
    @Body()
    body: {
      rateBillete1?: number | null;
      rateBillete2?: number | null;
      rateBillete3?: number | null;
      rateChance1?: number | null;
      rateChance2?: number | null;
      rateChance3?: number | null;
      chain12?: number | null;
      chain13?: number | null;
      chain21?: number | null;
      chain23?: number | null;
      chain31?: number | null;
      chain32?: number | null;
      nicaChain12?: number | null;
      nicaChain13?: number | null;
      nicaChain21?: number | null;
      nicaChain23?: number | null;
      nicaChain31?: number | null;
      nicaChain32?: number | null;
      nicaChance1?: number | null;
      nicaChance2?: number | null;
      nicaChance3?: number | null;
    },
    @Req() req: Request,
  ) {
    const parsedShopId = parseInt(shopId, 10);
    if (isNaN(parsedShopId)) throw new BadRequestException('shopId 无效');

    const authHeader = (req.headers?.['authorization'] || '') as string;
    const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
    const tokenUserId = parseOrderToken(raw);
    if (!tokenUserId) {
      throw new UnauthorizedException('请先登录');
    }

    const shopRepo = this.dataSource.getRepository(Shop);
    const shop = await shopRepo.findOne({ where: { shop_id: parsedShopId } });
    if (!shop) throw new NotFoundException('店铺不存在');
    if (shop.owner_id !== tokenUserId) {
      throw new UnauthorizedException('无权操作此店铺');
    }

    const toRate = (v: number | null | undefined, def: number) =>
      v != null && isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
    const toChainRate = (v: number | null | undefined) =>
      v != null && isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null;
    if (body.rateBillete1 !== undefined) (shop as any).rate_billete_1 = toRate(body.rateBillete1, 2000);
    if (body.rateBillete2 !== undefined) (shop as any).rate_billete_2 = toRate(body.rateBillete2, 600);
    if (body.rateBillete3 !== undefined) (shop as any).rate_billete_3 = toRate(body.rateBillete3, 300);
    if (body.rateChance1 !== undefined) (shop as any).rate_chance_1 = toRate(body.rateChance1, 14);
    if (body.rateChance2 !== undefined) (shop as any).rate_chance_2 = toRate(body.rateChance2, 3);
    if (body.rateChance3 !== undefined) (shop as any).rate_chance_3 = toRate(body.rateChance3, 2);
    if (body.chain12 !== undefined) (shop as any).chain_1_2 = toChainRate(body.chain12);
    if (body.chain13 !== undefined) (shop as any).chain_1_3 = toChainRate(body.chain13);
    if (body.chain21 !== undefined) (shop as any).chain_2_1 = toChainRate(body.chain21);
    if (body.chain23 !== undefined) (shop as any).chain_2_3 = toChainRate(body.chain23);
    if (body.chain31 !== undefined) (shop as any).chain_3_1 = toChainRate(body.chain31);
    if (body.chain32 !== undefined) (shop as any).chain_3_2 = toChainRate(body.chain32);
    // NICA 独立赔率
    if (body.nicaChain12 !== undefined) (shop as any).nica_chain_1_2 = toChainRate(body.nicaChain12);
    if (body.nicaChain13 !== undefined) (shop as any).nica_chain_1_3 = toChainRate(body.nicaChain13);
    if (body.nicaChain21 !== undefined) (shop as any).nica_chain_2_1 = toChainRate(body.nicaChain21);
    if (body.nicaChain23 !== undefined) (shop as any).nica_chain_2_3 = toChainRate(body.nicaChain23);
    if (body.nicaChain31 !== undefined) (shop as any).nica_chain_3_1 = toChainRate(body.nicaChain31);
    if (body.nicaChain32 !== undefined) (shop as any).nica_chain_3_2 = toChainRate(body.nicaChain32);
    if (body.nicaChance1 !== undefined) (shop as any).nica_chance_1 = toRate(body.nicaChance1, 14);
    if (body.nicaChance2 !== undefined) (shop as any).nica_chance_2 = toRate(body.nicaChance2, 3);
    if (body.nicaChance3 !== undefined) (shop as any).nica_chance_3 = toRate(body.nicaChance3, 2);
    await shopRepo.save(shop);
    return {
      success: true,
      rate_billete_1: (shop as any).rate_billete_1,
      rate_billete_2: (shop as any).rate_billete_2,
      rate_billete_3: (shop as any).rate_billete_3,
      rate_chance_1: (shop as any).rate_chance_1,
      rate_chance_2: (shop as any).rate_chance_2,
      rate_chance_3: (shop as any).rate_chance_3,
      chain_1_2: (shop as any).chain_1_2,
      chain_1_3: (shop as any).chain_1_3,
      chain_2_1: (shop as any).chain_2_1,
      chain_2_3: (shop as any).chain_2_3,
      chain_3_1: (shop as any).chain_3_1,
      chain_3_2: (shop as any).chain_3_2,
      nica_chain_1_2: (shop as any).nica_chain_1_2,
      nica_chain_1_3: (shop as any).nica_chain_1_3,
      nica_chain_2_1: (shop as any).nica_chain_2_1,
      nica_chain_2_3: (shop as any).nica_chain_2_3,
      nica_chain_3_1: (shop as any).nica_chain_3_1,
      nica_chain_3_2: (shop as any).nica_chain_3_2,
      nica_chance_1: (shop as any).nica_chance_1,
      nica_chance_2: (shop as any).nica_chance_2,
      nica_chance_3: (shop as any).nica_chance_3,
    };
  }

  /**
   * GET /api/shop/:shopId/orders - 获取店铺订单列表（兼容旧链接）
   */
  @Get(':shopId/orders')
  async getShopOrders(
    @Param('shopId') shopId: string,
    @Query('limit') limit: string = '100',
    @Query('status') status?: string,
    @Query('suffix') suffix?: string,
    @Query('drawId') drawId?: string,
    @Query('lotteryKind') lotteryKind?: string,
  ) {
    const id = parseInt(String(shopId || '').trim(), 10);
    if (isNaN(id) || id <= 0) {
      throw new BadRequestException('无效的 shopId');
    }
    return this.buildShopOrdersList(id, limit, status, suffix, drawId, lotteryKind);
  }

  /**
   * GET /api/shop/:shopNumber - 通过店号查询店铺（单段，放在 orders/limits 之后）
   */
  @Get(':shopNumber')
  async getShopByNumber(@Param('shopNumber') shopNumber: string) {
    const shop = await findShopByNumber(this.dataSource.getRepository(Shop), shopNumber);

    if (!shop) {
      throw new NotFoundException('店铺不存在');
    }

    return {
      shop: {
        shop_id: shop.shop_id,
        shop_number: shop.shop_number,
        shop_name: shop.shop_name,
        status: shop.status,
        commission_rate: shop.commission_rate,
        limit_chance: (shop as any).limit_chance ?? null,
        limit_billete: (shop as any).limit_billete ?? null,
        tica_enabled: !!(shop as any).tica_enabled,
        nica_enabled: !!(shop as any).nica_enabled,
        accepting_tica_orders: (shop as any).accepting_tica_orders !== false,
        accepting_nica_orders: (shop as any).accepting_nica_orders !== false,
      },
    };
  }
}

/** 巴拿马时区名，用于 14:55 停售、15:00-16:00 开奖窗口判断 */
const PANAMA_TZ = 'America/Panama';

/** 取当前巴拿马时间的年/月/日/时/分 */
function getPanamaNow(): { y: number; m: number; d: number; h: number; min: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PANAMA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
  let h = get('hour');
  const min = get('minute');
  // Intl.DateTimeFormat(hour12:false) 在部分环境/午夜边界会返回 24:xx 而非 00:xx，导致 totalMins 误判停售窗口
  if (h === 24) h = 0;
  return { y: get('year'), m: get('month'), d: get('day'), h, min };
}

/**
 * 下注状态Controller
 * 本期由总后台开奖决定：不按日期停售，有待开奖期即可下单；总后台发送开奖后进入下一期。
 */
@Controller('bet-status')
export class BetStatusController {
  private readonly logger = new Logger(BetStatusController.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly drawDayService: DrawDayService,
  ) {}

  /**
   * GET /api/bet-status - 获取下注状态（轮询用）
   * 仅根据是否存在待开奖期返回 canBet；当前期数供前端显示。
   */
  /** 从 draw 解析出 DD-MM-YYYY */
  private static formatDrawPeriodDate(draw: Draw): string {
    const timeStr = String(draw.draw_time || '').trim();
    if (timeStr && timeStr.includes('T') && /^\d{4}-\d{2}-\d{2}/.test(timeStr)) {
      const iso = timeStr.substring(0, 10);
      const y = iso.slice(0, 4), m = iso.slice(5, 7), d = iso.slice(8, 10);
      return `${d}-${m}-${y}`;
    }
    const rawDate = draw.draw_date;
    if (rawDate) {
      const d = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(rawDate))
        ? new Date(String(rawDate).substring(0, 10) + 'T12:00:00Z')
        : new Date(rawDate as any);
      const dd = d.getUTCDate(), mm = d.getUTCMonth() + 1, yy = d.getUTCFullYear();
      return `${String(dd).padStart(2, '0')}-${String(mm).padStart(2, '0')}-${yy}`;
    }
    const fallback = new Date();
    return `${String(fallback.getDate()).padStart(2, '0')}-${String(fallback.getMonth() + 1).padStart(2, '0')}-${fallback.getFullYear()}`;
  }

  @Get()
  async getBetStatus(@Query('shopId') shopId: string) {
    const drawRepo = this.dataSource.getRepository(Draw);
    // 仅全国 Lotería：优先 pending，没有则最新 completed
    let draw = await findNationalPendingDraw(drawRepo);
    if (!draw) {
      draw = await drawRepo
        .createQueryBuilder('d')
        .where('d.status = :s', { s: 'completed' })
        .andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
        .andWhere('(d.shop_id IS NULL)')
        .orderBy('d.draw_id', 'DESC')
        .getOne();
    }

    let canBet = true;
    let minutesUntilDraw: number | undefined;
    let currentPeriodDate: string | null = null; // 当前期数，供用户端显示
    let isDrawWindow = false;

    let confirmedDrawDay: string | null = null;
    let confirmedDrawTime: string | null = null;

    if (draw) {
      // 当前期数 = 待开奖的 draw 的日期；优先从 draw_time 的 ISO 解析（总后台发送的 2026-03-15T15:00:00）
      const timeStr = String(draw.draw_time || '15:00').trim();
      let dy: number; let dm: number; let dd: number;
      if (timeStr.includes('T') && /^\d{4}-\d{2}-\d{2}/.test(timeStr)) {
        const iso = timeStr.substring(0, 10);
        dy = parseInt(iso.slice(0, 4), 10);
        dm = parseInt(iso.slice(5, 7), 10);
        dd = parseInt(iso.slice(8, 10), 10);
      } else {
        const rawDate = draw.draw_date;
        if (rawDate) {
          const d = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(rawDate))
            ? new Date(String(rawDate).substring(0, 10) + 'T12:00:00Z')
            : new Date(rawDate as any);
          dy = d.getUTCFullYear(); dm = d.getUTCMonth() + 1; dd = d.getUTCDate();
        } else {
          const d = new Date();
          dy = d.getFullYear(); dm = d.getMonth() + 1; dd = d.getDate();
        }
      }
      currentPeriodDate = `${String(dd).padStart(2, '0')}-${String(dm).padStart(2, '0')}-${dy}`;

      let drawHour = 15;
      let drawMin = 0;
      if (timeStr.includes('T')) {
        const dt = new Date(timeStr);
        if (!isNaN(dt.getTime())) {
          drawHour = dt.getHours();
          drawMin = dt.getMinutes();
        }
      } else {
        const parts = timeStr.split(':').map(Number);
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          drawHour = parts[0];
          drawMin = parts[1];
        }
      }

      // 根据实际 draw_time 判断停售窗口：draw_time-5分钟 到 draw_time+60分钟
      // 同时将「系统认定的开奖日与时间」暴露给前端显示
      const confirmedDrawMins = drawHour * 60 + drawMin;
      confirmedDrawDay = `${String(dd).padStart(2, '0')}-${String(dm).padStart(2, '0')}-${dy}`;
      confirmedDrawTime = `${String(drawHour).padStart(2, '0')}:${String(drawMin).padStart(2, '0')}`;
      const panama = getPanamaNow();
      const todayStr = `${String(panama.d).padStart(2, '0')}-${String(panama.m).padStart(2, '0')}-${panama.y}`;
      const totalMins = panama.h * 60 + panama.min;

      const drawDateISO = `${dy}-${String(dm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      const todayISO = `${panama.y}-${String(panama.m).padStart(2, '0')}-${String(panama.d).padStart(2, '0')}`;
      const stopSaleStart = confirmedDrawMins - 5; // 开奖前 5 分钟停售
      const RESUME_MINS = 7 * 60; // 次日 07:00 恢复

      // 次日日期（YYYY-MM-DD）
      const drawDateObj = new Date(`${drawDateISO}T12:00:00`);
      drawDateObj.setDate(drawDateObj.getDate() + 1);
      const dayAfterISO = `${drawDateObj.getFullYear()}-${String(drawDateObj.getMonth() + 1).padStart(2, '0')}-${String(drawDateObj.getDate()).padStart(2, '0')}`;

      // 停售窗口：开奖日 draw_time-5min 起，到次日 07:00 止
      const inStopWindow =
        (drawDateISO === todayISO && totalMins >= stopSaleStart) ||
        (dayAfterISO === todayISO && totalMins < RESUME_MINS);

      if (inStopWindow) {
        canBet = false;
        isDrawWindow = true;
        minutesUntilDraw = undefined;
      } else {
        canBet = true;
        isDrawWindow = false;
        minutesUntilDraw = (drawDateISO === todayISO && totalMins < stopSaleStart)
          ? Math.max(0, stopSaleStart - totalMins)
          : undefined;
      }
    } else {
      // 无待开奖期（已发结果，等待次日07:00创建下一期）→ 停售
      const lastCompleted = await findNationalLastCompletedDraw(drawRepo);
      if (lastCompleted) {
        currentPeriodDate = BetStatusController.formatDrawPeriodDate(lastCompleted);
      }
      canBet = false;
      isDrawWindow = true;
    }

    let stopSellAt: number | undefined;
    if (minutesUntilDraw !== undefined) {
      stopSellAt = Date.now() + minutesUntilDraw * 60 * 1000;
    }

    const base = {
      status: 'ok' as const,
      canBet,
      minutesUntilDraw,
      stopSellAt,
      currentPeriodDate,
      isDrawWindow,
      confirmedDrawDay,
      confirmedDrawTime,
    };

    if (!shopId) {
      return base;
    }

    const sid = parseInt(shopId, 10);
    const shopRow = await this.dataSource.getRepository(Shop).findOne({ where: { shop_id: sid } });
    const localFlags = shopRow
      ? {
          ticaEnabled: !!shopRow.tica_enabled,
          nicaEnabled: !!shopRow.nica_enabled,
          acceptingTicaOrders: shopRow.accepting_tica_orders !== false,
          acceptingNicaOrders: shopRow.accepting_nica_orders !== false,
        }
      : {
          ticaEnabled: false,
          nicaEnabled: false,
          acceptingTicaOrders: false,
          acceptingNicaOrders: false,
        };

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const orders = await this.dataSource.getRepository(Order)
      .createQueryBuilder('order')
      .where('order.shop_id = :shopId', { shopId: sid })
      .andWhere('order.created_at >= :yesterday', { yesterday })
      .orderBy('order.created_at', 'DESC')
      .take(50)
      .getMany();

    return {
      ...base,
      ...localFlags,
      shop_id: sid,
      shopId: sid,
      orderCount: orders.length,
      orders: orders.map((o) => ({
        order_id: o.order_id,
        order_number: o.order_number,
        status: o.status,
        amount: o.amount,
      })),
    };
  }
}
