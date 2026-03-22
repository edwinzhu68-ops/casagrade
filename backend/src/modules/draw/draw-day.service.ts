import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Draw } from '../../entities/draw.entity';
import { Order } from '../../entities/order.entity';

/**
 * 将日期"对齐"到最近的标准开奖日（周三或周日，含当天）。
 * 用于修正手动提前开奖的情况：例如把周日改到周五开，
 * 周五对齐到周日，再用 getNextDrawDatePanama 就会跳到下周三，
 * 不会重复创建本周日期次。
 */
function snapToStandardDrawDay(date: Date): Date {
  const day = date.getDay();
  if (day === 0 || day === 3) return date;
  const daysToWed = ((3 - day + 7) % 7) || 7;
  const daysToSun = ((0 - day + 7) % 7) || 7;
  const days = Math.min(daysToWed, daysToSun);
  const snapped = new Date(date);
  snapped.setDate(snapped.getDate() + days);
  return snapped;
}

/** 从上一开奖日起算，找最近的下一个周三或周日 15:00（当天不算） */
function getNextDrawDatePanama(from?: Date): Date {
  let base: Date;
  if (from) {
    base = from;
  } else {
    const now = new Date();
    base = new Date(now.toLocaleString('en-US', { timeZone: 'America/Panama' }));
  }
  const day = base.getDay();
  const daysToWed = ((3 - day + 7) % 7) || 7;
  const daysToSun = ((0 - day + 7) % 7) || 7;
  const days = Math.min(daysToWed, daysToSun);
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  next.setHours(15, 0, 0, 0);
  return next;
}

const PANAMA_TZ = 'America/Panama';

/** 巴拿马当前时间 { y, m, d, h, min } */
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

