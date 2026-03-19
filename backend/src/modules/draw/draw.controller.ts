import { Controller, Get, Post, Body, Inject, Logger, UseGuards, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IsNull, In } from 'typeorm';
import { Draw } from '../../entities/draw.entity';
import { Order } from '../../entities/order.entity';
import { AdminTokenGuard } from '../../guards/admin-token.guard';
import { DrawDayService } from './draw-day.service';

/**
 * 中奖规则以你说的为准，不做其它查询。
 *
 * Billete（每奖只取最高档，三奖金额相加）：
 * - 四位全中：[一等奖 2000, 二等奖 600, 三等奖 300] 每张
 * - 前三位中：[50, 20, 10]
 * - 后三位中：[50, 20, 10]
 * - 前两位中：仅一等奖 3，二三等奖 0 → [3, 0, 0]
 * - 后两位中：[3, 2, 1]
 * - 最后一位中：仅一等奖 1 → [1, 0, 0]
 */
const BILLETE_RATE: Record<string, [number, number, number]> = {
  exact: [2000, 600, 300],
  first3: [50, 20, 10],
  last3: [50, 20, 10],
  first2: [3, 0, 0],
  last2: [3, 2, 1],
  last1: [1, 0, 0],
};

/**
 * Chance（你说的为准）：
 * - 0.25 一张；只看一二三奖的「后两位」，无论开奖号几位数。
 * - 头奖后两位中：14 元/张；二奖后两位中：3 元/张；三奖后两位中：2 元/张；三奖可叠加。
 */
const CHANCE_RATE: [number, number, number] = [14, 3, 2];

/**
 * 单个奖级计算：从高到低只取最高匹配档，返回 该档对应奖级的赔率×数量。
 * prizeIndex: 0=一等奖 1=二等奖 2=三等奖
 * 匹配顺序：4位 → 前3 → 后3 → 前2 → 后2 → 后1。
 */
function calcBilletePrizeForOneDraw(betNum: string, winRaw: string, qty: number, prizeIndex: 0 | 1 | 2): number {
  const originalLen = winRaw.replace(/\D/g, '').length;
  if (qty <= 0 || originalLen < 2) return 0;
  const b = betNum.slice(-4).padStart(4, '0');
  const wDigits = winRaw.replace(/\D/g, '');
  const w = (wDigits.length > 4 ? wDigits.slice(-4) : wDigits).padStart(4, '0');
  // 奖号不足4位（如2位数）：只比后两位，不做精确/前三/后三等高档比较
  if (originalLen < 4) {
    if (b.substring(2, 4) === w.substring(2, 4)) return BILLETE_RATE.last2[prizeIndex] * qty;
    return 0;
  }
  if (b === w) return BILLETE_RATE.exact[prizeIndex] * qty;
  if (b.substring(0, 3) === w.substring(0, 3)) return BILLETE_RATE.first3[prizeIndex] * qty;
  if (b.substring(1, 4) === w.substring(1, 4)) return BILLETE_RATE.last3[prizeIndex] * qty;
  if (b.substring(0, 2) === w.substring(0, 2)) return BILLETE_RATE.first2[prizeIndex] * qty;
  if (b.substring(2, 4) === w.substring(2, 4)) return BILLETE_RATE.last2[prizeIndex] * qty;
  if (b.substring(3, 4) === w.substring(3, 4)) return BILLETE_RATE.last1[prizeIndex] * qty;
  return 0;
}

/**
 * 开奖完成后结算「本期的已付款订单」：订单创建时已带 draw_id = 待开奖期 id，这里按 draw_id = 当前完成期 筛选并结算
 * Billete：对头奖/二奖/三奖分别算一次（每个奖只取最高档），三者相加。
 */
