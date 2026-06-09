"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalLotteryModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const order_entity_1 = require("../../entities/order.entity");
const shop_entity_1 = require("../../entities/shop.entity");
const draw_entity_1 = require("../../entities/draw.entity");
const settlement_module_1 = require("../settlement/settlement.module");
const local_lottery_service_1 = require("./local-lottery.service");
const local_lottery_controller_1 = require("./local-lottery.controller");
let LocalLotteryModule = class LocalLotteryModule {
};
exports.LocalLotteryModule = LocalLotteryModule;
exports.LocalLotteryModule = LocalLotteryModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([order_entity_1.Order, shop_entity_1.Shop, draw_entity_1.Draw]), settlement_module_1.SettlementModule],
        controllers: [local_lottery_controller_1.LocalLotteryController],
        providers: [local_lottery_service_1.LocalLotteryService],
        exports: [local_lottery_service_1.LocalLotteryService],
    })
], LocalLotteryModule);
//# sourceMappingURL=local-lottery.module.js.map