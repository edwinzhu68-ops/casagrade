import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { badBilingual, notFoundBilingual, unauthorizedBilingual } from '../../utils/api-bilingual';
import { DataSource } from 'typeorm';
import { Request } from 'express';
import * as crypto from 'crypto';
import { Order } from '../../entities/order.entity';
import { Shop } from '../../entities/shop.entity';
import { Draw } from '../../entities/draw.entity';
import { findShopPendingLocalDraw } from '../../utils/draw-queries';
import { getNextPeriodNoForScope } from '../../utils/draw-period-no';
import { withShopLock } from '../../utils/shop-order-lock';
import { SettlementService } from '../settlement/settlement.service';

export interface LocalCreateOrderDto {
  shopId?: number;
  shop_id?: number;
  /** TICA / NICA：结算规则相同（F/L 头二奖固定 + Chance 与 Lotería 一致），仅 lottery_type 与期次隔离 */
  lotteryKind: 'TICA' | 'NICA';
  numbers: { n: string; q: number }[];
  amount: number;
  gameType?: string;
  game_type?: string;
  clientId?: string;
  ipAddress?: string;
  idempotency_key?: string;
}

@Injectable()
export class LocalLotteryService {
  private readonly logger = new Logger(LocalLotteryService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly settlementService: SettlementService,
  ) {}

  /** 店主已开通 TICA/NICA 时顾客端才可下单；settle 滚下期时可跳过校验 */
  assertLocalFeatureForKind(shop: Shop | null, kind: 'TICA' | 'NICA'): void {
    if (!shop) throw notFoundBilingual('Tienda no encontrada.', '店铺不存在');
    if (kind === 'TICA' && !shop.tica_enabled) {
      throw badBilingual('TICA no está habilitado en esta tienda.', 'TICA 未开通');
    }
    if (kind === 'NICA' && !shop.nica_enabled) {
      throw badBilingual('NICA no está habilitado en esta tienda.', 'NICA 未开通');
    }
  }

  /** 获取或创建当前店 TICA/NICA 待开奖期 */
  async ensureShopPendingDraw(
    shopId: number,
    kind: 'TICA' | 'NICA',
    skipFeatureCheck = false,
  ): Promise<Draw> {
    if (!skipFeatureCheck) {
      const shop = await this.dataSource.getRepository(Shop).findOne({ where: { shop_id: shopId } });
      this.assertLocalFeatureForKind(shop, kind);
    }
    const drawRepo = this.dataSource.getRepository(Draw);
    let d = await findShopPendingLocalDraw(drawRepo, shopId, kind);
    if (d) return d;

    const panama = getPanamaYmd();
    const drawDateStr = `${panama.y}-${String(panama.m).padStart(2, '0')}-${String(panama.d).padStart(2, '0')}`;
    const periodNo = await getNextPeriodNoForScope(drawRepo, { shopId, lotteryType: kind });
    d = drawRepo.create({
      draw_date: drawDateStr as any,
      draw_time: '12:00:00',
      status: 'pending',
      winning_numbers: '',
      is_manual_override: false,
      lottery_type: kind,
      shop_id: shopId,
      period_no: periodNo,
    });
    await drawRepo.save(d);
    this.logger.log(`创建 ${kind} 新期 draw_id=${d.draw_id} period_no=${periodNo} shop_id=${shopId}`);
    return d;
  }

  async getCurrent(shopId: number, kind: 'TICA' | 'NICA') {
    const draw = await this.ensureShopPendingDraw(shopId, kind);
    const shop = await this.dataSource.getRepository(Shop).findOne({ where: { shop_id: shopId } });
    const customPeriod = kind === 'TICA'
      ? (shop as any)?.tica_custom_period ?? null
      : (shop as any)?.nica_custom_period ?? null;
    // 上一期 draw_id（按 period_no 找，避免 draw_id 跨彩种穿插不连续）
    let previousDrawId: number | null = null;
    if (draw.period_no != null) {
      const prevRow = await this.dataSource.getRepository(Draw)
        .createQueryBuilder('d')
        .select('d.draw_id', 'draw_id')
        .where('d.shop_id = :sid', { sid: shopId })
        .andWhere('d.lottery_type = :lt', { lt: kind })
        .andWhere('d.period_no < :pn', { pn: Number(draw.period_no) })
        .andWhere('d.status = :st', { st: 'completed' })
        .orderBy('d.period_no', 'DESC')
        .limit(1)
        .getRawOne();
      previousDrawId = prevRow?.draw_id != null ? Number(prevRow.draw_id) : null;
    }
    return {
      draw_id: draw.draw_id,
      period_no: draw.period_no,
      previousDrawId,
      custom_period: customPeriod,
      shop_id: shopId,
      lottery_type: kind,
      status: draw.status,
      draw_date: draw.draw_date,
      draw_time: draw.draw_time,
    };
  }

