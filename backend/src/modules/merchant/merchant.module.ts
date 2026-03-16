import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantController } from './merchant.controller';
import { User } from '../../entities/user.entity';
import { Shop } from '../../entities/shop.entity';
import { ShopBinding } from '../../entities/shop-binding.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Shop, ShopBinding])],
  controllers: [MerchantController],
})
export class MerchantModule {}
