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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var OrderController_1, ShopController_1, BetStatusController_1;
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BetStatusController = exports.ShopController = exports.OrderController = void 0;
const common_1 = require("@nestjs/common");
const express_1 = require("express");
const typeorm_1 = require("typeorm");
const order_entity_1 = require("../../entities/order.entity");
const shop_entity_1 = require("../../entities/shop.entity");
async function findShopByNumber(shopRepo, number) {
    const byPrimary = await shopRepo.findOne({ where: { shop_number: number } });
    if (byPrimary)
        return byPrimary;
    const all = await shopRepo.find();
    return all.find(s => (s.shop_aliases || []).includes(number)) ?? null;
}
const draw_entity_1 = require("../../entities/draw.entity");
const draw_day_service_1 = require("../draw/draw-day.service");
const crypto = __importStar(require("crypto"));
let OrderController = OrderController_1 = class OrderController {
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(OrderController_1.name);
    }
    async createOrder(dto, req) {
        const shopId = dto.shopId ?? dto.shop_id;
        const numbers = dto.numbers;
        const amount = Number(dto.amount);
        const gameTypeValue = dto.gameType || dto.game_type;
        const clientId = dto.clientId;
        const dtoIp = dto.ipAddress;
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.ip ||
            (req.socket && req.socket.remoteAddress) ||
            dtoIp ||
            '127.0.0.1';
        if (shopId == null || Number.isNaN(Number(shopId))) {
            throw new common_1.BadRequestException('缺少店铺ID');
        }
        if (!Array.isArray(numbers) || numbers.length === 0 || numbers.length > 500) {
            throw new common_1.BadRequestException('号码列表无效或超过500条');
        }
        if (Number.isNaN(amount) || amount <= 0 || amount > 100000) {
            throw new common_1.BadRequestException('金额无效');
        }
        for (const item of numbers) {
            if (typeof item.n !== 'string' || item.n.length > 10 || typeof item.q !== 'number' || item.q < 1 || item.q > 999) {
                throw new common_1.BadRequestException('号码或数量格式无效');
            }
        }
        const shop = await this.dataSource.getRepository(shop_entity_1.Shop).findOne({
            where: { shop_id: Number(shopId) },
        });
        if (!shop) {
            throw new common_1.NotFoundException('店铺不存在');
        }
        if (shop.status !== 'active') {
            throw new common_1.BadRequestException('店铺已停业');
        }
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        const currentDraw = await drawRepo.findOne({
            where: { status: 'pending' },
            order: { draw_id: 'DESC' },
        });
        const limitChance = shop.limit_chance;
        const limitBillete = shop.limit_billete;
        if (currentDraw && (limitChance != null || limitBillete != null)) {
            const orderRepo2 = this.dataSource.getRepository(order_entity_1.Order);
            const existingOrders = await orderRepo2
                .createQueryBuilder('o')
                .where('o.draw_id = :drawId', { drawId: currentDraw.draw_id })
                .andWhere('o.status != :canceled', { canceled: -1 })
                .getMany();
            const soldMap = {};
            for (const eo of existingOrders) {
                for (const item of (eo.numbers || [])) {
                    const key = String(item.n);
                    soldMap[key] = (soldMap[key] || 0) + (item.q || 0);
                }
            }
            const overLimitItems = [];
            for (const item of numbers) {
                const numStr = String(item.n).replace(/\D/g, '');
                const isBillete = numStr.length >= 4;
                const limit = isBillete ? limitBillete : limitChance;
                if (limit == null)
                    continue;
                const alreadySold = soldMap[item.n] || 0;
                if (alreadySold + item.q > limit) {
                    overLimitItems.push({ n: item.n, alreadySold, limit });
                }
            }
            if (overLimitItems.length > 0) {
                throw new common_1.BadRequestException({ message: '部分号码超出限额', overLimitItems });
            }
        }
        const orderNumber = this.generateOrderNumber();
        const orderHash = crypto.createHash('sha256').update(orderNumber + Date.now()).digest('hex').substring(0, 64);
        const verificationCode = this.generateVerificationCode();
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const order = orderRepo.create({
            order_number: orderNumber,
            order_hash: orderHash,
            shop_id: Number(shopId),
            numbers,
            amount,
            game_type: gameTypeValue,
            status: 0,
            verification_code: verificationCode,
            customer_info: { clientId },
            ip_address: ipAddress,
            draw_id: currentDraw?.draw_id || null,
        });
        await orderRepo.save(order);
        this.logger.log(`订单创建: #${orderNumber}, 店铺: ${shopId}, 金额: $${amount}`);
        return {
            order_id: order.order_id,
            order_number: order.order_number,
            order_hash: order.order_hash,
            verification_code: order.verification_code,
            amount: order.amount,
            status: 0,
            created_at: order.created_at,
        };
    }
    async deleteOrder(orderNumber, body, req) {
        const shopId = body?.shopId != null ? Number(body.shopId) : undefined;
        if (!shopId || isNaN(shopId)) {
            throw new common_1.BadRequestException('缺少 shopId');
        }
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const order = await orderRepo.findOne({ where: { order_number: orderNumber } });
        if (!order)
            throw new common_1.NotFoundException('订单不存在');
        if (order.shop_id !== shopId) {
            throw new common_1.BadRequestException('无权删除其他店铺的订单');
        }
        if (order.status === 1 || order.status === 2 || order.status === 3) {
            throw new common_1.BadRequestException('已付款或已结算的订单不允许删除');
        }
        this.logger.log(`订单删除: #${order.order_number}, 店铺: ${shopId}, 状态: ${order.status}`);
        await orderRepo.remove(order);
        return { success: true, message: '订单已删除' };
    }
    async getOrder(orderNumber) {
        const order = await this.dataSource.getRepository(order_entity_1.Order).findOne({
            where: { order_number: orderNumber },
            relations: ['shop'],
        });
        if (!order) {
            throw new common_1.NotFoundException('订单不存在');
        }
        const statusMap = {
            0: 'pending',
            1: 'paid',
            2: 'settled',
            3: 'won',
            [-1]: 'canceled',
        };
        return {
            order_id: order.order_id,
            order_number: order.order_number,
            order_hash: order.order_hash,
            amount: order.amount,
            numbers: order.numbers,
            game_type: order.game_type,
            status: statusMap[order.status] || 'pending',
            verification_code: order.verification_code,
            shopId: order.shop_id,
            shopNumber: order.shop?.shop_number,
            win_amount: order.win_amount,
            win_breakdown: order.win_breakdown ?? null,
            redeemed_at: order.redeemed_at ?? null,
            created_at: order.created_at,
            paid_at: order.paid_at,
        };
    }
    async confirmOrder(orderNumber, body) {
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const order = await orderRepo.findOne({
            where: { order_number: orderNumber },
        });
        if (!order) {
            throw new common_1.NotFoundException('订单不存在');
        }
        const createdAt = new Date(order.created_at);
        const now = new Date();
        const diffMs = now.getTime() - createdAt.getTime();
        const THIRTY_MIN = 30 * 60 * 1000;
        if (order.status !== 0) {
            if (order.status === 1) {
                return { success: true, message: '订单已确认付款' };
            }
            throw new common_1.BadRequestException('订单状态不是待支付');
        }
        if (diffMs > THIRTY_MIN) {
            await orderRepo.update(order.order_id, {
                status: -1,
                canceled_at: new Date(),
            });
            throw new common_1.BadRequestException('订单已超过30分钟未支付，已自动取消');
        }
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        const currentDraw = await drawRepo.findOne({
            where: { status: 'pending' },
            order: { draw_id: 'DESC' },
        });
        const updatePayload = {
            status: 1,
            paid_at: new Date(),
        };
        if (order.draw_id == null && currentDraw?.draw_id != null) {
            updatePayload.draw_id = currentDraw.draw_id;
        }
        await orderRepo.update(order.order_id, updatePayload);
        this.logger.log(`订单确认: #${order.order_number}, 店铺: ${body.shopId}`);
        return {
            success: true,
            order_id: order.order_id,
            order_number: order.order_number,
            status: 'paid',
        };
    }
    async redeemOrder(orderNumber, body) {
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const order = await orderRepo.findOne({
            where: { order_number: orderNumber },
        });
        if (!order) {
            throw new common_1.NotFoundException('订单不存在');
        }
        if (order.shop_id !== body.shopId) {
            throw new common_1.BadRequestException('店号不匹配：该订单属于其他店铺，不能在本店兑奖');
        }
        if (order.status !== 3) {
            throw new common_1.BadRequestException(order.status === 1 ? '尚未开奖，无法兑奖' : '该订单未中奖或状态异常');
        }
        if (order.redeemed_at) {
            throw new common_1.BadRequestException('该订单已兑奖，请勿重复操作');
        }
        await orderRepo.update(order.order_id, {
            redeemed_at: new Date(),
        });
        this.logger.log(`兑奖完成: #${order.order_number}, 店铺: ${body.shopId}, 金额: $${order.win_amount}`);
        return {
            success: true,
            order_number: order.order_number,
            win_amount: Number(order.win_amount),
            message: '兑奖成功',
        };
    }
    generateOrderNumber() {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.floor(1000 + Math.random() * 9000);
        return `${timestamp}${random}`;
    }
    generateVerificationCode() {
        return Math.floor(10000 + Math.random() * 90000).toString();
    }
};
exports.OrderController = OrderController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_a = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "createOrder", null);
__decorate([
    (0, common_1.Delete)(':orderNumber'),
    __param(0, (0, common_1.Param)('orderNumber')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "deleteOrder", null);
__decorate([
    (0, common_1.Get)(':orderNumber'),
    __param(0, (0, common_1.Param)('orderNumber')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "getOrder", null);
__decorate([
    (0, common_1.Post)(':orderNumber/confirm'),
    __param(0, (0, common_1.Param)('orderNumber')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "confirmOrder", null);
__decorate([
    (0, common_1.Post)(':orderNumber/redeem'),
    __param(0, (0, common_1.Param)('orderNumber')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "redeemOrder", null);
exports.OrderController = OrderController = OrderController_1 = __decorate([
    (0, common_1.Controller)('orders'),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], OrderController);
let ShopController = ShopController_1 = class ShopController {
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(ShopController_1.name);
    }
    async getShopByNumber(shopNumber) {
        const shop = await findShopByNumber(this.dataSource.getRepository(shop_entity_1.Shop), shopNumber);
        if (!shop) {
            throw new common_1.NotFoundException('店铺不存在');
        }
        return {
            shop: {
                shop_id: shop.shop_id,
                shop_number: shop.shop_number,
                shop_name: shop.shop_name,
                status: shop.status,
                commission_rate: shop.commission_rate,
                limit_chance: shop.limit_chance ?? null,
                limit_billete: shop.limit_billete ?? null,
            },
        };
    }
    async updateShopLimits(shopId, body) {
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const shop = await shopRepo.findOne({ where: { shop_id: parseInt(shopId, 10) } });
        if (!shop)
            throw new common_1.NotFoundException('店铺不存在');
        if (body.limitChance !== undefined)
            shop.limit_chance = body.limitChance || null;
        if (body.limitBillete !== undefined)
            shop.limit_billete = body.limitBillete || null;
        await shopRepo.save(shop);
        return { success: true, limit_chance: shop.limit_chance, limit_billete: shop.limit_billete };
    }
    async getShopOrders(shopId, limit = '100', status, suffix, drawId) {
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const shop = await shopRepo.findOne({
            where: { shop_id: parseInt(shopId) },
        });
        if (!shop) {
            throw new common_1.NotFoundException('店铺不存在');
        }
        const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
        const query = orderRepo.createQueryBuilder('order')
            .where('order.shop_id = :shopId', { shopId: parseInt(shopId, 10) })
            .orderBy('order.created_at', 'DESC')
            .take(limitNum);
        if (drawId && Number(drawId) > 0) {
            query.andWhere('order.draw_id = :drawId', { drawId: Number(drawId) });
        }
        if (status) {
            const statusMap = {
                'pending': 0,
                'paid': 1,
                'settled': 2,
                'won': 3,
            };
            if (statusMap[status] !== undefined) {
                query.andWhere('order.status = :status', { status: statusMap[status] });
            }
        }
        if (suffix && suffix.trim()) {
            const safe = String(suffix.trim()).replace(/%/g, '\\%').replace(/_/g, '\\_');
            query.andWhere('order.order_number LIKE :suffixPattern', { suffixPattern: '%' + safe });
            query.andWhere('order.status = 3');
            query.andWhere('order.redeemed_at IS NULL');
        }
        const orders = await query.getMany();
        const statusMap = {
            0: 'pending',
            1: 'paid',
            2: 'settled',
            3: 'won',
            [-1]: 'canceled',
        };
        return {
            shopId: shop.shop_id,
            shopNumber: shop.shop_number,
            shopName: shop.shop_name,
            orders: orders.map(order => ({
                order_id: order.order_id,
                order_number: order.order_number,
                order_hash: order.order_hash,
                numbers: order.numbers,
                amount: order.amount,
                game_type: order.game_type,
                status: statusMap[order.status] || 'pending',
                draw_id: order.draw_id ?? null,
                win_amount: order.win_amount,
                win_breakdown: order.win_breakdown ?? null,
                redeemed_at: order.redeemed_at ?? null,
                verification_code: order.verification_code,
                created_at: order.created_at,
                paid_at: order.paid_at,
            })),
        };
    }
};
exports.ShopController = ShopController;
__decorate([
    (0, common_1.Get)(':shopNumber'),
    __param(0, (0, common_1.Param)('shopNumber')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "getShopByNumber", null);
__decorate([
    (0, common_1.Patch)(':shopId/limits'),
    __param(0, (0, common_1.Param)('shopId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "updateShopLimits", null);
__decorate([
    (0, common_1.Get)(':shopId/orders'),
    __param(0, (0, common_1.Param)('shopId')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('suffix')),
    __param(4, (0, common_1.Query)('drawId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "getShopOrders", null);
exports.ShopController = ShopController = ShopController_1 = __decorate([
    (0, common_1.Controller)('shop'),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], ShopController);
const PANAMA_TZ = 'America/Panama';
function getPanamaNow() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: PANAMA_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(now);
    const get = (type) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
    return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
}
let BetStatusController = BetStatusController_1 = class BetStatusController {
    constructor(dataSource, drawDayService) {
        this.dataSource = dataSource;
        this.drawDayService = drawDayService;
        this.logger = new common_1.Logger(BetStatusController_1.name);
    }
    static formatDrawPeriodDate(draw) {
        const timeStr = String(draw.draw_time || '').trim();
        if (timeStr && timeStr.includes('T') && /^\d{4}-\d{2}-\d{2}/.test(timeStr)) {
            const iso = timeStr.substring(0, 10);
            const y = iso.slice(0, 4), m = iso.slice(5, 7), d = iso.slice(8, 10);
            return `${d}-${m}-${y}`;
        }
        const rawDate = draw.draw_date;
        if (rawDate) {
            const d = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(rawDate))
                ? new Date(String(rawDate).substring(0, 10) + 'T12:00:00Z')
                : new Date(rawDate);
            const dd = d.getUTCDate(), mm = d.getUTCMonth() + 1, yy = d.getUTCFullYear();
            return `${String(dd).padStart(2, '0')}-${String(mm).padStart(2, '0')}-${yy}`;
        }
        const fallback = new Date();
        return `${String(fallback.getDate()).padStart(2, '0')}-${String(fallback.getMonth() + 1).padStart(2, '0')}-${fallback.getFullYear()}`;
    }
    async getBetStatus(shopId) {
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        const draw = await drawRepo.findOne({
            where: { status: 'pending' },
            order: { draw_id: 'DESC' },
        });
        let canBet = true;
        let minutesUntilDraw;
        let currentPeriodDate = null;
        let isDrawWindow = false;
        let confirmedDrawDay = null;
        let confirmedDrawTime = null;
        if (draw) {
            const timeStr = String(draw.draw_time || '15:00').trim();
            let dy;
            let dm;
            let dd;
            if (timeStr.includes('T') && /^\d{4}-\d{2}-\d{2}/.test(timeStr)) {
                const iso = timeStr.substring(0, 10);
                dy = parseInt(iso.slice(0, 4), 10);
                dm = parseInt(iso.slice(5, 7), 10);
                dd = parseInt(iso.slice(8, 10), 10);
            }
            else {
                const rawDate = draw.draw_date;
                if (rawDate) {
                    const d = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(rawDate))
                        ? new Date(String(rawDate).substring(0, 10) + 'T12:00:00Z')
                        : new Date(rawDate);
                    dy = d.getUTCFullYear();
                    dm = d.getUTCMonth() + 1;
                    dd = d.getUTCDate();
                }
                else {
                    const d = new Date();
                    dy = d.getFullYear();
                    dm = d.getMonth() + 1;
                    dd = d.getDate();
                }
            }
            currentPeriodDate = `${String(dd).padStart(2, '0')}-${String(dm).padStart(2, '0')}-${dy}`;
            let drawHour = 15;
            let drawMin = 0;
            if (timeStr.includes('T')) {
                const dt = new Date(timeStr);
                if (!isNaN(dt.getTime())) {
                    drawHour = dt.getHours();
                    drawMin = dt.getMinutes();
                }
            }
            else {
                const parts = timeStr.split(':').map(Number);
                if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    drawHour = parts[0];
                    drawMin = parts[1];
                }
            }
            const confirmedDrawMins = drawHour * 60 + drawMin;
            confirmedDrawDay = `${String(dd).padStart(2, '0')}-${String(dm).padStart(2, '0')}-${dy}`;
            confirmedDrawTime = `${String(drawHour).padStart(2, '0')}:${String(drawMin).padStart(2, '0')}`;
            const panama = getPanamaNow();
            const todayStr = `${String(panama.d).padStart(2, '0')}-${String(panama.m).padStart(2, '0')}-${panama.y}`;
            const totalMins = panama.h * 60 + panama.min;
            if (confirmedDrawDay === todayStr && confirmedDrawMins >= 0) {
                const stopSaleStart = confirmedDrawMins - 5;
                const drawEndMins = confirmedDrawMins + 60;
                if (totalMins >= stopSaleStart && totalMins < drawEndMins) {
                    canBet = false;
                    isDrawWindow = true;
                }
                minutesUntilDraw = totalMins < stopSaleStart ? Math.max(0, stopSaleStart - totalMins) : undefined;
            }
            else {
                canBet = true;
                isDrawWindow = false;
                minutesUntilDraw = undefined;
            }
        }
        else {
            const lastCompleted = await drawRepo.findOne({
                where: { status: 'completed' },
                order: { draw_id: 'DESC' },
            });
            if (lastCompleted) {
                currentPeriodDate = BetStatusController_1.formatDrawPeriodDate(lastCompleted);
            }
            canBet = true;
        }
        const base = {
            status: 'ok',
            canBet,
            minutesUntilDraw,
            currentPeriodDate,
            isDrawWindow,
            confirmedDrawDay,
            confirmedDrawTime,
        };
        if (!shopId) {
            return base;
        }
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const orders = await this.dataSource.getRepository(order_entity_1.Order)
            .createQueryBuilder('order')
            .where('order.shop_id = :shopId', { shopId: parseInt(shopId) })
            .andWhere('order.created_at >= :yesterday', { yesterday })
            .orderBy('order.created_at', 'DESC')
            .take(50)
            .getMany();
        return {
            ...base,
            shopId: parseInt(shopId),
            orderCount: orders.length,
            orders: orders.map((o) => ({
                order_id: o.order_id,
                order_number: o.order_number,
                status: o.status,
                amount: o.amount,
            })),
        };
    }
};
exports.BetStatusController = BetStatusController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('shopId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BetStatusController.prototype, "getBetStatus", null);
exports.BetStatusController = BetStatusController = BetStatusController_1 = __decorate([
    (0, common_1.Controller)('bet-status'),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        draw_day_service_1.DrawDayService])
], BetStatusController);
//# sourceMappingURL=order.controller.js.map