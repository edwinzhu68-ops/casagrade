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
var OrderCancelService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderCancelService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const order_entity_1 = require("../../entities/order.entity");
const THIRTY_MIN_MS = 30 * 60 * 1000;
const INTERVAL_MS = 60 * 1000;
let OrderCancelService = OrderCancelService_1 = class OrderCancelService {
    constructor(orderRepo) {
        this.orderRepo = orderRepo;
        this.logger = new common_1.Logger(OrderCancelService_1.name);
        this.timer = null;
    }
    onModuleInit() {
        this.timer = setInterval(() => this.cancelExpiredPendingOrders(), INTERVAL_MS);
        this.logger.log('定时任务已启动：每 1 分钟检查超时未付款订单并自动取消');
    }
    async cancelExpiredPendingOrders() {
        const deadline = new Date(Date.now() - THIRTY_MIN_MS);
        try {
            const result = await this.orderRepo
                .createQueryBuilder()
                .update(order_entity_1.Order)
                .set({ status: -1, canceled_at: new Date() })
                .where('status = :status', { status: 0 })
                .andWhere('created_at < :deadline', { deadline })
                .execute();
            if (result.affected && result.affected > 0) {
                this.logger.log(`自动取消 ${result.affected} 笔超时未付款订单`);
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
    __param(0, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], OrderCancelService);
//# sourceMappingURL=order-cancel.service.js.map