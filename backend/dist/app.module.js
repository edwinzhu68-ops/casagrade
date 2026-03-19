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
const admin_module_1 = require("./modules/admin/admin.module");
const order_entity_1 = require("./entities/order.entity");
const shop_entity_1 = require("./entities/shop.entity");
const draw_entity_1 = require("./entities/draw.entity");
const user_entity_1 = require("./entities/user.entity");
const shop_binding_entity_1 = require("./entities/shop-binding.entity");
const card_code_entity_1 = require("./entities/card-code.entity");
const database_init_service_1 = require("./services/database-init.service");
function getTypeOrmConfig() {
    const dbType = (process.env.DB_TYPE || 'sqlite');
    const common = {
        entities: [order_entity_1.Order, shop_entity_1.Shop, draw_entity_1.Draw, user_entity_1.User, shop_binding_entity_1.ShopBinding, card_code_entity_1.CardCode],
        synchronize: process.env.NODE_ENV !== 'production',
        logging: false,
    };
    if (dbType === 'postgres') {
        return {
            ...common,
            type: 'postgres',
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT) || 5432,
            username: process.env.DB_USERNAME || 'postgres',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_DATABASE || 'lottery',
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        };
    }
    return {
        ...common,
        type: 'sqlite',
        database: process.env.DATABASE_PATH || 'lottery.db',
    };
}
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forRoot(getTypeOrmConfig()),
            order_module_1.OrderModule,
            draw_module_1.DrawModule,
            merchant_module_1.MerchantModule,
            settlement_module_1.SettlementModule,
            admin_module_1.AdminModule,
        ],
        providers: [database_init_service_1.DatabaseInitService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map