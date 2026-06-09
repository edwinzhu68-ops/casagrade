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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminTokenGuard = void 0;
const common_1 = require("@nestjs/common");
const crypto = __importStar(require("crypto"));
const typeorm_1 = require("typeorm");
const user_entity_1 = require("../entities/user.entity");
const ADMIN_PUBLIC_PATHS = new Set([
    '/api/admin/health',
]);
const TOKEN_SECRET = () => process.env.TOKEN_SECRET || 'lottery-token-secret-change-in-prod';
function parseUserIdFromBearer(auth) {
    const raw = auth.replace(/^\s*bearer\s+/i, '').trim();
    if (!raw)
        return null;
    const lastDot = raw.lastIndexOf('.');
    if (lastDot <= 0)
        return null;
    const payload = raw.slice(0, lastDot);
    const sig = raw.slice(lastDot + 1);
    const expected = crypto.createHmac('sha256', TOKEN_SECRET()).update(payload).digest('hex').slice(0, 32);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
        return null;
    try {
        const decoded = Buffer.from(payload, 'base64').toString('utf8');
        const colonIdx = decoded.indexOf(':');
        const userId = colonIdx > 0 ? parseInt(decoded.slice(0, colonIdx), 10) : NaN;
        return isNaN(userId) ? null : userId;
    }
    catch {
        return null;
    }
}
let AdminTokenGuard = class AdminTokenGuard {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        if (req.path && ADMIN_PUBLIC_PATHS.has(req.path))
            return true;
        const authHeader = (req.headers?.['authorization'] || '');
        const userId = parseUserIdFromBearer(authHeader);
        if (userId) {
            const user = await this.dataSource.getRepository(user_entity_1.User).findOne({ where: { user_id: userId } });
            if (user && user.role === 'admin')
                return true;
        }
        throw new common_1.UnauthorizedException('需要管理员账号登录');
    }
};
exports.AdminTokenGuard = AdminTokenGuard;
exports.AdminTokenGuard = AdminTokenGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], AdminTokenGuard);
//# sourceMappingURL=admin-token.guard.js.map