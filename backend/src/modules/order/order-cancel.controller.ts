import { Controller, Post, Body, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Order } from '../../entities/order.entity';

/**
 * 独立控制器：POST /api/orders-cancel（与 /api/orders 完全分离，避免 404）
 */
@Controller('orders-cancel')
export class OrderCancelController {
  constructor(private readonly dataSource: DataSource) {}

  @Post()
  async cancel(@Body() body: { orderNumber?: string; orderHash?: string }) {
    const orderNumber = (body?.orderNumber ?? '').trim();
    const orderHash = (body?.orderHash ?? '').trim();
    if (!orderNumber) {
      throw new BadRequestException('缺少 orderNumber');
    }
    const orderRepo = this.dataSource.getRepository(Order);
    const order = await orderRepo.findOne({
      where: { order_number: orderNumber },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }
    // 鉴权：必须传与订单一致的 order_hash 才允许取消（顾客端创建订单时收到，QR/前端缓存）
    // 防止匿名攻击者枚举/猜测 orderNumber 批量取消他人未付订单
    if (!orderHash || !(order as any).order_hash || orderHash !== (order as any).order_hash) {
      throw new UnauthorizedException('订单凭证无效');
    }
    if (order.status !== 0) {
      // 已付款/已中奖/已取消都不可取消
      // - status=1/2 已付款或已开奖未中：业务上已形成交易
      // - status=3 已中奖：绝不可取消，否则应收消失
      // - status=-1 已取消：幂等返回错误
      throw new BadRequestException('只能取消未付款订单');
    }

    const nowTs = new Date();
    await orderRepo.update(order.order_id, {
      status: -1,
      canceled_at: nowTs,
      updated_at: nowTs,
    } as any);

    return {
      success: true,
      order_number: order.order_number,
      message: '订单已取消',
    };
  }
}
