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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DrawController_1, AdminController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminController = exports.DrawController = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const typeorm_2 = require("typeorm");
const draw_entity_1 = require("../../entities/draw.entity");
const order_entity_1 = require("../../entities/order.entity");
const admin_token_guard_1 = require("../../guards/admin-token.guard");
const draw_day_service_1 = require("./draw-day.service");
const BILLETE_RATE = {
    exact: [2000, 600, 300],
    first3: [50, 20, 10],
    last3: [50, 20, 10],
    first2: [3, 0, 0],
    last2: [3, 2, 1],
    last1: [1, 0, 0],
};
const CHANCE_RATE = [14, 3, 2];
function calcBilletePrizeForOneDraw(betNum, winRaw, qty, prizeIndex) {
    const originalLen = winRaw.replace(/\D/g, '').length;
    if (qty <= 0 || originalLen < 2)
        return 0;
    const b = betNum.slice(-4).padStart(4, '0');
    const wDigits = winRaw.replace(/\D/g, '');
    const w = (wDigits.length > 4 ? wDigits.slice(-4) : wDigits).padStart(4, '0');
    if (originalLen < 4) {
        if (b.substring(2, 4) === w.substring(2, 4))
            return BILLETE_RATE.last2[prizeIndex] * qty;
        return 0;
    }
    if (b === w)
        return BILLETE_RATE.exact[prizeIndex] * qty;
    if (b.substring(0, 3) === w.substring(0, 3))
        return BILLETE_RATE.first3[prizeIndex] * qty;
    if (b.substring(1, 4) === w.substring(1, 4))
        return BILLETE_RATE.last3[prizeIndex] * qty;
    if (b.substring(0, 2) === w.substring(0, 2))
        return BILLETE_RATE.first2[prizeIndex] * qty;
    if (b.substring(2, 4) === w.substring(2, 4))
        return BILLETE_RATE.last2[prizeIndex] * qty;
    if (b.substring(3, 4) === w.substring(3, 4))
        return BILLETE_RATE.last1[prizeIndex] * qty;
    return 0;
}
async function settleOrdersForDraw(dataSource, drawId, primer, segundo, tercero) {
    const orderRepo = dataSource.getRepository(order_entity_1.Order);
    const win1 = String(primer ?? '').replace(/\D/g, '');
    const win2 = String(segundo ?? '').replace(/\D/g, '');
    const win3 = String(tercero ?? '').replace(/\D/g, '');
    const ch1 = win1.slice(-2).padStart(2, '0');
    const ch2 = win2.slice(-2).padStart(2, '0');
    const ch3 = win3.slice(-2).padStart(2, '0');
    const orders = await orderRepo.find({
        where: { status: 1, draw_id: drawId },
    });
    for (const order of orders) {
        let totalWin = 0;
        const numbers = order.numbers || [];
        const gameType = (order.game_type || '').toUpperCase();
        const winBreakdown = [];
        for (const bet of numbers) {
            const num = String(bet.n ?? '');
            const qty = Number(bet.q) || 0;
            let lineWin = 0;
            let matchInfo = '';
            const numLen = num.replace(/\D/g, '').length;
            if (numLen >= 4) {
                const betNum = num.slice(-4).padStart(4, '0');
                const isGordito = win2.length <= 2 && win3.length <= 2;
                const win1Val = calcBilletePrizeForOneDraw(betNum, win1, qty, 0);
                const win2Val = isGordito ? 0 : calcBilletePrizeForOneDraw(betNum, win2, qty, 1);
                const win3Val = isGordito ? 0 : calcBilletePrizeForOneDraw(betNum, win3, qty, 2);
                lineWin = win1Val + win2Val + win3Val;
                const matches = [];
                if (win1Val > 0)
                    matches.push('头奖');
                if (win2Val > 0)
                    matches.push('二奖');
                if (win3Val > 0)
                    matches.push('三奖');
                if (matches.length > 0)
                    matchInfo = matches.join('+');
            }
            else if (numLen >= 2) {
                const betCh = num.slice(-2).padStart(2, '0');
                let winVal = 0;
                if (betCh === ch1) {
                    winVal += CHANCE_RATE[0] * qty;
                    matchInfo += (matchInfo ? '+' : '') + '头奖';
                }
                if (betCh === ch2) {
                    winVal += CHANCE_RATE[1] * qty;
                    matchInfo += (matchInfo ? '+' : '') + '二奖';
                }
                if (betCh === ch3) {
                    winVal += CHANCE_RATE[2] * qty;
                    matchInfo += (matchInfo ? '+' : '') + '三奖';
                }
                lineWin = winVal;
                if (matchInfo)
                    matchInfo += '(14+3+2)';
            }
            totalWin += lineWin;
            winBreakdown.push({ n: num, q: qty, win: lineWin, match: matchInfo || undefined });
        }
        const newStatus = totalWin > 0 ? 3 : 2;
        await orderRepo.update(order.order_id, {
            draw_id: drawId,
            win_amount: totalWin,
            win_breakdown: winBreakdown,
            status: newStatus,
            settled_at: new Date(),
        });
    }
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
function dateToDDMMYYYY(d) {
    const dd = d.getDate();
    const mm = d.getMonth() + 1;
    const yy = d.getFullYear();
    return `${String(dd).padStart(2, '0')}-${String(mm).padStart(2, '0')}-${yy}`;
}
function drawDateToDisplayString(val) {
    if (val == null)
        return null;
    let yyyyMmDd;
    if (typeof val === 'string') {
        const s = val.trim().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
            return null;
        yyyyMmDd = s;
    }
    else {
        const d = new Date(val);
        if (isNaN(d.getTime()))
            return null;
        yyyyMmDd = d.toISOString().slice(0, 10);
    }
    const [y, m, d] = [yyyyMmDd.slice(0, 4), yyyyMmDd.slice(5, 7), yyyyMmDd.slice(8, 10)];
    return `${d}-${m}-${y}`;
}
function parseDDMMYYYY(s) {
    const parts = String(s).trim().split(/[-/]/);
    if (parts.length !== 3)
        return null;
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    if (isNaN(d) || isNaN(m) || isNaN(y) || m < 0 || m > 11)
        return null;
    const date = new Date(y, m, d);
    if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d)
        return null;
    return date;
}
function parseYYYYMMDD(s) {
    const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m)
        return null;
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    if (mo < 0 || mo > 11 || d < 1 || d > 31)
        return null;
    const date = new Date(Date.UTC(y, mo, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo || date.getUTCDate() !== d)
        return null;
    return date;
}
function dateToYYYYMMDD(d) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
let DrawController = DrawController_1 = class DrawController {
    constructor(dataSource, drawDayService) {
        this.dataSource = dataSource;
        this.drawDayService = drawDayService;
        this.logger = new common_1.Logger(DrawController_1.name);
    }
    async fetchFirebase() {
        const url = 'https://loteria-panama.firebaseio.com/.json';
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Firebase 请求失败: ${res.status}`);
        }
        const raw = (await res.json());
        const get = (key) => {
            const v = raw[key];
            return v != null ? String(v).trim() : '';
        };
        const drawType = get('Tipo de Sorteo').toUpperCase();
        const digits = (s) => s.replace(/\D/g, '');
        const pRaw = digits(get('Primer Premio'));
        const sRaw = digits(get('Segundo Premio'));
        const tRaw = digits(get('Tercer Premio'));
        let primer;
        let segundo;
        let tercero;
        if (drawType === 'GORDITO') {
            primer = pRaw.slice(-4).padStart(4, '0');
            segundo = sRaw.slice(-2).padStart(2, '0');
            tercero = tRaw.slice(-2).padStart(2, '0');
        }
        else if (drawType === 'EXTRAORDINARIA') {
            primer = pRaw.slice(-5).padStart(5, '0');
            segundo = sRaw.slice(-5).padStart(5, '0');
            tercero = tRaw.slice(-5).padStart(5, '0');
        }
        else {
            primer = pRaw.slice(-4).padStart(4, '0');
            segundo = sRaw.slice(-4).padStart(4, '0');
            tercero = tRaw.slice(-4).padStart(4, '0');
        }
        return {
            success: true,
            data: {
                drawType: get('Tipo de Sorteo'),
                primer,
                segundo,
                tercero,
                letras: get('Letras'),
            },
        };
    }
    async getLatestDraw() {
        const draw = await this.dataSource.getRepository(draw_entity_1.Draw).findOne({
            where: { status: (0, typeorm_2.In)(['COMPLETED', 'completed']), archived_at: (0, typeorm_2.IsNull)() },
            order: { draw_id: 'DESC' },
        });
        if (!draw) {
            return {
                draw: null,
                message: '暂无开奖记录',
            };
        }
        let winning;
        try {
            winning = JSON.parse(draw.winning_numbers);
        }
        catch {
            winning = { primer: draw.winning_numbers };
        }
        let drawDate = null;
        if (draw.draw_date) {
            const raw = draw.draw_date;
            if (typeof raw === 'string') {
                drawDate = raw.slice(0, 10);
            }
            else {
                const d = new Date(raw);
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
    async getPendingDraw() {
        const draw = await this.dataSource.getRepository(draw_entity_1.Draw).findOne({
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
    getNextDate() {
        const next = getNextDrawDatePanama();
        const y = next.getFullYear();
        const m = String(next.getMonth() + 1).padStart(2, '0');
        const d = String(next.getDate()).padStart(2, '0');
        return { date: `${y}-${m}-${d}`, time: '15:00' };
    }
    async setDrawTime(dto) {
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        let draw = await drawRepo.findOne({
            where: { status: 'pending' },
            order: { draw_id: 'DESC' },
        });
        const updatePayload = {};
        if (dto.drawTime != null && dto.drawTime !== '') {
            updatePayload.draw_time = dto.drawTime;
            if (typeof dto.drawTime === 'string' && dto.drawTime.includes('T') && /^\d{4}-\d{2}-\d{2}/.test(dto.drawTime)) {
                const dateOnly = dto.drawTime.slice(0, 10);
                const parsed = parseYYYYMMDD(dateOnly);
                if (parsed)
                    updatePayload.draw_date = parsed;
            }
        }
        if (dto.drawDate != null && dto.drawDate !== '') {
            const parsed = parseYYYYMMDD(dto.drawDate) || parseDDMMYYYY(dto.drawDate);
            if (parsed)
                updatePayload.draw_date = parsed;
        }
        if (updatePayload.draw_date || updatePayload.draw_time) {
            const dateForCheck = updatePayload.draw_date || null;
            const timeForCheck = updatePayload.draw_time || '15:00:00';
            if (dateForCheck) {
                const dateStr = typeof dateForCheck === 'string'
                    ? dateForCheck.slice(0, 10)
                    : dateForCheck.toISOString().slice(0, 10);
                const timePart = timeForCheck.includes('T') ? timeForCheck.slice(11, 16) : timeForCheck.slice(0, 5);
                const [hh, mm] = timePart.split(':').map(Number);
                const targetUtcMs = new Date(`${dateStr}T${String(hh).padStart(2, '0')}:${String(mm || 0).padStart(2, '0')}:00-05:00`).getTime();
                if (!isNaN(targetUtcMs) && targetUtcMs <= Date.now()) {
                    return { success: false, error: '开奖时间必须晚于当前巴拿马时间，请重新填写' };
                }
            }
        }
        if (draw) {
            if (Object.keys(updatePayload).length > 0) {
                updatePayload.is_manual_override = true;
                await drawRepo.update(draw.draw_id, updatePayload);
                if (updatePayload.draw_time)
                    draw.draw_time = updatePayload.draw_time;
                if (updatePayload.draw_date)
                    draw.draw_date = updatePayload.draw_date;
            }
        }
        else {
            draw = drawRepo.create({
                draw_date: updatePayload.draw_date || new Date(),
                draw_time: updatePayload.draw_time || '15:00:00',
                status: 'pending',
                winning_numbers: '',
                is_manual_override: true,
            });
            await drawRepo.save(draw);
        }
        this.logger.log(`开奖时间设置: draw_time=${draw.draw_time}, draw_date=${draw.draw_date}, 期次: ${draw.draw_id}`);
        return {
            success: true,
            drawId: draw.draw_id,
            drawTime: draw.draw_time,
            drawDate: draw.draw_date ? (typeof draw.draw_date === 'string' ? draw.draw_date : draw.draw_date.toISOString().slice(0, 10)) : null,
        };
    }
    async manualDraw(dto) {
        const primer = (dto.primer ?? dto.billete ?? '').toString().trim();
        const segundo = (dto.segundo ?? dto.segundas ?? '').toString().trim();
        const tercero = (dto.tercero ?? dto.terceras ?? '').toString().trim();
        const digits = (s) => s.replace(/\D/g, '');
        const winningNumbers = {
            primer: digits(primer),
            segundo: digits(segundo),
            tercero: digits(tercero),
        };
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        let draw = await drawRepo.findOne({
            where: { status: 'pending' },
            order: { draw_id: 'DESC' },
        });
        if (!draw) {
            const lastCompleted = await drawRepo.findOne({
                where: { status: 'completed' },
                order: { draw_id: 'DESC' },
            });
            if (lastCompleted) {
                const completedAt = new Date(lastCompleted.updated_at || lastCompleted.created_at);
                const secondsAgo = (Date.now() - completedAt.getTime()) / 1000;
                if (secondsAgo < 60) {
                    return { success: false, error: '开奖已完成，请勿重复提交（60秒内）' };
                }
            }
        }
        const hasValidPending = draw != null && Number.isFinite(draw.draw_id);
        if (hasValidPending) {
            const updateFields = {
                winning_numbers: JSON.stringify(winningNumbers),
                status: 'completed',
                draw_time: dto.drawTime || draw.draw_time,
            };
            if (dto.drawTime && typeof dto.drawTime === 'string' && dto.drawTime.includes('T') && /^\d{4}-\d{2}-\d{2}/.test(dto.drawTime)) {
                const parsed = parseYYYYMMDD(dto.drawTime.slice(0, 10));
                if (parsed)
                    updateFields.draw_date = parsed;
            }
            await drawRepo.update(draw.draw_id, updateFields);
            if (updateFields.draw_date)
                draw.draw_date = updateFields.draw_date;
        }
        else {
            draw = drawRepo.create({
                draw_date: new Date(),
                draw_time: dto.drawTime || new Date().toTimeString().split(' ')[0],
                status: 'completed',
                winning_numbers: JSON.stringify(winningNumbers),
            });
            await drawRepo.save(draw);
        }
        this.logger.log(`开奖完成: ${JSON.stringify(winningNumbers)}`);
        const cancelResult = await this.dataSource.getRepository(order_entity_1.Order)
            .createQueryBuilder()
            .update(order_entity_1.Order)
            .set({ status: -1 })
            .where('draw_id = :drawId AND status = 0', { drawId: draw.draw_id })
            .execute();
        if (cancelResult.affected && cancelResult.affected > 0) {
            this.logger.log(`开奖时取消未付款订单 ${cancelResult.affected} 条`);
        }
        await settleOrdersForDraw(this.dataSource, draw.draw_id, winningNumbers.primer, winningNumbers.segundo, winningNumbers.tercero);
        await drawRepo
            .createQueryBuilder()
            .update(draw_entity_1.Draw)
            .set({ status: 'canceled' })
            .where('status = :s AND draw_id < :id', { s: 'pending', id: draw.draw_id })
            .execute();
        return {
            success: true,
            drawId: draw.draw_id,
            primer: winningNumbers.primer,
            segundo: winningNumbers.segundo,
            tercero: winningNumbers.tercero,
        };
    }
    async resetDrawTime() {
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        const pending = await drawRepo.findOne({
            where: { status: 'pending' },
            order: { draw_id: 'DESC' },
        });
        const lastCompleted = await drawRepo.findOne({
            where: { status: (0, typeorm_2.In)(['COMPLETED', 'completed']) },
            order: { draw_id: 'DESC' },
        });
        let nextDraw;
        if (lastCompleted && lastCompleted.draw_date) {
            const base = new Date(typeof lastCompleted.draw_date === 'string'
                ? lastCompleted.draw_date + 'T12:00:00'
                : lastCompleted.draw_date);
            nextDraw = getNextDrawDatePanama(base);
        }
        else {
            nextDraw = getNextDrawDatePanama();
        }
        const nextDateStr = `${nextDraw.getFullYear()}-${String(nextDraw.getMonth() + 1).padStart(2, '0')}-${String(nextDraw.getDate()).padStart(2, '0')}`;
        const nextDateDisplay = drawDateToDisplayString(nextDateStr);
        if (pending) {
            await drawRepo.update(pending.draw_id, {
                draw_date: nextDateStr,
                draw_time: '15:00:00',
                is_manual_override: false,
            });
            this.drawDayService.setConfirmedDrawDay(nextDateDisplay, 900);
            this.logger.log(`恢复默认开奖时间: draw_id=${pending.draw_id}, draw_date=${nextDateStr}`);
            return { success: true, drawId: pending.draw_id, drawDate: nextDateDisplay, drawTime: '15:00' };
        }
        else {
            const next = drawRepo.create({
                draw_date: nextDateStr,
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
    async resetPendingDraw() {
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        await drawRepo
            .createQueryBuilder()
            .update(draw_entity_1.Draw)
            .set({ status: 'canceled' })
            .where('status = :s', { s: 'pending' })
            .execute();
        const nextDraw = getNextDrawDatePanama();
        const nextDateStr = `${nextDraw.getFullYear()}-${String(nextDraw.getMonth() + 1).padStart(2, '0')}-${String(nextDraw.getDate()).padStart(2, '0')}`;
        const next = drawRepo.create({
            draw_date: nextDateStr,
            draw_time: '15:00:00',
            status: 'pending',
            winning_numbers: '',
            is_manual_override: false,
        });
        await drawRepo.save(next);
        const nextDateDisplay = drawDateToDisplayString(nextDateStr);
        this.drawDayService.setConfirmedDrawDay(nextDateDisplay, 900);
        this.drawDayService.clearAutoArchiveFlag();
        this.logger.log(`重置待开奖期: 新 draw_id=${next.draw_id}, draw_date=${nextDateStr}`);
        return { success: true, drawId: next.draw_id, drawDate: nextDateDisplay, drawTime: '15:00' };
    }
    async rollbackDraw() {
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const completed = await drawRepo.findOne({
            where: { status: (0, typeorm_2.In)(['COMPLETED', 'completed']) },
            order: { draw_id: 'DESC' },
        });
        if (!completed) {
            return { success: false, error: '没有可回滚的已完成开奖' };
        }
        const redeemed = await orderRepo
            .createQueryBuilder('o')
            .where('o.draw_id = :did', { did: completed.draw_id })
            .andWhere('o.redeemed_at IS NOT NULL')
            .getCount();
        if (redeemed > 0) {
            return { success: false, error: `已有 ${redeemed} 笔订单完成兑奖，无法回滚` };
        }
        const nextPending = await drawRepo.findOne({
            where: { status: 'pending' },
            order: { draw_id: 'DESC' },
        });
        const shouldDeleteNext = nextPending && nextPending.draw_id !== completed.draw_id;
        await orderRepo
            .createQueryBuilder()
            .update(order_entity_1.Order)
            .set({ status: 1, win_amount: 0, win_breakdown: null, settled_at: null })
            .where('draw_id = :did AND status IN (2, 3)', { did: completed.draw_id })
            .execute();
        await drawRepo.update(completed.draw_id, {
            status: 'pending',
            winning_numbers: '',
            archived_at: null,
        });
        if (shouldDeleteNext) {
            await drawRepo.delete(nextPending.draw_id);
        }
        this.logger.log(`回滚开奖: draw_id=${completed.draw_id}`);
        return {
            success: true,
            drawId: completed.draw_id,
            drawDate: completed.draw_date,
            drawTime: completed.draw_time,
        };
    }
};
exports.DrawController = DrawController;
__decorate([
    (0, common_1.Get)('fetch-firebase'),
    (0, common_1.UseGuards)(admin_token_guard_1.AdminTokenGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DrawController.prototype, "fetchFirebase", null);
__decorate([
    (0, common_1.Get)('latest'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DrawController.prototype, "getLatestDraw", null);
__decorate([
    (0, common_1.Get)('pending'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DrawController.prototype, "getPendingDraw", null);
__decorate([
    (0, common_1.Get)('next-date'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DrawController.prototype, "getNextDate", null);
__decorate([
    (0, common_1.Post)('time'),
    (0, common_1.UseGuards)(admin_token_guard_1.AdminTokenGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DrawController.prototype, "setDrawTime", null);
__decorate([
    (0, common_1.Post)('manual'),
    (0, common_1.UseGuards)(admin_token_guard_1.AdminTokenGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DrawController.prototype, "manualDraw", null);
__decorate([
    (0, common_1.Post)('reset-time'),
    (0, common_1.UseGuards)(admin_token_guard_1.AdminTokenGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DrawController.prototype, "resetDrawTime", null);
__decorate([
    (0, common_1.Post)('reset-pending'),
    (0, common_1.UseGuards)(admin_token_guard_1.AdminTokenGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DrawController.prototype, "resetPendingDraw", null);
__decorate([
    (0, common_1.Post)('rollback'),
    (0, common_1.UseGuards)(admin_token_guard_1.AdminTokenGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DrawController.prototype, "rollbackDraw", null);
exports.DrawController = DrawController = DrawController_1 = __decorate([
    (0, common_1.Controller)('draw'),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        draw_day_service_1.DrawDayService])
], DrawController);
let AdminController = AdminController_1 = class AdminController {
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(AdminController_1.name);
    }
    async clearSettlement() {
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        const result = await drawRepo
            .createQueryBuilder()
            .update(draw_entity_1.Draw)
            .set({ archived_at: new Date() })
            .where('status IN (:...statuses) AND archived_at IS NULL', { statuses: ['COMPLETED', 'completed'] })
            .execute();
        if (!result.affected || result.affected === 0) {
            throw new common_1.NotFoundException('暂无已开奖期，无需清空');
        }
        return {
            success: true,
            message: `已清空开奖结算，共归档 ${result.affected} 期`,
        };
    }
    async cleanupNullDrawOrders() {
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const result = await orderRepo
            .createQueryBuilder()
            .delete()
            .from(order_entity_1.Order)
            .where('draw_id IS NULL')
            .execute();
        const affected = result.affected ?? 0;
        this.logger.warn(`cleanup-null-draw-orders: deleted ${affected} orders with draw_id IS NULL`);
        return { success: true, deleted: affected };
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Post)('clear-settlement'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "clearSettlement", null);
__decorate([
    (0, common_1.Post)('cleanup-null-draw-orders'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "cleanupNullDrawOrders", null);
exports.AdminController = AdminController = AdminController_1 = __decorate([
    (0, common_1.Controller)('admin'),
    (0, common_1.UseGuards)(admin_token_guard_1.AdminTokenGuard),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], AdminController);
//# sourceMappingURL=draw.controller.js.map