async function settleOrdersForDraw(
  dataSource: DataSource,
  drawId: number,
  primer: string,
  segundo: string,
  tercero: string,
): Promise<void> {
  const win1 = String(primer ?? '').replace(/\D/g, '');
  const win2 = String(segundo ?? '').replace(/\D/g, '');
  const win3 = String(tercero ?? '').replace(/\D/g, '');
  const ch1 = win1.slice(-2).padStart(2, '0');
  const ch2 = win2.slice(-2).padStart(2, '0');
  const ch3 = win3.slice(-2).padStart(2, '0');

  const orders = await dataSource.getRepository(Order).find({
    where: { status: 1, draw_id: drawId },
  });

  // 用事务包装所有结算更新，失败自动回滚
  await dataSource.transaction(async (manager) => {
    for (const order of orders) {
      let totalWin = 0;
      const numbers = (order.numbers as { n: string; q: number }[]) || [];
      const winBreakdown: { n: string; q: number; win: number; match?: string }[] = [];

      for (const bet of numbers) {
        const num = String(bet.n ?? '');
        const qty = Number(bet.q) || 0;
        let lineWin = 0;
        let matchInfo = '';

        // 按号码位数区分规则：4位是Billete，2位是Chance（不再按game_type字段区分）
        const numLen = num.replace(/\D/g, '').length;
        if (numLen >= 4) {
          // Billete：
          // - 普通开奖（二三奖均为4位）：三个奖都参与，各取最高档，结果相加
          // - GORDITO（二三奖为2位）：只与头奖比对
          const betNum = num.slice(-4).padStart(4, '0');
          const isGordito = win2.length <= 2 && win3.length <= 2;
          const win1Val = calcBilletePrizeForOneDraw(betNum, win1, qty, 0);
          const win2Val = isGordito ? 0 : calcBilletePrizeForOneDraw(betNum, win2, qty, 1);
          const win3Val = isGordito ? 0 : calcBilletePrizeForOneDraw(betNum, win3, qty, 2);
          lineWin = win1Val + win2Val + win3Val;
          // 记录匹配档位
          const matches: string[] = [];
          if (win1Val > 0) matches.push('头奖');
          if (win2Val > 0) matches.push('二奖');
          if (win3Val > 0) matches.push('三奖');
          if (matches.length > 0) matchInfo = matches.join('+');
        } else if (numLen >= 2) {
          // Chance：取后2位 [14,3,2]，三奖叠加
          const betCh = num.slice(-2).padStart(2, '0');
          let winVal = 0;
          if (betCh === ch1) { winVal += CHANCE_RATE[0] * qty; matchInfo += (matchInfo ? '+' : '') + '头奖'; }
          if (betCh === ch2) { winVal += CHANCE_RATE[1] * qty; matchInfo += (matchInfo ? '+' : '') + '二奖'; }
          if (betCh === ch3) { winVal += CHANCE_RATE[2] * qty; matchInfo += (matchInfo ? '+' : '') + '三奖'; }
          lineWin = winVal;
          if (matchInfo) matchInfo += '(14+3+2)';
        }
        totalWin += lineWin;
        winBreakdown.push({ n: num, q: qty, win: lineWin, match: matchInfo || undefined });
      }

      const newStatus = totalWin > 0 ? 3 : 2; // 3=已中奖 2=已开奖
      await manager.update(Order, order.order_id, {
        draw_id: drawId,
        win_amount: totalWin,
        win_breakdown: winBreakdown,
        status: newStatus,
        settled_at: new Date(),
      } as any);
    }
  });
}

/** 巴拿马下一开奖日：取最近的下一个周三或周日（哪个近用哪个）。
 *  from: 基准日期（通常是刚完成的开奖日）；不传则用今天巴拿马时间。 */
function getNextDrawDatePanama(from?: Date): Date {
  let base: Date;
  if (from) {
    base = from;
  } else {
    const now = new Date();
    base = new Date(now.toLocaleString('en-US', { timeZone: 'America/Panama' }));
  }
  const day = base.getDay(); // 0=Sun, 3=Wed
  // 距下一个周三/周日的天数，当天本身不算（用 || 7 处理 0 的情况）
  const daysToWed = ((3 - day + 7) % 7) || 7;
  const daysToSun = ((0 - day + 7) % 7) || 7;
  const days = Math.min(daysToWed, daysToSun);
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  next.setHours(15, 0, 0, 0);
  return next;
}

/** Date 转 DD-MM-YYYY（用于一般日期，本地时区） */
function dateToDDMMYYYY(d: Date): string {
  const dd = d.getDate();
  const mm = d.getMonth() + 1;
  const yy = d.getFullYear();
  return `${String(dd).padStart(2, '0')}-${String(mm).padStart(2, '0')}-${yy}`;
}

