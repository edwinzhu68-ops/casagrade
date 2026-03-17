import { Controller, Get, Post, Patch, Delete, Query, Body, Param, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { Order } from '../../entities/order.entity';
import { Shop } from '../../entities/shop.entity';
import { User } from '../../entities/user.entity';
import { Draw } from '../../entities/draw.entity';
import { CardCode } from '../../entities/card-code.entity';
import { ShopBinding } from '../../entities/shop-binding.entity';
import { AdminTokenGuard } from '../../guards/admin-token.guard';

/** 生成卡密：XXXX-XXXX-XXXX，去掉易混淆字符 */
function generateCardCode(type: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand2 = () => Array.from({ length: 2 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const seg4  = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const prefix = type === 'yearly' ? 'YY' : 'MM';
  // 格式：MM/YY + XX-XXXX-XXXX  共 14 字符（在 length:20 限制内）
  return `${prefix}${rand2()}-${seg4()}-${seg4()}`;
}

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminController {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Draw)
    private readonly drawRepo: Repository<Draw>,
    @InjectRepository(CardCode)
    private readonly cardCodeRepo: Repository<CardCode>,
    @InjectRepository(ShopBinding)
    private readonly shopBindingRepo: Repository<ShopBinding>,
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
   * GET /api/admin/shops - 返回全部店铺（管理员用）
   */
  @Get('shops')
  async getAllShops() {
    const shops = await this.shopRepo.find({ order: { shop_id: 'ASC' } });
    const ownerIds = shops.map(s => s.owner_id).filter(Boolean);
    const users = ownerIds.length
      ? await this.userRepo.find({ where: { user_id: In(ownerIds) } })
      : [];
    const userMap = new Map(users.map(u => [u.user_id, u]));

    // 所有已完成的期次（按 draw_id 升序），用于计算连续未下单期数
    const completedDraws = await this.drawRepo.find({
      where: { status: 'completed' },
      order: { draw_id: 'ASC' },
      select: ['draw_id'],
    });
    const completedDrawIds: number[] = completedDraws.map(d => d.draw_id);
    const totalCompleted = completedDrawIds.length;

    // 每个店铺最后一次有效订单的 draw_id（status 1/2/3）
    const shopIds = shops.map(s => s.shop_id).filter(Boolean);
    type LastOrderRow = { shop_id: number; last_draw_id: number };
    let lastOrderMap = new Map<number, number>();
    if (shopIds.length) {
      const rows: LastOrderRow[] = await this.orderRepo
        .createQueryBuilder('o')
        .select('o.shop_id', 'shop_id')
        .addSelect('MAX(o.draw_id)', 'last_draw_id')
        .where('o.shop_id IN (:...ids)', { ids: shopIds })
        .andWhere('o.status IN (:...statuses)', { statuses: [1, 2, 3] })
        .groupBy('o.shop_id')
        .getRawMany();
      rows.forEach(r => lastOrderMap.set(Number(r.shop_id), Number(r.last_draw_id)));
    }

    return {
      shops: shops.map(s => {
        const user = s.owner_id ? userMap.get(s.owner_id) : null;
        const lastDrawId = lastOrderMap.get(s.shop_id);
        const inactive_periods = lastDrawId != null
          ? completedDrawIds.filter(id => id > lastDrawId).length
          : totalCompleted;
        return {
          shop_id: s.shop_id,
          shop_number: s.shop_number,
          shop_name: s.shop_name,
          shop_aliases: s.shop_aliases || [],
          status: s.status,
          commission_rate: s.commission_rate,
          owner_id: s.owner_id,
          account_number: user ? user.account_number : null,
          registered_at: user ? user.created_at : null,
          inactive_periods,
          subscription_expires_at: (s as any).subscription_expires_at ?? null,
        };
      }),
    };
  }

  /**
   * DELETE /api/admin/accounts/:accountNumber - 删除账号及其店铺（店号释放回随机池）
   */
  @Delete('accounts/:accountNumber')
  async deleteAccount(@Param('accountNumber') accountNumber: string) {
    const account = (accountNumber || '').trim();
    if (!account) throw new BadRequestException('请提供账号');
    const user = await this.userRepo.findOne({ where: { account_number: account } });
    if (!user) throw new NotFoundException(`账号 ${account} 不存在`);
    const shops = await this.shopRepo.find({ where: { owner_id: user.user_id } });
    const shopNumbers = shops.map(s => s.shop_number);
    for (const shop of shops) {
      // 先删除该店铺相关的所有 binding 记录（主店或子店），防止 shop_id 被复用后残留数据污染新账号
      await this.shopBindingRepo.delete({ main_shop_id: shop.shop_id });
      await this.shopBindingRepo.delete({ sub_shop_id: shop.shop_id });
      await this.shopRepo.delete(shop.shop_id);
    }
    await this.userRepo.delete(user.user_id);
    return { success: true, message: `已删除账号 ${account}，释放店号：${shopNumbers.join(', ') || '无'}` };
  }

  /**
   * PATCH /api/admin/shops/:shopId/status - 启用/停用店铺
   */
  @Patch('shops/:shopId/status')
  async setShopStatus(
    @Param('shopId') shopId: string,
    @Body('status') status: string,
  ) {
    const shop = await this.shopRepo.findOne({ where: { shop_id: parseInt(shopId) } });
    if (!shop) throw new NotFoundException('店铺不存在');
    if (status !== 'active' && status !== 'disabled') throw new BadRequestException('status 只能是 active 或 disabled');
    await this.shopRepo.update(shop.shop_id, { status });
    return { success: true, shop_id: shop.shop_id, status };
  }

  /**
   * POST /api/admin/reset-password - 重置商家密码
   */
  @Post('reset-password')
  async resetPassword(
    @Body('shopNumber') shopNumber: string,
    @Body('newPassword') newPassword: string,
  ) {
    const sn = (shopNumber || '').trim();
    const pwd = (newPassword || '').trim();
    if (!sn) throw new BadRequestException('请提供店号');
    if (!pwd || pwd.length < 4) throw new BadRequestException('新密码至少 4 位');

    // 支持别名查找
    let shop = await this.shopRepo.findOne({ where: { shop_number: sn } });
    if (!shop) {
      const all = await this.shopRepo.find();
      shop = all.find(s => (s.shop_aliases || []).includes(sn)) ?? null;
    }
    if (!shop) throw new NotFoundException(`找不到店号 ${sn}`);
    if (!shop.owner_id) throw new BadRequestException('该店铺没有关联账号');

    const hash = await bcrypt.hash(pwd, 10);
    await this.userRepo.update(shop.owner_id, { password_hash: hash });
    return { success: true, message: `店号 ${sn} 密码已重置` };
  }

  /**
   * POST /api/admin/generate-cards - 批量生成卡密
   */
  @Post('generate-cards')
  async generateCards(
    @Body('type') type: string,
    @Body('count') count: number,
  ) {
    if (type !== 'monthly' && type !== 'yearly') throw new BadRequestException('type 只能是 monthly 或 yearly');
    const n = Math.min(Math.max(parseInt(String(count)) || 1, 1), 50);
    const codes: string[] = [];
    for (let i = 0; i < n; i++) {
      let code: string;
      let attempts = 0;
      do {
        code = generateCardCode(type);
        attempts++;
      } while (attempts < 10 && await this.cardCodeRepo.findOne({ where: { code } }));
      const card = this.cardCodeRepo.create({ code, type, used_by_shop_id: null, used_at: null });
      await this.cardCodeRepo.save(card);
      codes.push(code);
    }
    return { success: true, codes, type };
  }

  /**
   * GET /api/admin/cards - 查看卡密列表
   */
  @Get('cards')
  async listCards(@Query('type') type?: string) {
    const where: any = {};
    if (type) where.type = type;
    const cards = await this.cardCodeRepo.find({ where, order: { created_at: 'DESC' } });
    return {
      cards: cards.map(c => ({
        id: c.id,
        code: c.code,
        type: c.type,
        used: !!c.used_at,
        used_by_shop_id: c.used_by_shop_id,
        used_at: c.used_at,
        created_at: c.created_at,
      })),
    };
  }

  /**
   * 分配店号给买家（卖店号时用）
   * POST /api/admin/assign-shop
   * Body: { shopNumber: "1" | "123" | "88888", accountNumber: "buyerAccount" }
   * 店号 1-9 位数字（可从 1 开始任意分配）；若该店号已存在则报错不能绑
   */
  @Post('assign-shop')
  async assignShop(
    @Body('shopNumber') shopNumber: string,
    @Body('accountNumber') accountNumber: string,
  ) {
    const sn = (shopNumber || '').trim();
    const account = (accountNumber || '').trim();
    if (!/^\d{1,9}$/.test(sn)) {
      throw new BadRequestException('店号为 1-9 位数字');
    }
    if (!account) {
      throw new BadRequestException('请提供买家账号 accountNumber');
    }

    const user = await this.userRepo.findOne({ where: { account_number: account } });
    if (!user) {
      throw new NotFoundException(`账号 ${account} 不存在，请让买家先注册`);
    }

    // 检查该号码是否已被其他店铺使用（主号或别名）
    const existingByPrimary = await this.shopRepo.findOne({ where: { shop_number: sn } });
    if (existingByPrimary) {
      throw new BadRequestException(`店号 ${sn} 已存在，不能分配`);
    }
    const allShops = await this.shopRepo.find();
    const existingByAlias = allShops.find(s => (s.shop_aliases || []).includes(sn));
    if (existingByAlias) {
      throw new BadRequestException(`店号 ${sn} 已被其他店铺用作别名，不能分配`);
    }

    // 找该用户现有店铺
    const userShop = await this.shopRepo.findOne({ where: { owner_id: user.user_id } });
    if (userShop) {
      // 已有店铺：新号升为主号，旧主号降为别名
      const aliases = userShop.shop_aliases || [];
      const timestamps: Record<string, string> = userShop.shop_alias_timestamps || {};
      if (!aliases.includes(userShop.shop_number)) {
        aliases.push(userShop.shop_number);
        timestamps[userShop.shop_number] = new Date().toISOString();
      }
      await this.shopRepo.update(userShop.shop_id, { shop_number: sn, shop_aliases: aliases, shop_alias_timestamps: timestamps });
      return {
        success: true,
        message: `已将店号 ${sn} 设为主号，旧号 ${userShop.shop_number} 保留为别名（1个月后自动删除）`,
        shop_id: userShop.shop_id,
        shop_number: sn,
        shop_aliases: aliases,
        owner_id: userShop.owner_id,
      };
    }

    // 没有店铺：新建
    const shop = this.shopRepo.create({
      shop_number: sn,
      owner_id: user.user_id,
      shop_name: `店铺${sn}`,
      status: 'active',
      commission_rate: 0.1,
    });
    await this.shopRepo.save(shop);
    return {
      success: true,
      message: `已创建店号 ${sn} 并绑定到账号 ${account}`,
      shop_id: shop.shop_id,
      shop_number: shop.shop_number,
      shop_aliases: [],
      owner_id: shop.owner_id,
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

  /**
   * 历史期次总订单数和销售额（全部店铺）
   * GET /api/admin/draw-history?limit=
   * 仅统计已完成且已归档的期次，数据永久保留
   */
  @Get('draw-history')
  async drawHistory(@Query('limit') limit: string) {
    const take = Number(limit) || 50;

    const { Not, IsNull } = await import('typeorm');
    const completedDraws = await this.drawRepo.find({
      where: { status: In(['completed', 'COMPLETED']), archived_at: Not(IsNull()) },
      order: { draw_id: 'DESC' },
      take,
    });

    if (!completedDraws.length) {
      return { history: [] };
    }

    const history = await Promise.all(
      completedDraws.map(async (draw) => {
        const orders = await this.orderRepo.find({
          where: { draw_id: draw.draw_id },
        });

        const paidOrders = orders.filter((o) =>
          [1, 2, 3].includes(Number((o as any).status)),
        );

        const totalSales = paidOrders.reduce(
          (sum, o) => sum + Number((o as any).amount || 0),
          0,
        );
        const totalPayout = paidOrders.reduce(
          (sum, o) => sum + Number((o as any).win_amount || 0),
          0,
        );

        return {
          draw_id: draw.draw_id,
          draw_date: (draw as any).draw_date,
          order_count: paidOrders.length,
          total_sales: Math.round(totalSales * 100) / 100,
          total_payout: Math.round(totalPayout * 100) / 100,
          net_profit: Math.round((totalSales - totalPayout) * 100) / 100,
        };
      }),
    );

    return { history };
  }

  /**
   * POST /api/admin/archive-main-shop - 手动归档大庄管理中心数据
   * 效果等同于开奖次日 09:00 自动归档：sub-shop-data 切换到下一期
   */
  @Post('archive-main-shop')
  async archiveMainShop() {
    const completed = await this.drawRepo.findOne({
      where: { status: In(['completed', 'COMPLETED']) },
      order: { draw_id: 'DESC' },
    });
    if (!completed) {
      return { success: false, message: '没有已完成的期次可归档' };
    }
    if ((completed as any).main_shop_archived) {
      return { success: false, message: '大庄数据已经归档过了' };
    }
    await this.drawRepo.update(completed.draw_id, {
      main_shop_archived: true,
      // 同步设置 archived_at，使大庄历史与结算历史、result 历史保持一致
      archived_at: (completed as any).archived_at ?? new Date(),
    } as any);
    return { success: true, message: `已归档第 ${completed.draw_id} 期大庄数据` };
  }

  /**
   * GET /api/admin/logs - 获取错误日志（最近 100 行）
   * GET /api/admin/logs?lines=50 - 指定行数
   */
  @Get('logs')
  async getLogs(@Query('lines') lines: string = '100') {
    const logDir = path.join(__dirname, '..', '..', 'logs');
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logDir, `error-${today}.log`);
    
    let content = '';
    try {
      if (fs.existsSync(logFile)) {
        const fileContent = fs.readFileSync(logFile, 'utf-8');
        const allLines = fileContent.split('\n');
        const maxLines = Math.min(parseInt(lines, 10) || 100, 500);
        content = allLines.slice(-maxLines).join('\n');
      }
    } catch (e) {
      return { success: false, error: '读取日志失败: ' + (e as Error).message };
    }
    
    return { success: true, logs: content, date: today };
  }
}

