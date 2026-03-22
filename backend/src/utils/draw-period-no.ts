import { Repository } from 'typeorm';
import { Draw } from '../entities/draw.entity';

/**
 * 下一期展示期号 period_no：按「范围」独立递增，与全局主键 draw_id 无关。
 * - 全国：shop_id IS NULL 且 lottery_type ∈ { NACIONAL, NULL }
 * - 店内：shop_id + lottery_type（TICA | NICA）
 */
export async function getNextPeriodNoForScope(
  drawRepo: Repository<Draw>,
  scope: { shopId: number | null; lotteryType: string },
): Promise<number> {
  const lt = String(scope.lotteryType || 'NACIONAL').toUpperCase();
  const qb = drawRepo.createQueryBuilder('d').select('MAX(d.period_no)', 'max');
  if (scope.shopId == null || scope.shopId === undefined) {
    qb.where('d.shop_id IS NULL').andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', {
      lt: 'NACIONAL',
    });
  } else {
    qb.where('d.shop_id = :sid', { sid: Number(scope.shopId) }).andWhere('d.lottery_type = :lt', { lt });
  }
  const row = await qb.getRawOne();
  const m = row?.max != null ? Number(row.max) : 0;
  const base = Number.isFinite(m) ? m : 0;
  return base + 1;
}

/** 启动时回填：按 draw_id 升序，各范围内 period_no = 1,2,3… */
export async function backfillDrawPeriodNo(drawRepo: Repository<Draw>, logger?: { log: (m: string) => void }): Promise<void> {
  const all = await drawRepo.find({ order: { draw_id: 'ASC' } });
  if (!all.length) return;
  let updated = 0;
  const counters = new Map<string, number>();
  for (const d of all) {
    if (d.period_no != null && Number(d.period_no) > 0) continue;
    const sid = d.shop_id;
    const ltu = String(d.lottery_type || 'NACIONAL').toUpperCase();
    const key = sid == null || sid === undefined ? 'NACIONAL' : `${Number(sid)}:${ltu}`;
    const next = (counters.get(key) || 0) + 1;
    counters.set(key, next);
    await drawRepo.update(d.draw_id, { period_no: next } as any);
    updated++;
  }
  if (updated && logger) logger.log(`draws.period_no 回填完成，更新 ${updated} 行`);
}
