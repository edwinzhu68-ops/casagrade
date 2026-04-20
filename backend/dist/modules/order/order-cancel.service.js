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
var OrderCancelService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderCancelService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const order_entity_1 = require("../../entities/order.entity");
const draw_entity_1 = require("../../entities/draw.entity");
const INTERVAL_MS = 60 * 1000;
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
let OrderCancelService = OrderCancelService_1 = class OrderCancelService {
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(OrderCancelService_1.name);
        this.timer = null;
    }
    onModuleInit() {
        this.timer = setInterval(() => this.cancelExpiredPendingOrders(), INTERVAL_MS);
        this.logger.log('定时任务已启动：每 1 分钟检查停售后未付款订单并自动取消');
    }
    async isInStopSellPeriod() {
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        const draw = await drawRepo
            .createQueryBuilder('d')
            .where('d.status = :s', { s: 'pending' })
            .andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
            .andWhere('(d.shop_id IS NULL)')
            .orderBy('d.draw_id', 'DESC')
            .getOne();
        if (!draw)
            return true;
        const timeStr = String(draw.draw_time || '15:00').trim();
        let drawHour = 15, drawMin = 0;
        if (timeStr.includes('T')) {
            const dt = new Date(timeStr);
            if (!isNaN(dt.getTime())) {
                drawHour = dt.getHours();
                drawMin = dt.getMinutes();
            }
        }
        else {
            const p = timeStr.split(':').map(Number);
            if (p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1])) {
                drawHour = p[0];
                drawMin = p[1];
            }
        }
        let dy, dm, dd;
        if (timeStr.includes('T') && /^\d{4}-\d{2}-\d{2}/.test(timeStr)) {
            dy = parseInt(timeStr.slice(0, 4), 10);
            dm = parseInt(timeStr.slice(5, 7), 10);
            dd = parseInt(timeStr.slice(8, 10), 10);
        }
        else if (draw.draw_date) {
            const raw = draw.draw_date;
            const d = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(raw))
                ? new Date(String(raw).substring(0, 10) + 'T12:00:00Z')
                : new Date(raw);
            dy = d.getUTCFullYear();
            dm = d.getUTCMonth() + 1;
            dd = d.getUTCDate();
        }
        else {
            return false;
        }
        const stopSaleStart = drawHour * 60 + drawMin;
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
    async cancelExpiredPendingOrders() {
        try {
            if (!(await this.isInStopSellPeriod()))
                return;
            const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
            const nowTs = new Date();
            const result = await orderRepo
                .createQueryBuilder()
                .update(order_entity_1.Order)
                .set({ status: -1, canceled_at: nowTs, updated_at: nowTs })
                .where('status = :status', { status: 0 })
                .andWhere('(lottery_type IS NULL OR lottery_type = :nac)', { nac: 'NACIONAL' })
                .execute();
            if (result.affected && result.affected > 0) {
                this.logger.log(`停售后自动取消 ${result.affected} 笔未付款订单`);
            }
        }
        catch (e) {
            this.logger.warn('自动取消订单检查失败: ' + (e && e.message));
        }
    }
};
exports.OrderCancelService = OrderCancelService;
exports.OrderCancelService = OrderCancelService = OrderCancelService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], OrderCancelService);
//# sourceMappingURL=order-cancel.service.js.map