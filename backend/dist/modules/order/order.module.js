"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const order_cancel_controller_1 = require("./order-cancel.controller");
const order_controller_1 = require("./order.controller");
const order_cancel_service_1 = require("./order-cancel.service");
const order_entity_1 = require("../../entities/order.entity");
const shop_entity_1 = require("../../entities/shop.entity");
const draw_module_1 = require("../draw/draw.module");
let OrderModule = class OrderModule {
};
exports.OrderModule = OrderModule;
exports.OrderModule = OrderModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([order_entity_1.Order, shop_entity_1.Shop]), draw_module_1.DrawModule],
        controllers: [order_cancel_controller_1.OrderCancelController, order_controller_1.OrderController, order_controller_1.ShopController, order_controller_1.BetStatusController],
        providers: [order_cancel_service_1.OrderCancelService],
    })
], OrderModule);
//# sourceMappingURL=order.module.js.map