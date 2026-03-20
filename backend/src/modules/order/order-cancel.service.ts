import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { Draw } from '../../entities/draw.entity';

const INTERVAL_MS = 60 * 1000;
const PANAMA_TZ = 'America/Panama';

function getPanamaNow(): { y: number; m: number; d: number; h: number; min: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PANAMA_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
}

@Injectable()
export class OrderCancelService implements OnModuleInit {
  private readonly logger = new Logger(OrderCancelService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit() {
    this.timer = setInterval(() => this.cancelExpiredPendingOrders(), INTERVAL_MS);
    this.logger.log('定时任务已启动：每 1 分钟检查停售后未付款订单并自动取消');
  }

  private async isInStopSellPeriod(): Promise<boolean> {
    const drawRepo = this.dataSource.getRepository(Draw);
    const draw = await drawRepo.findOne({
      where: { status: 'pending' },
      order: { draw_id: 'DESC' },
    });
    if (!draw) return true;

    const timeStr = String(draw.draw_time || '15:00').trim();
    let drawHour = 15, drawMin = 0;
    if (timeStr.includes('T')) {
      const dt = new Date(timeStr);
      if (!isNaN(dt.getTime())) { drawHour = dt.getHours(); drawMin = dt.getMinutes(); }
    } else {
      const p = timeStr.split(':').map(Number);
      if (p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1])) { drawHour = p[0]; drawMin = p[1]; }
    }

    let dy: number, dm: number, dd: number;
    if (timeStr.includes('T') && /^\d{4}-\d{2}-\d{2}/.test(timeStr)) {
      dy = parseInt(timeStr.slice(0, 4), 10);
      dm = parseInt(timeStr.slice(5, 7), 10);
      dd = parseInt(timeStr.slice(8, 10), 10);
    } else if (draw.draw_date) {
      const raw = draw.draw_date;
      const d = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(raw))
        ? new Date(String(raw).substring(0, 10) + 'T12:00:00Z')
        : new Date(raw as any);
      dy = d.getUTCFullYear(); dm = d.getUTCMonth() + 1; dd = d.getUTCDate();
    } else {
      return false;
    }

    const stopSaleStart = drawHour * 60 + drawMin - 5;
    const RESUME_MINS = 7 * 60;

    const drawDateISO = `${dy}-${String(dm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    const nextDay = new Date(`${drawDateISO}T12:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    const dayAfterISO = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;

    const panama = getPanamaNow();
    const todayISO = `${panama.y}-${String(panama.m).padStart(2, '0')}-${String(panama.d).padStart(2, '0')}`;
    const totalMins = panama.h * 60 + panama.min;

    return (drawDateISO === todayISO && totalMins >= stopSaleStart) ||
           (dayAfterISO === todayISO && totalMins < RESUME_MINS);
  }

  async cancelExpiredPendingOrders(): Promise<void> {
    try {
      if (!(await this.isInStopSellPeriod())) return;

      const orderRepo = this.dataSource.getRepository(Order);
      const result = await orderRepo
        .createQueryBuilder()
        .update(Order)
        .set({ status: -1 as any, canceled_at: new Date() } as any)
        .where('status = :status', { status: 0 })
        .execute();
      if (result.affected && result.affected > 0) {
        this.logger.log(`停售后自动取消 ${result.affected} 笔未付款订单`);
      }
    } catch (e) {
      this.logger.warn('自动取消订单检查失败: ' + (e && (e as Error).message));
    }
  }
}
