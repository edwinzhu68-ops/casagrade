import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController, ShopController, BetStatusController } from './order.controller';
import { OrderCancelService } from './order-cancel.service';
import { Order } from '../../entities/order.entity';
import { Shop } from '../../entities/shop.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Shop])],
  controllers: [OrderController, ShopController, BetStatusController],
  providers: [OrderCancelService],
})
export class OrderModule {}
