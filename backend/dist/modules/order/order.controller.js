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
var OrderController_1, ShopController_1, BetStatusController_1;
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BetStatusController = exports.ShopController = exports.OrderController = void 0;
const common_1 = require("@nestjs/common");
const express_1 = require("express");
const typeorm_1 = require("typeorm");
const order_entity_1 = require("../../entities/order.entity");
const shop_entity_1 = require("../../entities/shop.entity");
async function findShopByNumber(shopRepo, number) {
    const byPrimary = await shopRepo.findOne({ where: { shop_number: number } });
    if (byPrimary)
        return byPrimary;
    const safe = number.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    return shopRepo
        .createQueryBuilder('s')
        .where(`s.shop_aliases LIKE :pattern`, { pattern: `%"${safe}"%` })
        .getOne() ?? null;
}
const draw_entity_1 = require("../../entities/draw.entity");
const draw_day_service_1 = require("../draw/draw-day.service");
const local_lottery_service_1 = require("../local-lottery/local-lottery.service");
const draw_queries_1 = require("../../utils/draw-queries");
const shop_order_lock_1 = require("../../utils/shop-order-lock");
const crypto = __importStar(require("crypto"));
const common_2 = require("@nestjs/common");
const TOKEN_SECRET = () => process.env.TOKEN_SECRET || 'lottery-token-secret-change-in-prod';
function parseOrderToken(token) {
    if (!token)
        return null;
    const lastDot = token.lastIndexOf('.');
    if (lastDot <= 0)
        return null;
    const payload = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);
    const expected = crypto.createHmac('sha256', TOKEN_SECRET()).update(payload).digest('hex').slice(0, 32);
    try {
        const a = Buffer.from(sig), b = Buffer.from(expected);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
            return null;
    }
    catch {
        return null;
    }
    try {
        const decoded = Buffer.from(payload, 'base64').toString('utf8');
        const colonIdx = decoded.indexOf(':');
        if (colonIdx < 1)
            return null;
        const userId = parseInt(decoded.slice(0, colonIdx), 10);
        return isNaN(userId) ? null : userId;
    }
    catch {
        return null;
    }
}
let OrderController = OrderController_1 = class OrderController {
    constructor(dataSource, localLotteryService) {
        this.dataSource = dataSource;
        this.localLotteryService = localLotteryService;
        this.logger = new common_1.Logger(OrderController_1.name);
    }
    async onModuleInit() {
        const qr = this.dataSource.createQueryRunner();
        for (const sql of [
            `ALTER TABLE orders ADD COLUMN idempotency_key VARCHAR(64)`,
        ]) {
            try {
                await qr.query(sql);
            }
            catch { }
        }
        await qr.release();
    }
    async createOrder(dto, req) {
        const kind = dto.lotteryKind;
        if (kind === 'TICA' || kind === 'NICA') {
            return this.localLotteryService.createOrder({
                shopId: dto.shopId ?? dto.shop_id,
                lotteryKind: kind,
                numbers: dto.numbers,
                amount: dto.amount,
                gameType: dto.gameType || dto.game_type,
                clientId: dto.clientId,
                ipAddress: dto.ipAddress,
                idempotency_key: dto.idempotency_key,
            }, req);
        }
        const shopId = dto.shopId ?? dto.shop_id;
        const numbers = dto.numbers;
        const amount = Number(dto.amount);
        const gameTypeValue = dto.gameType || dto.game_type;
        const clientId = dto.clientId;
        const dtoIp = dto.ipAddress;
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.ip ||
            (req.socket && req.socket.remoteAddress) ||
            dtoIp ||
            '127.0.0.1';
        if (shopId == null || Number.isNaN(Number(shopId))) {
            throw new common_1.BadRequestException('缺少店铺ID');
        }
        if (!Array.isArray(numbers) || numbers.length === 0 || numbers.length > 500) {
            throw new common_1.BadRequestException('号码列表无效或超过500条');
        }
        if (Number.isNaN(amount) || amount <= 0 || amount > 100000) {
            throw new common_1.BadRequestException('金额无效');
        }
        for (const item of numbers) {
            if (typeof item.n !== 'string' || item.n.length > 10 || typeof item.q !== 'number' || item.q < 1 || item.q > 999) {
                throw new common_1.BadRequestException('号码或数量格式无效');
            }
        }
        const BILLETE_PRICE = 1.00;
        const CHANCE_PRICE = 0.25;
        let expectedAmount = 0;
        for (const item of numbers) {
            const numLen = String(item.n).replace(/\D/g, '').length;
            const price = numLen >= 4 ? BILLETE_PRICE : CHANCE_PRICE;
            expectedAmount += price * Number(item.q);
        }
        expectedAmount = Math.round(expectedAmount * 100) / 100;
        if (Math.abs(expectedAmount - amount) > 0.01) {
            throw new common_1.BadRequestException(`金额不符：期望 $${expectedAmount}，实际 $${amount}`);
        }
        const idempotencyKey = (dto.idempotency_key || '').trim().substring(0, 64) || null;
        if (idempotencyKey) {
            const orderRepo0 = this.dataSource.getRepository(order_entity_1.Order);
            const existing = await orderRepo0
                .createQueryBuilder('o')
                .where('o.idempotency_key = :k', { k: idempotencyKey })
                .andWhere('o.shop_id = :s', { s: Number(shopId) })
                .andWhere('(o.lottery_type IS NULL OR o.lottery_type = :nac)', { nac: 'NACIONAL' })
                .andWhere('o.status != :canceled', { canceled: -1 })
                .getOne();
            if (existing) {
                this.logger.log(`幂等重复请求，返回已有订单 #${existing.order_number}`);
                return {
                    order_id: existing.order_id,
                    order_number: existing.order_number,
                    order_hash: existing.order_hash,
                    verification_code: existing.verification_code,
                    amount: existing.amount,
                    status: existing.status,
                    created_at: existing.created_at,
                    _idempotent: true,
                };
            }
        }
        const shop = await this.dataSource.getRepository(shop_entity_1.Shop).findOne({
            where: { shop_id: Number(shopId) },
        });
        if (!shop) {
            throw new common_1.NotFoundException('店铺不存在');
        }
        if (shop.status !== 'active') {
            throw new common_1.BadRequestException('店铺已停业');
        }
        const expiresAt = shop.subscription_expires_at;
        if (expiresAt && new Date(expiresAt) < new Date()) {
            throw new common_1.BadRequestException('Su suscripción ha vencido. Contacte al administrador para renovar.');
        }
        if (shop.loteria_enabled === false) {
            throw new common_1.BadRequestException('Lotería 已关闭，无法下单');
        }
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        const currentDraw = await (0, draw_queries_1.findNationalPendingDraw)(drawRepo);
        if (!currentDraw) {
            throw new common_1.BadRequestException('当前处于停售期，暂停下单');
        }
        if (currentDraw) {
            const timeStr = String(currentDraw.draw_time || '').trim();
            let drawHour = -1, drawMin = 0;
            let dy, dm, dd;
            if (timeStr.includes('T') && /^\d{4}-\d{2}-\d{2}/.test(timeStr)) {
                const iso = timeStr.substring(0, 10);
                dy = parseInt(iso.slice(0, 4), 10);
                dm = parseInt(iso.slice(5, 7), 10);
                dd = parseInt(iso.slice(8, 10), 10);
                const dt = new Date(timeStr);
                if (!isNaN(dt.getTime())) {
                    drawHour = dt.getHours();
                    drawMin = dt.getMinutes();
                }
            }
            else {
                const parts = timeStr.split(':').map(Number);
                if (parts.length >= 2 && !isNaN(parts[0])) {
                    drawHour = parts[0];
                    drawMin = parts[1] || 0;
                }
                const rawDate = String(currentDraw.draw_date || '').slice(0, 10);
                if (rawDate && /^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
                    dy = parseInt(rawDate.slice(0, 4), 10);
                    dm = parseInt(rawDate.slice(5, 7), 10);
                    dd = parseInt(rawDate.slice(8, 10), 10);
                }
                else {
                    drawHour = -1;
                }
            }
            if (drawHour >= 0) {
                const panama = getPanamaNow();
                const todayStr = `${String(panama.d).padStart(2, '0')}-${String(panama.m).padStart(2, '0')}-${panama.y}`;
                const confirmedDrawDay = `${String(dd).padStart(2, '0')}-${String(dm).padStart(2, '0')}-${dy}`;
                const drawDateISO2 = `${dy}-${String(dm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
                const todayISO2 = `${panama.y}-${String(panama.m).padStart(2, '0')}-${String(panama.d).padStart(2, '0')}`;
                const totalMins = panama.h * 60 + panama.min;
                const drawMins = drawHour * 60 + drawMin;
                const stopStart = drawMins;
                const RESUME = 7 * 60;
                const drawDateObj2 = new Date(`${drawDateISO2}T12:00:00`);
                drawDateObj2.setDate(drawDateObj2.getDate() + 1);
                const dayAfterISO2 = `${drawDateObj2.getFullYear()}-${String(drawDateObj2.getMonth() + 1).padStart(2, '0')}-${String(drawDateObj2.getDate()).padStart(2, '0')}`;
                const inStop = (drawDateISO2 === todayISO2 && totalMins >= stopStart) ||
                    (dayAfterISO2 === todayISO2 && totalMins < RESUME);
                if (inStop) {
                    throw new common_1.BadRequestException('当前处于开奖窗口期，暂停下单');
                }
            }
        }
        const limitChance = shop.limit_chance;
        const limitBillete = shop.limit_billete;
        return (0, shop_order_lock_1.withShopLock)(Number(shopId), async () => {
            if (currentDraw && (limitChance != null || limitBillete != null)) {
                const dbType = this.dataSource.options.type;
                let soldRows = [];
                if (dbType === 'postgres') {
                    soldRows = await this.dataSource.query(`SELECT item->>'n' AS num, SUM((item->>'q')::int) AS qty
             FROM orders, jsonb_array_elements(numbers::jsonb) AS item
             WHERE draw_id = $1 AND shop_id = $2 AND status != -1
             GROUP BY item->>'n'`, [currentDraw.draw_id, Number(shopId)]);
                }
                else {
                    soldRows = await this.dataSource.query(`SELECT json_extract(value, '$.n') AS num,
                    SUM(CAST(json_extract(value, '$.q') AS INTEGER)) AS qty
             FROM orders, json_each(numbers)
             WHERE draw_id = ? AND shop_id = ? AND status != -1
             GROUP BY json_extract(value, '$.n')`, [currentDraw.draw_id, Number(shopId)]);
                }
                const soldMap = Object.fromEntries(soldRows.map(r => [r.num, Number(r.qty)]));
                const overLimitItems = [];
                for (const item of numbers) {
                    const numStr = String(item.n).replace(/\D/g, '');
                    const isBillete = numStr.length >= 4;
                    const limit = isBillete ? limitBillete : limitChance;
                    if (limit == null)
                        continue;
                    const alreadySold = soldMap[item.n] || 0;
                    if (alreadySold + item.q > limit) {
                        overLimitItems.push({ n: item.n, alreadySold, limit });
                    }
                }
                if (overLimitItems.length > 0) {
                    throw new common_1.BadRequestException({ message: '部分号码超出限额', overLimitItems });
                }
            }
            const orderNumber = this.generateOrderNumber();
            const orderHash = crypto.createHash('sha256').update(orderNumber + Date.now()).digest('hex').substring(0, 64);
            const verificationCode = this.generateVerificationCode();
            const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
            const orderData = {
                order_number: orderNumber,
                order_hash: orderHash,
                shop_id: Number(shopId),
                numbers,
                amount,
                game_type: gameTypeValue,
                lottery_type: 'NACIONAL',
                status: 0,
                verification_code: verificationCode,
                customer_info: { clientId },
                ip_address: ipAddress,
                draw_id: currentDraw?.draw_id || null,
            };
            if (idempotencyKey)
                orderData.idempotency_key = idempotencyKey;
            const order = orderRepo.create(orderData);
            await orderRepo.save(order);
            this.logger.log(`订单创建: #${orderNumber}, 店铺: ${shopId}, 金额: $${amount}`);
            return {
                order_id: order.order_id,
                order_number: order.order_number,
                order_hash: order.order_hash,
                verification_code: order.verification_code,
                amount: order.amount,
                status: 0,
                created_at: order.created_at,
            };
        });
    }
    async deleteOrder(orderNumber, body, req) {
        const shopId = body?.shopId != null ? Number(body.shopId) : undefined;
        if (!shopId || isNaN(shopId)) {
            throw new common_1.BadRequestException('缺少 shopId');
        }
        const authHeader = (req.headers?.['authorization'] || '');
        const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
        const tokenUserId = parseOrderToken(raw);
        if (!tokenUserId) {
            throw new common_2.UnauthorizedException('请先登录');
        }
        const shop = await this.dataSource.getRepository(shop_entity_1.Shop).findOne({ where: { shop_id: shopId } });
        if (!shop)
            throw new common_1.NotFoundException('店铺不存在');
        if (shop.owner_id !== tokenUserId) {
            throw new common_2.UnauthorizedException('无权操作此店铺');
        }
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const order = await orderRepo.findOne({ where: { order_number: orderNumber } });
        if (!order)
            throw new common_1.NotFoundException('订单不存在');
        if (order.shop_id !== shopId) {
            throw new common_1.BadRequestException('无权删除其他店铺的订单');
        }
        if (order.status === 2 || order.status === 3) {
            throw new common_1.BadRequestException('已结算或已中奖的订单不允许删除');
        }
        this.logger.log(`订单删除: #${order.order_number}, 店铺: ${shopId}, 状态: ${order.status}`);
        await orderRepo.remove(order);
        return { success: true, message: '订单已删除' };
    }
    async patchOrder(orderNumber, body, req) {
        const shopId = body?.shopId != null ? Number(body.shopId) : undefined;
        if (!shopId || isNaN(shopId)) {
            throw new common_1.BadRequestException('缺少 shopId');
        }
        const authHeader = (req.headers?.['authorization'] || '');
        const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
        const tokenUserId = parseOrderToken(raw);
        if (!tokenUserId) {
            throw new common_2.UnauthorizedException('请先登录');
        }
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const shop = await shopRepo.findOne({ where: { shop_id: shopId } });
        if (!shop)
            throw new common_1.NotFoundException('店铺不存在');
        if (shop.owner_id !== tokenUserId) {
            throw new common_2.UnauthorizedException('无权操作此店铺');
        }
        const numbers = body.numbers;
        if (!Array.isArray(numbers) || numbers.length === 0 || numbers.length > 500) {
            throw new common_1.BadRequestException('号码列表无效或超过500条');
        }
        for (const item of numbers) {
            if (typeof item.n !== 'string' || item.n.length > 10 || typeof item.q !== 'number' || item.q < 1 || item.q > 999) {
                throw new common_1.BadRequestException('号码或数量格式无效');
            }
        }
        const BILLETE_PRICE = 1.0;
        const CHANCE_PRICE = 0.25;
        let amount = 0;
        for (const item of numbers) {
            const numLen = String(item.n).replace(/\D/g, '').length;
            const price = numLen >= 4 ? BILLETE_PRICE : CHANCE_PRICE;
            amount += price * Number(item.q);
        }
        amount = Math.round(amount * 100) / 100;
        if (Number.isNaN(amount) || amount <= 0 || amount > 100000) {
            throw new common_1.BadRequestException('金额无效');
        }
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const orderPre = await orderRepo.findOne({ where: { order_number: orderNumber } });
        if (!orderPre)
            throw new common_1.NotFoundException('订单不存在');
        if (orderPre.shop_id !== shopId) {
            throw new common_1.BadRequestException('无权操作其他店铺的订单');
        }
        const ltPre = String(orderPre.lottery_type || 'NACIONAL').toUpperCase();
        if (ltPre === 'TICA' || ltPre === 'NICA') {
            return this.localLotteryService.updateMerchantOrderLines(orderNumber, shopId, numbers, tokenUserId);
        }
        const limitChance = shop.limit_chance;
        const limitBillete = shop.limit_billete;
        return (0, shop_order_lock_1.withShopLock)(shopId, async () => {
            const fresh = await orderRepo.findOne({ where: { order_number: orderNumber } });
            if (!fresh)
                throw new common_1.NotFoundException('订单不存在');
            if (fresh.shop_id !== shopId) {
                throw new common_1.BadRequestException('无权操作其他店铺的订单');
            }
            const lt2 = String(fresh.lottery_type || 'NACIONAL').toUpperCase();
            if (lt2 === 'TICA' || lt2 === 'NICA') {
                return this.localLotteryService.updateMerchantOrderLines(orderNumber, shopId, numbers, tokenUserId);
            }
            if (fresh.status !== 0 && fresh.status !== 1) {
                throw new common_1.BadRequestException('仅待付款或已付款（未开奖结算）的订单可修改');
            }
            if (fresh.draw_id != null && (limitChance != null || limitBillete != null)) {
                const dbType = this.dataSource.options.type;
                let soldRows = [];
                if (dbType === 'postgres') {
                    soldRows = await this.dataSource.query(`SELECT item->>'n' AS num, SUM((item->>'q')::int) AS qty
             FROM orders, jsonb_array_elements(numbers::jsonb) AS item
             WHERE draw_id = $1 AND shop_id = $2 AND status != -1 AND order_id <> $3
             GROUP BY item->>'n'`, [fresh.draw_id, fresh.shop_id, fresh.order_id]);
                }
                else {
                    soldRows = await this.dataSource.query(`SELECT json_extract(value, '$.n') AS num,
                    SUM(CAST(json_extract(value, '$.q') AS INTEGER)) AS qty
             FROM orders, json_each(numbers)
             WHERE draw_id = ? AND shop_id = ? AND status != -1 AND order_id != ?
             GROUP BY json_extract(value, '$.n')`, [fresh.draw_id, fresh.shop_id, fresh.order_id]);
                }
                const soldMap = Object.fromEntries(soldRows.map(r => [r.num, Number(r.qty)]));
                const overLimitItems = [];
                for (const item of numbers) {
                    const numStr = String(item.n).replace(/\D/g, '');
                    const isBillete = numStr.length >= 4;
                    const limit = isBillete ? limitBillete : limitChance;
                    if (limit == null)
                        continue;
                    const alreadySold = soldMap[item.n] || 0;
                    if (alreadySold + item.q > limit) {
                        overLimitItems.push({ n: item.n, alreadySold, limit });
                    }
                }
                if (overLimitItems.length > 0) {
                    throw new common_1.BadRequestException({ message: '部分号码超出限额', overLimitItems });
                }
            }
            const gameType = inferMerchantPatchGameType(numbers);
            await orderRepo.update(fresh.order_id, {
                numbers,
                amount,
                game_type: gameType,
                win_amount: 0,
                win_breakdown: null,
            });
            this.logger.log(`订单修改: #${fresh.order_number}, 店铺: ${shopId}, 新金额: $${amount}`);
            return {
                success: true,
                order_number: fresh.order_number,
                amount,
                numbers,
                game_type: gameType,
                lottery_type: 'NACIONAL',
            };
        });
    }
    async getOrder(orderNumber) {
        const order = await this.dataSource.getRepository(order_entity_1.Order).findOne({
            where: { order_number: orderNumber },
            relations: ['shop', 'draw'],
        });
        if (!order) {
            throw new common_1.NotFoundException('订单不存在');
        }
        const statusMap = {
            0: 'pending',
            1: 'paid',
            2: 'settled',
            3: 'won',
            [-1]: 'canceled',
        };
        return {
            order_id: order.order_id,
            order_number: order.order_number,
            order_hash: order.order_hash,
            amount: order.amount,
            numbers: order.numbers,
            game_type: order.game_type,
            lottery_type: order.lottery_type ?? 'NACIONAL',
            status: statusMap[order.status] || 'pending',
            verification_code: order.verification_code,
            shop_id: order.shop_id,
            shopId: order.shop_id,
            shopNumber: order.shop?.shop_number,
            win_amount: order.win_amount,
            win_breakdown: order.win_breakdown ?? null,
            redeemed_at: order.redeemed_at ?? null,
            note: order.note ?? null,
            draw_date: order.draw?.draw_date ?? null,
            created_at: order.created_at,
            paid_at: order.paid_at,
        };
    }
    async confirmOrder(orderNumber, body, req) {
        const authHeader = (req.headers?.['authorization'] || '');
        const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
        const tokenUserId = parseOrderToken(raw);
        if (!tokenUserId) {
            throw new common_2.UnauthorizedException('请先登录');
        }
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const order = await orderRepo.findOne({
            where: { order_number: orderNumber },
        });
        if (!order) {
            throw new common_1.NotFoundException('订单不存在');
        }
        if (order.status !== 0) {
            if (order.status === 1) {
                return { success: true, message: '订单已确认付款' };
            }
            throw new common_1.BadRequestException('订单状态不是待支付');
        }
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        const orderLt = String(order.lottery_type || 'NACIONAL').toUpperCase();
        const currentNational = await (0, draw_queries_1.findNationalPendingDraw)(drawRepo);
        const updatePayload = {
            status: 1,
            paid_at: new Date(),
        };
        if (body.note != null)
            updatePayload.note = String(body.note).slice(0, 200);
        if (order.draw_id == null &&
            currentNational?.draw_id != null &&
            (orderLt === 'NACIONAL' || orderLt === '')) {
            updatePayload.draw_id = currentNational.draw_id;
        }
        await orderRepo.update(order.order_id, updatePayload);
        this.logger.log(`订单确认: #${order.order_number}, 店铺: ${body.shopId}`);
        return {
            success: true,
            order_id: order.order_id,
            order_number: order.order_number,
            status: 'paid',
        };
    }
    async redeemOrder(orderNumber, body, req) {
        const authHeader = (req.headers?.['authorization'] || '');
        const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
        const tokenUserId = parseOrderToken(raw);
        if (!tokenUserId) {
            throw new common_2.UnauthorizedException('请先登录');
        }
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const order = await orderRepo.findOne({
            where: { order_number: orderNumber },
        });
        if (!order) {
            throw new common_1.NotFoundException('订单不存在');
        }
        if (order.shop_id !== body.shopId) {
            throw new common_1.BadRequestException('店号不匹配：该订单属于其他店铺，不能在本店兑奖');
        }
        if (order.status !== 3) {
            throw new common_1.BadRequestException(order.status === 1 ? '尚未开奖，无法兑奖' : '该订单未中奖或状态异常');
        }
        const redeemResult = await orderRepo
            .createQueryBuilder()
            .update(order_entity_1.Order)
            .set({ redeemed_at: new Date() })
            .where('order_id = :id AND redeemed_at IS NULL', { id: order.order_id })
            .execute();
        if (!redeemResult.affected || redeemResult.affected === 0) {
            throw new common_1.BadRequestException('该订单已兑奖，请勿重复操作');
        }
        this.logger.log(`兑奖完成: #${order.order_number}, 店铺: ${body.shopId}, 金额: $${order.win_amount}`);
        return {
            success: true,
            order_number: order.order_number,
            win_amount: Number(order.win_amount),
            message: '兑奖成功',
        };
    }
    generateOrderNumber() {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.floor(1000 + Math.random() * 9000);
        return `${timestamp}${random}`;
    }
    generateVerificationCode() {
        return Math.floor(10000 + Math.random() * 90000).toString();
    }
};
exports.OrderController = OrderController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_a = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "createOrder", null);
__decorate([
    (0, common_1.Delete)(':orderNumber'),
    __param(0, (0, common_1.Param)('orderNumber')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "deleteOrder", null);
__decorate([
    (0, common_1.Patch)(':orderNumber'),
    __param(0, (0, common_1.Param)('orderNumber')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "patchOrder", null);
__decorate([
    (0, common_1.Get)(':orderNumber'),
    __param(0, (0, common_1.Param)('orderNumber')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "getOrder", null);
__decorate([
    (0, common_1.Post)(':orderNumber/confirm'),
    __param(0, (0, common_1.Param)('orderNumber')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "confirmOrder", null);
__decorate([
    (0, common_1.Post)(':orderNumber/redeem'),
    __param(0, (0, common_1.Param)('orderNumber')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "redeemOrder", null);
exports.OrderController = OrderController = OrderController_1 = __decorate([
    (0, common_1.Controller)('orders'),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        local_lottery_service_1.LocalLotteryService])
], OrderController);
function inferMerchantPatchGameType(numbers) {
    let hasB = false;
    let hasC = false;
    for (const item of numbers) {
        const numLen = String(item.n).replace(/\D/g, '').length;
        if (numLen >= 4)
            hasB = true;
        else
            hasC = true;
    }
    if (hasB && hasC)
        return 'MIXTO';
    if (hasB)
        return 'BILLETE';
    return 'CHANCE';
}
let ShopController = ShopController_1 = class ShopController {
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(ShopController_1.name);
    }
    async listShopOrdersByQuery(shopId, limit = '100', status, suffix, drawId, lotteryKind) {
        const id = parseInt(String(shopId || '').trim(), 10);
        if (!shopId || isNaN(id) || id <= 0) {
            throw new common_1.BadRequestException('缺少或无效的 shopId');
        }
        return this.buildShopOrdersList(id, limit, status, suffix, drawId, lotteryKind);
    }
    async buildShopOrdersList(shopIdNum, limit, status, suffix, drawId, lotteryKind) {
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        let shop = await shopRepo.findOne({ where: { shop_id: shopIdNum } });
        if (!shop) {
            shop = await shopRepo.findOne({ where: { shop_number: String(shopIdNum) } });
        }
        if (!shop) {
            throw new common_1.NotFoundException('店铺不存在');
        }
        const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
        const query = orderRepo.createQueryBuilder('order')
            .where('order.shop_id = :shopId', { shopId: shop.shop_id })
            .orderBy('order.created_at', 'DESC')
            .take(limitNum);
        if (drawId && Number(drawId) > 0) {
            query.andWhere('order.draw_id = :drawId', { drawId: Number(drawId) });
        }
        const lk = (lotteryKind || '').toString().toUpperCase();
        if (lk === 'TICA' || lk === 'NICA') {
            query.andWhere('order.lottery_type = :lotteryTypeFilter', { lotteryTypeFilter: lk });
        }
        else if (lk === 'NACIONAL') {
            query.andWhere('(order.lottery_type = :nac OR order.lottery_type IS NULL)', { nac: 'NACIONAL' });
        }
        if (status) {
            const statusMap = {
                'pending': 0,
                'paid': 1,
                'settled': 2,
                'won': 3,
            };
            if (statusMap[status] !== undefined) {
                query.andWhere('order.status = :status', { status: statusMap[status] });
            }
        }
        if (suffix && suffix.trim()) {
            const safe = String(suffix.trim()).replace(/%/g, '\\%').replace(/_/g, '\\_');
            query.andWhere('order.order_number LIKE :suffixPattern', { suffixPattern: '%' + safe });
            query.andWhere('order.status = 3');
            query.andWhere('order.redeemed_at IS NULL');
        }
        const orders = await query.getMany();
        const statusMap = {
            0: 'pending',
            1: 'paid',
            2: 'settled',
            3: 'won',
            [-1]: 'canceled',
        };
        return {
            shop_id: shop.shop_id,
            shopId: shop.shop_id,
            shopNumber: shop.shop_number,
            shopName: shop.shop_name,
            orders: orders.map(order => ({
                order_id: order.order_id,
                shop_id: order.shop_id,
                order_number: order.order_number,
                order_hash: order.order_hash,
                numbers: order.numbers,
                amount: order.amount,
                game_type: order.game_type,
                lottery_type: order.lottery_type ?? 'NACIONAL',
                status: statusMap[order.status] || 'pending',
                draw_id: order.draw_id ?? null,
                win_amount: order.win_amount,
                win_breakdown: order.win_breakdown ?? null,
                redeemed_at: order.redeemed_at ?? null,
                note: order.note ?? null,
                verification_code: order.verification_code,
                created_at: order.created_at,
                paid_at: order.paid_at,
            })),
        };
    }
    async updateShopLimits(shopId, body, req) {
        const parsedShopId = parseInt(shopId, 10);
        if (isNaN(parsedShopId))
            throw new common_1.BadRequestException('shopId 无效');
        const authHeader = (req.headers?.['authorization'] || '');
        const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
        const tokenUserId = parseOrderToken(raw);
        if (!tokenUserId) {
            throw new common_2.UnauthorizedException('请先登录');
        }
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const shop = await shopRepo.findOne({ where: { shop_id: parsedShopId } });
        if (!shop)
            throw new common_1.NotFoundException('店铺不存在');
        if (shop.owner_id !== tokenUserId) {
            throw new common_2.UnauthorizedException('无权操作此店铺');
        }
        if (body.limitChance !== undefined)
            shop.limit_chance = body.limitChance || null;
        if (body.limitBillete !== undefined)
            shop.limit_billete = body.limitBillete || null;
        if (body.ticaLimitChance !== undefined)
            shop.tica_limit_chance = body.ticaLimitChance || null;
        if (body.ticaLimitPalet !== undefined)
            shop.tica_limit_palet = body.ticaLimitPalet || null;
        if (body.nicaLimitChance !== undefined)
            shop.nica_limit_chance = body.nicaLimitChance || null;
        if (body.nicaLimitPalet !== undefined)
            shop.nica_limit_palet = body.nicaLimitPalet || null;
        if (body.ticaCustomPeriod !== undefined)
            shop.tica_custom_period = body.ticaCustomPeriod || null;
        if (body.nicaCustomPeriod !== undefined)
            shop.nica_custom_period = body.nicaCustomPeriod || null;
        if (body.ticaEnabled !== undefined)
            shop.tica_enabled = !!body.ticaEnabled;
        if (body.nicaEnabled !== undefined)
            shop.nica_enabled = !!body.nicaEnabled;
        if (body.loteriaEnabled !== undefined)
            shop.loteria_enabled = !!body.loteriaEnabled;
        await shopRepo.save(shop);
        return {
            success: true,
            limit_chance: shop.limit_chance,
            limit_billete: shop.limit_billete,
            tica_limit_chance: shop.tica_limit_chance,
            tica_limit_palet: shop.tica_limit_palet,
            nica_limit_chance: shop.nica_limit_chance,
            nica_limit_palet: shop.nica_limit_palet,
            tica_custom_period: shop.tica_custom_period,
            nica_custom_period: shop.nica_custom_period,
            loteria_enabled: shop.loteria_enabled,
            tica_enabled: shop.tica_enabled,
            nica_enabled: shop.nica_enabled,
        };
    }
    async updateShopRates(shopId, body, req) {
        const parsedShopId = parseInt(shopId, 10);
        if (isNaN(parsedShopId))
            throw new common_1.BadRequestException('shopId 无效');
        const authHeader = (req.headers?.['authorization'] || '');
        const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
        const tokenUserId = parseOrderToken(raw);
        if (!tokenUserId) {
            throw new common_2.UnauthorizedException('请先登录');
        }
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const shop = await shopRepo.findOne({ where: { shop_id: parsedShopId } });
        if (!shop)
            throw new common_1.NotFoundException('店铺不存在');
        if (shop.owner_id !== tokenUserId) {
            throw new common_2.UnauthorizedException('无权操作此店铺');
        }
        const toRate = (v, def) => v != null && isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
        const toChainRate = (v) => v != null && isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null;
        if (body.rateBillete1 !== undefined)
            shop.rate_billete_1 = toRate(body.rateBillete1, 2000);
        if (body.rateBillete2 !== undefined)
            shop.rate_billete_2 = toRate(body.rateBillete2, 600);
        if (body.rateBillete3 !== undefined)
            shop.rate_billete_3 = toRate(body.rateBillete3, 300);
        if (body.rateChance1 !== undefined)
            shop.rate_chance_1 = toRate(body.rateChance1, 14);
        if (body.rateChance2 !== undefined)
            shop.rate_chance_2 = toRate(body.rateChance2, 3);
        if (body.rateChance3 !== undefined)
            shop.rate_chance_3 = toRate(body.rateChance3, 2);
        if (body.chain12 !== undefined)
            shop.chain_1_2 = toChainRate(body.chain12);
        if (body.chain13 !== undefined)
            shop.chain_1_3 = toChainRate(body.chain13);
        if (body.chain21 !== undefined)
            shop.chain_2_1 = toChainRate(body.chain21);
        if (body.chain23 !== undefined)
            shop.chain_2_3 = toChainRate(body.chain23);
        if (body.chain31 !== undefined)
            shop.chain_3_1 = toChainRate(body.chain31);
        if (body.chain32 !== undefined)
            shop.chain_3_2 = toChainRate(body.chain32);
        if (body.nicaChain12 !== undefined)
            shop.nica_chain_1_2 = toChainRate(body.nicaChain12);
        if (body.nicaChain13 !== undefined)
            shop.nica_chain_1_3 = toChainRate(body.nicaChain13);
        if (body.nicaChain21 !== undefined)
            shop.nica_chain_2_1 = toChainRate(body.nicaChain21);
        if (body.nicaChain23 !== undefined)
            shop.nica_chain_2_3 = toChainRate(body.nicaChain23);
        if (body.nicaChain31 !== undefined)
            shop.nica_chain_3_1 = toChainRate(body.nicaChain31);
        if (body.nicaChain32 !== undefined)
            shop.nica_chain_3_2 = toChainRate(body.nicaChain32);
        if (body.nicaChance1 !== undefined)
            shop.nica_chance_1 = toRate(body.nicaChance1, 14);
        if (body.nicaChance2 !== undefined)
            shop.nica_chance_2 = toRate(body.nicaChance2, 3);
        if (body.nicaChance3 !== undefined)
            shop.nica_chance_3 = toRate(body.nicaChance3, 2);
        await shopRepo.save(shop);
        return {
            success: true,
            rate_billete_1: shop.rate_billete_1,
            rate_billete_2: shop.rate_billete_2,
            rate_billete_3: shop.rate_billete_3,
            rate_chance_1: shop.rate_chance_1,
            rate_chance_2: shop.rate_chance_2,
            rate_chance_3: shop.rate_chance_3,
            chain_1_2: shop.chain_1_2,
            chain_1_3: shop.chain_1_3,
            chain_2_1: shop.chain_2_1,
            chain_2_3: shop.chain_2_3,
            chain_3_1: shop.chain_3_1,
            chain_3_2: shop.chain_3_2,
            nica_chain_1_2: shop.nica_chain_1_2,
            nica_chain_1_3: shop.nica_chain_1_3,
            nica_chain_2_1: shop.nica_chain_2_1,
            nica_chain_2_3: shop.nica_chain_2_3,
            nica_chain_3_1: shop.nica_chain_3_1,
            nica_chain_3_2: shop.nica_chain_3_2,
            nica_chance_1: shop.nica_chance_1,
            nica_chance_2: shop.nica_chance_2,
            nica_chance_3: shop.nica_chance_3,
        };
    }
    async getShopOrders(shopId, limit = '100', status, suffix, drawId, lotteryKind) {
        const id = parseInt(String(shopId || '').trim(), 10);
        if (isNaN(id) || id <= 0) {
            throw new common_1.BadRequestException('无效的 shopId');
        }
        return this.buildShopOrdersList(id, limit, status, suffix, drawId, lotteryKind);
    }
    async getShopByNumber(shopNumber) {
        const shop = await findShopByNumber(this.dataSource.getRepository(shop_entity_1.Shop), shopNumber);
        if (!shop) {
            throw new common_1.NotFoundException('店铺不存在');
        }
        return {
            shop: {
                shop_id: shop.shop_id,
                shop_number: shop.shop_number,
                shop_name: shop.shop_name,
                status: shop.status,
                commission_rate: shop.commission_rate,
                limit_chance: shop.limit_chance ?? null,
                limit_billete: shop.limit_billete ?? null,
                tica_limit_chance: shop.tica_limit_chance ?? null,
                tica_limit_palet: shop.tica_limit_palet ?? null,
                nica_limit_chance: shop.nica_limit_chance ?? null,
                nica_limit_palet: shop.nica_limit_palet ?? null,
                tica_custom_period: shop.tica_custom_period ?? null,
                nica_custom_period: shop.nica_custom_period ?? null,
                loteria_enabled: shop.loteria_enabled !== false,
                tica_enabled: !!shop.tica_enabled,
                nica_enabled: !!shop.nica_enabled,
                accepting_tica_orders: shop.accepting_tica_orders !== false,
                accepting_nica_orders: shop.accepting_nica_orders !== false,
            },
        };
    }
};
exports.ShopController = ShopController;
__decorate([
    (0, common_1.Get)('orders'),
    __param(0, (0, common_1.Query)('shopId')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('suffix')),
    __param(4, (0, common_1.Query)('drawId')),
    __param(5, (0, common_1.Query)('lotteryKind')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "listShopOrdersByQuery", null);
__decorate([
    (0, common_1.Patch)(':shopId/limits'),
    __param(0, (0, common_1.Param)('shopId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, typeof (_d = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "updateShopLimits", null);
__decorate([
    (0, common_1.Patch)(':shopId/rates'),
    __param(0, (0, common_1.Param)('shopId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, typeof (_e = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "updateShopRates", null);
__decorate([
    (0, common_1.Get)(':shopId/orders'),
    __param(0, (0, common_1.Param)('shopId')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('suffix')),
    __param(4, (0, common_1.Query)('drawId')),
    __param(5, (0, common_1.Query)('lotteryKind')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "getShopOrders", null);
__decorate([
    (0, common_1.Get)(':shopNumber'),
    __param(0, (0, common_1.Param)('shopNumber')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "getShopByNumber", null);
exports.ShopController = ShopController = ShopController_1 = __decorate([
    (0, common_1.Controller)('shop'),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], ShopController);
const PANAMA_TZ = 'America/Panama';
function getPanamaNow() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: PANAMA_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(now);
    const get = (type) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
    let h = get('hour');
    const min = get('minute');
    if (h === 24)
        h = 0;
    return { y: get('year'), m: get('month'), d: get('day'), h, min };
}
let BetStatusController = BetStatusController_1 = class BetStatusController {
    constructor(dataSource, drawDayService) {
        this.dataSource = dataSource;
        this.drawDayService = drawDayService;
        this.logger = new common_1.Logger(BetStatusController_1.name);
    }
    static formatDrawPeriodDate(draw) {
        const timeStr = String(draw.draw_time || '').trim();
        if (timeStr && timeStr.includes('T') && /^\d{4}-\d{2}-\d{2}/.test(timeStr)) {
            const iso = timeStr.substring(0, 10);
            const y = iso.slice(0, 4), m = iso.slice(5, 7), d = iso.slice(8, 10);
            return `${d}-${m}-${y}`;
        }
        const rawDate = draw.draw_date;
        if (rawDate) {
            const d = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(rawDate))
                ? new Date(String(rawDate).substring(0, 10) + 'T12:00:00Z')
                : new Date(rawDate);
            const dd = d.getUTCDate(), mm = d.getUTCMonth() + 1, yy = d.getUTCFullYear();
            return `${String(dd).padStart(2, '0')}-${String(mm).padStart(2, '0')}-${yy}`;
        }
        const fallback = new Date();
        return `${String(fallback.getDate()).padStart(2, '0')}-${String(fallback.getMonth() + 1).padStart(2, '0')}-${fallback.getFullYear()}`;
    }
    async getBetStatus(shopId) {
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        let draw = await (0, draw_queries_1.findNationalPendingDraw)(drawRepo);
        if (!draw) {
            draw = await drawRepo
                .createQueryBuilder('d')
                .where('d.status = :s', { s: 'completed' })
                .andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
                .andWhere('(d.shop_id IS NULL)')
                .orderBy('d.draw_id', 'DESC')
                .getOne();
        }
        let canBet = true;
        let minutesUntilDraw;
        let currentPeriodDate = null;
        let isDrawWindow = false;
        let confirmedDrawDay = null;
        let confirmedDrawTime = null;
        if (draw) {
            const timeStr = String(draw.draw_time || '15:00').trim();
            let dy;
            let dm;
            let dd;
            if (timeStr.includes('T') && /^\d{4}-\d{2}-\d{2}/.test(timeStr)) {
                const iso = timeStr.substring(0, 10);
                dy = parseInt(iso.slice(0, 4), 10);
                dm = parseInt(iso.slice(5, 7), 10);
                dd = parseInt(iso.slice(8, 10), 10);
            }
            else {
                const rawDate = draw.draw_date;
                if (rawDate) {
                    const d = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(rawDate))
                        ? new Date(String(rawDate).substring(0, 10) + 'T12:00:00Z')
                        : new Date(rawDate);
                    dy = d.getUTCFullYear();
                    dm = d.getUTCMonth() + 1;
                    dd = d.getUTCDate();
                }
                else {
                    const d = new Date();
                    dy = d.getFullYear();
                    dm = d.getMonth() + 1;
                    dd = d.getDate();
                }
            }
            currentPeriodDate = `${String(dd).padStart(2, '0')}-${String(dm).padStart(2, '0')}-${dy}`;
            let drawHour = 15;
            let drawMin = 0;
            if (timeStr.includes('T')) {
                const dt = new Date(timeStr);
                if (!isNaN(dt.getTime())) {
                    drawHour = dt.getHours();
                    drawMin = dt.getMinutes();
                }
            }
            else {
                const parts = timeStr.split(':').map(Number);
                if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    drawHour = parts[0];
                    drawMin = parts[1];
                }
            }
            const confirmedDrawMins = drawHour * 60 + drawMin;
            confirmedDrawDay = `${String(dd).padStart(2, '0')}-${String(dm).padStart(2, '0')}-${dy}`;
            confirmedDrawTime = `${String(drawHour).padStart(2, '0')}:${String(drawMin).padStart(2, '0')}`;
            const panama = getPanamaNow();
            const todayStr = `${String(panama.d).padStart(2, '0')}-${String(panama.m).padStart(2, '0')}-${panama.y}`;
            const totalMins = panama.h * 60 + panama.min;
            const drawDateISO = `${dy}-${String(dm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
            const todayISO = `${panama.y}-${String(panama.m).padStart(2, '0')}-${String(panama.d).padStart(2, '0')}`;
            const stopSaleStart = confirmedDrawMins;
            const RESUME_MINS = 7 * 60;
            const drawDateObj = new Date(`${drawDateISO}T12:00:00`);
            drawDateObj.setDate(drawDateObj.getDate() + 1);
            const dayAfterISO = `${drawDateObj.getFullYear()}-${String(drawDateObj.getMonth() + 1).padStart(2, '0')}-${String(drawDateObj.getDate()).padStart(2, '0')}`;
            const inStopWindow = (drawDateISO === todayISO && totalMins >= stopSaleStart) ||
                (dayAfterISO === todayISO && totalMins < RESUME_MINS);
            if (inStopWindow) {
                canBet = false;
                isDrawWindow = true;
                minutesUntilDraw = undefined;
            }
            else {
                canBet = true;
                isDrawWindow = false;
                minutesUntilDraw = (drawDateISO === todayISO && totalMins < stopSaleStart)
                    ? Math.max(0, stopSaleStart - totalMins)
                    : undefined;
            }
        }
        else {
            const lastCompleted = await (0, draw_queries_1.findNationalLastCompletedDraw)(drawRepo);
            if (lastCompleted) {
                currentPeriodDate = BetStatusController_1.formatDrawPeriodDate(lastCompleted);
            }
            canBet = false;
            isDrawWindow = true;
        }
        let stopSellAt;
        if (minutesUntilDraw !== undefined) {
            stopSellAt = Date.now() + minutesUntilDraw * 60 * 1000;
        }
        const base = {
            status: 'ok',
            canBet,
            minutesUntilDraw,
            stopSellAt,
            currentPeriodDate,
            isDrawWindow,
            confirmedDrawDay,
            confirmedDrawTime,
        };
        if (!shopId) {
            return base;
        }
        const sid = parseInt(shopId, 10);
        const shopRow = await this.dataSource.getRepository(shop_entity_1.Shop).findOne({ where: { shop_id: sid } });
        const localFlags = shopRow
            ? {
                loteriaEnabled: shopRow.loteria_enabled !== false,
                ticaEnabled: !!shopRow.tica_enabled,
                nicaEnabled: !!shopRow.nica_enabled,
                acceptingTicaOrders: shopRow.accepting_tica_orders !== false,
                acceptingNicaOrders: shopRow.accepting_nica_orders !== false,
            }
            : {
                loteriaEnabled: true,
                ticaEnabled: false,
                nicaEnabled: false,
                acceptingTicaOrders: false,
                acceptingNicaOrders: false,
            };
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const orders = await this.dataSource.getRepository(order_entity_1.Order)
            .createQueryBuilder('order')
            .where('order.shop_id = :shopId', { shopId: sid })
            .andWhere('order.created_at >= :yesterday', { yesterday })
            .orderBy('order.created_at', 'DESC')
            .take(50)
            .getMany();
        return {
            ...base,
            ...localFlags,
            shop_id: sid,
            shopId: sid,
            orderCount: orders.length,
            orders: orders.map((o) => ({
                order_id: o.order_id,
                order_number: o.order_number,
                status: o.status,
                amount: o.amount,
            })),
        };
    }
};
exports.BetStatusController = BetStatusController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('shopId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BetStatusController.prototype, "getBetStatus", null);
exports.BetStatusController = BetStatusController = BetStatusController_1 = __decorate([
    (0, common_1.Controller)('bet-status'),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        draw_day_service_1.DrawDayService])
], BetStatusController);
//# sourceMappingURL=order.controller.js.map