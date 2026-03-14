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
var OrderService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const entities_1 = require("../../entities");
let OrderService = OrderService_1 = class OrderService {
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(OrderService_1.name);
    }
    async createOrder(dto) {
        const { storeCode, numbers, betAmount, multiplier = 1, customerName, customerPhone } = dto;
        const shop = await this.dataSource.getRepository(entities_1.Shop).findOne({
            where: { store_code: storeCode },
        });
        if (!shop) {
            throw new Error('店铺不存在');
        }
        if (shop.status !== 'ACTIVE') {
            throw new Error('店铺已停业');
        }
        if (betAmount > (shop.single_bet_limit || 100)) {
            throw new Error(`单笔最高投注 ${shop.single_bet_limit} 美元`);
        }
        const today = new Date().toISOString().split('T')[0];
        const todayTotal = await this.getTodaySales(storeCode);
        if (todayTotal + betAmount > (shop.daily_bet_limit || 5000)) {
            throw new Error(`今日额度已满 (已投 ${todayTotal} / 限额 ${shop.daily_bet_limit})`);
        }
        const verificationCode = this.generateVerificationCode();
        const orderRepo = this.dataSource.getRepository(entities_1.Order);
        const order = orderRepo.create({
            store_code: storeCode,
            master_id: shop.master_id,
            selection: { numbers, type: 'direct' },
            bet_amount: betAmount,
            multiplier,
            customer_name: customerName,
            customer_phone: customerPhone,
            verification_code: verificationCode,
            status: 'Pending',
        });
        await orderRepo.save(order);
        this.logger.log(`订单创建: #${order.order_id}, 店号: ${storeCode}, 金额: $${betAmount}`);
        return order;
    }
    async getTodaySales(storeCode) {
        const today = new Date().toISOString().split('T')[0];
        const result = await this.dataSource
            .getRepository(entities_1.Order)
            .createQueryBuilder('order')
            .where('order.store_code = :storeCode', { storeCode })
            .andWhere('DATE(order.created_at) = :today', { today })
            .andWhere('order.status IN (:...statuses)', { statuses: ['Paid', 'Won', 'Lost'] })
            .select('SUM(order.bet_amount * COALESCE(order.multiplier, 1))', 'total')
            .getRawOne();
        return Number(result?.total || 0);
    }
    generateVerificationCode() {
        return Math.floor(10000 + Math.random() * 90000).toString();
    }
    async verifyOrder(verificationCode) {
        const order = await this.dataSource.getRepository(entities_1.Order).findOne({
            where: { verification_code: verificationCode },
        });
        if (!order) {
            throw new Error('核销码不存在');
        }
        const createdAt = order.created_at ? new Date(order.created_at) : null;
        if (createdAt) {
            const now = new Date();
            const diffMs = now.getTime() - createdAt.getTime();
            const THIRTY_MIN = 30 * 60 * 1000;
            if (diffMs > THIRTY_MIN) {
                await this.dataSource.getRepository(entities_1.Order).update(order.order_id, {
                    status: 'Canceled',
                    canceled_at: new Date(),
                });
                throw new Error('订单已超过30分钟未支付，已自动取消');
            }
        }
        if (order.status !== 'Pending') {
            throw new Error(`订单状态不是待支付: ${order.status}`);
        }
        await this.dataSource.getRepository(entities_1.Order).update(order.order_id, {
            status: 'Paid',
            paid_at: new Date(),
        });
        order.status = 'Paid';
        order.paid_at = new Date();
        return order;
    }
    async getMasterDashboard(masterId, period) {
        const dateField = period === 'today' ? 'CURDATE()' :
            period === 'week' ? 'DATE_SUB(CURDATE(), INTERVAL 7 DAY)' :
                'DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
        const sql = `
      SELECT 
        COUNT(*) as total_orders,
        SUM(bet_amount * COALESCE(multiplier, 1)) as total_bets,
        SUM(shop_commission) as total_commission,
        SUM(win_amount) as total_winnings,
        SUM(master_revenue) as net_revenue
      FROM orders
      WHERE master_id = ?
        AND created_at >= ${dateField}
        AND status IN ('Paid', 'Won', 'Lost')
    `;
        const result = await this.dataSource.query(sql, [masterId]);
        return result[0];
    }
};
exports.OrderService = OrderService;
exports.OrderService = OrderService = OrderService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], OrderService);
//# sourceMappingURL=order.service.js.map