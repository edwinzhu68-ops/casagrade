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
var SettlementService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettlementService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const order_entity_1 = require("../../entities/order.entity");
const shop_entity_1 = require("../../entities/shop.entity");
const draw_entity_1 = require("../../entities/draw.entity");
let SettlementService = SettlementService_1 = class SettlementService {
    constructor(dataSource, orderRepo, shopRepo, drawRepo) {
        this.dataSource = dataSource;
        this.orderRepo = orderRepo;
        this.shopRepo = shopRepo;
        this.drawRepo = drawRepo;
        this.logger = new common_1.Logger(SettlementService_1.name);
    }
    async settleDraw(drawId) {
        const draw = await this.drawRepo.findOne({
            where: { draw_id: drawId },
        });
        if (!draw) {
            throw new Error('开奖期次不存在');
        }
        const winning = this.parseDrawResult(draw);
        this.logger.log(`开奖结果: ${winning.primer} ${winning.segundo} ${winning.tercero}`);
        const orders = await this.orderRepo.find({
            where: { status: 1, draw_id: drawId },
        });
        const results = {
            totalOrders: orders.length,
            totalSales: 0,
            totalPayout: 0,
            wins: 0,
            results: [],
        };
        for (const order of orders) {
            const orderResult = this.settleOrder(order, winning);
            results.results.push(orderResult);
            results.totalSales += orderResult.sales;
            results.totalPayout += orderResult.payout;
            if (orderResult.payout > 0)
                results.wins++;
        }
        await this.dataSource.transaction(async (manager) => {
            for (let i = 0; i < orders.length; i++) {
                const order = orders[i];
                const orderResult = results.results[i];
                await manager.update(order_entity_1.Order, order.order_id, {
                    status: orderResult.payout > 0 ? 3 : 2,
                    win_amount: orderResult.payout,
                    win_breakdown: orderResult.wins,
                    settled_at: new Date(),
                });
            }
            await manager.update(draw_entity_1.Draw, drawId, { status: 'COMPLETED' });
        });
        this.logger.log(`结算完成: ${results.totalOrders}单, 销售额$${results.totalSales}, 赔付$${results.totalPayout}, 中奖${results.wins}单`);
        return results;
    }
    settleOrder(order, winning) {
        const numbers = order.numbers;
        const gameType = order.game_type;
        const sales = Number(order.amount);
        let payout = 0;
        const wins = [];
        for (const num of numbers) {
            const numStr = num.n;
            const quantity = num.q;
            const numLen = numStr.replace(/\D/g, '').length;
            if (numLen >= 4) {
                const result = this.calculateBilletePayout(numStr, winning, quantity);
                if (result.totalPayout > 0) {
                    wins.push({
                        number: numStr,
                        matches: result.matches,
                        payout: result.totalPayout,
                    });
                }
                payout += result.totalPayout;
            }
            else if (numLen >= 2) {
                const result = this.calculateChancePayout(numStr, winning, quantity);
                if (result.totalPayout > 0) {
                    wins.push({
                        number: numStr,
                        matches: result.matches,
                        payout: result.totalPayout,
                    });
                }
                payout += result.totalPayout;
            }
        }
        return {
            orderId: order.order_id,
            gameType,
            sales,
            payout,
            wins,
        };
    }
    calculateBilletePayout(num, winning, qty) {
        const paddedNum = num.slice(-4).padStart(4, '0');
        const p = winning.primer;
        const s = winning.segundo;
        const t = winning.tercero;
        const primerNorm = p.length >= 4 ? p.slice(-4).padStart(4, '0') : null;
        const segundoNorm = s.length >= 4 ? s.slice(-4).padStart(4, '0') : null;
        const terceroNorm = t.length >= 4 ? t.slice(-4).padStart(4, '0') : null;
        const matches = [];
        let totalPayout = 0;
        if (primerNorm) {
            if (paddedNum === primerNorm) {
                matches.push(`头奖四位 ${paddedNum} x2000`);
                totalPayout += 2000 * qty;
            }
            else if (paddedNum.slice(0, 3) === primerNorm.slice(0, 3)) {
                matches.push(`头奖前三位 x50`);
                totalPayout += 50 * qty;
            }
            else if (paddedNum.slice(1, 4) === primerNorm.slice(1, 4)) {
                matches.push(`头奖后三位 x50`);
                totalPayout += 50 * qty;
            }
            else if (paddedNum.slice(0, 2) === primerNorm.slice(0, 2)) {
                matches.push(`头奖前两位 x3`);
                totalPayout += 3 * qty;
            }
            else if (paddedNum.slice(2, 4) === primerNorm.slice(2, 4)) {
                matches.push(`头奖后两位 x3`);
                totalPayout += 3 * qty;
            }
            else if (paddedNum.slice(-1) === primerNorm.slice(-1)) {
                matches.push(`头奖最后一位 x1`);
                totalPayout += 1 * qty;
            }
        }
        else {
            if (paddedNum.slice(-2) === p.slice(-2).padStart(2, '0')) {
                matches.push(`头奖后两位 ${p} x3`);
                totalPayout += 3 * qty;
            }
        }
        if (segundoNorm) {
            if (paddedNum === segundoNorm) {
                matches.push(`二奖四位 ${paddedNum} x600`);
                totalPayout += 600 * qty;
            }
            else if (paddedNum.slice(0, 3) === segundoNorm.slice(0, 3)) {
                matches.push(`二奖前三位 x20`);
                totalPayout += 20 * qty;
            }
            else if (paddedNum.slice(1, 4) === segundoNorm.slice(1, 4)) {
                matches.push(`二奖后三位 x20`);
                totalPayout += 20 * qty;
            }
            else if (paddedNum.slice(2, 4) === segundoNorm.slice(2, 4)) {
                matches.push(`二奖后两位 x2`);
                totalPayout += 2 * qty;
            }
        }
        else {
            if (paddedNum.slice(-2) === s.slice(-2).padStart(2, '0')) {
                matches.push(`二奖后两位 ${s} x2`);
                totalPayout += 2 * qty;
            }
        }
        if (terceroNorm) {
            if (paddedNum === terceroNorm) {
                matches.push(`三奖四位 ${paddedNum} x300`);
                totalPayout += 300 * qty;
            }
            else if (paddedNum.slice(0, 3) === terceroNorm.slice(0, 3)) {
                matches.push(`三奖前三位 x10`);
                totalPayout += 10 * qty;
            }
            else if (paddedNum.slice(1, 4) === terceroNorm.slice(1, 4)) {
                matches.push(`三奖后三位 x10`);
                totalPayout += 10 * qty;
            }
            else if (paddedNum.slice(2, 4) === terceroNorm.slice(2, 4)) {
                matches.push(`三奖后两位 x1`);
                totalPayout += 1 * qty;
            }
        }
        else {
            if (paddedNum.slice(-2) === t.slice(-2).padStart(2, '0')) {
                matches.push(`三奖后两位 ${t} x1`);
                totalPayout += 1 * qty;
            }
        }
        return { matches, totalPayout };
    }
    calculateChancePayout(num, winning, quantity) {
        const paddedNum = num.padStart(2, '0');
        const primerLast2 = winning.primer.slice(-2);
        const segundoLast2 = winning.segundo.slice(-2);
        const terceroLast2 = winning.tercero.slice(-2);
        const matches = [];
        let totalPayout = 0;
        if (paddedNum === primerLast2) {
            matches.push(`头奖后两位 ${paddedNum} x14`);
            totalPayout += 14 * quantity;
        }
        if (paddedNum === segundoLast2) {
            matches.push(`二奖后两位 ${paddedNum} x3`);
            totalPayout += 3 * quantity;
        }
        if (paddedNum === terceroLast2) {
            matches.push(`三奖后两位 ${paddedNum} x2`);
            totalPayout += 2 * quantity;
        }
        return { matches, totalPayout };
    }
    parseDrawResult(draw) {
        const raw = draw.winning_numbers;
        let obj = raw;
        if (typeof raw === 'string') {
            try {
                obj = JSON.parse(raw);
            }
            catch {
                const parts = raw.split(/[-\s,]/).map((v) => v.trim()).filter((v) => v.length > 0);
                return {
                    primer: (parts[0] || '').replace(/\D/g, '') || '0',
                    segundo: (parts[1] || '').replace(/\D/g, '') || '0',
                    tercero: (parts[2] || '').replace(/\D/g, '') || '0',
                };
            }
        }
        const toDigits = (v) => (v != null ? String(v).replace(/\D/g, '') : '') || '0';
        return {
            primer: toDigits(obj?.primer ?? obj?.billete),
            segundo: toDigits(obj?.segundo),
            tercero: toDigits(obj?.tercero),
        };
    }
    async getSettlementStats(shopId, startDate, endDate) {
        const query = this.orderRepo.createQueryBuilder('order');
        if (shopId) {
            query.andWhere('order.shop_id = :shopId', { shopId });
        }
        if (startDate) {
            query.andWhere('order.created_at >= :startDate', { startDate });
        }
        if (endDate) {
            query.andWhere('order.created_at <= :endDate', { endDate });
        }
        const orders = await query.getMany();
        let totalSales = 0;
        let totalPayout = 0;
        let winCount = 0;
        for (const order of orders) {
            totalSales += Number(order.amount);
            if (order.status === 3) {
                totalPayout += Number(order.win_amount);
                winCount++;
            }
        }
        return {
            totalOrders: orders.length,
            totalSales,
            totalPayout,
            winCount,
            profit: totalSales - totalPayout,
        };
    }
    async getHistoryForShop(shopId, limit = 7) {
        const draws = await this.drawRepo.find({
            where: [{ status: 'completed' }, { status: 'COMPLETED' }],
            order: { draw_id: 'DESC' },
            take: Math.max(limit * 2, 20),
        });
        const result = [];
        for (const draw of draws) {
            const orders = await this.orderRepo.find({
                where: {
                    shop_id: shopId,
                    draw_id: draw.draw_id,
                    status: (0, typeorm_2.In)([1, 2, 3]),
                },
            });
            if (orders.length === 0)
                continue;
            let totalSales = 0;
            let totalPayout = 0;
            for (const order of orders) {
                totalSales += Number(order.amount);
                totalPayout += Number(order.win_amount || 0);
            }
            const rawDate = draw.draw_date ?? draw.draw_time ?? draw.created_at ?? new Date();
            const d = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawDate)
                ? new Date(rawDate.slice(0, 10) + 'T12:00:00Z')
                : new Date(rawDate);
            const dd = d.getUTCDate();
            const mm = d.getUTCMonth() + 1;
            const yy = d.getUTCFullYear();
            const dateStr = `${String(dd).padStart(2, '0')}-${String(mm).padStart(2, '0')}-${yy}`;
            result.push({
                drawId: draw.draw_id,
                date: dateStr,
                drawDate: dateStr,
                totalSales,
                totalPayout,
                netProfit: totalSales - totalPayout,
            });
            if (result.length >= limit)
                break;
        }
        return result;
    }
};
exports.SettlementService = SettlementService;
exports.SettlementService = SettlementService = SettlementService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(2, (0, typeorm_1.InjectRepository)(shop_entity_1.Shop)),
    __param(3, (0, typeorm_1.InjectRepository)(draw_entity_1.Draw)),
    __metadata("design:paramtypes", [typeorm_2.DataSource,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], SettlementService);
//# sourceMappingURL=settlement.service.js.map