  async createOrder(dto: LocalCreateOrderDto, req: Request) {
    const shopId = dto.shopId ?? dto.shop_id;
    const kind = dto.lotteryKind;
    if (kind !== 'TICA' && kind !== 'NICA') {
      throw badBilingual('lotteryKind debe ser TICA o NICA.', 'lotteryKind 须为 TICA 或 NICA');
    }

    const numbers = dto.numbers;
    const amount = Number(dto.amount);
    const gameTypeValue = dto.gameType || dto.game_type;
    const clientId = dto.clientId;
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      (req.socket && req.socket.remoteAddress) ||
      dto.ipAddress ||
      '127.0.0.1';

    if (shopId == null || Number.isNaN(Number(shopId))) {
      throw badBilingual('Falta el ID de la tienda.', '缺少店铺ID');
    }
    if (!Array.isArray(numbers) || numbers.length === 0 || numbers.length > 500) {
      throw badBilingual(
        'Lista de números no válida o supera las 500 líneas.',
        '号码列表无效或超过500条',
      );
    }
    if (Number.isNaN(amount) || amount <= 0 || amount > 100000) {
      throw badBilingual('Monto no válido.', '金额无效');
    }
    for (const item of numbers) {
      if (typeof item.n !== 'string' || item.n.length > 10 || typeof item.q !== 'number' || item.q < 1 || item.q > 999) {
        throw badBilingual('Formato de número o cantidad no válido.', '号码或数量格式无效');
      }
    }

    const BILLETE_PRICE = 1.0;
    const CHANCE_PRICE = 0.25;
    let expectedAmount = 0;
    for (const item of numbers) {
      const numLen = String(item.n).replace(/\D/g, '').length;
      const price = numLen >= 4 ? BILLETE_PRICE : CHANCE_PRICE;
      expectedAmount += price * Number(item.q);
    }
    expectedAmount = Math.round(expectedAmount * 100) / 100;
    if (Math.abs(expectedAmount - amount) > 0.01) {
      throw badBilingual(
        `El monto no coincide: se esperaba $${expectedAmount}, se recibió $${amount}.`,
        `金额不符：期望 $${expectedAmount}，实际 $${amount}`,
      );
    }

    const idempotencyKey = (dto.idempotency_key || '').trim().substring(0, 64) || null;
    if (idempotencyKey) {
      const orderRepo0 = this.dataSource.getRepository(Order);
      const existing = await orderRepo0
        .createQueryBuilder('o')
        .where('o.idempotency_key = :k', { k: idempotencyKey })
        .andWhere('o.shop_id = :s', { s: Number(shopId) })
        .andWhere('o.lottery_type = :lt', { lt: kind })
        .andWhere('o.status != :canceled', { canceled: -1 })
        .getOne();
      if (existing) {
        this.logger.log(`${kind} 幂等重复请求，返回已有订单 #${existing.order_number}`);
        return {
          order_id: existing.order_id,
          order_number: existing.order_number,
          order_hash: existing.order_hash,
          verification_code: existing.verification_code,
          amount: existing.amount,
          status: existing.status,
          created_at: existing.created_at,
          lottery_type: kind,
          _idempotent: true,
        };
      }
    }

    const shop = await this.dataSource.getRepository(Shop).findOne({
      where: { shop_id: Number(shopId) },
    });
    if (!shop) throw notFoundBilingual('Tienda no encontrada.', '店铺不存在');
    if (shop.status !== 'active') {
      throw badBilingual('La tienda no está activa.', '店铺已停业');
    }

    const expiresAt = (shop as any).subscription_expires_at;
    if (!expiresAt || new Date(expiresAt) < new Date()) {
      throw badBilingual(
        'Su suscripción ha vencido o no está activa. Contacte al administrador para renovar.',
        '订阅已过期或未充值，请联系管理员。',
      );
    }

    this.assertLocalFeatureForKind(shop, kind);

    if (kind === 'TICA' && (shop as any).accepting_tica_orders === false) {
      throw badBilingual('TICA: la tienda no acepta pedidos en este momento.', 'TICA 接单已关闭');
    }
    if (kind === 'NICA' && (shop as any).accepting_nica_orders === false) {
      throw badBilingual('NICA: la tienda no acepta pedidos en este momento.', 'NICA 接单已关闭');
    }

    const currentDraw = await this.ensureShopPendingDraw(Number(shopId), kind, true);
    // TICA/NICA 独立限额，null 时 fallback 到通用限额
    const limitChance = (kind === 'TICA'
      ? ((shop as any).tica_limit_chance ?? (shop as any).limit_chance)
      : kind === 'NICA'
        ? ((shop as any).nica_limit_chance ?? (shop as any).limit_chance)
        : (shop as any).limit_chance) as number | null;
    const limitBillete = (kind === 'TICA'
      ? ((shop as any).tica_limit_palet ?? (shop as any).limit_billete)
      : kind === 'NICA'
        ? ((shop as any).nica_limit_palet ?? (shop as any).limit_billete)
        : (shop as any).limit_billete) as number | null;

    return withShopLock(Number(shopId), async () => {
      if (limitChance != null || limitBillete != null) {
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
          soldRows.map((r) => [r.num, Number(r.qty)]),
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
          throw new BadRequestException({
            message: 'Algunos números superan el límite de ventas.',
            messageZh: '部分号码超出限额',
            overLimitItems,
          });
        }
      }

      const orderNumber = this.generateOrderNumber();
      const orderHash = crypto.createHash('sha256').update(orderNumber + Date.now()).digest('hex').substring(0, 64);
      const verificationCode = this.generateVerificationCode();

      const orderRepo = this.dataSource.getRepository(Order);
      const orderData: any = {
        order_number: orderNumber,
        order_hash: orderHash,
        shop_id: Number(shopId),
        numbers,
        amount,
        game_type: gameTypeValue,
        lottery_type: kind,
        status: 0,
        verification_code: verificationCode,
        customer_info: { clientId },
        ip_address: ipAddress,
        draw_id: currentDraw.draw_id,
      };
      if (idempotencyKey) orderData.idempotency_key = idempotencyKey;
      const order = orderRepo.create(orderData) as unknown as Order;
      await orderRepo.save(order);

      this.logger.log(`${kind} 订单创建: #${orderNumber}, 店铺: ${shopId}, 金额: $${amount}`);

      return {
        order_id: order.order_id,
        order_number: order.order_number,
        order_hash: order.order_hash,
        verification_code: order.verification_code,
        amount: order.amount,
        status: 0,
        created_at: order.created_at,
        lottery_type: kind,
        draw_id: currentDraw.draw_id,
      };
    });
  }

  /**
   * 写入开奖号码、结算当期、标记完成，并创建下一期待开奖期
   */
  async settleAndRollNext(
    shopId: number,
    kind: 'TICA' | 'NICA',
    n1: string,
    n2: string,
    n3: string,
  ) {
    const norm = (v: string) => String(v ?? '').replace(/\D/g, '').slice(-2).padStart(2, '0');
    const a = norm(n1);
    const b = norm(n2);
    const c = norm(n3);
    if (!/^\d{2}$/.test(a) || !/^\d{2}$/.test(b) || !/^\d{2}$/.test(c)) {
      throw badBilingual('n1, n2 y n3 deben ser dos dígitos válidos.', 'n1、n2、n3 须为两位有效数字');
    }

    return withShopLock(shopId, async () => {
      const drawRepo = this.dataSource.getRepository(Draw);
      const pending = await findShopPendingLocalDraw(drawRepo, shopId, kind);
      if (!pending) {
        throw badBilingual('No hay sorteo TICA/NICA pendiente.', '没有待开奖的 TICA/NICA 期次');
      }

      const winningJson = JSON.stringify({ n1: a, n2: b, n3: c });
      await drawRepo.update(pending.draw_id, { winning_numbers: winningJson } as any);

      const stats = await this.settlementService.settleShopLotteryDraw(pending.draw_id);

      const next = await this.ensureShopPendingDraw(shopId, kind, true);

      return {
        settled_draw_id: pending.draw_id,
        next_draw_id: next.draw_id,
        winning_numbers: { n1: a, n2: b, n3: c },
        ...stats,
      };
    });
  }

  async assertShopOwner(shopId: number, operatorUserId: number): Promise<Shop> {
    const shop = await this.dataSource.getRepository(Shop).findOne({ where: { shop_id: shopId } });
    if (!shop) throw notFoundBilingual('Tienda no encontrada.', '店铺不存在');
    if (shop.owner_id !== operatorUserId) {
      throw unauthorizedBilingual('No tiene permiso para operar esta tienda.', '无权操作该店铺');
    }
    return shop;
  }

  async patchAccepting(
    shopId: number,
    body: { acceptingTicaOrders?: boolean; acceptingNicaOrders?: boolean },
    operatorUserId: number,
  ) {
    const shopRepo = this.dataSource.getRepository(Shop);
    const shop = await this.assertShopOwner(shopId, operatorUserId);
    if (body.acceptingTicaOrders !== undefined) {
      (shop as any).accepting_tica_orders = !!body.acceptingTicaOrders;
    }
    if (body.acceptingNicaOrders !== undefined) {
      (shop as any).accepting_nica_orders = !!body.acceptingNicaOrders;
    }
    await shopRepo.save(shop);
    return {
      success: true,
      accepting_tica_orders: (shop as any).accepting_tica_orders,
      accepting_nica_orders: (shop as any).accepting_nica_orders,
    };
  }

  /**
   * 店主：开通/关闭顾客端 TICA、NICA（他国彩票品种），并可一并更新接单开关
   */
  /**
   * 店主登录后修改 TICA/NICA 订单号码与数量（原单更新，不换单号；金额按票价重算）。
   * 仅 status 0/1；限额校验时排除本单原销量。
   */
  async updateMerchantOrderLines(
    orderNumber: string,
    shopId: number,
    numbers: { n: string; q: number }[],
    operatorUserId: number,
  ) {
    await this.assertShopOwner(shopId, operatorUserId);
    const orderRepo = this.dataSource.getRepository(Order);
    const shopRepo = this.dataSource.getRepository(Shop);
    const shopRow = await shopRepo.findOne({ where: { shop_id: shopId } });
    if (!shopRow) throw notFoundBilingual('Tienda no encontrada.', '店铺不存在');

    if (!Array.isArray(numbers) || numbers.length === 0 || numbers.length > 500) {
      throw badBilingual(
        'Lista de números no válida o supera las 500 líneas.',
        '号码列表无效或超过500条',
      );
    }
    for (const item of numbers) {
      if (typeof item.n !== 'string' || item.n.length > 10 || typeof item.q !== 'number' || item.q < 1 || item.q > 999) {
        throw badBilingual('Formato de número o cantidad no válido.', '号码或数量格式无效');
      }
    }
    const amount = this.computeExpectedAmountFromLines(numbers);
    if (Number.isNaN(amount) || amount <= 0 || amount > 100000) {
      throw badBilingual('Monto no válido.', '金额无效');
    }

    return withShopLock(shopId, async () => {
      const order = await orderRepo.findOne({ where: { order_number: orderNumber } });
      if (!order) throw notFoundBilingual('Pedido no encontrado.', '订单不存在');
      if (order.shop_id !== shopId) {
        throw badBilingual('No permitido.', '无权操作其他店铺的订单');
      }
      const kind = String((order as any).lottery_type || '').toUpperCase();
      if (kind !== 'TICA' && kind !== 'NICA') {
        throw badBilingual('Tipo de pedido incorrecto.', '订单类型不支持此修改');
      }
      if (order.status !== 0 && order.status !== 1) {
        throw badBilingual(
          'Solo se pueden editar pedidos pendientes o pagados sin sorteo.',
          '仅待付款或已付款（未开奖结算）的订单可修改号码',
        );
      }

      this.assertLocalFeatureForKind(shopRow, kind as 'TICA' | 'NICA');

      if (order.draw_id == null) {
        throw badBilingual('Pedido sin sorteo asignado.', '订单缺少期次，无法修改');
      }

      // TICA/NICA 独立限额，null 时 fallback 到通用限额
      const limitChance = (kind === 'TICA'
        ? ((shopRow as any).tica_limit_chance ?? (shopRow as any).limit_chance)
        : kind === 'NICA'
          ? ((shopRow as any).nica_limit_chance ?? (shopRow as any).limit_chance)
          : (shopRow as any).limit_chance) as number | null;
      const limitBillete = (kind === 'TICA'
        ? ((shopRow as any).tica_limit_palet ?? (shopRow as any).limit_billete)
        : kind === 'NICA'
          ? ((shopRow as any).nica_limit_palet ?? (shopRow as any).limit_billete)
          : (shopRow as any).limit_billete) as number | null;

      if (limitChance != null || limitBillete != null) {
        const dbType = (this.dataSource.options as any).type as string;
        let soldRows: { num: string; qty: string }[] = [];
        if (dbType === 'postgres') {
          soldRows = await this.dataSource.query(
            `SELECT item->>'n' AS num, SUM((item->>'q')::int) AS qty
             FROM orders, jsonb_array_elements(numbers::jsonb) AS item
             WHERE draw_id = $1 AND shop_id = $2 AND status != -1 AND order_id <> $3
             GROUP BY item->>'n'`,
            [order.draw_id, order.shop_id, order.order_id],
          );
        } else {
          soldRows = await this.dataSource.query(
            `SELECT json_extract(value, '$.n') AS num,
                    SUM(CAST(json_extract(value, '$.q') AS INTEGER)) AS qty
             FROM orders, json_each(numbers)
             WHERE draw_id = ? AND shop_id = ? AND status != -1 AND order_id != ?
             GROUP BY json_extract(value, '$.n')`,
            [order.draw_id, order.shop_id, order.order_id],
          );
        }
        const soldMap: Record<string, number> = Object.fromEntries(
          soldRows.map((r) => [r.num, Number(r.qty)]),
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
          throw new BadRequestException({
            message: 'Algunos números superan el límite de ventas.',
            messageZh: '部分号码超出限额',
            overLimitItems,
          });
        }
      }

      const gameType = inferLocalGameTypeFromNumbers(numbers);
      await orderRepo.update(order.order_id, {
        numbers,
        amount,
        game_type: gameType,
        win_amount: 0,
        win_breakdown: null,
        updated_at: new Date(),
      } as any);

      this.logger.log(`${kind} 订单修改: #${order.order_number}, 店铺: ${shopId}, 新金额: $${amount}`);
      return {
        success: true,
        order_number: order.order_number,
        amount,
        numbers,
        game_type: gameType,
        lottery_type: kind,
      };
    });
  }

  private computeExpectedAmountFromLines(numbers: { n: string; q: number }[]): number {
    const BILLETE_PRICE = 1.0;
    const CHANCE_PRICE = 0.25;
    let expectedAmount = 0;
    for (const item of numbers) {
      const numLen = String(item.n).replace(/\D/g, '').length;
      const price = numLen >= 4 ? BILLETE_PRICE : CHANCE_PRICE;
      expectedAmount += price * Number(item.q);
    }
    return Math.round(expectedAmount * 100) / 100;
  }

  async patchShopSettings(
    shopId: number,
    body: {
      ticaEnabled?: boolean;
      nicaEnabled?: boolean;
      acceptingTicaOrders?: boolean;
      acceptingNicaOrders?: boolean;
    },
    operatorUserId: number,
  ) {
    const shopRepo = this.dataSource.getRepository(Shop);
    const shop = await this.assertShopOwner(shopId, operatorUserId);
    if (body.ticaEnabled !== undefined) shop.tica_enabled = !!body.ticaEnabled;
    if (body.nicaEnabled !== undefined) shop.nica_enabled = !!body.nicaEnabled;
    if (body.acceptingTicaOrders !== undefined) {
      (shop as any).accepting_tica_orders = !!body.acceptingTicaOrders;
    }
    if (body.acceptingNicaOrders !== undefined) {
      (shop as any).accepting_nica_orders = !!body.acceptingNicaOrders;
    }
    await shopRepo.save(shop);
    return {
      success: true,
      tica_enabled: shop.tica_enabled,
      nica_enabled: shop.nica_enabled,
      accepting_tica_orders: shop.accepting_tica_orders,
      accepting_nica_orders: shop.accepting_nica_orders,
    };
  }

  private generateOrderNumber(): string {
    const ts = Date.now().toString();
    const rand = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `ORD${ts.slice(-8)}${rand}`;
  }

  private generateVerificationCode(): string {
    return Math.floor(10000 + Math.random() * 90000).toString();
  }
}

const PANAMA_TZ = 'America/Panama';

function inferLocalGameTypeFromNumbers(numbers: { n: string; q: number }[]): string {
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

function getPanamaYmd(): { y: number; m: number; d: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PANAMA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
  return { y: get('year'), m: get('month'), d: get('day') };
}
