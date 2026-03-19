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

  constructor(private readonly dataSource: DataSource) {}

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

    // 2. 获取当前待开奖期次
    const drawRepo = this.dataSource.getRepository(Draw);
    const currentDraw = await drawRepo.findOne({
      where: { status: 'pending' },
      order: { draw_id: 'DESC' },
    });

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

    // 2b. 每号限额校验（仅当限额已设置且有当期）
    const limitChance = (shop as any).limit_chance as number | null;
    const limitBillete = (shop as any).limit_billete as number | null;
    if (currentDraw && (limitChance != null || limitBillete != null)) {
      // 用数据库聚合代替加载全部订单到内存：让DB统计每个号码的已售总量
      const dbType = (this.dataSource.options as any).type as string;
      let soldRows: { num: string; qty: string }[] = [];
      if (dbType === 'postgres') {
        soldRows = await this.dataSource.query(
          `SELECT item->>'n' AS num, SUM((item->>'q')::int) AS qty
           FROM orders, jsonb_array_elements(numbers::jsonb) AS item
           WHERE draw_id = $1 AND status != -1
           GROUP BY item->>'n'`,
          [currentDraw.draw_id],
        );
      } else {
        soldRows = await this.dataSource.query(
          `SELECT json_extract(value, '$.n') AS num,
                  SUM(CAST(json_extract(value, '$.q') AS INTEGER)) AS qty
           FROM orders, json_each(numbers)
           WHERE draw_id = ? AND status != -1
           GROUP BY json_extract(value, '$.n')`,
          [currentDraw.draw_id],
        );
      }
      const soldMap: Record<string, number> = Object.fromEntries(
        soldRows.map(r => [r.num, Number(r.qty)]),
      );

      // 校验本次下单每个号码，收集所有超限号码
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
   * GET /api/orders/:orderNumber - 查询订单
   */
  @Get(':orderNumber')
  async getOrder(@Param('orderNumber') orderNumber: string) {
    const order = await this.dataSource.getRepository(Order).findOne({
      where: { order_number: orderNumber },
      relations: ['shop'],
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
      status: statusMap[order.status] || 'pending',
      verification_code: order.verification_code,
      shopId: order.shop_id,
      shopNumber: order.shop?.shop_number,
      win_amount: order.win_amount,
      win_breakdown: (order as any).win_breakdown ?? null,
      redeemed_at: (order as any).redeemed_at ?? null,
      created_at: order.created_at,
      paid_at: order.paid_at,
    };
  }

  /**
   * POST /api/orders/:orderNumber/confirm - 老板确认收款
   */
  @Post(':orderNumber/confirm')
  async confirmOrder(@Param('orderNumber') orderNumber: string, @Body() body: { shopId: number }) {
    const orderRepo = this.dataSource.getRepository(Order);
    const order = await orderRepo.findOne({
      where: { order_number: orderNumber },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    // 检查30分钟超时
    const createdAt = new Date(order.created_at);
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const THIRTY_MIN = 30 * 60 * 1000;

    if (order.status !== 0) {
      if (order.status === 1) {
        return { success: true, message: '订单已确认付款' };
      }
      throw new BadRequestException('订单状态不是待支付');
    }

    // 检查30分钟超时
    if (diffMs > THIRTY_MIN) {
      await orderRepo.update(order.order_id, {
        status: -1, // Canceled
        canceled_at: new Date(),
      } as any);
      throw new BadRequestException('订单已超过30分钟未支付，已自动取消');
    }

    // 若订单没有归属期（draw_id 为空），归入当前待开奖期，以便老板端「本期订单」正确统计
    const drawRepo = this.dataSource.getRepository(Draw);
    const currentDraw = await drawRepo.findOne({
      where: { status: 'pending' },
      order: { draw_id: 'DESC' },
    });
    const updatePayload: any = {
      status: 1, // Paid
      paid_at: new Date(),
    };
    if (order.draw_id == null && currentDraw?.draw_id != null) {
      updatePayload.draw_id = currentDraw.draw_id;
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
  ) {
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

/**
 * 店铺Controller - 处理店铺相关接口
 */
@Controller('shop')
export class ShopController {
  private readonly logger = new Logger(ShopController.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * GET /api/shop/:shopNumber - 通过店号查询店铺
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
      },
    };
  }

  /**
   * PATCH /api/shop/:shopId/limits - 保存每号销售限额
   */
  @Patch(':shopId/limits')
  async updateShopLimits(
    @Param('shopId') shopId: string,
    @Body() body: { limitChance?: number | null; limitBillete?: number | null },
  ) {
    const shopRepo = this.dataSource.getRepository(Shop);
    const shop = await shopRepo.findOne({ where: { shop_id: parseInt(shopId, 10) } });
    if (!shop) throw new NotFoundException('店铺不存在');
    if (body.limitChance !== undefined) (shop as any).limit_chance = body.limitChance || null;
    if (body.limitBillete !== undefined) (shop as any).limit_billete = body.limitBillete || null;
    await shopRepo.save(shop);
    return { success: true, limit_chance: (shop as any).limit_chance, limit_billete: (shop as any).limit_billete };
  }

  /**
   * GET /api/shop/:shopId/orders - 获取店铺订单列表
   */
  @Get(':shopId/orders')
  async getShopOrders(
    @Param('shopId') shopId: string,
    @Query('limit') limit: string = '100',
    @Query('status') status?: string,
    @Query('suffix') suffix?: string,
    @Query('drawId') drawId?: string,
  ) {
    const shopRepo = this.dataSource.getRepository(Shop);
    const orderRepo = this.dataSource.getRepository(Order);

    const shop = await shopRepo.findOne({
      where: { shop_id: parseInt(shopId) },
    });

    if (!shop) {
      throw new NotFoundException('店铺不存在');
    }

    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    const query = orderRepo.createQueryBuilder('order')
      .where('order.shop_id = :shopId', { shopId: parseInt(shopId, 10) })
      .orderBy('order.created_at', 'DESC')
      .take(limitNum);

    if (drawId && Number(drawId) > 0) {
      query.andWhere('order.draw_id = :drawId', { drawId: Number(drawId) });
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

    // 按订单号后几位筛选（用于老板输入后四位数选单兑奖）：只返回已中奖且未兑奖
    if (suffix && suffix.trim()) {
      const safe = String(suffix.trim()).replace(/%/g, '\\%').replace(/_/g, '\\_');
      query.andWhere('order.order_number LIKE :suffixPattern', { suffixPattern: '%' + safe });
      query.andWhere('order.status = 3');
      query.andWhere('order.redeemed_at IS NULL');
    }

    const orders = await query.getMany();

    // 兼容前端格式
    const statusMap: { [key: number]: string } = {
      0: 'pending',
      1: 'paid',
      2: 'settled',
      3: 'won',
      [-1]: 'canceled',
    };

    return {
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
        status: statusMap[order.status] || 'pending',
        draw_id: order.draw_id ?? null,
        win_amount: order.win_amount,
        win_breakdown: (order as any).win_breakdown ?? null,
        redeemed_at: (order as any).redeemed_at ?? null,
        verification_code: order.verification_code,
        created_at: order.created_at,
        paid_at: order.paid_at,
      })),
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
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
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
    // 优先查 pending，没有则查最新的 completed（用于显示最近开奖时间）
    let draw = await drawRepo.findOne({
      where: { status: 'pending' },
      order: { draw_id: 'DESC' },
    });
    if (!draw) {
      draw = await drawRepo.findOne({
        where: { status: 'completed' },
        order: { draw_id: 'DESC' },
      });
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
      const lastCompleted = await drawRepo.findOne({
        where: { status: 'completed' },
        order: { draw_id: 'DESC' },
      });
      if (lastCompleted) {
        currentPeriodDate = BetStatusController.formatDrawPeriodDate(lastCompleted);
      }
      canBet = false;
      isDrawWindow = true;
    }

    const base = {
      status: 'ok' as const,
      canBet,
      minutesUntilDraw,
      currentPeriodDate,
      isDrawWindow,
      confirmedDrawDay,
      confirmedDrawTime,
    };

    if (!shopId) {
      return base;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const orders = await this.dataSource.getRepository(Order)
      .createQueryBuilder('order')
      .where('order.shop_id = :shopId', { shopId: parseInt(shopId) })
      .andWhere('order.created_at >= :yesterday', { yesterday })
      .orderBy('order.created_at', 'DESC')
      .take(50)
      .getMany();

    return {
      ...base,
      shopId: parseInt(shopId),
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