/** 将 draw_time（ISO 或 HH:mm:ss）和 draw_date 解析为 { dateStr: 'DD-MM-YYYY', h, min } */
function parseDrawTime(draw: Draw): { dateStr: string; h: number; min: number } | null {
  const timeStr = String(draw.draw_time || '').trim();
  let h = 15, min = 0;
  let dateStr: string | null = null;

  if (timeStr.includes('T') && /^\d{4}-\d{2}-\d{2}/.test(timeStr)) {
    const iso = timeStr.substring(0, 10);
    const dy = parseInt(iso.slice(0, 4), 10);
    const dm = parseInt(iso.slice(5, 7), 10);
    const dd = parseInt(iso.slice(8, 10), 10);
    dateStr = `${String(dd).padStart(2, '0')}-${String(dm).padStart(2, '0')}-${dy}`;
    const timePart = timeStr.substring(11, 16);
    const tp = timePart.split(':').map(Number);
    h = tp[0] || 15;
    min = tp[1] || 0;
  } else {
    const p = timeStr.split(':').map(Number);
    if (p.length >= 2 && !isNaN(p[0])) { h = p[0]; min = p[1] || 0; }
    const rawDate = draw.draw_date;
    if (!rawDate) return null;
    const rawDateStr = String(rawDate);
    const d = typeof rawDateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawDateStr)
      ? new Date(rawDateStr.slice(0, 10) + 'T12:00:00Z')
      : new Date(rawDateStr);
    if (isNaN(d.getTime())) return null;
    dateStr = `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
  }

  if (!dateStr) return null;
  return { dateStr, h, min };
}

@Injectable()
export class DrawDayService implements OnModuleInit {
  private readonly logger = new Logger(DrawDayService.name);

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit() {
    setInterval(() => this.tick(), 60 * 1000);
    this.logger.log('DrawDayService 启动：每分钟检查开奖时间，自动取消未付款订单，次日07:00建下一期');
    this.tick();
  }

  // ── 供外部调用的方法（保持接口兼容，逻辑已移入 tick）────────────────────
  /** 设置已确认开奖日（现在直接从DB读取，此方法保留为空操作保持兼容性） */
  setConfirmedDrawDay(_date: string | null, _drawMins = -1) {}
  /** 清除自动归档标志（已由DB幂等操作替代，保留为空操作） */
  clearAutoArchiveFlag() {}

  // ── 核心定时逻辑 ─────────────────────────────────────────────────────────
  private async tick() {
    try {
      const panama = getPanamaNow();
      const todayStr = `${String(panama.d).padStart(2, '0')}-${String(panama.m).padStart(2, '0')}-${panama.y}`;
      const todayISO = `${panama.y}-${String(panama.m).padStart(2, '0')}-${String(panama.d).padStart(2, '0')}`;
      const nowMins = panama.h * 60 + panama.min;

      const drawRepo = this.dataSource.getRepository(Draw);
      const pending = await drawRepo
        .createQueryBuilder('d')
        .where('d.status = :s', { s: 'pending' })
        .andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
        .andWhere('(d.shop_id IS NULL)')
        .orderBy('d.draw_id', 'DESC')
        .getOne();

      if (pending) {
        // ── 有待开奖期：到点取消未付款订单（UPDATE 本身幂等，多次调用无害）──
        const parsed = parseDrawTime(pending);
        if (!parsed) return;
        const { dateStr, h, min } = parsed;
        const drawMins = h * 60 + min;
        if (dateStr === todayStr && nowMins >= drawMins) {
          await this.cancelUnpaidOrders(pending.draw_id);
        }
      } else {
        // ── 无待开奖期（结果已发）：次日 07:00 全量归档 + 创建下一期 ──
        if (nowMins < 7 * 60) return;

        const lastCompleted = await drawRepo
          .createQueryBuilder('d')
          .where('d.status = :s', { s: 'completed' })
          .andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
          .andWhere('(d.shop_id IS NULL)')
          .orderBy('d.draw_id', 'DESC')
          .getOne();
        if (!lastCompleted) return;

        // 确认今天 >= 已完成开奖日的次日（防止当天结算后立刻建下一期）
        const rawDate = String((lastCompleted as any).draw_date || '').slice(0, 10);
        if (!rawDate) return;
        const dayAfterDate = new Date(rawDate + 'T12:00:00');
        dayAfterDate.setDate(dayAfterDate.getDate() + 1);
        const dayAfterISO = `${dayAfterDate.getFullYear()}-${String(dayAfterDate.getMonth() + 1).padStart(2, '0')}-${String(dayAfterDate.getDate()).padStart(2, '0')}`;

        if (todayISO < dayAfterISO) return;

        // 全量归档所有未归档的已完成期
        await drawRepo
          .createQueryBuilder()
          .update(Draw)
          .set({ archived_at: new Date() } as any)
          .where('status = :s AND archived_at IS NULL', { s: 'completed' })
          .execute();

        // 创建下一期（按周三/周日规则，对齐避免重复创建相同自然日）
        const completedDateBase = snapToStandardDrawDay(new Date(rawDate + 'T12:00:00'));
        const nextDraw = getNextDrawDatePanama(completedDateBase);
        const nextDateStr = `${nextDraw.getFullYear()}-${String(nextDraw.getMonth() + 1).padStart(2, '0')}-${String(nextDraw.getDate()).padStart(2, '0')}`;

        const next = drawRepo.create({
          draw_date: nextDateStr as any,
          draw_time: '15:00:00',
          status: 'pending',
          winning_numbers: '',
          is_manual_override: false,
          lottery_type: 'NACIONAL',
          shop_id: null,
        });
        await drawRepo.save(next);
        this.logger.log(`次日07:00: 全量归档完成，创建下一期 draw_id=${next.draw_id}, draw_date=${nextDateStr}`);
      }
    } catch (e) {
      this.logger.error('tick 异常: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  /** 开奖时间到：将当期所有未付款订单（status=0）标记为已取消（status=-1）；幂等操作 */
  private async cancelUnpaidOrders(drawId: number) {
    try {
      const result = await this.dataSource.getRepository(Order)
        .createQueryBuilder()
        .update(Order)
        .set({ status: -1 } as any)
        .where('draw_id = :drawId AND status = 0', { drawId })
        .execute();
      if (result.affected && result.affected > 0) {
        this.logger.log(`开奖时间到，取消未付款订单 ${result.affected} 条（draw_id=${drawId}）`);
      }
    } catch (e) {
      this.logger.warn('取消未付款订单失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  }
}
