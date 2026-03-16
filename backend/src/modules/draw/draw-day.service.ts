import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource, IsNull, In } from 'typeorm';
import { Draw } from '../../entities/draw.entity';
import * as fs from 'fs';
import * as path from 'path';

const PANAMA_TZ = 'America/Panama';
const FILE_NAME = 'draw-day.json';

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
    // ISO 格式：2026-03-19T14:00:00
    const dt = new Date(timeStr);
    if (isNaN(dt.getTime())) return null;
    // draw_time 存的是本地时间字符串，直接解析年月日时分
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
    // HH:mm 或 HH:mm:ss
    const parts = timeStr.split(':').map(Number);
    if (parts.length >= 2 && !isNaN(parts[0])) { h = parts[0]; min = parts[1] || 0; }
    // 日期从 draw_date
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
  private filePath: string;

  /** 已确认的开奖日 DD-MM-YYYY，用于 bet-status 停售判断 */
  private confirmedDrawDay: string | null = null;
  /** 开奖时间（分钟，从 0:00 起），-1 表示未知 */
  private confirmedDrawMins = -1;
  /** 已触发过自动归档的日期，避免重复 */
  private autoArchivedForDate: string | null = null;

  constructor(private readonly dataSource: DataSource) {
    this.filePath = path.join(process.cwd(), FILE_NAME);
    this.load();
  }

  onModuleInit() {
    setInterval(() => this.tick(), 60 * 1000);
    this.logger.log('DrawDayService: 每分钟检查开奖时间，到时自动停售并归档上期结果');
    // 启动时立即检查一次
    this.tick();
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(raw);
        this.confirmedDrawDay = data.confirmedDrawDay ?? null;
        this.confirmedDrawMins = data.confirmedDrawMins ?? -1;
        this.autoArchivedForDate = data.autoArchivedForDate ?? null;
      }
    } catch {
      this.confirmedDrawDay = null;
    }
  }

  private save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify({
        confirmedDrawDay: this.confirmedDrawDay,
        confirmedDrawMins: this.confirmedDrawMins,
        autoArchivedForDate: this.autoArchivedForDate,
      }, null, 2), 'utf-8');
    } catch (e) {
      this.logger.warn('保存 draw-day 失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  /** 供 bet-status 使用 */
  getConfirmedDrawDay(): string | null { return this.confirmedDrawDay; }
  getConfirmedDrawMins(): number { return this.confirmedDrawMins; }

  setConfirmedDrawDay(date: string | null, drawMins = -1) {
    this.confirmedDrawDay = date;
    this.confirmedDrawMins = drawMins;
    this.save();
  }

  private async tick() {
    const panama = getPanamaNow();
    const todayStr = `${String(panama.d).padStart(2, '0')}-${String(panama.m).padStart(2, '0')}-${panama.y}`;
    const nowMins = panama.h * 60 + panama.min;

    const drawRepo = this.dataSource.getRepository(Draw);
    const pending = await drawRepo.findOne({
      where: { status: 'pending' },
      order: { draw_id: 'DESC' },
    });

    if (!pending) {
      if (this.confirmedDrawDay !== null) {
        this.setConfirmedDrawDay(null);
      }
      return;
    }

    const parsed = parseDrawTime(pending);
    if (!parsed) return;

    const { dateStr, h, min } = parsed;
    const drawMins = h * 60 + min;

    // 更新确认开奖日（只要 pending 存在就维护）
    if (this.confirmedDrawDay !== dateStr || this.confirmedDrawMins !== drawMins) {
      this.setConfirmedDrawDay(dateStr, drawMins);
      this.logger.log(`开奖日更新: ${dateStr} ${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`);
    }

    // 自动归档：开奖日当天，当前时间 >= draw_time，且本日还未归档过
    if (dateStr === todayStr && nowMins >= drawMins && this.autoArchivedForDate !== todayStr) {
      this.autoArchivedForDate = todayStr;
      this.save();
      await this.autoArchiveLastCompleted();
    }
  }

  /** 将上一期已完成、未归档的结果自动归档 */
  private async autoArchiveLastCompleted() {
    const drawRepo = this.dataSource.getRepository(Draw);
    const completed = await drawRepo.findOne({
      where: { status: In(['COMPLETED', 'completed']), archived_at: IsNull() },
      order: { draw_id: 'DESC' },
    });
    if (!completed) return;
    await drawRepo.update(completed.draw_id, { archived_at: new Date() });
    this.logger.log(`自动归档上期结果: draw_id=${completed.draw_id}`);
  }
}
