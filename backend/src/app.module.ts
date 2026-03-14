import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderModule } from './modules/order/order.module';
import { DrawModule } from './modules/draw/draw.module';
import { MerchantModule } from './modules/merchant/merchant.module';
import { SettlementModule } from './modules/settlement/settlement.module';
import { AdminModule } from './modules/admin/admin.module';
import { Order } from './entities/order.entity';
import { Shop } from './entities/shop.entity';
import { Draw } from './entities/draw.entity';
import { User } from './entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: process.env.DATABASE_PATH || 'lottery.db',
      entities: [Order, Shop, Draw, User],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: false,
    }),
    OrderModule,
    DrawModule,
    MerchantModule,
    SettlementModule,
    AdminModule,
  ],
})
export class AppModule {}
