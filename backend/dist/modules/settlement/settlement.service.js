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
    constructor(orderRepo, shopRepo, drawRepo) {
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
            if (orderResult.payout > 0) {
                results.wins++;
            }
            await this.orderRepo.update(order.order_id, {
                status: orderResult.payout > 0 ? 3 : 2,
                win_amount: orderResult.payout,
                settled_at: new Date(),
            });
        }
        await this.drawRepo.update(drawId, { status: 'COMPLETED' });
        this.logger.log(`结算完成: ${results.totalOrders}单, 销售额$${results.totalSales}, 赔付$${results.totalPayout}, 中奖${results.wins}单`);
        return results;
    }
    settleOrder(order, winning) {
        const numbers = order.numbers;
        const gameType = order.game_type;
        const amount = Number(order.amount);
        let sales = 0;
        let payout = 0;
        const wins = [];
        for (const num of numbers) {
            const numStr = num.n;
            const quantity = num.q;
            if (gameType === 'BILLETE') {
                const result = this.calculateBilletePayout(numStr, winning, amount * quantity);
                if (result.totalPayout > 0) {
                    wins.push({
                        number: numStr,
                        matches: result.matches,
                        payout: result.totalPayout,
                    });
                }
                payout += result.totalPayout;
                sales += amount * quantity;
            }
            else if (gameType === 'CHANCE') {
                const result = this.calculateChancePayout(numStr, winning, amount * quantity);
                if (result.totalPayout > 0) {
                    wins.push({
                        number: numStr,
                        matches: result.matches,
                        payout: result.totalPayout,
                    });
                }
                payout += result.totalPayout;
                sales += amount * quantity;
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
    calculateBilletePayout(num, winning, betAmount) {
        const paddedNum = num.padStart(4, '0');
        const primer = winning.primer.padStart(4, '0');
        const segundo = winning.segundo.padStart(4, '0');
        const tercero = winning.tercero.padStart(4, '0');
        const matches = [];
        let totalPayout = 0;
        const primerHit = paddedNum === primer;
        const segundoHit = paddedNum === segundo;
        const terceroHit = paddedNum === tercero;
        if (primerHit) {
            matches.push(`头奖四位 ${paddedNum} x2000`);
            totalPayout += 2000 * betAmount;
        }
        if (segundoHit) {
            matches.push(`二奖四位 ${paddedNum} x600`);
            totalPayout += 600 * betAmount;
        }
        if (terceroHit) {
            matches.push(`三奖四位 ${paddedNum} x300`);
            totalPayout += 300 * betAmount;
        }
        if (!primerHit && paddedNum.slice(0, 3) === primer.slice(0, 3)) {
            matches.push(`头奖前三位 ${paddedNum.slice(0, 3)} x50`);
            totalPayout += 50 * betAmount;
        }
        if (!primerHit && paddedNum.slice(1, 4) === primer.slice(1, 4)) {
            matches.push(`头奖后三位 ${paddedNum.slice(1, 4)} x50`);
            totalPayout += 50 * betAmount;
        }
        if (!segundoHit && paddedNum.slice(1, 4) === segundo.slice(1, 4)) {
            matches.push(`二奖后三位 ${paddedNum.slice(1, 4)} x20`);
            totalPayout += 20 * betAmount;
        }
        if (!terceroHit && paddedNum.slice(1, 4) === tercero.slice(1, 4)) {
            matches.push(`三奖后三位 ${paddedNum.slice(1, 4)} x10`);
            totalPayout += 10 * betAmount;
        }
        if (!primerHit && paddedNum.slice(0, 2) === primer.slice(0, 2)) {
            matches.push(`头奖前两位 ${paddedNum.slice(0, 2)} x3`);
            totalPayout += 3 * betAmount;
        }
        if (!primerHit && paddedNum.slice(2, 4) === primer.slice(2, 4)) {
            matches.push(`头奖后两位 ${paddedNum.slice(2, 4)} x3`);
            totalPayout += 3 * betAmount;
        }
        if (!segundoHit && paddedNum.slice(2, 4) === segundo.slice(2, 4)) {
            matches.push(`二奖后两位 ${paddedNum.slice(2, 4)} x2`);
            totalPayout += 2 * betAmount;
        }
        if (!terceroHit && paddedNum.slice(2, 4) === tercero.slice(2, 4)) {
            matches.push(`三奖后两位 ${paddedNum.slice(2, 4)} x1`);
            totalPayout += 1 * betAmount;
        }
        if (totalPayout > 0 && !primerHit && paddedNum.slice(-1) === primer.slice(-1)) {
            matches.push(`头奖最后一位 +$1`);
            totalPayout += 1 * betAmount;
        }
        return { matches, totalPayout };
    }
    calculateChancePayout(num, winning, betAmount) {
        const paddedNum = num.padStart(2, '0');
        const primerLast2 = winning.primer.slice(-2);
        const segundoLast2 = winning.segundo.slice(-2);
        const terceroLast2 = winning.tercero.slice(-2);
        const matches = [];
        let totalPayout = 0;
        if (paddedNum === primerLast2) {
            matches.push(`头奖后两位 ${paddedNum} x14`);
            totalPayout += 14 * betAmount;
        }
        if (paddedNum === segundoLast2) {
            matches.push(`二奖后两位 ${paddedNum} x3`);
            totalPayout += 3 * betAmount;
        }
        if (paddedNum === terceroLast2) {
            matches.push(`三奖后两位 ${paddedNum} x2`);
            totalPayout += 2 * betAmount;
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
                    primer: (parts[0] || '0000').padStart(4, '0'),
                    segundo: (parts[1] || '0000').padStart(4, '0'),
                    tercero: (parts[2] || '0000').padStart(4, '0'),
                };
            }
        }
        const primer = (obj?.primer || obj?.billete || '').toString().padStart(4, '0');
        const segundo = (obj?.segundo || '').toString().padStart(4, '0');
        const tercero = (obj?.tercero || '').toString().padStart(4, '0');
        return { primer, segundo, tercero };
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
};
exports.SettlementService = SettlementService;
exports.SettlementService = SettlementService = SettlementService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(1, (0, typeorm_1.InjectRepository)(shop_entity_1.Shop)),
    __param(2, (0, typeorm_1.InjectRepository)(draw_entity_1.Draw)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], SettlementService);
//# sourceMappingURL=settlement.service.js.map