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

    const results = {
      totalOrders: orders.length,
      totalSales: 0,
      totalPayout: 0,
      wins: 0,
      results: [] as any[],
    };

    // 先统计所有订单结算结果（无副作用）
    for (const order of orders) {
      const orderResult = this.settleOrder(order, winning);
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
        await manager.update(Order, order.order_id, {
          status: orderResult.payout > 0 ? 3 : 2, // 3=已中奖 2=已开奖
          win_amount: orderResult.payout,
          win_breakdown: orderResult.wins,
          settled_at: new Date(),
        } as any);
      }
      // 更新开奖期次状态
      await manager.update(Draw, drawId, { status: 'COMPLETED' as any });
    });

    this.logger.log(`结算完成: ${results.totalOrders}单, 销售额$${results.totalSales}, 赔付$${results.totalPayout}, 中奖${results.wins}单`);

    return results;
  }

  /**
   * 结算单个订单
   */
  private settleOrder(order: Order, winning: DrawResult): {
    orderId: number;
    gameType: string;
    sales: number;
    payout: number;
    wins: any[];
  } {
    const numbers = order.numbers as { n: string; q: number }[];
    const gameType = order.game_type;
    // sales 直接使用订单总金额，不按号码行重复累加
    const sales = Number(order.amount);

    let payout = 0;
    const wins: any[] = [];

    for (const num of numbers) {
      const numStr = num.n;
      const quantity = num.q;

      // 按号码位数区分规则：4位是Billete，2位是Chance（不再按game_type字段区分）
      const numLen = numStr.replace(/\D/g, '').length;
      if (numLen >= 4) {
        // Billete: 4位数字；赔付 = 赔率 × 张数（$1/张），与订单总金额无关
        const result = this.calculateBilletePayout(numStr, winning, quantity);
        if (result.totalPayout > 0) {
          wins.push({
            number: numStr,
            matches: result.matches,
            payout: result.totalPayout,
          });
        }
        payout += result.totalPayout;
      } else if (numLen >= 2) {
        // Chance: 2位数字，按「张数×赔率」计算，不是「金额×张数」
        const result = this.calculateChancePayout(numStr, winning, quantity);
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
   * Billete 赔付计算（4 位数一注）
   * 每个奖（头/二/三）只取该奖内中的最高一档，三个奖之间叠加。
   * 档位从高到低：四位 > 前/后三位 > 前/后两位 > 最后一位
   * qty: 张数（Billete $1/张，赔付 = 赔率 × qty）
   */
  private calculateBilletePayout(
    num: string,
    winning: DrawResult,
    qty: number,
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

    // 头奖：只取最高一档
    if (primerNorm) {
      if (paddedNum === primerNorm) {
        matches.push(`头奖四位 ${paddedNum} x2000`);
        totalPayout += 2000 * qty;
      } else if (paddedNum.slice(0, 3) === primerNorm.slice(0, 3)) {
        matches.push(`头奖前三位 x50`);
        totalPayout += 50 * qty;
      } else if (paddedNum.slice(1, 4) === primerNorm.slice(1, 4)) {
        matches.push(`头奖后三位 x50`);
        totalPayout += 50 * qty;
      } else if (paddedNum.slice(0, 2) === primerNorm.slice(0, 2)) {
        matches.push(`头奖前两位 x3`);
        totalPayout += 3 * qty;
      } else if (paddedNum.slice(2, 4) === primerNorm.slice(2, 4)) {
        matches.push(`头奖后两位 x3`);
        totalPayout += 3 * qty;
      } else if (paddedNum.slice(-1) === primerNorm.slice(-1)) {
        matches.push(`头奖最后一位 x1`);
        totalPayout += 1 * qty;
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
        matches.push(`二奖四位 ${paddedNum} x600`);
        totalPayout += 600 * qty;
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
        matches.push(`三奖四位 ${paddedNum} x300`);
        totalPayout += 300 * qty;
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
   * 头奖 14x、二奖 3x、三奖 2x
   */
  private calculateChancePayout(
    num: string,
    winning: DrawResult,
    quantity: number,
  ): ChanceResult {
    const paddedNum = num.padStart(2, '0');
    const primerLast2 = winning.primer.slice(-2);
    const segundoLast2 = winning.segundo.slice(-2);
    const terceroLast2 = winning.tercero.slice(-2);

    const matches: string[] = [];
    let totalPayout = 0;

    if (paddedNum === primerLast2) {
      matches.push(`头奖后两位 ${paddedNum} x14`);
      totalPayout += 14 * quantity;
    }
    if (paddedNum === segundoLast2) {
      matches.push(`二奖后两位 ${paddedNum} x3`);
      totalPayout += 3 * quantity;
    }
    if (paddedNum === terceroLast2) {
      matches.push(`三奖后两位 ${paddedNum} x2`);
      totalPayout += 2 * quantity;
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
   */
  async getHistoryForShop(shopId: number, limit: number = 7) {
    const draws = await this.drawRepo.find({
      where: [{ status: 'completed' }, { status: 'COMPLETED' }],
      order: { draw_id: 'DESC' },
      take: Math.max(limit * 2, 20), // 多取一些，过滤掉本店无订单的期次后仍能凑满 limit 条（含已归档期）
    });

    const result: {
      drawId?: number;
      date: string;
      drawDate: string;
      totalSales: number;
      totalPayout: number;
      netProfit: number;
    }[] = [];

    for (const draw of draws) {
      const orders = await this.orderRepo.find({
        where: {
          shop_id: shopId,
          draw_id: draw.draw_id,
          status: In([1, 2, 3]),
        },
      });

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