/**
 * 开奖日 display：从 DB 读出的 draw_date 转为 DD-MM-YYYY，不做时区转换，保证“设成几号就显示几号”。
 * 支持 Date 或 YYYY-MM-DD 字符串（SQLite/TypeORM 可能返回任一种）。
 */
function drawDateToDisplayString(val: Date | string | null | undefined): string | null {
  if (val == null) return null;
  let yyyyMmDd: string;
  if (typeof val === 'string') {
    const s = val.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    yyyyMmDd = s;
  } else {
    const d = new Date(val as any);
    if (isNaN(d.getTime())) return null;
    yyyyMmDd = d.toISOString().slice(0, 10);
  }
  const [y, m, d] = [yyyyMmDd.slice(0, 4), yyyyMmDd.slice(5, 7), yyyyMmDd.slice(8, 10)];
  return `${d}-${m}-${y}`;
}

/** 解析 DD-MM-YYYY 或 D-M-YYYY 为 Date */
function parseDDMMYYYY(s: string): Date | null {
  const parts = String(s).trim().split(/[-/]/);
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const y = parseInt(parts[2], 10);
  if (isNaN(d) || isNaN(m) || isNaN(y) || m < 0 || m > 11) return null;
  const date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return date;
}

/** 解析 YYYY-MM-DD 为 Date（UTC 当日 0 点），保证入库后任意时区读回仍是同一天 */
function parseYYYYMMDD(s: string): Date | null {
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo || date.getUTCDate() !== d) return null;
  return date;
}

/** 手动开奖用：Date 转 YYYY-MM-DD */
function dateToYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface SetDrawTimeDto {
  drawTime?: string; // HH:mm:ss
  drawDate?: string; // 手动开奖用 YYYY-MM-DD；也支持 DD-MM-YYYY
}

interface ManualDrawDto {
  primer: string;
  segundo?: string;
  tercero?: string;
  drawTime?: string;
}

@Controller('draw')
export class DrawController {
  private readonly logger = new Logger(DrawController.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly drawDayService: DrawDayService,
  ) {}

