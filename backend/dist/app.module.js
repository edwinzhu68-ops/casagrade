"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const order_module_1 = require("./modules/order/order.module");
const draw_module_1 = require("./modules/draw/draw.module");
const merchant_module_1 = require("./modules/merchant/merchant.module");
const settlement_module_1 = require("./modules/settlement/settlement.module");
const order_entity_1 = require("./entities/order.entity");
const shop_entity_1 = require("./entities/shop.entity");
const draw_entity_1 = require("./entities/draw.entity");
const user_entity_1 = require("./entities/user.entity");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forRoot({
                type: 'sqlite',
                database: 'lottery.db',
                entities: [order_entity_1.Order, shop_entity_1.Shop, draw_entity_1.Draw, user_entity_1.User],
                synchronize: true,
                logging: false,
            }),
            order_module_1.OrderModule,
            draw_module_1.DrawModule,
            merchant_module_1.MerchantModule,
            settlement_module_1.SettlementModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map