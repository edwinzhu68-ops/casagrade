import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../entities/order.entity';
import { Shop } from '../../entities/shop.entity';
import { Draw } from '../../entities/draw.entity';
import { SettlementModule } from '../settlement/settlement.module';
import { LocalLotteryService } from './local-lottery.service';
import { LocalLotteryController } from './local-lottery.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Shop, Draw]), SettlementModule],
  controllers: [LocalLotteryController],
  providers: [LocalLotteryService],
  exports: [LocalLotteryService],
})
export class LocalLotteryModule {}
