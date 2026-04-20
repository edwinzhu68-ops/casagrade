// ============================================
// 巴拿马 Loteria 结算服务 (适配现有实体)
// ============================================

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { Shop } from '../../entities/shop.entity';
import { Draw } from '../../entities/draw.entity';

// 开奖结果类型
interface DrawResult {
  primer: string;
  segundo: string;
  tercero: string;
}

// Billete 赔付结果
interface BilleteResult {
  matches: string[];
  totalPayout: number;
}

// Chance 赔付结果
interface ChanceResult {
  matches: string[];
  totalPayout: number;
}

/** 店内彩开奖号码 N1 N2 N3（两位） */
export interface WinningN123 {
  n1: string;
  n2: string;
  n3: string;
}

/** TICA / NICA 共用固定 Billete 奖金（方案迭代，不入库） */
const SHOP_LOCAL_BILLETE_HEAD = 1000;
const SHOP_LOCAL_BILLETE_SECOND = 200;

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    @InjectRepository(Draw)
    private readonly drawRepo: Repository<Draw>,
  ) {}

  /**
   * 结算指定期次
   * status: 0=未付款 1=已付款 2=已开奖 3=已中奖
   */
  async settleDraw(drawId: number): Promise<{
    totalOrders: number;
    totalSales: number;
    totalPayout: number;
    wins: number;
    results: any[];
  }> {
    const draw = await this.drawRepo.findOne({
      where: { draw_id: drawId },
    });

    if (!draw) {
      throw new Error('开奖期次不存在');
    }

    // 解析开奖结果
    const winning = this.parseDrawResult(draw);
    this.logger.log(`开奖结果: ${winning.primer} ${winning.segundo} ${winning.tercero}`);

    // 查找已付款订单
    const orders = await this.orderRepo.find({
      where: { status: 1, draw_id: drawId },
    });

    // 加载所有涉及的店铺，获取自定义赔率
    const shopIds = [...new Set(orders.map(o => o.shop_id))];
    const shops = shopIds.length > 0 ? await this.shopRepo.findByIds(shopIds) : [];
    const shopMap = new Map<number, Shop>(shops.map(s => [s.shop_id, s]));

    const results = {
      totalOrders: orders.length,
      totalSales: 0,
      totalPayout: 0,
      wins: 0,
      results: [] as any[],
    };

    // 先统计所有订单结算结果（无副作用）
    for (const order of orders) {
      const shop = shopMap.get(order.shop_id) ?? null;
      const orderResult = this.settleOrderWithDrawResult(order, winning, shop);
      results.results.push(orderResult);
      results.totalSales += orderResult.sales;
      results.totalPayout += orderResult.payout;
      if (orderResult.payout > 0) results.wins++;
    }

    // 用事务包装所有写操作，失败自动回滚
    await this.dataSource.transaction(async (manager) => {
      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        const orderResult = results.results[i];
        const nowTs = new Date();
        await manager.update(Order, order.order_id, {
          status: orderResult.payout > 0 ? 3 : 2, // 3=已中奖 2=已开奖
          win_amount: orderResult.payout,
          win_breakdown: orderResult.wins,
          settled_at: nowTs,
          updated_at: nowTs,
        } as any);
      }
      // 更新开奖期次状态（统一小写）
      await manager.update(Draw, drawId, { status: 'completed' as any });
    });

    this.logger.log(`结算完成: ${results.totalOrders}单, 销售额$${results.totalSales}, 赔付$${results.totalPayout}, 中奖${results.wins}单`);

    return results;
  }

  /**
   * 店内 TICA/NICA：写入 N1N2N3 后对指定期次结算，并完成该期、创建下一期待开奖
   */
  async settleShopLotteryDraw(drawId: number): Promise<{
    totalOrders: number;
    totalSales: number;
    totalPayout: number;
    wins: number;
    results: any[];
  }> {
    const draw = await this.drawRepo.findOne({ where: { draw_id: drawId } });
    if (!draw) throw new Error('开奖期次不存在');
    const lt = String((draw as any).lottery_type || 'NACIONAL').toUpperCase();
    if (lt !== 'TICA' && lt !== 'NICA') {
      throw new Error('该期次不是店内彩');
    }
    if (draw.status !== 'pending') {
      throw new Error('该期次已结算或状态异常');
    }
    const n123 = this.parseWinningN123(draw.winning_numbers);
    const winning = this.drawResultFromN123(n123);

    const orders = await this.orderRepo.find({
      where: { status: 1, draw_id: drawId },
    });

    // 加载店铺获取自定义 Chance 赔率（TICA/NICA Billete 保持固定额）
    const shopIds = [...new Set(orders.map(o => o.shop_id))];
    const shops = shopIds.length > 0 ? await this.shopRepo.findByIds(shopIds) : [];
    const shopMap = new Map<number, Shop>(shops.map(s => [s.shop_id, s]));

    const results = {
      totalOrders: orders.length,
      totalSales: 0,
      totalPayout: 0,
      wins: 0,
      results: [] as any[],
    };

    // 方案迭代：TICA 与 NICA 结算完全相同（F/L 头二奖固定额 + Chance 与 Lotería 同逻辑）
    for (const order of orders) {
      const shop = shopMap.get(order.shop_id) ?? null;
      const orderResult = this.settleTicaNicaOrder(order, n123, winning, shop);
      results.results.push(orderResult);
      results.totalSales += orderResult.sales;
      results.totalPayout += orderResult.payout;
      if (orderResult.payout > 0) results.wins++;
    }

    await this.dataSource.transaction(async (manager) => {
      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        const orderResult = results.results[i];
        const nowTs = new Date();
        await manager.update(Order, order.order_id, {
          status: orderResult.payout > 0 ? 3 : 2,
          win_amount: orderResult.payout,
          win_breakdown: orderResult.wins,
          settled_at: nowTs,
          updated_at: nowTs,
        } as any);
      }
      await manager.update(Draw, drawId, { status: 'completed' } as any);
      // TICA/NICA 开奖后自动取消该期所有未付款订单(status=0 → status=-1)
      const cancelTs = new Date();
      const cancelResult = await manager
        .createQueryBuilder()
        .update(Order)
        .set({ status: -1, canceled_at: cancelTs, updated_at: cancelTs } as any)
        .where('draw_id = :drawId AND status = 0', { drawId })
        .execute();
      if (cancelResult.affected && cancelResult.affected > 0) {
        this.logger.log(`[${lt}] 自动取消 ${cancelResult.affected} 笔未付款订单 draw_id=${drawId}`);
      }
    });

    this.logger.log(
      `[${lt}] 店内结算完成 draw_id=${drawId}: ${results.totalOrders}单, 赔付$${results.totalPayout}`,
    );
    return results;
  }

  /**
   * 解析 winning_numbers 中的 n1/n2/n3（兼容 JSON 字符串）
   */
  parseWinningN123(raw: string | null | undefined): WinningN123 {
    if (raw == null || String(raw).trim() === '') {
      throw new Error('缺少开奖号码 n1/n2/n3');
    }
    let obj: any = raw;
    if (typeof raw === 'string') {
      try {
        obj = JSON.parse(raw);
      } catch {
        throw new Error('开奖号码格式无效');
      }
    }
    const pad2 = (v: unknown) => {
      const d = String(v ?? '').replace(/\D/g, '');
      if (d.length === 0) return '';
      return d.slice(-2).padStart(2, '0');
    };
    const n1 = pad2(obj?.n1);
    const n2 = pad2(obj?.n2);
    const n3 = pad2(obj?.n3);
    if (!/^\d{2}$/.test(n1) || !/^\d{2}$/.test(n2) || !/^\d{2}$/.test(n3)) {
      throw new Error('n1/n2/n3 须为两位数字');
    }
    return { n1, n2, n3 };
  }

  /** N1N2N3 → 与全国 Chance/Billete 后两位逻辑一致的 DrawResult */
  drawResultFromN123(n: WinningN123): DrawResult {
    return {
      primer: n.n1,
      segundo: n.n2,
      tercero: n.n3,
    };
  }

  /**
   * 结算单个订单（仅全国 NACIONAL：Lotería Billete 阶梯 + Chance）
   */
  private settleOrderWithDrawResult(order: Order, winning: DrawResult, shop: Shop | null = null): {
    orderId: number;
    gameType: string;
    sales: number;
    payout: number;
    wins: any[];
  } {
    const numbers = order.numbers as { n: string; q: number }[];
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return { orderId: order.order_id, gameType: order.game_type || '', sales: Number(order.amount), payout: 0, wins: [] };
    }
    const gameType = order.game_type;
    const sales = Number(order.amount);

    const exactRates: [number, number, number] = [
      shop?.rate_billete_1 != null ? Number(shop.rate_billete_1) : 2000,
      shop?.rate_billete_2 != null ? Number(shop.rate_billete_2) : 600,
      shop?.rate_billete_3 != null ? Number(shop.rate_billete_3) : 300,
    ];
    const chanceRates: [number, number, number] = [
      shop?.rate_chance_1 != null ? Number(shop.rate_chance_1) : 14,
      shop?.rate_chance_2 != null ? Number(shop.rate_chance_2) : 3,
      shop?.rate_chance_3 != null ? Number(shop.rate_chance_3) : 2,
    ];

    let payout = 0;
    const wins: any[] = [];

    for (const num of numbers) {
      const numStr = num.n;
      const quantity = num.q;

      const numLen = numStr.replace(/\D/g, '').length;
      if (numLen >= 4) {
        const result = this.calculateBilletePayout(numStr, winning, quantity, exactRates);
        if (result.totalPayout > 0) {
          wins.push({
            number: numStr,
            matches: result.matches,
            payout: result.totalPayout,
          });
        }
        payout += result.totalPayout;
      } else if (numLen >= 2) {
        const result = this.calculateChancePayout(numStr, winning, quantity, chanceRates);
        if (result.totalPayout > 0) {
          wins.push({
            number: numStr,
            matches: result.matches,
            payout: result.totalPayout,
          });
        }
        payout += result.totalPayout;
      }
    }

    return {
      orderId: order.order_id,
      gameType,
      sales,
      payout,
      wins,
    };
  }

  /**
   * TICA / NICA（与方案迭代一致）：Billete 头/二奖固定金额；Chance 与 Lotería 相同（N1→primer…）
   */
  private settleTicaNicaOrder(order: Order, n123: WinningN123, chanceWinning: DrawResult, shop: Shop | null = null): {
    orderId: number;
    gameType: string;
    sales: number;
    payout: number;
    wins: any[];
  } {
    const numbers = order.numbers as { n: string; q: number }[];
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return { orderId: order.order_id, gameType: order.game_type || '', sales: Number(order.amount), payout: 0, wins: [] };
    }
    const gameType = order.game_type;
    const sales = Number(order.amount);
    let payout = 0;
    const wins: any[] = [];

    // NICA 有独立赔率字段，null 时 fallback 到 TICA 的值
    const lotteryType = ((order as any).lottery_type || '').toString().toUpperCase();
    const isNica = lotteryType === 'NICA';

    const chanceRates: [number, number, number] = isNica ? [
      shop?.nica_chance_1 != null ? Number(shop.nica_chance_1) : (shop?.rate_chance_1 != null ? Number(shop.rate_chance_1) : 14),
      shop?.nica_chance_2 != null ? Number(shop.nica_chance_2) : (shop?.rate_chance_2 != null ? Number(shop.rate_chance_2) : 3),
      shop?.nica_chance_3 != null ? Number(shop.nica_chance_3) : (shop?.rate_chance_3 != null ? Number(shop.rate_chance_3) : 2),
    ] : [
      shop?.rate_chance_1 != null ? Number(shop.rate_chance_1) : 14,
      shop?.rate_chance_2 != null ? Number(shop.rate_chance_2) : 3,
      shop?.rate_chance_3 != null ? Number(shop.rate_chance_3) : 2,
    ];

    const chain = isNica ? {
      c12: shop?.nica_chain_1_2 != null ? Number(shop.nica_chain_1_2) : (shop?.chain_1_2 != null ? Number(shop.chain_1_2) : 1000),
      c13: shop?.nica_chain_1_3 != null ? Number(shop.nica_chain_1_3) : (shop?.chain_1_3 != null ? Number(shop.chain_1_3) : 1000),
      c21: shop?.nica_chain_2_1 != null ? Number(shop.nica_chain_2_1) : (shop?.chain_2_1 != null ? Number(shop.chain_2_1) : 0),
      c23: shop?.nica_chain_2_3 != null ? Number(shop.nica_chain_2_3) : (shop?.chain_2_3 != null ? Number(shop.chain_2_3) : 200),
      c31: shop?.nica_chain_3_1 != null ? Number(shop.nica_chain_3_1) : (shop?.chain_3_1 != null ? Number(shop.chain_3_1) : 0),
      c32: shop?.nica_chain_3_2 != null ? Number(shop.nica_chain_3_2) : (shop?.chain_3_2 != null ? Number(shop.chain_3_2) : 0),
    } : {
      c12: shop?.chain_1_2 != null ? Number(shop.chain_1_2) : 1000,
      c13: shop?.chain_1_3 != null ? Number(shop.chain_1_3) : 1000,
      c21: shop?.chain_2_1 != null ? Number(shop.chain_2_1) : 0,
      c23: shop?.chain_2_3 != null ? Number(shop.chain_2_3) : 200,
      c31: shop?.chain_3_1 != null ? Number(shop.chain_3_1) : 0,
      c32: shop?.chain_3_2 != null ? Number(shop.chain_3_2) : 0,
    };

    for (const num of numbers) {
      const numStr = num.n;
      const quantity = num.q;
      const numLen = numStr.replace(/\D/g, '').length;
      if (numLen >= 4) {
        const result = this.calculateTicaNicaBilletePayout(numStr, n123, quantity, chain);
        if (result.totalPayout > 0) {
          wins.push({
            number: numStr,
            matches: result.matches,
            payout: result.totalPayout,
          });
        }
        payout += result.totalPayout;
      } else if (numLen >= 2) {
        const result = this.calculateChancePayout(numStr, chanceWinning, quantity, chanceRates);
        if (result.totalPayout > 0) {
          wins.push({
            number: numStr,
            matches: result.matches,
            payout: result.totalPayout,
          });
        }
        payout += result.totalPayout;
      }
    }

    return {
      orderId: order.order_id,
      gameType,
      sales,
      payout,
      wins,
    };
  }

  /**
   * TICA / NICA Palet 赔付计算（4 位数一注）
   * 6 个串奖，各自独立叠加（都从同一注的 F+L 两个两位数推导）：
   * - 1串2: F=12 + L=34（N1在前 N2在后）
   * - 1串3: F=12 + L=34（N1在前 N3在后）
   * - 2串1: F=12 + L=34（N2在前 N1在后）
   * - 2串3: F=12 + L=34（N2在前 N3在后）
   * - 3串1: F=12 + L=34（N3在前 N1在后）
   * - 3串2: F=12 + L=34（N3在前 N2在后）
   * 每串中奖条件：该串的 X 位置数字==N_X 且 Y 位置数字==N_Y（X/Y 顺序不固定，取顺向或逆向都能匹配）
   * chain 值 ≥1 才算中奖，0 = 不中
   */
  private calculateTicaNicaBilletePayout(
    num: string,
    n123: WinningN123,
    qty: number,
    chain: { c12: number; c13: number; c21: number; c23: number; c31: number; c32: number },
  ): BilleteResult {
    const bet = num.replace(/\D/g, '').slice(-4).padStart(4, '0');
    const F = bet.slice(0, 2); // bet 的前两位
    const L = bet.slice(2, 4);  // bet 的后两位
    const { n1, n2, n3 } = n123;
    const matches: string[] = [];
    let totalPayout = 0;

    const add = (label: string, mult: number) => {
      if (mult > 0) {
        matches.push(`${label} x${mult}`);
        totalPayout += mult * qty;
      }
    };

    // 1串2: N1在前 N2在后（正向）
    add('1串2', (F === n1 && L === n2) ? chain.c12 : 0);
    // 1串3: N1在前 N3在后（正向）
    add('1串3', (F === n1 && L === n3) ? chain.c13 : 0);
    // 2串1: N2在前 N1在后（逆向）
    add('2串1', (F === n2 && L === n1) ? chain.c21 : 0);
    // 2串3: N2在前 N3在后（正向）
    add('2串3', (F === n2 && L === n3) ? chain.c23 : 0);
    // 3串1: N3在前 N1在后（逆向）
    add('3串1', (F === n3 && L === n1) ? chain.c31 : 0);
    // 3串2: N3在前 N2在后（逆向）
    add('3串2', (F === n3 && L === n2) ? chain.c32 : 0);

    return { matches, totalPayout };
  }

  /**
   * Billete 赔付计算（4 位数一注）
   * 每个奖（头/二/三）只取该奖内中的最高一档，三个奖之间叠加。
   * 档位从高到低：四位 > 前/后三位 > 前/后两位 > 最后一位
   * qty: 张数（Billete $1/张，赔付 = 赔率 × qty）
   */
  private calculateBilletePayout(
    num: string,
    winning: DrawResult,
    qty: number,
    exactRates: [number, number, number] = [2000, 600, 300],
  ): BilleteResult {
    const paddedNum = num.slice(-4).padStart(4, '0');
    const p = winning.primer;
    const s = winning.segundo;
    const t = winning.tercero;
    const primerNorm = p.length >= 4 ? p.slice(-4).padStart(4, '0') : null;
    const segundoNorm = s.length >= 4 ? s.slice(-4).padStart(4, '0') : null;
    const terceroNorm = t.length >= 4 ? t.slice(-4).padStart(4, '0') : null;

    const matches: string[] = [];
    let totalPayout = 0;

    // 头奖：四位/前三/后三互斥取最高；前两位和最后一位可叠加
    if (primerNorm) {
      if (paddedNum === primerNorm) {
        matches.push(`头奖四位 ${paddedNum} x${exactRates[0]}`);
        totalPayout += exactRates[0] * qty;
      } else if (paddedNum.slice(0, 3) === primerNorm.slice(0, 3)) {
        matches.push(`头奖前三位 x50`);
        totalPayout += 50 * qty;
      } else if (paddedNum.slice(1, 4) === primerNorm.slice(1, 4)) {
        matches.push(`头奖后三位 x50`);
        totalPayout += 50 * qty;
      } else {
        if (paddedNum.slice(0, 2) === primerNorm.slice(0, 2)) {
          matches.push(`头奖前两位 x3`);
          totalPayout += 3 * qty;
        }
        if (paddedNum.slice(2, 4) === primerNorm.slice(2, 4)) {
          matches.push(`头奖后两位 x3`);
          totalPayout += 3 * qty;
        } else if (paddedNum.slice(-1) === primerNorm.slice(-1)) {
          matches.push(`头奖最后一位 x1`);
          totalPayout += 1 * qty;
        }
      }
    } else {
      // 头奖号不足4位（如GORDITO 2位）：只比后两位
      if (paddedNum.slice(-2) === p.slice(-2).padStart(2, '0')) {
        matches.push(`头奖后两位 ${p} x3`);
        totalPayout += 3 * qty;
      }
    }

    // 二奖：只取最高一档
    if (segundoNorm) {
      if (paddedNum === segundoNorm) {
        matches.push(`二奖四位 ${paddedNum} x${exactRates[1]}`);
        totalPayout += exactRates[1] * qty;
      } else if (paddedNum.slice(0, 3) === segundoNorm.slice(0, 3)) {
        matches.push(`二奖前三位 x20`);
        totalPayout += 20 * qty;
      } else if (paddedNum.slice(1, 4) === segundoNorm.slice(1, 4)) {
        matches.push(`二奖后三位 x20`);
        totalPayout += 20 * qty;
      } else if (paddedNum.slice(2, 4) === segundoNorm.slice(2, 4)) {
        matches.push(`二奖后两位 x2`);
        totalPayout += 2 * qty;
      }
    } else {
      if (paddedNum.slice(-2) === s.slice(-2).padStart(2, '0')) {
        matches.push(`二奖后两位 ${s} x2`);
        totalPayout += 2 * qty;
      }
    }

    // 三奖：只取最高一档
    if (terceroNorm) {
      if (paddedNum === terceroNorm) {
        matches.push(`三奖四位 ${paddedNum} x${exactRates[2]}`);
        totalPayout += exactRates[2] * qty;
      } else if (paddedNum.slice(0, 3) === terceroNorm.slice(0, 3)) {
        matches.push(`三奖前三位 x10`);
        totalPayout += 10 * qty;
      } else if (paddedNum.slice(1, 4) === terceroNorm.slice(1, 4)) {
        matches.push(`三奖后三位 x10`);
        totalPayout += 10 * qty;
      } else if (paddedNum.slice(2, 4) === terceroNorm.slice(2, 4)) {
        matches.push(`三奖后两位 x1`);
        totalPayout += 1 * qty;
      }
    } else {
      if (paddedNum.slice(-2) === t.slice(-2).padStart(2, '0')) {
        matches.push(`三奖后两位 ${t} x1`);
        totalPayout += 1 * qty;
      }
    }

    return { matches, totalPayout };
  }

  /**
   * Chance 赔付计算：只比一二三奖的后两位（奖号 2 位就对 2 位）
   * 默认赔率：头奖 14x、二奖 3x、三奖 2x；可通过 rates 参数覆盖
   */
  private calculateChancePayout(
    num: string,
    winning: DrawResult,
    quantity: number,
    rates: [number, number, number] = [14, 3, 2],
  ): ChanceResult {
    const paddedNum = num.padStart(2, '0');
    const primerLast2 = winning.primer.slice(-2);
    const segundoLast2 = winning.segundo.slice(-2);
    const terceroLast2 = winning.tercero.slice(-2);

    const matches: string[] = [];
    let totalPayout = 0;

    if (paddedNum === primerLast2) {
      matches.push(`头奖后两位 ${paddedNum} x${rates[0]}`);
      totalPayout += rates[0] * quantity;
    }
    if (paddedNum === segundoLast2) {
      matches.push(`二奖后两位 ${paddedNum} x${rates[1]}`);
      totalPayout += rates[1] * quantity;
    }
    if (paddedNum === terceroLast2) {
      matches.push(`三奖后两位 ${paddedNum} x${rates[2]}`);
      totalPayout += rates[2] * quantity;
    }

    return { matches, totalPayout };
  }

  /**
   * 解析 Draw 中的开奖结果（原样返回，不补 0；可能为 2/4/5 位）
   */
  private parseDrawResult(draw: Draw): DrawResult {
    const raw: any = (draw as any).winning_numbers;
    let obj: any = raw;

    if (typeof raw === 'string') {
      try {
        obj = JSON.parse(raw);
      } catch {
        const parts = raw.split(/[-\s,]/).map((v: string) => v.trim()).filter((v: string) => v.length > 0);
        return {
          primer: (parts[0] || '').replace(/\D/g, '') || '0',
          segundo: (parts[1] || '').replace(/\D/g, '') || '0',
          tercero: (parts[2] || '').replace(/\D/g, '') || '0',
        };
      }
    }

    const toDigits = (v: unknown) => (v != null ? String(v).replace(/\D/g, '') : '') || '0';
    return {
      primer: toDigits(obj?.primer ?? obj?.billete),
      segundo: toDigits(obj?.segundo),
      tercero: toDigits(obj?.tercero),
    };
  }

  /**
   * 获取结算统计
   */
  async getSettlementStats(shopId?: number, startDate?: Date, endDate?: Date): Promise<any> {
    const query = this.orderRepo.createQueryBuilder('order');

    if (shopId) {
      query.andWhere('order.shop_id = :shopId', { shopId });
    }

    if (startDate) {
      query.andWhere('order.created_at >= :startDate', { startDate });
    }

    if (endDate) {
      query.andWhere('order.created_at <= :endDate', { endDate });
    }

    const orders = await query.getMany();

    let totalSales = 0;
    let totalPayout = 0;
    let winCount = 0;

    for (const order of orders) {
      totalSales += Number(order.amount);
      if (order.status === 3) {
        totalPayout += Number(order.win_amount);
        winCount++;
      }
    }

    return {
      totalOrders: orders.length,
      totalSales,
      totalPayout,
      winCount,
      profit: totalSales - totalPayout,
    };
  }

  /**
   * 最近 N 期历史结算记录（按开奖期次聚合，仅含本店有订单的期次）
   * 只统计已完成开奖的期次；订单含已付款/已开奖/已中奖（1,2,3）
   * 日期统一为 DD-MM-YYYY；若某期本店无订单则跳过该期（不占条数）
   *
   * @param lotteryKind NACIONAL=仅全国 Lotería；TICA|NICA=仅该店该店内彩；不传=旧行为（全国+店内混排）
   */
  async getHistoryForShop(shopId: number, limit: number = 7, lotteryKind?: string) {
    const takeN = Math.max(limit * 2, 20);
    const st = ['completed', 'COMPLETED'];
    const k = lotteryKind ? String(lotteryKind).toUpperCase() : '';

    let draws: Draw[];
    if (k === 'TICA' || k === 'NICA') {
      draws = await this.drawRepo
        .createQueryBuilder('d')
        .where('d.status IN (:...st)', { st })
        .andWhere('d.shop_id = :sid', { sid: shopId })
        .andWhere('d.lottery_type = :lt', { lt: k })
        .orderBy('d.draw_id', 'DESC')
        .take(takeN)
        .getMany();
    } else if (k === 'NACIONAL') {
      draws = await this.drawRepo
        .createQueryBuilder('d')
        .where('d.status IN (:...st)', { st })
        .andWhere('d.shop_id IS NULL')
        .andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
        .orderBy('d.draw_id', 'DESC')
        .take(takeN)
        .getMany();
    } else {
      // 旧客户端未传 lotteryKind 时默认仅返回 NACIONAL，不再混排（防止跨彩种泄漏）
      draws = await this.drawRepo
        .createQueryBuilder('d')
        .where('d.status IN (:...st)', { st })
        .andWhere('d.shop_id IS NULL')
        .andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
        .orderBy('d.draw_id', 'DESC')
        .take(takeN)
        .getMany();
    }

    const result: {
      drawId?: number;
      date: string;
      drawDate: string;
      totalSales: number;
      totalPayout: number;
      netProfit: number;
    }[] = [];

    for (const draw of draws) {
      let orders: Order[];
      if (k === 'NACIONAL') {
        orders = await this.orderRepo
          .createQueryBuilder('o')
          .where('o.shop_id = :sid', { sid: shopId })
          .andWhere('o.draw_id = :did', { did: draw.draw_id })
          .andWhere('o.status IN (:...stt)', { stt: [1, 2, 3] })
          .andWhere('(o.lottery_type = :lt OR o.lottery_type IS NULL)', { lt: 'NACIONAL' })
          .getMany();
      } else if (k === 'TICA' || k === 'NICA') {
        orders = await this.orderRepo.find({
          where: {
            shop_id: shopId,
            draw_id: draw.draw_id,
            status: In([1, 2, 3]),
            lottery_type: k,
          },
        });
      } else {
        orders = await this.orderRepo.find({
          where: {
            shop_id: shopId,
            draw_id: draw.draw_id,
            status: In([1, 2, 3]),
          },
        });
      }

      if (orders.length === 0) continue; // 本店该期无订单，不展示

      let totalSales = 0;
      let totalPayout = 0;
      for (const order of orders) {
        totalSales += Number(order.amount);
        totalPayout += Number(order.win_amount || 0);
      }

      const rawDate = draw.draw_date ?? draw.draw_time ?? draw.created_at ?? new Date();
      const d = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawDate)
        ? new Date(rawDate.slice(0, 10) + 'T12:00:00Z')
        : new Date(rawDate as any);
      const dd = d.getUTCDate();
      const mm = d.getUTCMonth() + 1;
      const yy = d.getUTCFullYear();
      const dateStr = `${String(dd).padStart(2, '0')}-${String(mm).padStart(2, '0')}-${yy}`;

      result.push({
        drawId: draw.draw_id,
        date: dateStr,
        drawDate: dateStr,
        totalSales,
        totalPayout,
        netProfit: totalSales - totalPayout,
      });

      if (result.length >= limit) break;
    }

    return result;
  }
}
