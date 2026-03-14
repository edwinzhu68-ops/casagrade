import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { Shop } from '../../entities/shop.entity';
import { AdminTokenGuard } from '../../guards/admin-token.guard';

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminController {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
  ) {}

  /**
   * 店铺对比：Top N 销售额 / 净利润
   * GET /api/admin/shop-compare?from=YYYY-MM-DD&to=YYYY-MM-DD&top=10
   */
  @Get('shop-compare')
  async shopCompare(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('top') top: string = '10',
  ) {
    const topN = Number(top) || 10;

    const where: any = {};
    if (from) {
      where.created_at = where.created_at || {};
      where.created_at.$gte = new Date(from);
    }
    if (to) {
      where.created_at = where.created_at || {};
      // 包含当天
      const endDate = new Date(to);
      endDate.setDate(endDate.getDate() + 1);
      where.created_at.$lt = endDate;
    }

    // 简单方式：先取出所有已付款订单，再在内存中聚合
    const qb = this.orderRepo.createQueryBuilder('order')
      .where('order.status >= :status', { status: 1 });

    if (from) {
      qb.andWhere('order.paid_at >= :from', { from: new Date(from) });
    }
    if (to) {
      const endDate = new Date(to);
      endDate.setDate(endDate.getDate() + 1);
      qb.andWhere('order.paid_at < :to', { to: endDate });
    }

    const orders = await qb.getMany();

    const shopMap = new Map<number, { sales: number; payout: number }>();
    for (const o of orders) {
      if (!o.shop_id) continue;
      if (!shopMap.has(o.shop_id)) {
        shopMap.set(o.shop_id, { sales: 0, payout: 0 });
      }
      const entry = shopMap.get(o.shop_id)!;
      entry.sales += Number(o.amount);
      if (o.win_amount) {
        entry.payout += Number(o.win_amount);
      }
    }

    const shopIds = Array.from(shopMap.keys());
    const shops = shopIds.length
      ? await this.shopRepo.find({ where: { shop_id: In(shopIds) } })
      : [];

    const items = shops.map((s) => {
      const agg = shopMap.get(s.shop_id) || { sales: 0, payout: 0 };
      const totalSales = agg.sales;
      const totalPayout = agg.payout;
      const netProfit = totalSales - totalPayout;
      return {
        shopNumber: s.shop_number,
        shopName: s.shop_name,
        totalSales,
        netProfit,
      };
    });

    items.sort((a, b) => b.totalSales - a.totalSales);

    return {
      items: items.slice(0, topN),
    };
  }

  /**
   * 系统健康检查
   * GET /api/admin/health
   */
  @Get('health')
  async health() {
    try {
      await this.orderRepo.query('SELECT 1');
      return {
        db: 'ok',
        queue: 'unknown', // 目前暂未接入队列
      };
    } catch (e) {
      return {
        db: 'error',
        queue: 'unknown',
      };
    }
  }
}

