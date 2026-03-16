import { Controller, Post, Body, BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Order } from '../../entities/order.entity';

/**
 * 独立控制器：POST /api/orders-cancel（与 /api/orders 完全分离，避免 404）
 */
@Controller('orders-cancel')
export class OrderCancelController {
  constructor(private readonly dataSource: DataSource) {}

  @Post()
  async cancel(@Body() body: { orderNumber?: string }) {
    const orderNumber = (body?.orderNumber ?? '').trim();
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
    if (order.status !== 0) {
      throw new BadRequestException('只能取消未付款订单');
    }

    await orderRepo.update(order.order_id, {
      status: -1,
      canceled_at: new Date(),
    } as any);

    return {
      success: true,
      order_number: order.order_number,
      message: '订单已取消',
    };
  }
}
