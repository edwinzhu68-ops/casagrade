import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../../entities/order.entity';

const THIRTY_MIN_MS = 30 * 60 * 1000;
const INTERVAL_MS = 60 * 1000; // 每分钟检查一次

@Injectable()
export class OrderCancelService implements OnModuleInit {
  private readonly logger = new Logger(OrderCancelService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.cancelExpiredPendingOrders(), INTERVAL_MS);
    this.logger.log('定时任务已启动：每 1 分钟检查超时未付款订单并自动取消');
  }

  async cancelExpiredPendingOrders(): Promise<void> {
    const deadline = new Date(Date.now() - THIRTY_MIN_MS);
    try {
      const result = await this.orderRepo
        .createQueryBuilder()
        .update(Order)
        .set({ status: -1 as any, canceled_at: new Date() } as any)
        .where('status = :status', { status: 0 })
        .andWhere('created_at < :deadline', { deadline })
        .execute();
      if (result.affected && result.affected > 0) {
        this.logger.log(`自动取消 ${result.affected} 笔超时未付款订单`);
      }
    } catch (e) {
      this.logger.warn('自动取消订单检查失败: ' + (e && (e as Error).message));
    }
  }
}
