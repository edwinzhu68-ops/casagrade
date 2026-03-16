"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminTokenGuard = void 0;
const common_1 = require("@nestjs/common");
let AdminTokenGuard = class AdminTokenGuard {
    canActivate(context) {
        const adminToken = process.env.ADMIN_TOKEN;
        if (!adminToken || adminToken === '') {
            return true;
        }
        const req = context.switchToHttp().getRequest();
        if (req.path && (req.path.includes('admin/health') || req.path.includes('admin/clear-settlement'))) {
            return true;
        }
        const token = req.headers['x-admin-token'];
        if (token !== adminToken) {
            throw new common_1.UnauthorizedException('需要管理员密钥');
        }
        return true;
    }
};
exports.AdminTokenGuard = AdminTokenGuard;
exports.AdminTokenGuard = AdminTokenGuard = __decorate([
    (0, common_1.Injectable)()
], AdminTokenGuard);
//# sourceMappingURL=admin-token.guard.js.map