import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderCancelController } from './order-cancel.controller';
import { OrderController, ShopController, BetStatusController } from './order.controller';
import { OrderCancelService } from './order-cancel.service';
import { Order } from '../../entities/order.entity';
import { Shop } from '../../entities/shop.entity';
import { DrawModule } from '../draw/draw.module';
import { LocalLotteryModule } from '../local-lottery/local-lottery.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Shop]), DrawModule, LocalLotteryModule],
  controllers: [OrderCancelController, OrderController, ShopController, BetStatusController],
  providers: [OrderCancelService],
})
export class OrderModule {}
