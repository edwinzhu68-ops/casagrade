import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DrawController, AdminController } from './draw.controller';
import { Draw } from '../../entities/draw.entity';
import { DrawDayService } from './draw-day.service';

@Module({
  imports: [TypeOrmModule.forFeature([Draw])],
  controllers: [DrawController, AdminController],
  providers: [DrawDayService],
  exports: [DrawDayService],
})
export class DrawModule {}
