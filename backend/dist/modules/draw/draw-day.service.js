"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var DrawDayService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrawDayService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const draw_entity_1 = require("../../entities/draw.entity");
const order_entity_1 = require("../../entities/order.entity");
const draw_period_no_1 = require("../../utils/draw-period-no");
function snapToStandardDrawDay(date) {
    const day = date.getDay();
    if (day === 0 || day === 3)
        return date;
    const daysToWed = ((3 - day + 7) % 7) || 7;
    const daysToSun = ((0 - day + 7) % 7) || 7;
    const days = Math.min(daysToWed, daysToSun);
    const snapped = new Date(date);
    snapped.setDate(snapped.getDate() + days);
    return snapped;
}
function getNextDrawDatePanama(from) {
    let base;
    if (from) {
        base = from;
    }
    else {
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
function getPanamaNow() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: PANAMA_TZ,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now);
    const get = (type) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
    let h = get('hour');
    const min = get('minute');
    if (h === 24)
        h = 0;
    return { y: get('year'), m: get('month'), d: get('day'), h, min };
}
function parseDrawTime(draw) {
    const timeStr = String(draw.draw_time || '').trim();
    let h = 15, min = 0;
    let dateStr = null;
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
    }
    else {
        const p = timeStr.split(':').map(Number);
        if (p.length >= 2 && !isNaN(p[0])) {
            h = p[0];
            min = p[1] || 0;
        }
        const rawDate = draw.draw_date;
        if (!rawDate)
            return null;
        const rawDateStr = String(rawDate);
        const d = typeof rawDateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawDateStr)
            ? new Date(rawDateStr.slice(0, 10) + 'T12:00:00Z')
            : new Date(rawDateStr);
        if (isNaN(d.getTime()))
            return null;
        dateStr = `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
    }
    if (!dateStr)
        return null;
    return { dateStr, h, min };
}
let DrawDayService = DrawDayService_1 = class DrawDayService {
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(DrawDayService_1.name);
    }
    onModuleInit() {
        setInterval(() => this.tick(), 60 * 1000);
        this.logger.log('DrawDayService 启动：每分钟检查开奖时间，自动取消未付款订单，次日07:00建下一期');
        this.tick();
    }
    setConfirmedDrawDay(_date, _drawMins = -1) { }
    clearAutoArchiveFlag() { }
    async tick() {
        try {
            const panama = getPanamaNow();
            const todayStr = `${String(panama.d).padStart(2, '0')}-${String(panama.m).padStart(2, '0')}-${panama.y}`;
            const todayISO = `${panama.y}-${String(panama.m).padStart(2, '0')}-${String(panama.d).padStart(2, '0')}`;
            const nowMins = panama.h * 60 + panama.min;
            const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
            const pending = await drawRepo
                .createQueryBuilder('d')
                .where('d.status = :s', { s: 'pending' })
                .andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
                .andWhere('(d.shop_id IS NULL)')
                .orderBy('d.draw_id', 'DESC')
                .getOne();
            if (pending) {
                const parsed = parseDrawTime(pending);
                if (!parsed)
                    return;
                const { dateStr, h, min } = parsed;
                const drawMins = h * 60 + min;
                if (dateStr === todayStr && nowMins >= drawMins) {
                    await this.cancelUnpaidOrders(pending.draw_id);
                }
                const pendingDateISO = String(pending.draw_date || '').slice(0, 10);
                if (pendingDateISO && todayISO >= pendingDateISO && nowMins >= 7 * 60) {
                    const archiveResult = await drawRepo
                        .createQueryBuilder()
                        .update(draw_entity_1.Draw)
                        .set({ archived_at: new Date() })
                        .where('status = :s AND archived_at IS NULL AND draw_id != :pid', { s: 'completed', pid: pending.draw_id })
                        .andWhere('(lottery_type = :lt OR lottery_type IS NULL)', { lt: 'NACIONAL' })
                        .andWhere('(shop_id IS NULL)')
                        .execute();
                    if (archiveResult.affected && archiveResult.affected > 0) {
                        this.logger.log(`开奖日${pendingDateISO} 07:00: 归档${archiveResult.affected}个已完成期`);
                    }
                }
            }
            else {
                if (nowMins < 7 * 60)
                    return;
                const lastCompleted = await drawRepo
                    .createQueryBuilder('d')
                    .where('d.status = :s', { s: 'completed' })
                    .andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
                    .andWhere('(d.shop_id IS NULL)')
                    .orderBy('d.draw_id', 'DESC')
                    .getOne();
                if (!lastCompleted)
                    return;
                const rawDate = String(lastCompleted.draw_date || '').slice(0, 10);
                if (rawDate === todayISO)
                    return;
                if (!rawDate)
                    return;
                const nextDraw = getNextDrawDatePanama(new Date(rawDate + 'T12:00:00'));
                const nextDateStr = `${nextDraw.getFullYear()}-${String(nextDraw.getMonth() + 1).padStart(2, '0')}-${String(nextDraw.getDate()).padStart(2, '0')}`;
                const periodNo = await (0, draw_period_no_1.getNextPeriodNoForScope)(drawRepo, { shopId: null, lotteryType: 'NACIONAL' });
                const next = drawRepo.create({
                    draw_date: nextDateStr,
                    draw_time: '15:00:00',
                    status: 'pending',
                    winning_numbers: '',
                    is_manual_override: false,
                    lottery_type: 'NACIONAL',
                    shop_id: null,
                    period_no: periodNo,
                });
                await drawRepo.save(next);
                this.logger.log(`次日07:00: 创建下一期 draw_id=${next.draw_id} period_no=${periodNo}, draw_date=${nextDateStr}（归档将在${nextDateStr}开奖日进行）`);
            }
        }
        catch (e) {
            this.logger.error('tick 异常: ' + (e instanceof Error ? e.message : String(e)));
        }
    }
    async cancelUnpaidOrders(drawId) {
        try {
            const result = await this.dataSource.getRepository(order_entity_1.Order)
                .createQueryBuilder()
                .update(order_entity_1.Order)
                .set({ status: -1 })
                .where('draw_id = :drawId AND status = 0', { drawId })
                .execute();
            if (result.affected && result.affected > 0) {
                this.logger.log(`开奖时间到，取消未付款订单 ${result.affected} 条（draw_id=${drawId}）`);
            }
        }
        catch (e) {
            this.logger.warn('取消未付款订单失败: ' + (e instanceof Error ? e.message : String(e)));
        }
    }
};
exports.DrawDayService = DrawDayService;
exports.DrawDayService = DrawDayService = DrawDayService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], DrawDayService);
//# sourceMappingURL=draw-day.service.js.map