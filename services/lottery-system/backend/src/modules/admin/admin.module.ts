import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
// import { ScheduleModule } from '@nestjs/schedule';
import { AdminController } from './admin.controller';
import { AliasCleanupService } from './alias-cleanup.service';
import { Order } from '../../entities/order.entity';
import { Shop } from '../../entities/shop.entity';
import { User } from '../../entities/user.entity';
import { Draw } from '../../entities/draw.entity';
import { CardCode } from '../../entities/card-code.entity';
import { ShopBinding } from '../../entities/shop-binding.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Shop, User, Draw, CardCode, ShopBinding]),
    // ScheduleModule.forRoot(),
  ],
  controllers: [AdminController],
  providers: [AliasCleanupService],
})
export class AdminModule {}

