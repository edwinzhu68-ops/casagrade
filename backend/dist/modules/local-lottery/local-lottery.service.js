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
var LocalLotteryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalLotteryService = void 0;
const common_1 = require("@nestjs/common");
const api_bilingual_1 = require("../../utils/api-bilingual");
const typeorm_1 = require("typeorm");
const crypto = __importStar(require("crypto"));
const order_entity_1 = require("../../entities/order.entity");
const shop_entity_1 = require("../../entities/shop.entity");
const draw_entity_1 = require("../../entities/draw.entity");
const draw_queries_1 = require("../../utils/draw-queries");
const draw_period_no_1 = require("../../utils/draw-period-no");
const shop_order_lock_1 = require("../../utils/shop-order-lock");
const settlement_service_1 = require("../settlement/settlement.service");
let LocalLotteryService = LocalLotteryService_1 = class LocalLotteryService {
    constructor(dataSource, settlementService) {
        this.dataSource = dataSource;
        this.settlementService = settlementService;
        this.logger = new common_1.Logger(LocalLotteryService_1.name);
    }
    assertLocalFeatureForKind(shop, kind) {
        if (!shop)
            throw (0, api_bilingual_1.notFoundBilingual)('Tienda no encontrada.', '店铺不存在');
        if (kind === 'TICA' && !shop.tica_enabled) {
            throw (0, api_bilingual_1.badBilingual)('TICA no está habilitado en esta tienda.', 'TICA 未开通');
        }
        if (kind === 'NICA' && !shop.nica_enabled) {
            throw (0, api_bilingual_1.badBilingual)('NICA no está habilitado en esta tienda.', 'NICA 未开通');
        }
    }
    async ensureShopPendingDraw(shopId, kind, skipFeatureCheck = false) {
        if (!skipFeatureCheck) {
            const shop = await this.dataSource.getRepository(shop_entity_1.Shop).findOne({ where: { shop_id: shopId } });
            this.assertLocalFeatureForKind(shop, kind);
        }
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        const existing = await (0, draw_queries_1.findShopPendingLocalDraw)(drawRepo, shopId, kind);
        if (existing)
            return existing;
        return (0, shop_order_lock_1.withShopLock)(shopId, async () => {
            const again = await (0, draw_queries_1.findShopPendingLocalDraw)(drawRepo, shopId, kind);
            if (again)
                return again;
            const panama = getPanamaYmd();
            const drawDateStr = `${panama.y}-${String(panama.m).padStart(2, '0')}-${String(panama.d).padStart(2, '0')}`;
            const periodNo = await (0, draw_period_no_1.getNextPeriodNoForScope)(drawRepo, { shopId, lotteryType: kind });
            const d = drawRepo.create({
                draw_date: drawDateStr,
                draw_time: '12:00:00',
                status: 'pending',
                winning_numbers: '',
                is_manual_override: false,
                lottery_type: kind,
                shop_id: shopId,
                period_no: periodNo,
            });
            await drawRepo.save(d);
            this.logger.log(`创建 ${kind} 新期 draw_id=${d.draw_id} period_no=${periodNo} shop_id=${shopId}`);
            return d;
        });
    }
    async getCurrent(shopId, kind) {
        const draw = await this.ensureShopPendingDraw(shopId, kind);
        const shop = await this.dataSource.getRepository(shop_entity_1.Shop).findOne({ where: { shop_id: shopId } });
        const customPeriod = kind === 'TICA'
            ? shop?.tica_custom_period ?? null
            : shop?.nica_custom_period ?? null;
        let previousDrawId = null;
        if (draw.period_no != null) {
            const prevRow = await this.dataSource.getRepository(draw_entity_1.Draw)
                .createQueryBuilder('d')
                .select('d.draw_id', 'draw_id')
                .where('d.shop_id = :sid', { sid: shopId })
                .andWhere('d.lottery_type = :lt', { lt: kind })
                .andWhere('d.period_no < :pn', { pn: Number(draw.period_no) })
                .andWhere('d.status = :st', { st: 'completed' })
                .orderBy('d.period_no', 'DESC')
                .limit(1)
                .getRawOne();
            previousDrawId = prevRow?.draw_id != null ? Number(prevRow.draw_id) : null;
        }
        return {
            draw_id: draw.draw_id,
            period_no: draw.period_no,
            previousDrawId,
            custom_period: customPeriod,
            shop_id: shopId,
            lottery_type: kind,
            status: draw.status,
            draw_date: draw.draw_date,
            draw_time: draw.draw_time,
        };
    }
    async createOrder(dto, req) {
        const shopId = dto.shopId ?? dto.shop_id;
        const kind = dto.lotteryKind;
        if (kind !== 'TICA' && kind !== 'NICA') {
            throw (0, api_bilingual_1.badBilingual)('lotteryKind debe ser TICA o NICA.', 'lotteryKind 须为 TICA 或 NICA');
        }
        const numbers = dto.numbers;
        const amount = Number(dto.amount);
        const gameTypeValue = dto.gameType || dto.game_type;
        const clientId = dto.clientId;
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.ip ||
            (req.socket && req.socket.remoteAddress) ||
            dto.ipAddress ||
            '127.0.0.1';
        if (shopId == null || Number.isNaN(Number(shopId))) {
            throw (0, api_bilingual_1.badBilingual)('Falta el ID de la tienda.', '缺少店铺ID');
        }
        if (!Array.isArray(numbers) || numbers.length === 0 || numbers.length > 500) {
            throw (0, api_bilingual_1.badBilingual)('Lista de números no válida o supera las 500 líneas.', '号码列表无效或超过500条');
        }
        if (Number.isNaN(amount) || amount <= 0 || amount > 100000) {
            throw (0, api_bilingual_1.badBilingual)('Monto no válido.', '金额无效');
        }
        for (const item of numbers) {
            if (typeof item.n !== 'string' || item.n.length > 10 || typeof item.q !== 'number' || item.q < 1 || item.q > 999) {
                throw (0, api_bilingual_1.badBilingual)('Formato de número o cantidad no válido.', '号码或数量格式无效');
            }
        }
        const BILLETE_PRICE = 1.0;
        const CHANCE_PRICE = 0.25;
        let expectedAmount = 0;
        for (const item of numbers) {
            const numLen = String(item.n).replace(/\D/g, '').length;
            const price = numLen >= 4 ? BILLETE_PRICE : CHANCE_PRICE;
            expectedAmount += price * Number(item.q);
        }
        expectedAmount = Math.round(expectedAmount * 100) / 100;
        if (Math.abs(expectedAmount - amount) > 0.01) {
            throw (0, api_bilingual_1.badBilingual)(`El monto no coincide: se esperaba $${expectedAmount}, se recibió $${amount}.`, `金额不符：期望 $${expectedAmount}，实际 $${amount}`);
        }
        const idempotencyKey = (dto.idempotency_key || '').trim().substring(0, 64) || null;
        if (idempotencyKey) {
            const orderRepo0 = this.dataSource.getRepository(order_entity_1.Order);
            const existing = await orderRepo0
                .createQueryBuilder('o')
                .where('o.idempotency_key = :k', { k: idempotencyKey })
                .andWhere('o.shop_id = :s', { s: Number(shopId) })
                .andWhere('o.lottery_type = :lt', { lt: kind })
                .andWhere('o.status != :canceled', { canceled: -1 })
                .getOne();
            if (existing) {
                this.logger.log(`${kind} 幂等重复请求，返回已有订单 #${existing.order_number}`);
                return {
                    order_id: existing.order_id,
                    order_number: existing.order_number,
                    order_hash: existing.order_hash,
                    verification_code: existing.verification_code,
                    amount: existing.amount,
                    status: existing.status,
                    created_at: existing.created_at,
                    lottery_type: kind,
                    _idempotent: true,
                };
            }
        }
        const shop = await this.dataSource.getRepository(shop_entity_1.Shop).findOne({
            where: { shop_id: Number(shopId) },
        });
        if (!shop)
            throw (0, api_bilingual_1.notFoundBilingual)('Tienda no encontrada.', '店铺不存在');
        if (shop.status !== 'active') {
            throw (0, api_bilingual_1.badBilingual)('La tienda no está activa.', '店铺已停业');
        }
        const expiresAt = shop.subscription_expires_at;
        if (!expiresAt || new Date(expiresAt) < new Date()) {
            throw (0, api_bilingual_1.badBilingual)('Su suscripción ha vencido o no está activa. Contacte al administrador para renovar.', '订阅已过期或未充值，请联系管理员。');
        }
        this.assertLocalFeatureForKind(shop, kind);
        if (kind === 'TICA' && shop.accepting_tica_orders === false) {
            throw (0, api_bilingual_1.badBilingual)('TICA: la tienda no acepta pedidos en este momento.', 'TICA 接单已关闭');
        }
        if (kind === 'NICA' && shop.accepting_nica_orders === false) {
            throw (0, api_bilingual_1.badBilingual)('NICA: la tienda no acepta pedidos en este momento.', 'NICA 接单已关闭');
        }
        const currentDraw = await this.ensureShopPendingDraw(Number(shopId), kind, true);
        const limitChance = (kind === 'TICA'
            ? (shop.tica_limit_chance ?? shop.limit_chance)
            : kind === 'NICA'
                ? (shop.nica_limit_chance ?? shop.limit_chance)
                : shop.limit_chance);
        const limitBillete = (kind === 'TICA'
            ? (shop.tica_limit_palet ?? shop.limit_billete)
            : kind === 'NICA'
                ? (shop.nica_limit_palet ?? shop.limit_billete)
                : shop.limit_billete);
        return (0, shop_order_lock_1.withShopLock)(Number(shopId), async () => {
            if (limitChance != null || limitBillete != null) {
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
                const soldMap = Object.fromEntries(soldRows.map((r) => [r.num, Number(r.qty)]));
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
                    throw new common_1.BadRequestException({
                        message: 'Algunos números superan el límite de ventas.',
                        messageZh: '部分号码超出限额',
                        overLimitItems,
                    });
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
                lottery_type: kind,
                status: 0,
                verification_code: verificationCode,
                customer_info: { clientId },
                ip_address: ipAddress,
                draw_id: currentDraw.draw_id,
            };
            if (idempotencyKey)
                orderData.idempotency_key = idempotencyKey;
            const order = orderRepo.create(orderData);
            await orderRepo.save(order);
            this.logger.log(`${kind} 订单创建: #${orderNumber}, 店铺: ${shopId}, 金额: $${amount}`);
            return {
                order_id: order.order_id,
                order_number: order.order_number,
                order_hash: order.order_hash,
                verification_code: order.verification_code,
                amount: order.amount,
                status: 0,
                created_at: order.created_at,
                lottery_type: kind,
                draw_id: currentDraw.draw_id,
            };
        });
    }
    async settleAndRollNext(shopId, kind, n1, n2, n3) {
        const norm = (v) => String(v ?? '').replace(/\D/g, '').slice(-2).padStart(2, '0');
        const a = norm(n1);
        const b = norm(n2);
        const c = norm(n3);
        if (!/^\d{2}$/.test(a) || !/^\d{2}$/.test(b) || !/^\d{2}$/.test(c)) {
            throw (0, api_bilingual_1.badBilingual)('n1, n2 y n3 deben ser dos dígitos válidos.', 'n1、n2、n3 须为两位有效数字');
        }
        return (0, shop_order_lock_1.withShopLock)(shopId, async () => {
            const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
            const pending = await (0, draw_queries_1.findShopPendingLocalDraw)(drawRepo, shopId, kind);
            if (!pending) {
                throw (0, api_bilingual_1.badBilingual)('No hay sorteo TICA/NICA pendiente.', '没有待开奖的 TICA/NICA 期次');
            }
            const winningJson = JSON.stringify({ n1: a, n2: b, n3: c });
            await drawRepo.update(pending.draw_id, { winning_numbers: winningJson });
            const stats = await this.settlementService.settleShopLotteryDraw(pending.draw_id);
            const next = await this.ensureShopPendingDraw(shopId, kind, true);
            return {
                settled_draw_id: pending.draw_id,
                next_draw_id: next.draw_id,
                winning_numbers: { n1: a, n2: b, n3: c },
                ...stats,
            };
        });
    }
    async assertShopOwner(shopId, operatorUserId) {
        const shop = await this.dataSource.getRepository(shop_entity_1.Shop).findOne({ where: { shop_id: shopId } });
        if (!shop)
            throw (0, api_bilingual_1.notFoundBilingual)('Tienda no encontrada.', '店铺不存在');
        if (shop.owner_id !== operatorUserId) {
            throw (0, api_bilingual_1.unauthorizedBilingual)('No tiene permiso para operar esta tienda.', '无权操作该店铺');
        }
        return shop;
    }
    async patchAccepting(shopId, body, operatorUserId) {
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const shop = await this.assertShopOwner(shopId, operatorUserId);
        if (body.acceptingTicaOrders !== undefined) {
            shop.accepting_tica_orders = !!body.acceptingTicaOrders;
        }
        if (body.acceptingNicaOrders !== undefined) {
            shop.accepting_nica_orders = !!body.acceptingNicaOrders;
        }
        await shopRepo.save(shop);
        return {
            success: true,
            accepting_tica_orders: shop.accepting_tica_orders,
            accepting_nica_orders: shop.accepting_nica_orders,
        };
    }
    async updateMerchantOrderLines(orderNumber, shopId, numbers, operatorUserId) {
        await this.assertShopOwner(shopId, operatorUserId);
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const shopRow = await shopRepo.findOne({ where: { shop_id: shopId } });
        if (!shopRow)
            throw (0, api_bilingual_1.notFoundBilingual)('Tienda no encontrada.', '店铺不存在');
        if (!Array.isArray(numbers) || numbers.length === 0 || numbers.length > 500) {
            throw (0, api_bilingual_1.badBilingual)('Lista de números no válida o supera las 500 líneas.', '号码列表无效或超过500条');
        }
        for (const item of numbers) {
            if (typeof item.n !== 'string' || item.n.length > 10 || typeof item.q !== 'number' || item.q < 1 || item.q > 999) {
                throw (0, api_bilingual_1.badBilingual)('Formato de número o cantidad no válido.', '号码或数量格式无效');
            }
        }
        const amount = this.computeExpectedAmountFromLines(numbers);
        if (Number.isNaN(amount) || amount <= 0 || amount > 100000) {
            throw (0, api_bilingual_1.badBilingual)('Monto no válido.', '金额无效');
        }
        return (0, shop_order_lock_1.withShopLock)(shopId, async () => {
            const order = await orderRepo.findOne({ where: { order_number: orderNumber } });
            if (!order)
                throw (0, api_bilingual_1.notFoundBilingual)('Pedido no encontrado.', '订单不存在');
            if (order.shop_id !== shopId) {
                throw (0, api_bilingual_1.badBilingual)('No permitido.', '无权操作其他店铺的订单');
            }
            const kind = String(order.lottery_type || '').toUpperCase();
            if (kind !== 'TICA' && kind !== 'NICA') {
                throw (0, api_bilingual_1.badBilingual)('Tipo de pedido incorrecto.', '订单类型不支持此修改');
            }
            if (order.status !== 0 && order.status !== 1) {
                throw (0, api_bilingual_1.badBilingual)('Solo se pueden editar pedidos pendientes o pagados sin sorteo.', '仅待付款或已付款（未开奖结算）的订单可修改号码');
            }
            this.assertLocalFeatureForKind(shopRow, kind);
            if (order.draw_id == null) {
                throw (0, api_bilingual_1.badBilingual)('Pedido sin sorteo asignado.', '订单缺少期次，无法修改');
            }
            const limitChance = (kind === 'TICA'
                ? (shopRow.tica_limit_chance ?? shopRow.limit_chance)
                : kind === 'NICA'
                    ? (shopRow.nica_limit_chance ?? shopRow.limit_chance)
                    : shopRow.limit_chance);
            const limitBillete = (kind === 'TICA'
                ? (shopRow.tica_limit_palet ?? shopRow.limit_billete)
                : kind === 'NICA'
                    ? (shopRow.nica_limit_palet ?? shopRow.limit_billete)
                    : shopRow.limit_billete);
            if (limitChance != null || limitBillete != null) {
                const dbType = this.dataSource.options.type;
                let soldRows = [];
                if (dbType === 'postgres') {
                    soldRows = await this.dataSource.query(`SELECT item->>'n' AS num, SUM((item->>'q')::int) AS qty
             FROM orders, jsonb_array_elements(numbers::jsonb) AS item
             WHERE draw_id = $1 AND shop_id = $2 AND status != -1 AND order_id <> $3
             GROUP BY item->>'n'`, [order.draw_id, order.shop_id, order.order_id]);
                }
                else {
                    soldRows = await this.dataSource.query(`SELECT json_extract(value, '$.n') AS num,
                    SUM(CAST(json_extract(value, '$.q') AS INTEGER)) AS qty
             FROM orders, json_each(numbers)
             WHERE draw_id = ? AND shop_id = ? AND status != -1 AND order_id != ?
             GROUP BY json_extract(value, '$.n')`, [order.draw_id, order.shop_id, order.order_id]);
                }
                const soldMap = Object.fromEntries(soldRows.map((r) => [r.num, Number(r.qty)]));
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
                    throw new common_1.BadRequestException({
                        message: 'Algunos números superan el límite de ventas.',
                        messageZh: '部分号码超出限额',
                        overLimitItems,
                    });
                }
            }
            const gameType = inferLocalGameTypeFromNumbers(numbers);
            await orderRepo.update(order.order_id, {
                numbers,
                amount,
                game_type: gameType,
                win_amount: 0,
                win_breakdown: null,
                updated_at: new Date(),
            });
            this.logger.log(`${kind} 订单修改: #${order.order_number}, 店铺: ${shopId}, 新金额: $${amount}`);
            return {
                success: true,
                order_number: order.order_number,
                amount,
                numbers,
                game_type: gameType,
                lottery_type: kind,
            };
        });
    }
    computeExpectedAmountFromLines(numbers) {
        const BILLETE_PRICE = 1.0;
        const CHANCE_PRICE = 0.25;
        let expectedAmount = 0;
        for (const item of numbers) {
            const numLen = String(item.n).replace(/\D/g, '').length;
            const price = numLen >= 4 ? BILLETE_PRICE : CHANCE_PRICE;
            expectedAmount += price * Number(item.q);
        }
        return Math.round(expectedAmount * 100) / 100;
    }
    async patchShopSettings(shopId, body, operatorUserId) {
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const shop = await this.assertShopOwner(shopId, operatorUserId);
        if (body.ticaEnabled !== undefined)
            shop.tica_enabled = !!body.ticaEnabled;
        if (body.nicaEnabled !== undefined)
            shop.nica_enabled = !!body.nicaEnabled;
        if (body.acceptingTicaOrders !== undefined) {
            shop.accepting_tica_orders = !!body.acceptingTicaOrders;
        }
        if (body.acceptingNicaOrders !== undefined) {
            shop.accepting_nica_orders = !!body.acceptingNicaOrders;
        }
        await shopRepo.save(shop);
        return {
            success: true,
            tica_enabled: shop.tica_enabled,
            nica_enabled: shop.nica_enabled,
            accepting_tica_orders: shop.accepting_tica_orders,
            accepting_nica_orders: shop.accepting_nica_orders,
        };
    }
    generateOrderNumber() {
        const ts = Date.now().toString();
        const rand = Math.floor(Math.random() * 10000)
            .toString()
            .padStart(4, '0');
        return `ORD${ts.slice(-8)}${rand}`;
    }
    generateVerificationCode() {
        return Math.floor(10000 + Math.random() * 90000).toString();
    }
};
exports.LocalLotteryService = LocalLotteryService;
exports.LocalLotteryService = LocalLotteryService = LocalLotteryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        settlement_service_1.SettlementService])
], LocalLotteryService);
const PANAMA_TZ = 'America/Panama';
function inferLocalGameTypeFromNumbers(numbers) {
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
function getPanamaYmd() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: PANAMA_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now);
    const get = (type) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
    return { y: get('year'), m: get('month'), d: get('day') };
}
//# sourceMappingURL=local-lottery.service.js.map