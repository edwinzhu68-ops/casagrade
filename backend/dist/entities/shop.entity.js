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
exports.Shop = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
let Shop = class Shop {
};
exports.Shop = Shop;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Shop.prototype, "shop_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true, length: 10 }),
    __metadata("design:type", String)
], Shop.prototype, "shop_number", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "owner_id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'owner_id' }),
    __metadata("design:type", user_entity_1.User)
], Shop.prototype, "owner", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 100, nullable: true }),
    __metadata("design:type", String)
], Shop.prototype, "shop_name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 5, scale: 2, default: 0.10 }),
    __metadata("design:type", Number)
], Shop.prototype, "commission_rate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'simple-json', nullable: true }),
    __metadata("design:type", Array)
], Shop.prototype, "shop_aliases", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'simple-json', nullable: true }),
    __metadata("design:type", Object)
], Shop.prototype, "shop_alias_timestamps", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 20, default: 'active' }),
    __metadata("design:type", String)
], Shop.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "single_bet_limit", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "daily_bet_limit", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "limit_chance", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "limit_billete", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "tica_limit_chance", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "tica_limit_palet", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "nica_limit_chance", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "nica_limit_palet", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, nullable: true }),
    __metadata("design:type", String)
], Shop.prototype, "tica_custom_period", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, nullable: true }),
    __metadata("design:type", String)
], Shop.prototype, "nica_custom_period", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], Shop.prototype, "loteria_enabled", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], Shop.prototype, "tica_enabled", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], Shop.prototype, "nica_enabled", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], Shop.prototype, "accepting_tica_orders", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], Shop.prototype, "accepting_nica_orders", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "rate_billete_1", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "rate_billete_2", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "rate_billete_3", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "rate_chance_1", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "rate_chance_2", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "rate_chance_3", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'chain_1_2', type: 'decimal', precision: 10, scale: 2, default: 1000 }),
    __metadata("design:type", Number)
], Shop.prototype, "chain_1_2", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'chain_1_3', type: 'decimal', precision: 10, scale: 2, default: 1000 }),
    __metadata("design:type", Number)
], Shop.prototype, "chain_1_3", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'chain_2_1', type: 'decimal', precision: 10, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Shop.prototype, "chain_2_1", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'chain_2_3', type: 'decimal', precision: 10, scale: 2, default: 200 }),
    __metadata("design:type", Number)
], Shop.prototype, "chain_2_3", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'chain_3_1', type: 'decimal', precision: 10, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Shop.prototype, "chain_3_1", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'chain_3_2', type: 'decimal', precision: 10, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Shop.prototype, "chain_3_2", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'nica_chain_1_2', type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "nica_chain_1_2", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'nica_chain_1_3', type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "nica_chain_1_3", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'nica_chain_2_1', type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "nica_chain_2_1", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'nica_chain_2_3', type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "nica_chain_2_3", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'nica_chain_3_1', type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "nica_chain_3_1", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'nica_chain_3_2', type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "nica_chain_3_2", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'nica_chance_1', type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "nica_chance_1", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'nica_chance_2', type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "nica_chance_2", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'nica_chance_3', type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Shop.prototype, "nica_chance_3", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], Shop.prototype, "subscription_expires_at", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Shop.prototype, "created_at", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Shop.prototype, "updated_at", void 0);
exports.Shop = Shop = __decorate([
    (0, typeorm_1.Entity)('shops'),
    (0, typeorm_1.Index)(['owner_id']),
    (0, typeorm_1.Index)(['status'])
], Shop);
//# sourceMappingURL=shop.entity.js.map