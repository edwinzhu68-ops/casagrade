import { Repository } from 'typeorm';
import { Draw } from '../entities/draw.entity';

/** 全国 Lotería：pending 且 NACIONAL、无 shop_id（兼容旧库 lottery_type 为空） */
export async function findNationalPendingDraw(drawRepo: Repository<Draw>): Promise<Draw | null> {
  return drawRepo
    .createQueryBuilder('d')
    .where('d.status = :s', { s: 'pending' })
    .andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
    .andWhere('(d.shop_id IS NULL)')
    .orderBy('d.draw_id', 'DESC')
    .getOne();
}

/** 全国：最近一期已完成（大小写兼容） */
export async function findNationalLastCompletedDraw(drawRepo: Repository<Draw>): Promise<Draw | null> {
  return drawRepo
    .createQueryBuilder('d')
    .where('d.status IN (:...st)', { st: ['completed', 'COMPLETED'] })
    .andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
    .andWhere('(d.shop_id IS NULL)')
    .orderBy('d.draw_id', 'DESC')
    .getOne();
}

/**
 * 全国 Lotería：结算页 GET /api/draw/latest 专用。
 * 必须排除 TICA/NICA（店内彩 draw_id 更大时，原先不加 lottery_type 会误把店内期当「全国最新开奖」），且仅未归档期。
 */
export async function findNationalLatestCompletedUnarchivedDraw(
  drawRepo: Repository<Draw>,
): Promise<Draw | null> {
  return drawRepo
    .createQueryBuilder('d')
    .where('d.status IN (:...st)', { st: ['completed', 'COMPLETED'] })
    .andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
    .andWhere('(d.shop_id IS NULL)')
    .andWhere('d.archived_at IS NULL')
    .orderBy('d.draw_id', 'DESC')
    .getOne();
}

/** 店内 TICA / NICA 当前待开奖期 */
export async function findShopPendingLocalDraw(
  drawRepo: Repository<Draw>,
  shopId: number,
  lotteryType: 'TICA' | 'NICA',
): Promise<Draw | null> {
  return drawRepo.findOne({
    where: {
      status: 'pending',
      shop_id: shopId,
      lottery_type: lotteryType,
    } as any,
    order: { draw_id: 'DESC' },
  });
}
