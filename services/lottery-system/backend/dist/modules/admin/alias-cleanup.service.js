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
var AliasCleanupService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AliasCleanupService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const shop_entity_1 = require("../../entities/shop.entity");
const ALIAS_EXPIRE_DAYS = 30;
let AliasCleanupService = AliasCleanupService_1 = class AliasCleanupService {
    constructor(shopRepo) {
        this.shopRepo = shopRepo;
        this.logger = new common_1.Logger(AliasCleanupService_1.name);
    }
    async cleanupExpiredAliases() {
        const shops = await this.shopRepo.find();
        const expireMs = ALIAS_EXPIRE_DAYS * 24 * 60 * 60 * 1000;
        const now = Date.now();
        let cleaned = 0;
        for (const shop of shops) {
            const aliases = shop.shop_aliases || [];
            const timestamps = shop.shop_alias_timestamps || {};
            if (aliases.length === 0)
                continue;
            const kept = aliases.filter(alias => {
                const addedAt = timestamps[alias];
                if (!addedAt)
                    return true;
                return now - new Date(addedAt).getTime() < expireMs;
            });
            if (kept.length < aliases.length) {
                const removed = aliases.filter(a => !kept.includes(a));
                const newTimestamps = { ...timestamps };
                removed.forEach(a => delete newTimestamps[a]);
                await this.shopRepo.update(shop.shop_id, {
                    shop_aliases: kept.length > 0 ? kept : null,
                    shop_alias_timestamps: Object.keys(newTimestamps).length > 0 ? newTimestamps : null,
                });
                cleaned += removed.length;
                this.logger.log(`店铺 ${shop.shop_number} 清理过期别名：${removed.join(', ')}`);
            }
        }
        if (cleaned > 0) {
            this.logger.log(`共清理 ${cleaned} 个过期别名，已释放回随机池`);
        }
    }
};
exports.AliasCleanupService = AliasCleanupService;
exports.AliasCleanupService = AliasCleanupService = AliasCleanupService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(shop_entity_1.Shop)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], AliasCleanupService);
//# sourceMappingURL=alias-cleanup.service.js.map