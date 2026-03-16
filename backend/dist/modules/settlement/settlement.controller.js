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
exports.SettlementController = void 0;
const common_1 = require("@nestjs/common");
const settlement_service_1 = require("./settlement.service");
const admin_token_guard_1 = require("../../guards/admin-token.guard");
let SettlementController = class SettlementController {
    constructor(settlementService) {
        this.settlementService = settlementService;
    }
    async settleDraw(drawId) {
        const result = await this.settlementService.settleDraw(Number(drawId));
        return {
            success: true,
            message: `结算完成，共 ${result.totalOrders} 单`,
            data: result,
        };
    }
    async getStats(shopId, startDate, endDate) {
        const result = await this.settlementService.getSettlementStats(shopId ? Number(shopId) : undefined, startDate ? new Date(startDate) : undefined, endDate ? new Date(endDate) : undefined);
        return {
            success: true,
            data: result,
        };
    }
    async getHistory(shopId, limit = '7') {
        const result = await this.settlementService.getHistoryForShop(Number(shopId), Number(limit) || 7);
        return {
            success: true,
            items: result,
        };
    }
};
exports.SettlementController = SettlementController;
__decorate([
    (0, common_1.Post)('settle/:drawId'),
    (0, common_1.UseGuards)(admin_token_guard_1.AdminTokenGuard),
    __param(0, (0, common_1.Param)('drawId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], SettlementController.prototype, "settleDraw", null);
__decorate([
    (0, common_1.Get)('stats'),
    __param(0, (0, common_1.Query)('shopId')),
    __param(1, (0, common_1.Query)('startDate')),
    __param(2, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], SettlementController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('history'),
    __param(0, (0, common_1.Query)('shopId')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], SettlementController.prototype, "getHistory", null);
exports.SettlementController = SettlementController = __decorate([
    (0, common_1.Controller)('settlement'),
    __metadata("design:paramtypes", [settlement_service_1.SettlementService])
], SettlementController);
//# sourceMappingURL=settlement.controller.js.map