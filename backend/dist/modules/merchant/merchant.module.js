"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MerchantModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const merchant_controller_1 = require("./merchant.controller");
const user_entity_1 = require("../../entities/user.entity");
const shop_entity_1 = require("../../entities/shop.entity");
const shop_binding_entity_1 = require("../../entities/shop-binding.entity");
const local_lottery_module_1 = require("../local-lottery/local-lottery.module");
let MerchantModule = class MerchantModule {
};
exports.MerchantModule = MerchantModule;
exports.MerchantModule = MerchantModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([user_entity_1.User, shop_entity_1.Shop, shop_binding_entity_1.ShopBinding]), local_lottery_module_1.LocalLotteryModule],
        controllers: [merchant_controller_1.MerchantController],
    })
], MerchantModule);
//# sourceMappingURL=merchant.module.js.map