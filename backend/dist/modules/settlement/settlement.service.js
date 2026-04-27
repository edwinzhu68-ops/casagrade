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
const SHOP_LOCAL_BILLETE_HEAD = 1000;
const SHOP_LOCAL_BILLETE_SECOND = 200;
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
        const shopIds = [...new Set(orders.map(o => o.shop_id))];
        const shops = shopIds.length > 0 ? await this.shopRepo.findByIds(shopIds) : [];
        const shopMap = new Map(shops.map(s => [s.shop_id, s]));
        const results = {
            totalOrders: orders.length,
            totalSales: 0,
            totalPayout: 0,
            wins: 0,
            results: [],
        };
        for (const order of orders) {
            const shop = shopMap.get(order.shop_id) ?? null;
            const orderResult = this.settleOrderWithDrawResult(order, winning, shop);
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
                const nowTs = new Date();
                await manager.update(order_entity_1.Order, order.order_id, {
                    status: orderResult.payout > 0 ? 3 : 2,
                    win_amount: orderResult.payout,
                    win_breakdown: orderResult.wins,
                    settled_at: nowTs,
                    updated_at: nowTs,
                });
            }
            await manager.update(draw_entity_1.Draw, drawId, { status: 'completed' });
        });
        this.logger.log(`结算完成: ${results.totalOrders}单, 销售额$${results.totalSales}, 赔付$${results.totalPayout}, 中奖${results.wins}单`);
        return results;
    }
    async settleShopLotteryDraw(drawId) {
        const draw = await this.drawRepo.findOne({ where: { draw_id: drawId } });
        if (!draw)
            throw new Error('开奖期次不存在');
        const lt = String(draw.lottery_type || 'NACIONAL').toUpperCase();
        if (lt !== 'TICA' && lt !== 'NICA') {
            throw new Error('该期次不是店内彩');
        }
        if (draw.status !== 'pending') {
            throw new Error('该期次已结算或状态异常');
        }
        const n123 = this.parseWinningN123(draw.winning_numbers);
        const winning = this.drawResultFromN123(n123);
        const orders = await this.orderRepo.find({
            where: { status: 1, draw_id: drawId },
        });
        const shopIds = [...new Set(orders.map(o => o.shop_id))];
        const shops = shopIds.length > 0 ? await this.shopRepo.findByIds(shopIds) : [];
        const shopMap = new Map(shops.map(s => [s.shop_id, s]));
        const results = {
            totalOrders: orders.length,
            totalSales: 0,
            totalPayout: 0,
            wins: 0,
            results: [],
        };
        for (const order of orders) {
            const shop = shopMap.get(order.shop_id) ?? null;
            const orderResult = this.settleTicaNicaOrder(order, n123, winning, shop);
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
                const nowTs = new Date();
                await manager.update(order_entity_1.Order, order.order_id, {
                    status: orderResult.payout > 0 ? 3 : 2,
                    win_amount: orderResult.payout,
                    win_breakdown: orderResult.wins,
                    settled_at: nowTs,
                    updated_at: nowTs,
                });
            }
            await manager.update(draw_entity_1.Draw, drawId, { status: 'completed' });
            const cancelTs = new Date();
            const cancelResult = await manager
                .createQueryBuilder()
                .update(order_entity_1.Order)
                .set({ status: -1, canceled_at: cancelTs, updated_at: cancelTs })
                .where('draw_id = :drawId AND status = 0', { drawId })
                .execute();
            if (cancelResult.affected && cancelResult.affected > 0) {
                this.logger.log(`[${lt}] 自动取消 ${cancelResult.affected} 笔未付款订单 draw_id=${drawId}`);
            }
        });
        this.logger.log(`[${lt}] 店内结算完成 draw_id=${drawId}: ${results.totalOrders}单, 赔付$${results.totalPayout}`);
        return results;
    }
    parseWinningN123(raw) {
        if (raw == null || String(raw).trim() === '') {
            throw new Error('缺少开奖号码 n1/n2/n3');
        }
        let obj = raw;
        if (typeof raw === 'string') {
            try {
                obj = JSON.parse(raw);
            }
            catch {
                throw new Error('开奖号码格式无效');
            }
        }
        const pad2 = (v) => {
            const d = String(v ?? '').replace(/\D/g, '');
            if (d.length === 0)
                return '';
            return d.slice(-2).padStart(2, '0');
        };
        const n1 = pad2(obj?.n1);
        const n2 = pad2(obj?.n2);
        const n3 = pad2(obj?.n3);
        if (!/^\d{2}$/.test(n1) || !/^\d{2}$/.test(n2) || !/^\d{2}$/.test(n3)) {
            throw new Error('n1/n2/n3 须为两位数字');
        }
        return { n1, n2, n3 };
    }
    drawResultFromN123(n) {
        return {
            primer: n.n1,
            segundo: n.n2,
            tercero: n.n3,
        };
    }
    settleOrderWithDrawResult(order, winning, shop = null) {
        const numbers = order.numbers;
        if (!Array.isArray(numbers) || numbers.length === 0) {
            return { orderId: order.order_id, gameType: order.game_type || '', sales: Number(order.amount), payout: 0, wins: [] };
        }
        const gameType = order.game_type;
        const sales = Number(order.amount);
        const exactRates = [
            shop?.rate_billete_1 != null ? Number(shop.rate_billete_1) : 2000,
            shop?.rate_billete_2 != null ? Number(shop.rate_billete_2) : 600,
            shop?.rate_billete_3 != null ? Number(shop.rate_billete_3) : 300,
        ];
        const chanceRates = [
            shop?.rate_chance_1 != null ? Number(shop.rate_chance_1) : 14,
            shop?.rate_chance_2 != null ? Number(shop.rate_chance_2) : 3,
            shop?.rate_chance_3 != null ? Number(shop.rate_chance_3) : 2,
        ];
        let payout = 0;
        const wins = [];
        for (const num of numbers) {
            const numStr = num.n;
            const quantity = num.q;
            const numLen = numStr.replace(/\D/g, '').length;
            if (numLen >= 4) {
                const result = this.calculateBilletePayout(numStr, winning, quantity, exactRates);
                if (result.totalPayout > 0) {
                    wins.push({
                        n: numStr,
                        q: quantity,
                        win: result.totalPayout,
                        match: Array.isArray(result.matches) ? result.matches.join('+') : undefined,
                    });
                }
                payout += result.totalPayout;
            }
            else if (numLen >= 2) {
                const result = this.calculateChancePayout(numStr, winning, quantity, chanceRates);
                if (result.totalPayout > 0) {
                    wins.push({
                        n: numStr,
                        q: quantity,
                        win: result.totalPayout,
                        match: Array.isArray(result.matches) ? result.matches.join('+') : undefined,
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
    settleTicaNicaOrder(order, n123, chanceWinning, shop = null) {
        const numbers = order.numbers;
        if (!Array.isArray(numbers) || numbers.length === 0) {
            return { orderId: order.order_id, gameType: order.game_type || '', sales: Number(order.amount), payout: 0, wins: [] };
        }
        const gameType = order.game_type;
        const sales = Number(order.amount);
        let payout = 0;
        const wins = [];
        const lotteryType = (order.lottery_type || '').toString().toUpperCase();
        const isNica = lotteryType === 'NICA';
        const chanceRates = isNica ? [
            shop?.nica_chance_1 != null ? Number(shop.nica_chance_1) : (shop?.rate_chance_1 != null ? Number(shop.rate_chance_1) : 14),
            shop?.nica_chance_2 != null ? Number(shop.nica_chance_2) : (shop?.rate_chance_2 != null ? Number(shop.rate_chance_2) : 3),
            shop?.nica_chance_3 != null ? Number(shop.nica_chance_3) : (shop?.rate_chance_3 != null ? Number(shop.rate_chance_3) : 2),
        ] : [
            shop?.tica_chance_1 != null ? Number(shop.tica_chance_1) : (shop?.rate_chance_1 != null ? Number(shop.rate_chance_1) : 14),
            shop?.tica_chance_2 != null ? Number(shop.tica_chance_2) : (shop?.rate_chance_2 != null ? Number(shop.rate_chance_2) : 3),
            shop?.tica_chance_3 != null ? Number(shop.tica_chance_3) : (shop?.rate_chance_3 != null ? Number(shop.rate_chance_3) : 2),
        ];
        const chain = isNica ? {
            c12: shop?.nica_chain_1_2 != null ? Number(shop.nica_chain_1_2) : (shop?.chain_1_2 != null ? Number(shop.chain_1_2) : 1000),
            c13: shop?.nica_chain_1_3 != null ? Number(shop.nica_chain_1_3) : (shop?.chain_1_3 != null ? Number(shop.chain_1_3) : 1000),
            c21: shop?.nica_chain_2_1 != null ? Number(shop.nica_chain_2_1) : (shop?.chain_2_1 != null ? Number(shop.chain_2_1) : 0),
            c23: shop?.nica_chain_2_3 != null ? Number(shop.nica_chain_2_3) : (shop?.chain_2_3 != null ? Number(shop.chain_2_3) : 200),
            c31: shop?.nica_chain_3_1 != null ? Number(shop.nica_chain_3_1) : (shop?.chain_3_1 != null ? Number(shop.chain_3_1) : 0),
            c32: shop?.nica_chain_3_2 != null ? Number(shop.nica_chain_3_2) : (shop?.chain_3_2 != null ? Number(shop.chain_3_2) : 0),
        } : {
            c12: shop?.chain_1_2 != null ? Number(shop.chain_1_2) : 1000,
            c13: shop?.chain_1_3 != null ? Number(shop.chain_1_3) : 1000,
            c21: shop?.chain_2_1 != null ? Number(shop.chain_2_1) : 0,
            c23: shop?.chain_2_3 != null ? Number(shop.chain_2_3) : 200,
            c31: shop?.chain_3_1 != null ? Number(shop.chain_3_1) : 0,
            c32: shop?.chain_3_2 != null ? Number(shop.chain_3_2) : 0,
        };
        for (const num of numbers) {
            const numStr = num.n;
            const quantity = num.q;
            const numLen = numStr.replace(/\D/g, '').length;
            if (numLen >= 4) {
                const result = this.calculateTicaNicaBilletePayout(numStr, n123, quantity, chain);
                if (result.totalPayout > 0) {
                    wins.push({
                        n: numStr,
                        q: quantity,
                        win: result.totalPayout,
                        match: Array.isArray(result.matches) ? result.matches.join('+') : undefined,
                    });
                }
                payout += result.totalPayout;
            }
            else if (numLen >= 2) {
                const result = this.calculateChancePayout(numStr, chanceWinning, quantity, chanceRates);
                if (result.totalPayout > 0) {
                    wins.push({
                        n: numStr,
                        q: quantity,
                        win: result.totalPayout,
                        match: Array.isArray(result.matches) ? result.matches.join('+') : undefined,
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
    calculateTicaNicaBilletePayout(num, n123, qty, chain) {
        const bet = num.replace(/\D/g, '').slice(-4).padStart(4, '0');
        const F = bet.slice(0, 2);
        const L = bet.slice(2, 4);
        const { n1, n2, n3 } = n123;
        const matches = [];
        let totalPayout = 0;
        const add = (label, mult) => {
            if (mult > 0) {
                matches.push(`${label} x${mult}`);
                totalPayout += mult * qty;
            }
        };
        add('1串2', (F === n1 && L === n2) ? chain.c12 : 0);
        add('1串3', (F === n1 && L === n3) ? chain.c13 : 0);
        add('2串1', (F === n2 && L === n1) ? chain.c21 : 0);
        add('2串3', (F === n2 && L === n3) ? chain.c23 : 0);
        add('3串1', (F === n3 && L === n1) ? chain.c31 : 0);
        add('3串2', (F === n3 && L === n2) ? chain.c32 : 0);
        return { matches, totalPayout };
    }
    calculateBilletePayout(num, winning, qty, exactRates = [2000, 600, 300]) {
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
                matches.push(`头奖四位 ${paddedNum} x${exactRates[0]}`);
                totalPayout += exactRates[0] * qty;
            }
            else if (paddedNum.slice(0, 3) === primerNorm.slice(0, 3)) {
                matches.push(`头奖前三位 x50`);
                totalPayout += 50 * qty;
            }
            else if (paddedNum.slice(1, 4) === primerNorm.slice(1, 4)) {
                matches.push(`头奖后三位 x50`);
                totalPayout += 50 * qty;
            }
            else {
                if (paddedNum.slice(0, 2) === primerNorm.slice(0, 2)) {
                    matches.push(`头奖前两位 x3`);
                    totalPayout += 3 * qty;
                }
                if (paddedNum.slice(2, 4) === primerNorm.slice(2, 4)) {
                    matches.push(`头奖后两位 x3`);
                    totalPayout += 3 * qty;
                }
                else if (paddedNum.slice(-1) === primerNorm.slice(-1)) {
                    matches.push(`头奖最后一位 x1`);
                    totalPayout += 1 * qty;
                }
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
                matches.push(`二奖四位 ${paddedNum} x${exactRates[1]}`);
                totalPayout += exactRates[1] * qty;
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
                matches.push(`三奖四位 ${paddedNum} x${exactRates[2]}`);
                totalPayout += exactRates[2] * qty;
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
    calculateChancePayout(num, winning, quantity, rates = [14, 3, 2]) {
        const paddedNum = num.padStart(2, '0');
        const primerLast2 = winning.primer.slice(-2);
        const segundoLast2 = winning.segundo.slice(-2);
        const terceroLast2 = winning.tercero.slice(-2);
        const matches = [];
        let totalPayout = 0;
        if (paddedNum === primerLast2) {
            matches.push(`头奖后两位 ${paddedNum} x${rates[0]}`);
            totalPayout += rates[0] * quantity;
        }
        if (paddedNum === segundoLast2) {
            matches.push(`二奖后两位 ${paddedNum} x${rates[1]}`);
            totalPayout += rates[1] * quantity;
        }
        if (paddedNum === terceroLast2) {
            matches.push(`三奖后两位 ${paddedNum} x${rates[2]}`);
            totalPayout += rates[2] * quantity;
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
    async getHistoryForShop(shopId, limit = 7, lotteryKind) {
        const takeN = Math.max(limit * 2, 20);
        const st = ['completed', 'COMPLETED'];
        const k = lotteryKind ? String(lotteryKind).toUpperCase() : '';
        let draws;
        if (k === 'TICA' || k === 'NICA') {
            draws = await this.drawRepo
                .createQueryBuilder('d')
                .where('d.status IN (:...st)', { st })
                .andWhere('d.shop_id = :sid', { sid: shopId })
                .andWhere('d.lottery_type = :lt', { lt: k })
                .orderBy('d.draw_id', 'DESC')
                .take(takeN)
                .getMany();
        }
        else if (k === 'NACIONAL') {
            draws = await this.drawRepo
                .createQueryBuilder('d')
                .where('d.status IN (:...st)', { st })
                .andWhere('d.shop_id IS NULL')
                .andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
                .orderBy('d.draw_id', 'DESC')
                .take(takeN)
                .getMany();
        }
        else {
            draws = await this.drawRepo
                .createQueryBuilder('d')
                .where('d.status IN (:...st)', { st })
                .andWhere('d.shop_id IS NULL')
                .andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
                .orderBy('d.draw_id', 'DESC')
                .take(takeN)
                .getMany();
        }
        const result = [];
        for (const draw of draws) {
            let orders;
            if (k === 'NACIONAL') {
                orders = await this.orderRepo
                    .createQueryBuilder('o')
                    .where('o.shop_id = :sid', { sid: shopId })
                    .andWhere('o.draw_id = :did', { did: draw.draw_id })
                    .andWhere('o.status IN (:...stt)', { stt: [1, 2, 3] })
                    .andWhere('(o.lottery_type = :lt OR o.lottery_type IS NULL)', { lt: 'NACIONAL' })
                    .getMany();
            }
            else if (k === 'TICA' || k === 'NICA') {
                orders = await this.orderRepo.find({
                    where: {
                        shop_id: shopId,
                        draw_id: draw.draw_id,
                        status: (0, typeorm_2.In)([1, 2, 3]),
                        lottery_type: k,
                    },
                });
            }
            else {
                orders = await this.orderRepo.find({
                    where: {
                        shop_id: shopId,
                        draw_id: draw.draw_id,
                        status: (0, typeorm_2.In)([1, 2, 3]),
                    },
                });
            }
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