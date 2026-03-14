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
var MerchantController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MerchantController = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const user_entity_1 = require("../../entities/user.entity");
const shop_entity_1 = require("../../entities/shop.entity");
const crypto = __importStar(require("crypto"));
let MerchantController = MerchantController_1 = class MerchantController {
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(MerchantController_1.name);
    }
    async login(dto) {
        const account = dto.account || dto.accountNumber;
        const user = await this.dataSource.getRepository(user_entity_1.User).findOne({
            where: { account_number: account },
        });
        if (!user) {
            throw new Error('账号不存在');
        }
        const passwordHash = crypto.createHash('sha256').update(dto.password).digest('hex');
        if (user.password_hash !== passwordHash && user.password_hash !== dto.password) {
            throw new Error('密码错误');
        }
        const token = Buffer.from(`${user.user_id}:${user.account_number}`).toString('base64');
        this.logger.log(`老板登录: ${user.account_number}, 角色: ${user.role}`);
        return {
            token,
            userId: user.user_id,
            accountNumber: user.account_number,
            role: user.role,
        };
    }
    async getShops(userId, req) {
        let userIdNum;
        if (userId) {
            userIdNum = parseInt(userId);
        }
        else {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                try {
                    const token = authHeader.replace('Bearer ', '');
                    const decoded = Buffer.from(token, 'base64').toString();
                    userIdNum = parseInt(decoded.split(':')[0]);
                }
                catch (e) {
                    throw new Error('无效的token');
                }
            }
            else {
                throw new Error('请先登录');
            }
        }
        if (!userIdNum || isNaN(userIdNum)) {
            throw new Error('无效的用户ID');
        }
        const shops = await this.dataSource.getRepository(shop_entity_1.Shop).find({
            where: { owner_id: userIdNum },
            order: { shop_id: 'DESC' },
        });
        return {
            shops: shops.map(shop => ({
                shop_id: shop.shop_id,
                shop_number: shop.shop_number,
                shop_name: shop.shop_name,
                status: shop.status,
                commission_rate: shop.commission_rate,
            })),
        };
    }
    async getShop(shopId) {
        const shop = await this.dataSource.getRepository(shop_entity_1.Shop).findOne({
            where: { shop_id: parseInt(shopId) },
        });
        if (!shop) {
            throw new Error('店铺不存在');
        }
        return {
            shop_id: shop.shop_id,
            shop_number: shop.shop_number,
            shop_name: shop.shop_name,
            status: shop.status,
            commission_rate: shop.commission_rate,
            single_bet_limit: shop.single_bet_limit,
            daily_bet_limit: shop.daily_bet_limit,
        };
    }
};
exports.MerchantController = MerchantController;
__decorate([
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "login", null);
__decorate([
    (0, common_1.Get)('shops'),
    __param(0, (0, common_1.Query)('userId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "getShops", null);
__decorate([
    (0, common_1.Get)('shops/:shopId'),
    __param(0, (0, common_1.Param)('shopId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "getShop", null);
exports.MerchantController = MerchantController = MerchantController_1 = __decorate([
    (0, common_1.Controller)('merchant'),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], MerchantController);
//# sourceMappingURL=merchant.controller.js.map