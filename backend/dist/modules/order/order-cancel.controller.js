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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderCancelController = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const order_entity_1 = require("../../entities/order.entity");
let OrderCancelController = class OrderCancelController {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async cancel(body) {
        const orderNumber = (body?.orderNumber ?? '').trim();
        const orderHash = (body?.orderHash ?? '').trim();
        if (!orderNumber) {
            throw new common_1.BadRequestException('缺少 orderNumber');
        }
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const order = await orderRepo.findOne({
            where: { order_number: orderNumber },
        });
        if (!order) {
            throw new common_1.NotFoundException('订单不存在');
        }
        if (!orderHash || !order.order_hash || orderHash !== order.order_hash) {
            throw new common_1.UnauthorizedException('订单凭证无效');
        }
        if (order.status !== 0) {
            throw new common_1.BadRequestException('只能取消未付款订单');
        }
        const nowTs = new Date();
        await orderRepo.update(order.order_id, {
            status: -1,
            canceled_at: nowTs,
            updated_at: nowTs,
        });
        return {
            success: true,
            order_number: order.order_number,
            message: '订单已取消',
        };
    }
};
exports.OrderCancelController = OrderCancelController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OrderCancelController.prototype, "cancel", null);
exports.OrderCancelController = OrderCancelController = __decorate([
    (0, common_1.Controller)('orders-cancel'),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], OrderCancelController);
//# sourceMappingURL=order-cancel.controller.js.map