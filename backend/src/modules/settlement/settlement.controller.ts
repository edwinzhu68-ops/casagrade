import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { AdminTokenGuard } from '../../guards/admin-token.guard';

@Controller('settlement')
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  /**
   * 手动结算指定期次（需管理员密钥）
   * POST /api/settlement/settle/:drawId
   */
  @Post('settle/:drawId')
  @UseGuards(AdminTokenGuard)
  async settleDraw(@Param('drawId') drawId: number) {
    const result = await this.settlementService.settleDraw(Number(drawId));
    return {
      success: true,
      message: `结算完成，共 ${result.totalOrders} 单`,
      data: result,
    };
  }

  /**
   * 获取结算统计
   * GET /api/settlement/stats?shopId=1&startDate=2026-01-01&endDate=2026-12-31
   */
  @Get('stats')
  async getStats(
    @Query('shopId') shopId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const result = await this.settlementService.getSettlementStats(
      shopId ? Number(shopId) : undefined,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
    return {
      success: true,
      data: result,
    };
  }

  /**
   * 最近 N 期历史结算（给 result.html 用）
   * GET /api/settlement/history?shopId=1&limit=7
   */
  @Get('history')
  async getHistory(
    @Query('shopId') shopId: string,
    @Query('limit') limit: string = '7',
  ) {
    const result = await this.settlementService.getHistoryForShop(
      Number(shopId),
      Number(limit) || 7,
    );
    return {
      success: true,
      items: result,
    };
  }
}
