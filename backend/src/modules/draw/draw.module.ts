import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DrawController, AdminController } from './draw.controller';
import { Draw } from '../../entities/draw.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Draw])],
  controllers: [DrawController, AdminController],
})
export class DrawModule {}
