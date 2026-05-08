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
var DatabaseInitService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseInitService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const draw_entity_1 = require("../entities/draw.entity");
const draw_period_no_1 = require("../utils/draw-period-no");
let DatabaseInitService = DatabaseInitService_1 = class DatabaseInitService {
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(DatabaseInitService_1.name);
    }
    async onModuleInit() {
        await this.ensureTicaNicaColumns();
        await this.ensureDrawPeriodNoColumn();
        await this.bootstrapAdminAccount();
        const indexes = [
            {
                name: 'idx_orders_draw_status',
                sql: 'CREATE INDEX IF NOT EXISTS idx_orders_draw_status ON orders(draw_id, status)',
            },
            {
                name: 'idx_orders_shop_draw',
                sql: 'CREATE INDEX IF NOT EXISTS idx_orders_shop_draw ON orders(shop_id, draw_id)',
            },
            {
                name: 'idx_orders_shop_status',
                sql: 'CREATE INDEX IF NOT EXISTS idx_orders_shop_status ON orders(shop_id, status)',
            },
            {
                name: 'idx_shops_owner_id',
                sql: 'CREATE INDEX IF NOT EXISTS idx_shops_owner_id ON shops(owner_id)',
            },
            {
                name: 'idx_shops_status',
                sql: 'CREATE INDEX IF NOT EXISTS idx_shops_status ON shops(status)',
            },
            {
                name: 'idx_draws_status',
                sql: 'CREATE INDEX IF NOT EXISTS idx_draws_status ON draws(status)',
            },
            {
                name: 'idx_draws_status_id',
                sql: 'CREATE INDEX IF NOT EXISTS idx_draws_status_id ON draws(status, draw_id)',
            },
            {
                name: 'idx_draws_shop_lottery_status',
                sql: 'CREATE INDEX IF NOT EXISTS idx_draws_shop_lottery_status ON draws(shop_id, lottery_type, status)',
            },
            {
                name: 'idx_bindings_main_status',
                sql: 'CREATE INDEX IF NOT EXISTS idx_bindings_main_status ON shop_bindings(main_shop_id, status)',
            },
            {
                name: 'idx_bindings_sub_shop',
                sql: 'CREATE INDEX IF NOT EXISTS idx_bindings_sub_shop ON shop_bindings(sub_shop_id)',
            },
            {
                name: 'idx_users_email',
                sql: 'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
            },
        ];
        let created = 0;
        for (const idx of indexes) {
            try {
                await this.dataSource.query(idx.sql);
                created++;
            }
            catch (e) {
                this.logger.warn(`索引 ${idx.name} 创建失败（可能已存在）: ${e.message}`);
            }
        }
        this.logger.log(`数据库索引初始化完成，共处理 ${created}/${indexes.length} 个索引`);
    }
    async ensureTicaNicaColumns() {
        const dbType = this.dataSource.options.type || 'sqlite';
        const boolDefault = dbType === 'postgres' ? 'true' : '1';
        const boolDisabled = dbType === 'postgres' ? 'false' : '0';
        const alters = [
            `ALTER TABLE draws ADD COLUMN lottery_type varchar(20) DEFAULT 'NACIONAL'`,
            `ALTER TABLE draws ADD COLUMN shop_id integer`,
            `ALTER TABLE orders ADD COLUMN lottery_type varchar(20) DEFAULT 'NACIONAL'`,
            `ALTER TABLE shops ADD COLUMN accepting_tica_orders boolean NOT NULL DEFAULT ${boolDefault}`,
            `ALTER TABLE shops ADD COLUMN accepting_nica_orders boolean NOT NULL DEFAULT ${boolDefault}`,
            `ALTER TABLE shops ADD COLUMN tica_enabled boolean NOT NULL DEFAULT ${boolDisabled}`,
            `ALTER TABLE shops ADD COLUMN nica_enabled boolean NOT NULL DEFAULT ${boolDisabled}`,
            `ALTER TABLE shops ADD COLUMN tica_chance_1 decimal(10,2)`,
            `ALTER TABLE shops ADD COLUMN tica_chance_2 decimal(10,2)`,
            `ALTER TABLE shops ADD COLUMN tica_chance_3 decimal(10,2)`,
            `ALTER TABLE shops ADD COLUMN national_custom_draw_date varchar(12)`,
            `ALTER TABLE shops ADD COLUMN national_custom_draw_id integer`,
        ];
        for (const sql of alters) {
            try {
                await this.dataSource.query(sql);
            }
            catch {
            }
        }
        try {
            await this.dataSource.query(`UPDATE draws SET lottery_type = 'NACIONAL' WHERE lottery_type IS NULL`);
        }
        catch { }
        try {
            await this.dataSource.query(`UPDATE orders SET lottery_type = 'NACIONAL' WHERE lottery_type IS NULL`);
        }
        catch { }
    }
    async bootstrapAdminAccount() {
        const adminAccount = (process.env.ADMIN_ACCOUNT || '').trim();
        if (!adminAccount)
            return;
        try {
            const result = await this.dataSource.query(`UPDATE users SET role = 'admin' WHERE account_number = ? AND role != 'admin'`, [adminAccount]);
            const affected = result?.affected ?? (Array.isArray(result) ? 0 : 0);
            if (affected > 0) {
                this.logger.log(`Admin bootstrap：账号 ${adminAccount} role 已设为 admin`);
            }
            else {
                this.logger.log(`Admin bootstrap：账号 ${adminAccount} 已是 admin 或不存在（跳过）`);
            }
        }
        catch (e) {
            this.logger.warn(`Admin bootstrap 失败: ${e.message}`);
        }
    }
    async ensureDrawPeriodNoColumn() {
        try {
            await this.dataSource.query(`ALTER TABLE draws ADD COLUMN period_no integer`);
        }
        catch {
        }
        try {
            await (0, draw_period_no_1.backfillDrawPeriodNo)(this.dataSource.getRepository(draw_entity_1.Draw), this.logger);
        }
        catch (e) {
            this.logger.warn(`period_no 回填跳过: ${e.message}`);
        }
    }
};
exports.DatabaseInitService = DatabaseInitService;
exports.DatabaseInitService = DatabaseInitService = DatabaseInitService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], DatabaseInitService);
//# sourceMappingURL=database-init.service.js.map