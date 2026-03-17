"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
const FILE_NAME = 'draw-day.json';
function getPanamaNow() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: PANAMA_TZ,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now);
    const get = (type) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
    return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
}
function parseDrawTime(draw) {
    const timeStr = String(draw.draw_time || '').trim();
    let h = 15, min = 0;
    let dateStr = null;
    if (timeStr.includes('T') && /^\d{4}-\d{2}-\d{2}/.test(timeStr)) {
        const dt = new Date(timeStr);
        if (isNaN(dt.getTime()))
            return null;
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
        const parts = timeStr.split(':').map(Number);
        if (parts.length >= 2 && !isNaN(parts[0])) {
            h = parts[0];
            min = parts[1] || 0;
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
        this.confirmedDrawDay = null;
        this.confirmedDrawMins = -1;
        this.autoArchivedForDate = null;
        this.nextPeriodCreatedForDate = null;
        this.filePath = path.join(process.cwd(), FILE_NAME);
        this.load();
    }
    onModuleInit() {
        setInterval(() => this.tick(), 60 * 1000);
        this.logger.log('DrawDayService: 每分钟检查开奖时间，到时自动停售并归档上期结果');
        this.tick();
    }
    load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf-8');
                const data = JSON.parse(raw);
                this.confirmedDrawDay = data.confirmedDrawDay ?? null;
                this.confirmedDrawMins = data.confirmedDrawMins ?? -1;
                this.autoArchivedForDate = data.autoArchivedForDate ?? null;
                this.nextPeriodCreatedForDate = data.nextPeriodCreatedForDate ?? null;
            }
        }
        catch {
            this.confirmedDrawDay = null;
        }
    }
    save() {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify({
                confirmedDrawDay: this.confirmedDrawDay,
                confirmedDrawMins: this.confirmedDrawMins,
                autoArchivedForDate: this.autoArchivedForDate,
                nextPeriodCreatedForDate: this.nextPeriodCreatedForDate,
            }, null, 2), 'utf-8');
        }
        catch (e) {
            this.logger.warn('保存 draw-day 失败: ' + (e instanceof Error ? e.message : String(e)));
        }
    }
    getConfirmedDrawDay() { return this.confirmedDrawDay; }
    getConfirmedDrawMins() { return this.confirmedDrawMins; }
    setConfirmedDrawDay(date, drawMins = -1) {
        this.confirmedDrawDay = date;
        this.confirmedDrawMins = drawMins;
        this.save();
    }
    clearAutoArchiveFlag() {
        this.autoArchivedForDate = null;
        this.save();
    }
    async tick() {
        const panama = getPanamaNow();
        const todayStr = `${String(panama.d).padStart(2, '0')}-${String(panama.m).padStart(2, '0')}-${panama.y}`;
        const todayISO = `${panama.y}-${String(panama.m).padStart(2, '0')}-${String(panama.d).padStart(2, '0')}`;
        const nowMins = panama.h * 60 + panama.min;
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        const pending = await drawRepo.findOne({
            where: { status: 'pending' },
            order: { draw_id: 'DESC' },
        });
        if (pending) {
            const parsed = parseDrawTime(pending);
            if (!parsed)
                return;
            const { dateStr, h, min } = parsed;
            const drawMins = h * 60 + min;
            if (this.confirmedDrawDay !== dateStr || this.confirmedDrawMins !== drawMins) {
                this.setConfirmedDrawDay(dateStr, drawMins);
                this.logger.log(`开奖日更新: ${dateStr} ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
            }
            if (dateStr === todayStr && nowMins >= drawMins && this.autoArchivedForDate !== todayStr) {
                this.autoArchivedForDate = todayStr;
                this.save();
                await this.cancelUnpaidOrders(pending.draw_id);
            }
        }
        else {
            if (this.confirmedDrawDay !== null) {
                this.setConfirmedDrawDay(null);
            }
            if (nowMins >= 7 * 60 && this.nextPeriodCreatedForDate !== todayStr) {
                const lastCompleted = await drawRepo.findOne({
                    where: { status: 'completed' },
                    order: { draw_id: 'DESC' },
                });
                if (lastCompleted) {
                    const rawDate = String(lastCompleted.draw_date || '').slice(0, 10);
                    const completedDateObj = new Date(rawDate + 'T12:00:00');
                    completedDateObj.setDate(completedDateObj.getDate() + 1);
                    const dayAfterISO = `${completedDateObj.getFullYear()}-${String(completedDateObj.getMonth() + 1).padStart(2, '0')}-${String(completedDateObj.getDate()).padStart(2, '0')}`;
                    if (todayISO >= dayAfterISO) {
                        await drawRepo
                            .createQueryBuilder()
                            .update(draw_entity_1.Draw)
                            .set({ archived_at: new Date() })
                            .where('status = :s AND archived_at IS NULL', { s: 'completed' })
                            .execute();
                        const completedDateBase = new Date(rawDate + 'T12:00:00');
                        const nextDraw = getNextDrawDatePanama(completedDateBase);
                        const nextDateStr = `${nextDraw.getFullYear()}-${String(nextDraw.getMonth() + 1).padStart(2, '0')}-${String(nextDraw.getDate()).padStart(2, '0')}`;
                        const next = drawRepo.create({
                            draw_date: nextDateStr,
                            draw_time: '15:00:00',
                            status: 'pending',
                            winning_numbers: '',
                            is_manual_override: false,
                        });
                        await drawRepo.save(next);
                        this.nextPeriodCreatedForDate = todayStr;
                        this.save();
                        this.logger.log(`次日07:00: 全量归档完成，创建下一期 draw_id=${next.draw_id}, draw_date=${nextDateStr}`);
                    }
                }
            }
        }
    }
    async cancelUnpaidOrders(drawId) {
        try {
            const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
            const result = await orderRepo
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
    async autoArchiveLastCompleted() {
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        const completed = await drawRepo.findOne({
            where: { status: (0, typeorm_1.In)(['COMPLETED', 'completed']), archived_at: (0, typeorm_1.IsNull)() },
            order: { draw_id: 'DESC' },
        });
        if (!completed)
            return;
        await drawRepo.update(completed.draw_id, { archived_at: new Date() });
        this.logger.log(`自动归档上期结果: draw_id=${completed.draw_id}`);
    }
};
exports.DrawDayService = DrawDayService;
exports.DrawDayService = DrawDayService = DrawDayService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], DrawDayService);
//# sourceMappingURL=draw-day.service.js.map