  /**
   * GET /api/draw/fetch-firebase - 从 Firebase 拉取巴拿马官方开奖数据（需管理员密钥）
   * 数据源: https://loteria-panama.firebaseio.com/.json
   * 按 Tipo de Sorteo 解析位数：
   * - MIERCOLITO / DOMINICAL：三奖均为 4 位
   * - GORDITO：头奖 4 位，二奖三奖 2 位
   * - EXTRAORDINARIA：三奖均为 5 位（写入时取后 4 位与现有结算一致）
   */
  @Get('fetch-firebase')
  @UseGuards(AdminTokenGuard)
  async fetchFirebase() {
    const url = 'https://loteria-panama.firebaseio.com/.json';
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Firebase 请求失败: ${res.status}`);
    }
    const raw = (await res.json()) as Record<string, unknown>;
    const get = (key: string) => {
      const v = raw[key];
      return v != null ? String(v).trim() : '';
    };
    const drawType = get('Tipo de Sorteo').toUpperCase();
    const digits = (s: string) => s.replace(/\D/g, '');

    // 保留原始字符串（含 -- 等占位符），前端可据此判断是否还未开完
    const pFull = get('Primer Premio');
    const sFull = get('Segundo Premio');
    const tFull = get('Tercer Premio');
    const pRaw = digits(pFull);
    const sRaw = digits(sFull);
    const tRaw = digits(tFull);

    let primer: string;
    let segundo: string;
    let tercero: string;

    // GORDITO：头奖取后4位，二三奖取后2位
    // 其他：直接返回原始字符串（含 --），前端检测 - 号判断是否未完整
    if (drawType.includes('GORDITO')) {
      primer = pRaw.length >= 4 ? pRaw.slice(-4) : pFull;
      segundo = sRaw.length >= 2 ? sRaw.slice(-2) : sFull;
      tercero = tRaw.length >= 2 ? tRaw.slice(-2) : tFull;
    } else {
      primer = pFull;
      segundo = sFull;
      tercero = tFull;
    }

    // 按 drawType 决定预计开奖位数（供前端"准备开奖"提示用）
    const expectedDigits: { p: number; s: number; t: number } =
      drawType === 'GORDITO' ? { p: 4, s: 2, t: 2 } :
      drawType === 'EXTRAORDINARIA' ? { p: 5, s: 5, t: 5 } :
      { p: 4, s: 4, t: 4 };

    return {
      success: true,
      data: {
        drawType: get('Tipo de Sorteo'),
        drawDate: get('Fecha del Sorteo'),   // 原样返回，如 "16-03-2026"
        drawHora: get('Hora del Sorteo'),    // 原样返回，如 "15:00" 或空
        primer,
        segundo,
        tercero,
        letras: get('Letras'),
        expectedDigits,                      // 预计各奖位数
      },
    };
  }

  /**
   * GET /api/draw/fetch-lnb - 从 lnb.gob.pa 官网爬取开奖号码（需管理员密钥）
   */
  @Get('fetch-lnb')
  @UseGuards(AdminTokenGuard)
  async fetchLnb() {
    try {
      const url = 'https://lnb.gob.pa/';
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LotteryBot/1.0)' },
      });
      if (!res.ok) return { success: false, error: `LNB 请求失败: ${res.status}` };
      const html = await res.text();

      // 提取所有 premio-number 里的数字（\s* 处理标签内可能的空白）
      const matches = [...html.matchAll(/class="premio-number"[^>]*>\s*([\d\s\-]+?)\s*<\/div>/g)];
      const primer  = matches[0]?.[1]?.replace(/\D/g, '') || '';
      const segundo = matches[1]?.[1]?.replace(/\D/g, '') || '';
      const tercero = matches[2]?.[1]?.replace(/\D/g, '') || '';

      if (!primer && !segundo && !tercero) {
        // 调试用：返回部分 HTML 片段帮助排查结构
        const snippet = html.slice(html.indexOf('premio'), html.indexOf('premio') + 500).replace(/\n/g, ' ');
        this.logger.warn(`LNB 未匹配到号码，HTML片段: ${snippet}`);
        return { success: false, error: 'LNB 页面未找到开奖号码（可能页面结构已变化）' };
      }

      return { success: true, data: { primer, segundo, tercero, source: 'lnb.gob.pa' } };
    } catch (e) {
      this.logger.error('fetchLnb error', e);
      return { success: false, error: String((e as any)?.message || e) };
    }
  }

  /**
   * GET /api/draw/latest - 获取最近开奖（未归档的最近一期；归档后结算页显示等待开奖）
   */
  @Get('latest')
  async getLatestDraw() {
    const draw = await this.dataSource.getRepository(Draw).findOne({
      where: { status: In(['COMPLETED', 'completed']), archived_at: IsNull() },
      order: { draw_id: 'DESC' },
    });

    if (!draw) {
      return {
        draw: null,
        message: '暂无开奖记录',
      };
    }

    // 解析 winning_numbers
    let winning;
    try {
      winning = JSON.parse(draw.winning_numbers);
    } catch {
      winning = { primer: draw.winning_numbers };
    }

    // 原样返回开奖日期：以数据库里的 draw_date 字段为准，不做时区换算
    let drawDate: string | null = null;
    if ((draw as any).draw_date) {
      const raw = (draw as any).draw_date;
      if (typeof raw === 'string') {
        drawDate = raw.slice(0, 10);
      } else {
        const d = new Date(raw as any);
        const y = d.getFullYear();
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const dd = d.getDate().toString().padStart(2, '0');
        drawDate = `${y}-${m}-${dd}`;
      }
    }

    return {
      draw: {
        drawId: draw.draw_id,
        primer: winning.primer || winning.primeras || '',
        segundo: winning.segundo || winning.segundas || '',
        tercero: winning.tercero || winning.terceras || winning.ultimas || '',
        drawTime: draw.draw_time,
        drawDate,
        status: draw.status,
      },
    };
  }

  /**
   * GET /api/draw/pending - 获取待开奖期（本期：16:00 开售到下次 14:55 停售）
   * 老板端用本期 drawId 筛订单，统计本期销售额/订单数
   */
  @Get('pending')
  async getPendingDraw() {
    const draw = await this.dataSource.getRepository(Draw).findOne({
      where: { status: 'pending' },
      order: { draw_id: 'DESC' },
    });
    if (!draw) {
      return { draw: null, message: '暂无待开奖期' };
    }
    const drawDateStr = drawDateToDisplayString(draw.draw_date);
    return {
      draw: {
        drawId: draw.draw_id,
        drawTime: draw.draw_time,
        drawDate: drawDateStr,
        status: draw.status,
        isManualOverride: draw.is_manual_override || false,
      },
    };
  }

  /**
   * GET /api/draw/next-date - 返回服务器计算的下次开奖日期（巴拿马时间）
   */
  @Get('next-date')
  getNextDate() {
    const next = getNextDrawDatePanama();
    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, '0');
    const d = String(next.getDate()).padStart(2, '0');
    return { date: `${y}-${m}-${d}`, time: '15:00' };
  }

  /**
   * POST /api/draw/time - 设置开奖时间（需管理员密钥）
   */
  @Post('time')
  @UseGuards(AdminTokenGuard)
  async setDrawTime(@Body() dto: SetDrawTimeDto) {
    const drawRepo = this.dataSource.getRepository(Draw);
    let draw = await drawRepo.findOne({
      where: { status: 'pending' },
      order: { draw_id: 'DESC' },
    });

    const updatePayload: Partial<Draw> = {};
    if (dto.drawTime != null && dto.drawTime !== '') {
      updatePayload.draw_time = dto.drawTime;
      // ISO 格式（如 2026-03-16T15:00:00）时同步更新 draw_date，避免下一期日期基于旧 draw_date 计算
      if (typeof dto.drawTime === 'string' && dto.drawTime.includes('T') && /^\d{4}-\d{2}-\d{2}/.test(dto.drawTime)) {
        const dateOnly = dto.drawTime.slice(0, 10);
        const parsed = parseYYYYMMDD(dateOnly);
        if (parsed) updatePayload.draw_date = parsed;
      }
    }
    if (dto.drawDate != null && dto.drawDate !== '') {
      const parsed = parseYYYYMMDD(dto.drawDate) || parseDDMMYYYY(dto.drawDate);
      if (parsed) updatePayload.draw_date = parsed;
    }

    // ✅ 校验：开奖时间不能是过去（防止 tick() 立即触发错误归档）
    // 用 draw_date + draw_time 组合出目标时间，与巴拿马当前时间比较
    if (updatePayload.draw_date || updatePayload.draw_time) {
      const dateForCheck: Date | null = (updatePayload.draw_date as Date) || null;
      const timeForCheck: string = (updatePayload.draw_time as string) || '15:00:00';
      if (dateForCheck) {
        const dateStr = typeof dateForCheck === 'string'
          ? (dateForCheck as string).slice(0, 10)
          : (dateForCheck as Date).toISOString().slice(0, 10);
        const timePart = timeForCheck.includes('T') ? timeForCheck.slice(11, 16) : timeForCheck.slice(0, 5);
        const [hh, mm] = timePart.split(':').map(Number);
        // 构造巴拿马本地时刻（UTC-5），与当前 UTC 对比
        const targetUtcMs = new Date(`${dateStr}T${String(hh).padStart(2,'0')}:${String(mm || 0).padStart(2,'0')}:00-05:00`).getTime();
        if (!isNaN(targetUtcMs) && targetUtcMs <= Date.now()) {
          return { success: false, error: '开奖时间必须晚于当前巴拿马时间，请重新填写' };
        }
      }
    }

    if (draw) {
      if (Object.keys(updatePayload).length > 0) {
        updatePayload.is_manual_override = true;
        await drawRepo.update(draw.draw_id, updatePayload);
        if (updatePayload.draw_time) draw.draw_time = updatePayload.draw_time as string;
        if (updatePayload.draw_date) draw.draw_date = updatePayload.draw_date as Date;
      }
    } else {
      draw = drawRepo.create({
        draw_date: (updatePayload.draw_date as Date) || new Date(),
        draw_time: (updatePayload.draw_time as string) || '15:00:00',
        status: 'pending',
        winning_numbers: '',
        is_manual_override: true,
      });
      await drawRepo.save(draw);
    }

    this.logger.log(`开奖时间设置: draw_time=${(draw as any).draw_time}, draw_date=${(draw as any).draw_date}, 期次: ${draw.draw_id}`);

    return {
      success: true,
      drawId: draw.draw_id,
      drawTime: draw.draw_time,
      drawDate: draw.draw_date ? (typeof draw.draw_date === 'string' ? draw.draw_date : draw.draw_date.toISOString().slice(0, 10)) : null,
    };
  }

  /**
   * POST /api/draw/manual - 手动开奖（需管理员密钥）
   * 兼容前端字段：primer/billete, segundo/segundas, tercero/terceras
   */
  @Post('manual')
  @UseGuards(AdminTokenGuard)
  async manualDraw(@Body() dto: ManualDrawDto & { billete?: string; segundas?: string; terceras?: string }) {
    const primer = (dto.primer ?? dto.billete ?? '').toString().trim();
    const segundo = (dto.segundo ?? dto.segundas ?? '').toString().trim();
    const tercero = (dto.tercero ?? dto.terceras ?? '').toString().trim();

    const digits = (s: string) => s.replace(/\D/g, '');
    const winningNumbers = {
      primer: digits(primer),
      segundo: digits(segundo),
      tercero: digits(tercero),
    };
    const drawRepo = this.dataSource.getRepository(Draw);

    // 找到待开奖期次
    let draw = await drawRepo.findOne({
      where: { status: 'pending' },
      order: { draw_id: 'DESC' },
    });

    // 防重复开奖：无 pending 期时检查最近一期是否刚刚完成（60秒内），若是则拒绝
    if (!draw) {
      const lastCompleted = await drawRepo.findOne({
        where: { status: 'completed' },
        order: { draw_id: 'DESC' },
      });
      if (lastCompleted) {
        const completedAt = new Date((lastCompleted as any).updated_at || (lastCompleted as any).created_at);
        const secondsAgo = (Date.now() - completedAt.getTime()) / 1000;
        if (secondsAgo < 60) {
          return { success: false, error: '开奖已完成，请勿重复提交（60秒内）' };
        }
      }
    }

    const hasValidPending = draw != null && Number.isFinite((draw as any).draw_id);
    if (hasValidPending) {
      const updateFields: Partial<Draw> = {
        winning_numbers: JSON.stringify(winningNumbers),
        status: 'completed',
        draw_time: dto.drawTime || (draw as any).draw_time,
      };
      // ISO 格式 drawTime（如 2026-03-16T15:00:00）时同步更新 draw_date
      if (dto.drawTime && typeof dto.drawTime === 'string' && dto.drawTime.includes('T') && /^\d{4}-\d{2}-\d{2}/.test(dto.drawTime)) {
        const parsed = parseYYYYMMDD(dto.drawTime.slice(0, 10));
        if (parsed) updateFields.draw_date = parsed;
      }
      await drawRepo.update((draw as any).draw_id, updateFields);
      if (updateFields.draw_date) (draw as any).draw_date = updateFields.draw_date;
    } else {
      // 无待开奖期次或 draw_id 无效时，新建一条已开奖记录并保存（避免 update(undefined) 报 Empty criteria）
      draw = drawRepo.create({
        draw_date: new Date(),
        draw_time: dto.drawTime || new Date().toTimeString().split(' ')[0],
        status: 'completed',
        winning_numbers: JSON.stringify(winningNumbers),
      });
      await drawRepo.save(draw);
    }

    this.logger.log(`开奖完成: ${JSON.stringify(winningNumbers)}`);

    // 开奖前取消所有未付款订单（兜底：tick 已处理过的本次为 0 条）
    const cancelResult = await this.dataSource.getRepository(Order)
      .createQueryBuilder()
      .update(Order)
      .set({ status: -1 } as any)
      .where('draw_id = :drawId AND status = 0', { drawId: draw.draw_id })
      .execute();
    if (cancelResult.affected && cancelResult.affected > 0) {
      this.logger.log(`开奖时取消未付款订单 ${cancelResult.affected} 条`);
    }

    await settleOrdersForDraw(
      this.dataSource,
      draw.draw_id,
      winningNumbers.primer,
      winningNumbers.segundo,
      winningNumbers.tercero,
    );

    // 清理孤立 pending（draw_id 小于本次开奖的旧 pending）
    await drawRepo
      .createQueryBuilder()
      .update(Draw)
      .set({ status: 'canceled' } as any)
      .where('status = :s AND draw_id < :id', { s: 'pending', id: draw.draw_id })
      .execute();

    // 下一期由 DrawDayService 在次日 07:00 自动创建，同时全量归档

    return {
      success: true,
      drawId: draw.draw_id,
      primer: winningNumbers.primer,
      segundo: winningNumbers.segundo,
      tercero: winningNumbers.tercero,
    };
  }

  /**
   * POST /api/draw/reset-time - 恢复默认开奖时间（将手动覆盖重置为系统计算的下次周三/周日 15:00）
   * 以最近已完成的开奖日为基准重新计算，is_manual_override 置 false
   */
  @Post('reset-time')
  @UseGuards(AdminTokenGuard)
  async resetDrawTime() {
    const drawRepo = this.dataSource.getRepository(Draw);
    const pending = await drawRepo.findOne({
      where: { status: 'pending' },
      order: { draw_id: 'DESC' },
    });

    // 以最近已完成开奖日为基准计算下次正常开奖日
    const lastCompleted = await drawRepo.findOne({
      where: { status: In(['COMPLETED', 'completed']) },
      order: { draw_id: 'DESC' },
    });

    let nextDraw: Date;
    if (lastCompleted && lastCompleted.draw_date) {
      const base = new Date(
        typeof lastCompleted.draw_date === 'string'
          ? (lastCompleted.draw_date as string) + 'T12:00:00'
          : (lastCompleted.draw_date as any),
      );
      nextDraw = getNextDrawDatePanama(base);
    } else {
      nextDraw = getNextDrawDatePanama();
    }

    const nextDateStr = `${nextDraw.getFullYear()}-${String(nextDraw.getMonth() + 1).padStart(2, '0')}-${String(nextDraw.getDate()).padStart(2, '0')}`;

    // DD-MM-YYYY 格式供 DrawDayService 使用
    const nextDateDisplay = drawDateToDisplayString(nextDateStr); // returns DD-MM-YYYY

    if (pending) {
      await drawRepo.update(pending.draw_id, {
        draw_date: nextDateStr as any,
        draw_time: '15:00:00',
        is_manual_override: false,
      });
      // 立即同步 DrawDayService 内存状态（不等下一次 tick），15:00 = 900 分钟
      this.drawDayService.setConfirmedDrawDay(nextDateDisplay, 900);
      this.logger.log(`恢复默认开奖时间: draw_id=${pending.draw_id}, draw_date=${nextDateStr}`);
      return { success: true, drawId: pending.draw_id, drawDate: nextDateDisplay, drawTime: '15:00' };
    } else {
      // 不存在 pending 期时，新建一期
      const next = drawRepo.create({
        draw_date: nextDateStr as any,
        draw_time: '15:00:00',
        status: 'pending',
        winning_numbers: '',
        is_manual_override: false,
      });
      await drawRepo.save(next);
      this.drawDayService.setConfirmedDrawDay(nextDateDisplay, 900);
      this.logger.log(`新建默认待开奖期: draw_id=${next.draw_id}, draw_date=${nextDateStr}`);
      return { success: true, drawId: next.draw_id, drawDate: nextDateDisplay, drawTime: '15:00' };
    }
  }

  /**
   * POST /api/draw/reset-pending - 兜底恢复：取消当前 pending 期，按服务器当前巴拿马时间重建正确的下一期
   */
  @Post('reset-pending')
  @UseGuards(AdminTokenGuard)
  async resetPendingDraw() {
    const drawRepo = this.dataSource.getRepository(Draw);

    // 取消所有 pending
    await drawRepo
      .createQueryBuilder()
      .update(Draw)
      .set({ status: 'canceled' } as any)
      .where('status = :s', { s: 'pending' })
      .execute();

    // 以服务器当前巴拿马时间为基准计算下次正常开奖日
    const nextDraw = getNextDrawDatePanama();

    const nextDateStr = `${nextDraw.getFullYear()}-${String(nextDraw.getMonth() + 1).padStart(2, '0')}-${String(nextDraw.getDate()).padStart(2, '0')}`;

    const next = drawRepo.create({
      draw_date: nextDateStr as any,
      draw_time: '15:00:00',
      status: 'pending',
      winning_numbers: '',
      is_manual_override: false,
    });
    await drawRepo.save(next);
    const nextDateDisplay = drawDateToDisplayString(nextDateStr);
    // 立即同步 DrawDayService 内存状态，并清除 autoArchivedForDate 标志
    // （测试开奖可能已触发归档标志，重置后需要确保下次真正开奖时能正常归档）
    this.drawDayService.setConfirmedDrawDay(nextDateDisplay, 900);
    this.drawDayService.clearAutoArchiveFlag();
    this.logger.log(`重置待开奖期: 新 draw_id=${next.draw_id}, draw_date=${nextDateStr}`);
    return { success: true, drawId: next.draw_id, drawDate: nextDateDisplay, drawTime: '15:00' };
  }

  /**
   * POST /api/draw/rollback - 回滚最近一次开奖（需管理员密钥）
   * 将最新 completed 期恢复为 pending，重置所有已结算订单
   */
  @Post('rollback')
  @UseGuards(AdminTokenGuard)
  async rollbackDraw() {
    const drawRepo = this.dataSource.getRepository(Draw);
    const orderRepo = this.dataSource.getRepository(Order);

    // 找最近一期已完成的开奖
    const completed = await drawRepo.findOne({
      where: { status: In(['COMPLETED', 'completed']) },
      order: { draw_id: 'DESC' },
    });
    if (!completed) {
      return { success: false, error: '没有可回滚的已完成开奖' };
    }

    // 检查是否有已兑奖订单（redeemed_at 不为 null），有则拒绝回滚
    const redeemed = await orderRepo
      .createQueryBuilder('o')
      .where('o.draw_id = :did', { did: completed.draw_id })
      .andWhere('o.redeemed_at IS NOT NULL')
      .getCount();
    if (redeemed > 0) {
      return { success: false, error: `已有 ${redeemed} 笔订单完成兑奖，无法回滚` };
    }

    // 先找出自动创建的下一期 pending（draw_id 比 completed 大），稍后删除
    const nextPending = await drawRepo.findOne({
      where: { status: 'pending' },
      order: { draw_id: 'DESC' },
    });
    const shouldDeleteNext = nextPending && nextPending.draw_id !== completed.draw_id;

    // 重置已结算订单（status 2/3）回 status=1，清除结算字段
    await orderRepo
      .createQueryBuilder()
      .update(Order)
      .set({ status: 1, win_amount: 0, win_breakdown: null, settled_at: null } as any)
      .where('draw_id = :did AND status IN (2, 3)', { did: completed.draw_id })
      .execute();

    // 恢复 draw 到 pending
    await drawRepo.update(completed.draw_id, {
      status: 'pending',
      winning_numbers: '',
      archived_at: null,
    } as any);

    // 删除自动创建的下一期 pending（避免出现两个 pending）
    if (shouldDeleteNext) {
      await drawRepo.delete(nextPending!.draw_id);
    }

    this.logger.log(`回滚开奖: draw_id=${completed.draw_id}`);
    return {
      success: true,
      drawId: completed.draw_id,
      drawDate: completed.draw_date,
      drawTime: completed.draw_time,
    };
  }
}

/**
 * 管理员Controller（开奖等，需管理员密钥）
 */
@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * POST /api/admin/clear-settlement - 清空开奖结算（当前期转入历史，结算页显示等待开奖）；登录即可，不需管理员密钥
   */
  @Post('clear-settlement')
  async clearSettlement() {
    const drawRepo = this.dataSource.getRepository(Draw);
    // 一次性归档所有未归档的 completed draws，防止旧期次一直轮流显示
    const result = await drawRepo
      .createQueryBuilder()
      .update(Draw)
      .set({ archived_at: new Date() } as any)
      .where('status IN (:...statuses) AND archived_at IS NULL', { statuses: ['COMPLETED', 'completed'] })
      .execute();
    if (!result.affected || result.affected === 0) {
      throw new NotFoundException('暂无已开奖期，无需清空');
    }
    return {
      success: true,
      message: `已清空开奖结算，共归档 ${result.affected} 期`,
    };
  }

  /**
   * 删除所有 draw_id 为空的历史订单（危险操作，仅用于清理旧脏数据）
   * POST /api/admin/cleanup-null-draw-orders
   * 需要管理员密钥（AdminTokenGuard）
   */
  @Post('cleanup-null-draw-orders')
  async cleanupNullDrawOrders() {
    const orderRepo = this.dataSource.getRepository(Order);
    const result = await orderRepo
      .createQueryBuilder()
      .delete()
      .from(Order)
      .where('draw_id IS NULL')
      .execute();

    const affected = result.affected ?? 0;
    this.logger.warn(`cleanup-null-draw-orders: deleted ${affected} orders with draw_id IS NULL`);
    return { success: true, deleted: affected };
  }

}
