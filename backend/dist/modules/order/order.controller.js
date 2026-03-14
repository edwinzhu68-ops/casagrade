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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BetStatusController = exports.ShopController = exports.OrderController = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const order_entity_1 = require("../../entities/order.entity");
const shop_entity_1 = require("../../entities/shop.entity");
const draw_entity_1 = require("../../entities/draw.entity");
const crypto = __importStar(require("crypto"));
let OrderController = OrderController_1 = class OrderController {
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(OrderController_1.name);
    }
    async createOrder(dto) {
        const { shopId, numbers, amount, gameType, clientId, ipAddress } = dto;
        const gameTypeValue = gameType || dto.game_type;
        const shop = await this.dataSource.getRepository(shop_entity_1.Shop).findOne({
            where: { shop_id: shopId },
        });
        if (!shop) {
            throw new Error('店铺不存在');
        }
        if (shop.status !== 'active') {
            throw new Error('店铺已停业');
        }
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        const currentDraw = await drawRepo.findOne({
            where: { status: 'pending' },
            order: { draw_id: 'DESC' },
        });
        const orderNumber = this.generateOrderNumber();
        const orderHash = crypto.createHash('sha256').update(orderNumber + Date.now()).digest('hex').substring(0, 64);
        const verificationCode = this.generateVerificationCode();
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const order = orderRepo.create({
            order_number: orderNumber,
            order_hash: orderHash,
            shop_id: shopId,
            numbers,
            amount,
            game_type: gameTypeValue,
            status: 0,
            verification_code: verificationCode,
            customer_info: { clientId },
            ip_address: ipAddress || '127.0.0.1',
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
        };
    }
    async getOrder(orderNumber) {
        const order = await this.dataSource.getRepository(order_entity_1.Order).findOne({
            where: { order_number: orderNumber },
            relations: ['shop'],
        });
        if (!order) {
            throw new Error('订单不存在');
        }
        const statusMap = {
            0: 'pending',
            1: 'paid',
            2: 'settled',
            3: 'won',
        };
        return {
            order_id: order.order_id,
            order_number: order.order_number,
            order_hash: order.order_hash,
            amount: order.amount,
            numbers: order.numbers,
            status: statusMap[order.status] || 'pending',
            verification_code: order.verification_code,
            shopId: order.shop_id,
            shopNumber: order.shop?.shop_number,
            win_amount: order.win_amount,
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
            throw new Error('订单不存在');
        }
        const createdAt = new Date(order.created_at);
        const now = new Date();
        const diffMs = now.getTime() - createdAt.getTime();
        const THIRTY_MIN = 30 * 60 * 1000;
        if (diffMs > THIRTY_MIN) {
            await orderRepo.update(order.order_id, {
                status: -1,
                canceled_at: new Date(),
            });
            throw new Error('订单已超过30分钟未支付，已自动取消');
        }
        if (order.status !== 0) {
            throw new Error(`订单状态不是待支付: ${order.status}`);
        }
        await orderRepo.update(order.order_id, {
            status: 1,
            paid_at: new Date(),
        });
        this.logger.log(`订单确认: #${order.order_number}, 店铺: ${body.shopId}`);
        return {
            success: true,
            order_id: order.order_id,
            order_number: order.order_number,
            status: 'paid',
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
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "createOrder", null);
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
        const shop = await this.dataSource.getRepository(shop_entity_1.Shop).findOne({
            where: { shop_number: shopNumber },
        });
        if (!shop) {
            throw new Error('店铺不存在');
        }
        return {
            shop: {
                shop_id: shop.shop_id,
                shop_number: shop.shop_number,
                shop_name: shop.shop_name,
                status: shop.status,
                commission_rate: shop.commission_rate,
            },
        };
    }
    async getShopOrders(shopId, limit = '100', status) {
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const shop = await shopRepo.findOne({
            where: { shop_id: parseInt(shopId) },
        });
        if (!shop) {
            throw new Error('店铺不存在');
        }
        const query = orderRepo.createQueryBuilder('order')
            .where('order.shop_id = :shopId', { shopId: parseInt(shopId) })
            .orderBy('order.created_at', 'DESC')
            .take(parseInt(limit) || 100);
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
        const orders = await query.getMany();
        const statusMap = {
            0: 'pending',
            1: 'paid',
            2: 'settled',
            3: 'won',
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
                win_amount: order.win_amount,
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
    (0, common_1.Get)(':shopId/orders'),
    __param(0, (0, common_1.Param)('shopId')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "getShopOrders", null);
exports.ShopController = ShopController = ShopController_1 = __decorate([
    (0, common_1.Controller)('shop'),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], ShopController);
let BetStatusController = BetStatusController_1 = class BetStatusController {
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(BetStatusController_1.name);
    }
    async getBetStatus(shopId) {
        const draw = await this.dataSource.getRepository(draw_entity_1.Draw).findOne({
            where: { status: 'pending' },
            order: { draw_id: 'DESC' },
        });
        let canBet = true;
        let minutesUntilDraw;
        if (draw && draw.draw_time) {
            const now = new Date();
            const [hours, minutes] = draw.draw_time.split(':').map(Number);
            const drawDate = draw.draw_date ? new Date(draw.draw_date) : new Date();
            drawDate.setHours(hours, minutes, 0, 0);
            if (drawDate < now) {
                drawDate.setDate(drawDate.getDate() + 1);
            }
            const diffMs = drawDate.getTime() - now.getTime();
            minutesUntilDraw = Math.floor(diffMs / 60000);
            if (minutesUntilDraw <= 5) {
                canBet = false;
            }
        }
        if (!shopId) {
            return { status: 'ok', canBet, minutesUntilDraw };
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
            status: 'ok',
            canBet,
            minutesUntilDraw,
            shopId: parseInt(shopId),
            orderCount: orders.length,
            orders: orders.map(o => ({
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
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], BetStatusController);
//# sourceMappingURL=order.controller.js.map