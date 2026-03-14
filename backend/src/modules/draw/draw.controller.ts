import { Controller, Get, Post, Body, Inject, Logger, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Draw } from '../../entities/draw.entity';
import { AdminTokenGuard } from '../../guards/admin-token.guard';

interface SetDrawTimeDto {
  drawTime: string; // HH:mm:ss
}

interface ManualDrawDto {
  primer: string;
  segundo?: string;
  tercero?: string;
  drawTime?: string;
}

@Controller('draw')
export class DrawController {
  private readonly logger = new Logger(DrawController.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * GET /api/draw/latest - 获取最近开奖
   */
  @Get('latest')
  async getLatestDraw() {
    const draw = await this.dataSource.getRepository(Draw).findOne({
      where: { status: 'completed' },
      order: { draw_id: 'DESC' },
    });

    if (!draw) {
      return {
        draw: null,
        message: '暂无开奖记录',
      };
    }

    // 解析 winning_numbers
    let winning;
    try {
      winning = JSON.parse(draw.winning_numbers);
    } catch {
      winning = { primer: draw.winning_numbers };
    }

    return {
      draw: {
        drawId: draw.draw_id,
        primer: winning.primer || winning.primeras || '',
        segundo: winning.segundo || winning.segundas || '',
        tercero: winning.tercero || winning.terceras || winning.ultimas || '',
        drawTime: draw.draw_time,
        drawDate: draw.draw_date,
        status: draw.status,
      },
    };
  }

  /**
   * POST /api/draw/time - 设置开奖时间（需管理员密钥）
   */
  @Post('time')
  @UseGuards(AdminTokenGuard)
  async setDrawTime(@Body() dto: SetDrawTimeDto) {
    // 创建新的开奖期次（待开奖）
    const drawRepo = this.dataSource.getRepository(Draw);
    
    // 检查是否已有待开奖期次
    let draw = await drawRepo.findOne({
      where: { status: 'pending' },
      order: { draw_id: 'DESC' },
    });

    if (draw) {
      // 更新已有期次的时间
      await drawRepo.update(draw.draw_id, {
        draw_time: dto.drawTime,
      });
      draw.draw_time = dto.drawTime;
    } else {
      // 创建新期次
      draw = drawRepo.create({
        draw_date: new Date(),
        draw_time: dto.drawTime,
        status: 'pending',
        winning_numbers: '',
      });
      await drawRepo.save(draw);
    }

    this.logger.log(`开奖时间设置: ${(draw as any).draw_time}, 期次: ${draw.draw_id}`);

    return {
      success: true,
      drawId: draw.draw_id,
      drawTime: draw.draw_time,
    };
  }

  /**
   * POST /api/draw/manual - 手动开奖（需管理员密钥）
   * 兼容前端字段：primer/billete, segundo/segundas, tercero/terceras
   */
  @Post('manual')
  @UseGuards(AdminTokenGuard)
  async manualDraw(@Body() dto: ManualDrawDto & { billete?: string; segundas?: string; terceras?: string }) {
    const primer = (dto.primer ?? dto.billete ?? '').toString().trim();
    const segundo = (dto.segundo ?? dto.segundas ?? '').toString().trim();
    const tercero = (dto.tercero ?? dto.terceras ?? '').toString().trim();

    // 找到待开奖期次
    let draw = await this.dataSource.getRepository(Draw).findOne({
      where: { status: 'pending' },
      order: { draw_id: 'DESC' },
    });

    if (!draw) {
      // 如果没有待开奖期次，创建新的
      draw = this.dataSource.getRepository(Draw).create({
        draw_date: new Date(),
        draw_time: dto.drawTime || new Date().toTimeString().split(' ')[0],
        status: 'completed',
      });
    }

    // 写入开奖号码（2位/4位/5位取后4或后2）
    const winningNumbers = {
      primer: primer.slice(-4).padStart(4, '0'),
      segundo: segundo.slice(-4).padStart(4, '0'),
      tercero: tercero.slice(-4).padStart(4, '0'),
    };

    await this.dataSource.getRepository(Draw).update(draw.draw_id, {
      winning_numbers: JSON.stringify(winningNumbers),
      status: 'completed',
      draw_time: dto.drawTime || (draw as any).draw_time,
    });

    this.logger.log(`开奖完成: ${JSON.stringify(winningNumbers)}`);

    return {
      success: true,
      drawId: draw.draw_id,
      primer: winningNumbers.primer,
      segundo: winningNumbers.segundo,
      tercero: winningNumbers.tercero,
    };
  }
}

/**
 * 管理员Controller（开奖等，需管理员密钥）
 */
@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * POST /admin/draw - 开奖（兼容旧前端）
   */
  @Post('draw')
  async adminDraw(@Body() body: { primer?: string; segundo?: string; tercero?: string; drawTime?: string }) {
    const { primer, segundo, tercero, drawTime } = body;

    // 找到待开奖期次
    let draw = await this.dataSource.getRepository(Draw).findOne({
      where: { status: 'pending' },
      order: { draw_id: 'DESC' },
    });

    const drawRepo = this.dataSource.getRepository(Draw);

    if (!draw) {
      // 如果没有待开奖期次，创建新的并直接完成
      const winningNumbers = {
        primer: (primer || '').padStart(4, '0'),
        segundo: (segundo || '').padStart(4, '0'),
        tercero: (tercero || '').padStart(4, '0'),
      };

      draw = drawRepo.create({
        draw_date: new Date(),
        draw_time: drawTime || new Date().toTimeString().split(' ')[0],
        status: 'completed',
        winning_numbers: JSON.stringify(winningNumbers),
      });
      await drawRepo.save(draw);

      this.logger.log(`管理员开奖(新期次): ${JSON.stringify(winningNumbers)}`);

      return {
        success: true,
        drawId: draw.draw_id,
        ...winningNumbers,
      };
    }

    // 写入开奖号码
    const winningNumbers = {
      primer: (primer || '').padStart(4, '0'),
      segundo: (segundo || '').padStart(4, '0'),
      tercero: (tercero || '').padStart(4, '0'),
    };

    await drawRepo.update(draw.draw_id, {
      winning_numbers: JSON.stringify(winningNumbers),
      status: 'completed',
      draw_time: drawTime || (draw as any).draw_time,
    });

    this.logger.log(`管理员开奖: ${JSON.stringify(winningNumbers)}`);

    return {
      success: true,
      drawId: draw.draw_id,
      ...winningNumbers,
    };
  }
}
