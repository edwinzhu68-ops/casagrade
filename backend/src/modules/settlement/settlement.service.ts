// ============================================
// 巴拿马 Loteria 结算服务 (适配现有实体)
// ============================================

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

    for (const order of orders) {
      const orderResult = this.settleOrder(order, winning);
      results.results.push(orderResult);
      results.totalSales += orderResult.sales;
      results.totalPayout += orderResult.payout;

      if (orderResult.payout > 0) {
        results.wins++;
      }

      // 更新订单状态
      await this.orderRepo.update(order.order_id, {
        status: orderResult.payout > 0 ? 3 : 2, // 3=已中奖 2=已开奖
        win_amount: orderResult.payout,
        settled_at: new Date(),
      });
    }

    // 更新开奖期次状态
    await this.drawRepo.update(drawId, { status: 'COMPLETED' as any });

    this.logger.log(
      `结算完成: ${results.totalOrders}单, 销售额$${results.totalSales}, 赔付$${results.totalPayout}, 中奖${results.wins}单`,
    );

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
    const amount = Number(order.amount);

    let sales = 0;
    let payout = 0;
    const wins: any[] = [];

    for (const num of numbers) {
      const numStr = num.n;
      const quantity = num.q;

      if (gameType === 'BILLETE') {
        // Billete: 4位数字
        const result = this.calculateBilletePayout(numStr, winning, amount * quantity);
        if (result.totalPayout > 0) {
          wins.push({
            number: numStr,
            matches: result.matches,
            payout: result.totalPayout,
          });
        }
        payout += result.totalPayout;
        sales += amount * quantity;
      } else if (gameType === 'CHANCE') {
        // Chance: 2位数字
        const result = this.calculateChancePayout(numStr, winning, amount * quantity);
        if (result.totalPayout > 0) {
          wins.push({
            number: numStr,
            matches: result.matches,
            payout: result.totalPayout,
          });
        }
        payout += result.totalPayout;
        sales += amount * quantity;
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
   * Billete 赔付计算 (正确规则)
   * - 头奖四位: 2000x (全中)
   * - 二奖四位: 600x
   * - 三奖四位: 300x
   * - 头奖前三位: 50x (仅当未中头奖四位)
   * - 头奖后三位: 50x (仅当未中头奖四位)
   * - 二奖后三位: 20x (仅当未中二奖四位)
   * - 三奖后三位: 10x (仅当未中三奖四位)
   * - 头奖前两位: 3x (仅当未中头奖四位)
   * - 头奖后两位: 3x (仅当未中头奖四位)
   * - 二奖后两位: 2x (仅当未中二奖四位)
   * - 三奖后两位: 1x (仅当未中三奖四位)
   */
  private calculateBilletePayout(
    num: string,
    winning: DrawResult,
    betAmount: number,
  ): BilleteResult {
    const paddedNum = num.padStart(4, '0');
    const primer = winning.primer.padStart(4, '0');
    const segundo = winning.segundo.padStart(4, '0');
    const tercero = winning.tercero.padStart(4, '0');

    const matches: string[] = [];
    let totalPayout = 0;

    // 是否命中四位
    const primerHit = paddedNum === primer;
    const segundoHit = paddedNum === segundo;
    const terceroHit = paddedNum === tercero;

    // 1. 四位数 (如果中了几奖就叠加)
    if (primerHit) {
      matches.push(`头奖四位 ${paddedNum} x2000`);
      totalPayout += 2000 * betAmount;
    }
    if (segundoHit) {
      matches.push(`二奖四位 ${paddedNum} x600`);
      totalPayout += 600 * betAmount;
    }
    if (terceroHit) {
      matches.push(`三奖四位 ${paddedNum} x300`);
      totalPayout += 300 * betAmount;
    }

    // 2. 三位数 (仅当未中对应奖项的四位)
    if (!primerHit && paddedNum.slice(0, 3) === primer.slice(0, 3)) {
      matches.push(`头奖前三位 ${paddedNum.slice(0, 3)} x50`);
      totalPayout += 50 * betAmount;
    }
    if (!primerHit && paddedNum.slice(1, 4) === primer.slice(1, 4)) {
      matches.push(`头奖后三位 ${paddedNum.slice(1, 4)} x50`);
      totalPayout += 50 * betAmount;
    }
    if (!segundoHit && paddedNum.slice(1, 4) === segundo.slice(1, 4)) {
      matches.push(`二奖后三位 ${paddedNum.slice(1, 4)} x20`);
      totalPayout += 20 * betAmount;
    }
    if (!terceroHit && paddedNum.slice(1, 4) === tercero.slice(1, 4)) {
      matches.push(`三奖后三位 ${paddedNum.slice(1, 4)} x10`);
      totalPayout += 10 * betAmount;
    }

    // 3. 两位数 (仅当未中对应奖项的四位)
    if (!primerHit && paddedNum.slice(0, 2) === primer.slice(0, 2)) {
      matches.push(`头奖前两位 ${paddedNum.slice(0, 2)} x3`);
      totalPayout += 3 * betAmount;
    }
    if (!primerHit && paddedNum.slice(2, 4) === primer.slice(2, 4)) {
      matches.push(`头奖后两位 ${paddedNum.slice(2, 4)} x3`);
      totalPayout += 3 * betAmount;
    }
    if (!segundoHit && paddedNum.slice(2, 4) === segundo.slice(2, 4)) {
      matches.push(`二奖后两位 ${paddedNum.slice(2, 4)} x2`);
      totalPayout += 2 * betAmount;
    }
    if (!terceroHit && paddedNum.slice(2, 4) === tercero.slice(2, 4)) {
      matches.push(`三奖后两位 ${paddedNum.slice(2, 4)} x1`);
      totalPayout += 1 * betAmount;
    }

    // 4. 头奖最后一位奖励：如果中了非头奖的奖项，且最后一位等于头奖最后一位，额外加1美元
    // (中头奖四位时不叠加)
    if (totalPayout > 0 && !primerHit && paddedNum.slice(-1) === primer.slice(-1)) {
      matches.push(`头奖最后一位 +$1`);
      totalPayout += 1 * betAmount;
    }

    return { matches, totalPayout };
  }

  /**
   * Chance 赔付计算 (正确规则)
   * - 头奖后两位: 14x
   * - 二奖后两位: 3x
   * - 三奖后两位: 2x
   */
  private calculateChancePayout(
    num: string,
    winning: DrawResult,
    betAmount: number,
  ): ChanceResult {
    const paddedNum = num.padStart(2, '0');
    const primerLast2 = winning.primer.slice(-2);
    const segundoLast2 = winning.segundo.slice(-2);
    const terceroLast2 = winning.tercero.slice(-2);

    const matches: string[] = [];
    let totalPayout = 0;

    if (paddedNum === primerLast2) {
      matches.push(`头奖后两位 ${paddedNum} x14`);
      totalPayout += 14 * betAmount;
    }
    if (paddedNum === segundoLast2) {
      matches.push(`二奖后两位 ${paddedNum} x3`);
      totalPayout += 3 * betAmount;
    }
    if (paddedNum === terceroLast2) {
      matches.push(`三奖后两位 ${paddedNum} x2`);
      totalPayout += 2 * betAmount;
    }

    return { matches, totalPayout };
  }

  /**
   * 解析 Draw 中的开奖结果
   */
  private parseDrawResult(draw: Draw): DrawResult {
    const raw: any = (draw as any).winning_numbers;
    let obj: any = raw;

    if (typeof raw === 'string') {
      try {
        obj = JSON.parse(raw);
      } catch {
        // 非 JSON，用分隔符拆分
        const parts = raw.split(/[-\s,]/).map((v: string) => v.trim()).filter((v: string) => v.length > 0);
        return {
          primer: (parts[0] || '0000').padStart(4, '0'),
          segundo: (parts[1] || '0000').padStart(4, '0'),
          tercero: (parts[2] || '0000').padStart(4, '0'),
        };
      }
    }

    const primer = (obj?.primer || obj?.billete || '').toString().padStart(4, '0');
    const segundo = (obj?.segundo || '').toString().padStart(4, '0');
    const tercero = (obj?.tercero || '').toString().padStart(4, '0');

    return { primer, segundo, tercero };
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
   * 最近 N 期历史结算记录（按开奖期次聚合）
   * 仅统计已付款订单
   */
  async getHistoryForShop(shopId: number, limit: number = 7) {
    // 找最近 N 期已完成或已开奖的 Draw
    const draws = await this.drawRepo.find({
      order: { draw_id: 'DESC' },
      take: limit,
    });

    const result: {
      date: string;
      primer: string;
      segundo: string;
      tercero: string;
      totalSales: number;
      totalPayout: number;
      netProfit: number;
    }[] = [];

    for (const draw of draws) {
      // 解析开奖号码，兼容 { primer, segundo, tercero } 结构
      const winning = this.parseDrawResult(draw);

      const orders = await this.orderRepo.find({
        where: {
          shop_id: shopId,
          draw_id: draw.draw_id,
          status: 1 as any, // 已付款
        },
      });

      let totalSales = 0;
      let totalPayout = 0;

      for (const order of orders) {
        totalSales += Number(order.amount);
        if (order.win_amount) {
          totalPayout += Number(order.win_amount);
        }
      }

      const rawDate = draw.draw_time ?? draw.created_at ?? new Date();
      const dateStr = typeof rawDate === 'string' ? rawDate.slice(0, 10) : new Date(rawDate).toISOString().slice(0, 10);
      result.push({
        date: dateStr,
        primer: winning.primer,
        segundo: winning.segundo,
        tercero: winning.tercero,
        totalSales,
        totalPayout,
        netProfit: totalSales - totalPayout,
      });
    }

    return result;
  }
}
