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
var AdminController_1;
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const express_1 = require("express");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const bcrypt = __importStar(require("bcryptjs"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const order_entity_1 = require("../../entities/order.entity");
const shop_entity_1 = require("../../entities/shop.entity");
const user_entity_1 = require("../../entities/user.entity");
const draw_entity_1 = require("../../entities/draw.entity");
const card_code_entity_1 = require("../../entities/card-code.entity");
const shop_binding_entity_1 = require("../../entities/shop-binding.entity");
const admin_token_guard_1 = require("../../guards/admin-token.guard");
function generateCardCode(type) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const rand2 = () => Array.from({ length: 2 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const seg4 = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const prefix = type === 'yearly' ? 'YY' : type === 'half_yearly' ? 'HY' : 'MM';
    return `${prefix}${rand2()}-${seg4()}-${seg4()}`;
}
let AdminController = AdminController_1 = class AdminController {
    constructor(orderRepo, shopRepo, userRepo, drawRepo, cardCodeRepo, shopBindingRepo, dataSource) {
        this.orderRepo = orderRepo;
        this.shopRepo = shopRepo;
        this.userRepo = userRepo;
        this.drawRepo = drawRepo;
        this.cardCodeRepo = cardCodeRepo;
        this.shopBindingRepo = shopBindingRepo;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(AdminController_1.name);
    }
    async shopCompare(from, to, top = '10') {
        const topN = Number(top) || 10;
        const where = {};
        if (from) {
            where.created_at = where.created_at || {};
            where.created_at.$gte = new Date(from);
        }
        if (to) {
            where.created_at = where.created_at || {};
            const endDate = new Date(to);
            endDate.setDate(endDate.getDate() + 1);
            where.created_at.$lt = endDate;
        }
        const qb = this.orderRepo.createQueryBuilder('order')
            .where('order.status >= :status', { status: 1 });
        if (from) {
            qb.andWhere('order.paid_at >= :from', { from: new Date(from) });
        }
        if (to) {
            const endDate = new Date(to);
            endDate.setDate(endDate.getDate() + 1);
            qb.andWhere('order.paid_at < :to', { to: endDate });
        }
        const orders = await qb.getMany();
        const shopMap = new Map();
        for (const o of orders) {
            if (!o.shop_id)
                continue;
            if (!shopMap.has(o.shop_id)) {
                shopMap.set(o.shop_id, { sales: 0, payout: 0 });
            }
            const entry = shopMap.get(o.shop_id);
            entry.sales += Number(o.amount);
            if (o.win_amount) {
                entry.payout += Number(o.win_amount);
            }
        }
        const shopIds = Array.from(shopMap.keys());
        const shops = shopIds.length
            ? await this.shopRepo.find({ where: { shop_id: (0, typeorm_2.In)(shopIds) } })
            : [];
        const items = shops.map((s) => {
            const agg = shopMap.get(s.shop_id) || { sales: 0, payout: 0 };
            const totalSales = agg.sales;
            const totalPayout = agg.payout;
            const netProfit = totalSales - totalPayout;
            return {
                shopNumber: s.shop_number,
                shopName: s.shop_name,
                totalSales,
                netProfit,
            };
        });
        items.sort((a, b) => b.totalSales - a.totalSales);
        return {
            items: items.slice(0, topN),
        };
    }
    async getAllShops() {
        const shops = await this.shopRepo.find({ order: { shop_id: 'ASC' } });
        const ownerIds = shops.map(s => s.owner_id).filter(Boolean);
        const users = ownerIds.length
            ? await this.userRepo.find({ where: { user_id: (0, typeorm_2.In)(ownerIds) } })
            : [];
        const userMap = new Map(users.map(u => [u.user_id, u]));
        const completedDraws = await this.drawRepo.find({
            where: { status: 'completed' },
            order: { draw_id: 'ASC' },
            select: ['draw_id'],
        });
        const completedDrawIds = completedDraws.map(d => d.draw_id);
        const totalCompleted = completedDrawIds.length;
        const shopIds = shops.map(s => s.shop_id).filter(Boolean);
        let lastOrderMap = new Map();
        if (shopIds.length) {
            const rows = await this.orderRepo
                .createQueryBuilder('o')
                .select('o.shop_id', 'shop_id')
                .addSelect('MAX(o.draw_id)', 'last_draw_id')
                .where('o.shop_id IN (:...ids)', { ids: shopIds })
                .andWhere('o.status IN (:...statuses)', { statuses: [1, 2, 3] })
                .groupBy('o.shop_id')
                .getRawMany();
            rows.forEach(r => lastOrderMap.set(Number(r.shop_id), Number(r.last_draw_id)));
        }
        const bindings = shopIds.length
            ? await this.shopBindingRepo.find({ where: { main_shop_id: (0, typeorm_2.In)(shopIds), status: 'active' } })
            : [];
        const subCountMap = new Map();
        for (const b of bindings) {
            subCountMap.set(b.main_shop_id, (subCountMap.get(b.main_shop_id) || 0) + 1);
        }
        return {
            shops: shops.map(s => {
                const user = s.owner_id ? userMap.get(s.owner_id) : null;
                const lastDrawId = lastOrderMap.get(s.shop_id);
                const inactive_periods = lastDrawId != null
                    ? completedDrawIds.filter(id => id > lastDrawId).length
                    : totalCompleted;
                return {
                    shop_id: s.shop_id,
                    shop_number: s.shop_number,
                    shop_name: s.shop_name,
                    shop_aliases: s.shop_aliases || [],
                    status: s.status,
                    commission_rate: s.commission_rate,
                    owner_id: s.owner_id,
                    account_number: user ? user.account_number : null,
                    registered_at: user ? user.created_at : null,
                    inactive_periods,
                    subscription_expires_at: s.subscription_expires_at ?? null,
                    sub_shop_count: subCountMap.get(s.shop_id) || 0,
                };
            }),
        };
    }
    async deleteAccount(accountNumber, req) {
        const account = (accountNumber || '').trim();
        if (!account)
            throw new common_1.BadRequestException('请提供账号');
        const user = await this.userRepo.findOne({ where: { account_number: account } });
        if (!user)
            throw new common_1.NotFoundException(`账号 ${account} 不存在`);
        const shops = await this.shopRepo.find({ where: { owner_id: user.user_id } });
        const shopNumbers = shops.map(s => s.shop_number);
        let deletedOrders = 0;
        let deletedDraws = 0;
        await this.dataSource.transaction(async (manager) => {
            for (const shop of shops) {
                const o = await manager.delete(order_entity_1.Order, { shop_id: shop.shop_id });
                const d = await manager.delete(draw_entity_1.Draw, { shop_id: shop.shop_id });
                deletedOrders += o.affected || 0;
                deletedDraws += d.affected || 0;
                await manager.delete(shop_binding_entity_1.ShopBinding, { main_shop_id: shop.shop_id });
                await manager.delete(shop_binding_entity_1.ShopBinding, { sub_shop_id: shop.shop_id });
                await manager.delete(shop_entity_1.Shop, shop.shop_id);
            }
            await manager.delete(user_entity_1.User, user.user_id);
        });
        const ip = (req?.headers?.['x-forwarded-for'] || req?.ip || '?').toString().split(',')[0].trim();
        this.logger.log(`[审计] 删除账号 account=${account} user_id=${user.user_id} 释放店号=[${shopNumbers.join(',')}] ` +
            `订单=${deletedOrders} 彩期=${deletedDraws} ip=${ip} time=${new Date().toISOString()}`);
        return {
            success: true,
            message: `已删除账号 ${account}，释放店号：${shopNumbers.join(', ') || '无'}（清理订单 ${deletedOrders} 条，店内彩期 ${deletedDraws} 条）`,
        };
    }
    async setShopStatus(shopId, status) {
        const shop = await this.shopRepo.findOne({ where: { shop_id: parseInt(shopId) } });
        if (!shop)
            throw new common_1.NotFoundException('店铺不存在');
        if (status !== 'active' && status !== 'disabled')
            throw new common_1.BadRequestException('status 只能是 active 或 disabled');
        await this.shopRepo.update(shop.shop_id, { status });
        return { success: true, shop_id: shop.shop_id, status };
    }
    async setShopSubscription(shopId, expiresAt, req) {
        const id = parseInt(shopId, 10);
        if (isNaN(id))
            throw new common_1.BadRequestException('无效的 shopId');
        const shop = await this.shopRepo.findOne({ where: { shop_id: id } });
        if (!shop)
            throw new common_1.NotFoundException('店铺不存在');
        let newExpiry = null;
        if (expiresAt !== null && expiresAt !== undefined && expiresAt !== '') {
            newExpiry = new Date(expiresAt);
            if (isNaN(newExpiry.getTime()))
                throw new common_1.BadRequestException('日期格式无效，请用 YYYY-MM-DD');
        }
        const oldExpiry = shop.subscription_expires_at
            ? new Date(shop.subscription_expires_at).toISOString()
            : null;
        const ip = (req?.headers?.['x-forwarded-for'] || req?.ip || '?').toString().split(',')[0].trim();
        await this.shopRepo.update(id, { subscription_expires_at: newExpiry });
        this.logger.log(`[审计] 修改店铺订阅到期日 shop_id=${id} shop_number=${shop.shop_number} ` +
            `old=${oldExpiry} → new=${newExpiry ? newExpiry.toISOString() : null} ip=${ip} time=${new Date().toISOString()}`);
        return {
            success: true,
            shop_id: id,
            subscription_expires_at: newExpiry ? newExpiry.toISOString() : null,
        };
    }
    async resetPassword(shopNumber, newPassword, req) {
        const sn = (shopNumber || '').trim();
        const pwd = (newPassword || '').trim();
        if (!sn)
            throw new common_1.BadRequestException('请提供店号');
        if (!pwd || pwd.length < 4)
            throw new common_1.BadRequestException('新密码至少 4 位');
        let shop = await this.shopRepo.findOne({ where: { shop_number: sn } });
        if (!shop) {
            const all = await this.shopRepo.find();
            shop = all.find(s => (s.shop_aliases || []).includes(sn)) ?? null;
        }
        if (!shop)
            throw new common_1.NotFoundException(`找不到店号 ${sn}`);
        if (!shop.owner_id)
            throw new common_1.BadRequestException('该店铺没有关联账号');
        const hash = await bcrypt.hash(pwd, 10);
        await this.userRepo.update(shop.owner_id, { password_hash: hash });
        const ip = (req?.headers?.['x-forwarded-for'] || req?.ip || '?').toString().split(',')[0].trim();
        this.logger.log(`[审计] 重置密码 shop_number=${sn} shop_id=${shop.shop_id} target_user_id=${shop.owner_id} ` +
            `ip=${ip} time=${new Date().toISOString()}`);
        return { success: true, message: `店号 ${sn} 密码已重置` };
    }
    async generateCards(type, count, req) {
        if (!['monthly', 'half_yearly', 'yearly'].includes(type))
            throw new common_1.BadRequestException('type 只能是 monthly / half_yearly / yearly');
        const n = Math.min(Math.max(parseInt(String(count)) || 1, 1), 50);
        const codes = [];
        for (let i = 0; i < n; i++) {
            let code;
            let attempts = 0;
            do {
                code = generateCardCode(type);
                attempts++;
            } while (attempts < 10 && await this.cardCodeRepo.findOne({ where: { code } }));
            if (attempts >= 10)
                throw new common_1.BadRequestException('卡密生成碰撞过多，请重试');
            const card = this.cardCodeRepo.create({ code, type, used_by_shop_id: null, used_at: null });
            await this.cardCodeRepo.save(card);
            codes.push(code);
        }
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '?';
        this.logger.log(`[审计] 生成卡密 type=${type} count=${n} ip=${ip} time=${new Date().toISOString()}`);
        return { success: true, codes, type, generated_at: new Date().toISOString() };
    }
    async listCards(type) {
        const where = {};
        if (type)
            where.type = type;
        const cards = await this.cardCodeRepo.find({ where, order: { created_at: 'DESC' } });
        return {
            cards: cards.map(c => ({
                id: c.id,
                code: c.code,
                type: c.type,
                used: !!c.used_at,
                used_by_shop_id: c.used_by_shop_id,
                used_at: c.used_at,
                created_at: c.created_at,
            })),
        };
    }
    async getSubShops(shopId) {
        const id = parseInt(shopId, 10);
        if (isNaN(id))
            throw new common_1.BadRequestException('无效的 shopId');
        const bindings = await this.shopBindingRepo.find({
            where: { main_shop_id: id, status: 'active' },
            order: { created_at: 'ASC' },
        });
        const subIds = bindings.map(b => b.sub_shop_id);
        const shops = subIds.length ? await this.shopRepo.find({ where: { shop_id: (0, typeorm_2.In)(subIds) } }) : [];
        const shopMap = new Map(shops.map(s => [s.shop_id, s]));
        return {
            sub_shops: bindings.map(b => {
                const s = shopMap.get(b.sub_shop_id);
                return {
                    shop_id: b.sub_shop_id,
                    shop_number: s?.shop_number ?? '',
                    shop_name: s?.shop_name ?? '',
                    subscription_expires_at: s?.subscription_expires_at ?? null,
                    binding_id: b.binding_id,
                };
            }),
        };
    }
    async revokeCard(id, req) {
        const cardId = parseInt(id, 10);
        if (isNaN(cardId))
            throw new common_1.BadRequestException('无效的卡密ID');
        const card = await this.cardCodeRepo.findOne({ where: { id: cardId } });
        if (!card)
            throw new common_1.NotFoundException('卡密不存在');
        await this.cardCodeRepo.delete(cardId);
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '?';
        this.logger.log(`[审计] 作废卡密 id=${cardId} code=${card.code} ip=${ip} time=${new Date().toISOString()}`);
        return { success: true, message: `卡密 ${card.code} 已作废` };
    }
    async assignShop(shopNumber, accountNumber) {
        const sn = (shopNumber || '').trim();
        const account = (accountNumber || '').trim();
        if (!/^\d{1,9}$/.test(sn)) {
            throw new common_1.BadRequestException('店号为 1-9 位数字');
        }
        if (!account) {
            throw new common_1.BadRequestException('请提供买家账号 accountNumber');
        }
        const user = await this.userRepo.findOne({ where: { account_number: account } });
        if (!user) {
            throw new common_1.NotFoundException(`账号 ${account} 不存在，请让买家先注册`);
        }
        const existingByPrimary = await this.shopRepo.findOne({ where: { shop_number: sn } });
        if (existingByPrimary) {
            throw new common_1.BadRequestException(`店号 ${sn} 已存在，不能分配`);
        }
        const allShops = await this.shopRepo.find();
        const existingByAlias = allShops.find(s => (s.shop_aliases || []).includes(sn));
        if (existingByAlias) {
            throw new common_1.BadRequestException(`店号 ${sn} 已被其他店铺用作别名，不能分配`);
        }
        const userShop = await this.shopRepo.findOne({ where: { owner_id: user.user_id } });
        if (userShop) {
            const aliases = userShop.shop_aliases || [];
            const timestamps = userShop.shop_alias_timestamps || {};
            if (!aliases.includes(userShop.shop_number)) {
                aliases.push(userShop.shop_number);
                timestamps[userShop.shop_number] = new Date().toISOString();
            }
            await this.shopRepo.update(userShop.shop_id, { shop_number: sn, shop_aliases: aliases, shop_alias_timestamps: timestamps });
            return {
                success: true,
                message: `已将店号 ${sn} 设为主号，旧号 ${userShop.shop_number} 保留为别名（1个月后自动删除）`,
                shop_id: userShop.shop_id,
                shop_number: sn,
                shop_aliases: aliases,
                owner_id: userShop.owner_id,
            };
        }
        const shop = this.shopRepo.create({
            shop_number: sn,
            owner_id: user.user_id,
            shop_name: `店铺${sn}`,
            status: 'active',
            commission_rate: 0.1,
        });
        await this.shopRepo.save(shop);
        return {
            success: true,
            message: `已创建店号 ${sn} 并绑定到账号 ${account}`,
            shop_id: shop.shop_id,
            shop_number: shop.shop_number,
            shop_aliases: [],
            owner_id: shop.owner_id,
        };
    }
    async health() {
        try {
            await this.orderRepo.query('SELECT 1');
            return {
                db: 'ok',
                queue: 'unknown',
            };
        }
        catch (e) {
            return {
                db: 'error',
                queue: 'unknown',
            };
        }
    }
    async drawHistory(limit) {
        const take = Number(limit) || 50;
        const { Not, IsNull } = await Promise.resolve().then(() => __importStar(require('typeorm')));
        const completedDraws = await this.drawRepo.find({
            where: { status: (0, typeorm_2.In)(['completed', 'COMPLETED']), archived_at: Not(IsNull()) },
            order: { draw_id: 'DESC' },
            take,
        });
        if (!completedDraws.length) {
            return { history: [] };
        }
        const history = await Promise.all(completedDraws.map(async (draw) => {
            const orders = await this.orderRepo.find({
                where: { draw_id: draw.draw_id },
            });
            const paidOrders = orders.filter((o) => [1, 2, 3].includes(Number(o.status)));
            const totalSales = paidOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0);
            const totalPayout = paidOrders.reduce((sum, o) => sum + Number(o.win_amount || 0), 0);
            return {
                draw_id: draw.draw_id,
                draw_date: draw.draw_date,
                order_count: paidOrders.length,
                total_sales: Math.round(totalSales * 100) / 100,
                total_payout: Math.round(totalPayout * 100) / 100,
                net_profit: Math.round((totalSales - totalPayout) * 100) / 100,
            };
        }));
        return { history };
    }
    async archiveMainShop() {
        const completed = await this.drawRepo.findOne({
            where: { status: (0, typeorm_2.In)(['completed', 'COMPLETED']) },
            order: { draw_id: 'DESC' },
        });
        if (!completed) {
            return { success: false, message: '没有已完成的期次可归档' };
        }
        if (completed.main_shop_archived) {
            return { success: false, message: '大庄数据已经归档过了' };
        }
        await this.drawRepo.update(completed.draw_id, {
            main_shop_archived: true,
            archived_at: completed.archived_at ?? new Date(),
        });
        return { success: true, message: `已归档第 ${completed.draw_id} 期大庄数据` };
    }
    async getLogs(lines = '100') {
        const logDir = path.join(__dirname, '..', '..', 'logs');
        const today = new Date().toISOString().split('T')[0];
        const logFile = path.join(logDir, `error-${today}.log`);
        let content = '';
        try {
            if (fs.existsSync(logFile)) {
                const fileContent = fs.readFileSync(logFile, 'utf-8');
                const allLines = fileContent.split('\n');
                const maxLines = Math.min(parseInt(lines, 10) || 100, 500);
                content = allLines.slice(-maxLines).join('\n');
            }
        }
        catch (e) {
            return { success: false, error: '读取日志失败: ' + e.message };
        }
        return { success: true, logs: content, date: today };
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('shop-compare'),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, common_1.Query)('top')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "shopCompare", null);
__decorate([
    (0, common_1.Get)('shops'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getAllShops", null);
__decorate([
    (0, common_1.Delete)('accounts/:accountNumber'),
    __param(0, (0, common_1.Param)('accountNumber')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "deleteAccount", null);
__decorate([
    (0, common_1.Patch)('shops/:shopId/status'),
    __param(0, (0, common_1.Param)('shopId')),
    __param(1, (0, common_1.Body)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "setShopStatus", null);
__decorate([
    (0, common_1.Patch)('shops/:shopId/subscription'),
    __param(0, (0, common_1.Param)('shopId')),
    __param(1, (0, common_1.Body)('expires_at')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "setShopSubscription", null);
__decorate([
    (0, common_1.Post)('reset-password'),
    __param(0, (0, common_1.Body)('shopNumber')),
    __param(1, (0, common_1.Body)('newPassword')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "resetPassword", null);
__decorate([
    (0, common_1.Post)('generate-cards'),
    __param(0, (0, common_1.Body)('type')),
    __param(1, (0, common_1.Body)('count')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, typeof (_a = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "generateCards", null);
__decorate([
    (0, common_1.Get)('cards'),
    __param(0, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listCards", null);
__decorate([
    (0, common_1.Get)('shops/:shopId/sub-shops'),
    __param(0, (0, common_1.Param)('shopId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getSubShops", null);
__decorate([
    (0, common_1.Delete)('cards/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "revokeCard", null);
__decorate([
    (0, common_1.Post)('assign-shop'),
    __param(0, (0, common_1.Body)('shopNumber')),
    __param(1, (0, common_1.Body)('accountNumber')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "assignShop", null);
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('draw-history'),
    __param(0, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "drawHistory", null);
__decorate([
    (0, common_1.Post)('archive-main-shop'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "archiveMainShop", null);
__decorate([
    (0, common_1.Get)('logs'),
    __param(0, (0, common_1.Query)('lines')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getLogs", null);
exports.AdminController = AdminController = AdminController_1 = __decorate([
    (0, common_1.Controller)('admin'),
    (0, common_1.UseGuards)(admin_token_guard_1.AdminTokenGuard),
    __param(0, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(1, (0, typeorm_1.InjectRepository)(shop_entity_1.Shop)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(3, (0, typeorm_1.InjectRepository)(draw_entity_1.Draw)),
    __param(4, (0, typeorm_1.InjectRepository)(card_code_entity_1.CardCode)),
    __param(5, (0, typeorm_1.InjectRepository)(shop_binding_entity_1.ShopBinding)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource])
], AdminController);
//# sourceMappingURL=admin.controller.js.map