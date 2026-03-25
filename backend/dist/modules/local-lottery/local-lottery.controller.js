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
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalLotteryController = void 0;
const common_1 = require("@nestjs/common");
const express_1 = require("express");
const crypto = __importStar(require("crypto"));
const api_bilingual_1 = require("../../utils/api-bilingual");
const local_lottery_service_1 = require("./local-lottery.service");
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
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
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
function requireUserId(req) {
    const authHeader = (req.headers?.['authorization'] || '');
    const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
    const uid = parseOrderToken(raw);
    if (!uid) {
        throw (0, api_bilingual_1.unauthorizedBilingual)('Inicie sesión para continuar.', '请先登录');
    }
    return uid;
}
let LocalLotteryController = class LocalLotteryController {
    constructor(localLotteryService) {
        this.localLotteryService = localLotteryService;
    }
    async current(shopId, kind) {
        const sid = parseInt(String(shopId || ''), 10);
        if (!sid || isNaN(sid)) {
            throw (0, api_bilingual_1.badBilingual)('Falta shopId.', '缺少 shopId');
        }
        const k = String(kind || '').toUpperCase();
        if (k !== 'TICA' && k !== 'NICA') {
            throw (0, api_bilingual_1.badBilingual)('kind debe ser TICA o NICA.', 'kind 须为 TICA 或 NICA');
        }
        return this.localLotteryService.getCurrent(sid, k);
    }
    async create(dto, req) {
        return this.localLotteryService.createOrder(dto, req);
    }
    async settle(body, req) {
        const shopId = Number(body?.shopId);
        if (!shopId || isNaN(shopId)) {
            throw (0, api_bilingual_1.badBilingual)('Falta shopId.', '缺少 shopId');
        }
        const uid = requireUserId(req);
        await this.localLotteryService.assertShopOwner(shopId, uid);
        const k = String(body.kind || '').toUpperCase();
        if (k !== 'TICA' && k !== 'NICA') {
            throw (0, api_bilingual_1.badBilingual)('kind debe ser TICA o NICA.', 'kind 须为 TICA 或 NICA');
        }
        return this.localLotteryService.settleAndRollNext(shopId, k, body.n1, body.n2, body.n3);
    }
    async accepting(shopId, body, req) {
        const sid = parseInt(String(shopId || ''), 10);
        if (!sid || isNaN(sid)) {
            throw (0, api_bilingual_1.badBilingual)('Falta shopId.', '缺少 shopId');
        }
        const uid = requireUserId(req);
        return this.localLotteryService.patchAccepting(sid, body, uid);
    }
    async shopSettings(shopId, body, req) {
        const sid = parseInt(String(shopId || ''), 10);
        if (!sid || isNaN(sid)) {
            throw (0, api_bilingual_1.badBilingual)('Falta shopId.', '缺少 shopId');
        }
        const uid = requireUserId(req);
        return this.localLotteryService.patchShopSettings(sid, body, uid);
    }
};
exports.LocalLotteryController = LocalLotteryController;
__decorate([
    (0, common_1.Get)('current'),
    __param(0, (0, common_1.Query)('shopId')),
    __param(1, (0, common_1.Query)('kind')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], LocalLotteryController.prototype, "current", null);
__decorate([
    (0, common_1.Post)('orders'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_a = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], LocalLotteryController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('settle'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], LocalLotteryController.prototype, "settle", null);
__decorate([
    (0, common_1.Patch)('accepting'),
    __param(0, (0, common_1.Query)('shopId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], LocalLotteryController.prototype, "accepting", null);
__decorate([
    (0, common_1.Patch)('shop-settings'),
    __param(0, (0, common_1.Query)('shopId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, typeof (_d = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], LocalLotteryController.prototype, "shopSettings", null);
exports.LocalLotteryController = LocalLotteryController = __decorate([
    (0, common_1.Controller)('local-lottery'),
    __metadata("design:paramtypes", [local_lottery_service_1.LocalLotteryService])
], LocalLotteryController);
//# sourceMappingURL=local-lottery.controller.js.map