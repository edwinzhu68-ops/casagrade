import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderModule } from './modules/order/order.module';
import { DrawModule } from './modules/draw/draw.module';
import { MerchantModule } from './modules/merchant/merchant.module';
import { SettlementModule } from './modules/settlement/settlement.module';
import { AdminModule } from './modules/admin/admin.module';
import { LocalLotteryModule } from './modules/local-lottery/local-lottery.module';
import { Order } from './entities/order.entity';
import { Shop } from './entities/shop.entity';
import { Draw } from './entities/draw.entity';
import { User } from './entities/user.entity';
import { ShopBinding } from './entities/shop-binding.entity';
import { CardCode } from './entities/card-code.entity';
import { Session } from './entities/session.entity';
import { DatabaseInitService } from './services/database-init.service';

/**
 * 根据 DB_TYPE 环境变量选择数据库：
 *   sqlite（默认）：本地开发/小规模部署，无需额外配置
 *   postgres：生产环境，需设置 DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD / DB_DATABASE
 */
function getTypeOrmConfig(): Parameters<typeof TypeOrmModule.forRoot>[0] {
  const dbType = (process.env.DB_TYPE || 'sqlite') as 'sqlite' | 'postgres';
  const common = {
    entities: [Order, Shop, Draw, User, ShopBinding, CardCode, Session],
    synchronize: process.env.NODE_ENV !== 'production', // 生产环境用 DatabaseInitService 建索引
    logging: false,
  };
  if (dbType === 'postgres') {
    return {
      ...common,
      type: 'postgres' as const,
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'lottery',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };
  }
  return {
    ...common,
    type: 'sqlite' as const,
    database: process.env.DATABASE_PATH || 'lottery.db',
  };
}

@Module({
  imports: [
    TypeOrmModule.forRoot(getTypeOrmConfig()),
    OrderModule,
    DrawModule,
    MerchantModule,
    SettlementModule,
    AdminModule,
    LocalLotteryModule,
  ],
  providers: [DatabaseInitService],
})
export class AppModule {}
