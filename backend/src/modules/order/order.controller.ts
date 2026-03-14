import { Controller, Post, Get, Param, Body, Inject, Logger, Query, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { Shop } from '../../entities/shop.entity';
import { Draw } from '../../entities/draw.entity';
import * as crypto from 'crypto';

interface CreateOrderDto {
  shopId?: number;
  shop_id?: number;
  numbers: { n: string; q: number }[];
  amount: number;
  gameType?: string;
  game_type?: string;
  clientId?: string;
  ipAddress?: string;
}

@Controller('orders')
export class OrderController {
  private readonly logger = new Logger(OrderController.name);

  constructor(private readonly dataSource: DataSource) {}

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

    // 3. 生成订单号和hash
    const orderNumber = this.generateOrderNumber();
    const orderHash = crypto.createHash('sha256').update(orderNumber + Date.now()).digest('hex').substring(0, 64);

    // 4. 生成核销码（5位数字）
    const verificationCode = this.generateVerificationCode();

    // 5. 创建订单
    const orderRepo = this.dataSource.getRepository(Order);
    const order = orderRepo.create({
      order_number: orderNumber,
      order_hash: orderHash,
      shop_id: Number(shopId),
      numbers,
      amount,
      game_type: gameTypeValue,
      status: 0, // 0:未付款
      verification_code: verificationCode,
      customer_info: { clientId },
      ip_address: ipAddress,
      draw_id: currentDraw?.draw_id || null,
    });

    await orderRepo.save(order);

    this.logger.log(`订单创建: #${orderNumber}, 店铺: ${shopId}, 金额: $${amount}`);

    return {
      order_id: order.order_id,
      order_number: order.order_number,
      order_hash: order.order_hash,
      verification_code: order.verification_code,
      amount: order.amount,
      status: 0,
    };
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
      status: statusMap[order.status] || 'pending',
      verification_code: order.verification_code,
      shopId: order.shop_id,
      shopNumber: order.shop?.shop_number,
      win_amount: order.win_amount,
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

    if (diffMs > THIRTY_MIN) {
      await orderRepo.update(order.order_id, {
        status: -1, // Canceled
        canceled_at: new Date(),
      } as any);
      throw new BadRequestException('订单已超过30分钟未支付，已自动取消');
    }

    if (order.status !== 0) {
      throw new BadRequestException('订单状态不是待支付');
    }

    // 更新为已支付
    await orderRepo.update(order.order_id, {
      status: 1, // Paid
      paid_at: new Date(),
    });

    this.logger.log(`订单确认: #${order.order_number}, 店铺: ${body.shopId}`);

    return {
      success: true,
      order_id: order.order_id,
      order_number: order.order_number,
      status: 'paid',
    };
  }

  /**
   * POST /api/orders/:orderNumber/redeem - 老板兑奖（本店、已中奖、未兑奖即可；平台不防老板，可扫码或手动选单/输入订单号）
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
      throw new BadRequestException('该订单不属于本店，无法兑奖');
    }
    if (order.status !== 3) {
      throw new BadRequestException(order.status === 1 ? '尚未开奖，无法兑奖' : '该订单未中奖或状态异常');
    }
    if ((order as any).redeemed_at) {
      throw new BadRequestException('该订单已兑奖，请勿重复操作');
    }

    await orderRepo.update(order.order_id, {
      redeemed_at: new Date(),
    } as any);

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
    const shop = await this.dataSource.getRepository(Shop).findOne({
      where: { shop_number: shopNumber },
    });

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
      },
    };
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
        order_number: order.order_number,
        order_hash: order.order_hash,
        numbers: order.numbers,
        amount: order.amount,
        game_type: order.game_type,
        status: statusMap[order.status] || 'pending',
        win_amount: order.win_amount,
        redeemed_at: (order as any).redeemed_at ?? null,
        verification_code: order.verification_code,
        created_at: order.created_at,
        paid_at: order.paid_at,
      })),
    };
  }
}

/**
 * 下注状态Controller
 */
@Controller('bet-status')
export class BetStatusController {
  private readonly logger = new Logger(BetStatusController.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * GET /api/bet-status - 获取下注状态（轮询用）
   */
  @Get()
  async getBetStatus(@Query('shopId') shopId: string) {
    // 获取最新的待开奖期次
    const draw = await this.dataSource.getRepository(Draw).findOne({
      where: { status: 'pending' },
      order: { draw_id: 'DESC' },
    });

    let canBet = true;
    let minutesUntilDraw: number | undefined;

    if (draw && draw.draw_time) {
      const now = new Date();
      const timeStr = String(draw.draw_time).trim();
      let hours = 15;
      let minutes = 0;
      // 支持 "15:00" / "15:00:00" 或 "2026-03-13T15:00:00"
      if (timeStr.includes('T')) {
        const dt = new Date(timeStr);
        if (!isNaN(dt.getTime())) {
          hours = dt.getHours();
          minutes = dt.getMinutes();
        }
      } else {
        const parts = timeStr.split(':').map(Number);
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          hours = parts[0];
          minutes = parts[1];
        }
      }
      const drawDate = draw.draw_date ? new Date(draw.draw_date) : new Date();
      drawDate.setHours(hours, minutes, 0, 0);
      if (drawDate < now) {
        drawDate.setDate(drawDate.getDate() + 1);
      }
      const diffMs = drawDate.getTime() - now.getTime();
      minutesUntilDraw = Math.floor(diffMs / 60000);
      if (minutesUntilDraw < 0) minutesUntilDraw = 0;
      if (minutesUntilDraw <= 5) {
        canBet = false;
      }
    }

    if (!shopId) {
      return { status: 'ok', canBet, minutesUntilDraw };
    }

    // 获取该店铺最近24小时内的订单
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
      status: 'ok',
      canBet,
      minutesUntilDraw,
      shopId: parseInt(shopId),
      orderCount: orders.length,
      orders: orders.map(o => ({
        order_id: o.order_id,
        order_number: o.order_number,
        status: o.status,
        amount: o.amount,
      })),
    };
  }
}
