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
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const typeorm_1 = require("typeorm");
let User = class User {
};
exports.User = User;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], User.prototype, "user_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true, length: 10 }),
    __metadata("design:type", String)
], User.prototype, "account_number", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 20, nullable: true }),
    __metadata("design:type", String)
], User.prototype, "phone", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 255, nullable: true }),
    __metadata("design:type", String)
], User.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 255 }),
    __metadata("design:type", String)
], User.prototype, "password_hash", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 20, default: 'merchant' }),
    __metadata("design:type", String)
], User.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, nullable: true, default: null }),
    __metadata("design:type", String)
], User.prototype, "session_token", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, nullable: true, default: null }),
    __metadata("design:type", String)
], User.prototype, "device_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true, default: null }),
    __metadata("design:type", Date)
], User.prototype, "last_login_at", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true, default: null }),
    __metadata("design:type", String)
], User.prototype, "last_login_ua", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], User.prototype, "created_at", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], User.prototype, "updated_at", void 0);
exports.User = User = __decorate([
    (0, typeorm_1.Entity)('users'),
    (0, typeorm_1.Index)(['email'])
], User);
//# sourceMappingURL=user.entity.js.map