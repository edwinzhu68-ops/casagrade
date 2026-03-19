/**
 * DatabaseInitService
 *
 * 生产环境 synchronize=false，TypeORM 的 @Index 装饰器不会自动建索引。
 * 本服务在应用启动时用 CREATE INDEX IF NOT EXISTS 补建所有必要索引，
 * 对 SQLite 和 PostgreSQL 均兼容（语法相同）。
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseInitService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseInitService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    const indexes: { name: string; sql: string }[] = [
      // ── orders ────────────────────────────────────────────────────────────
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
      // ── shops ─────────────────────────────────────────────────────────────
      {
        name: 'idx_shops_owner_id',
        sql: 'CREATE INDEX IF NOT EXISTS idx_shops_owner_id ON shops(owner_id)',
      },
      {
        name: 'idx_shops_status',
        sql: 'CREATE INDEX IF NOT EXISTS idx_shops_status ON shops(status)',
      },
      // ── draws ─────────────────────────────────────────────────────────────
      {
        name: 'idx_draws_status',
        sql: 'CREATE INDEX IF NOT EXISTS idx_draws_status ON draws(status)',
      },
      {
        name: 'idx_draws_status_id',
        sql: 'CREATE INDEX IF NOT EXISTS idx_draws_status_id ON draws(status, draw_id)',
      },
      // ── shop_bindings ─────────────────────────────────────────────────────
      {
        name: 'idx_bindings_main_status',
        sql: 'CREATE INDEX IF NOT EXISTS idx_bindings_main_status ON shop_bindings(main_shop_id, status)',
      },
      {
        name: 'idx_bindings_sub_shop',
        sql: 'CREATE INDEX IF NOT EXISTS idx_bindings_sub_shop ON shop_bindings(sub_shop_id)',
      },
      // ── users ─────────────────────────────────────────────────────────────
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
      } catch (e) {
        this.logger.warn(`索引 ${idx.name} 创建失败（可能已存在）: ${(e as Error).message}`);
      }
    }
    this.logger.log(`数据库索引初始化完成，共处理 ${created}/${indexes.length} 个索引`);
  }
}
