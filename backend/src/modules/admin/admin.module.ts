import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { Order } from '../../entities/order.entity';
import { Shop } from '../../entities/shop.entity';
import { User } from '../../entities/user.entity';
import { Draw } from '../../entities/draw.entity';
import { CardCode } from '../../entities/card-code.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Shop, User, Draw, CardCode])],
  controllers: [AdminController],
})
export class AdminModule {}

