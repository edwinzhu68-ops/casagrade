import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shop } from '../../entities/shop.entity';

const ALIAS_EXPIRE_DAYS = 30;

@Injectable()
export class AliasCleanupService {
  private readonly logger = new Logger(AliasCleanupService.name);

  constructor(
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
  ) {}

  /** 每天凌晨3点执行，清理超过30天的别名 */
  @Cron('0 3 * * *')
  async cleanupExpiredAliases() {
    const shops = await this.shopRepo.find();
    const expireMs = ALIAS_EXPIRE_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let cleaned = 0;

    for (const shop of shops) {
      const aliases = shop.shop_aliases || [];
      const timestamps = shop.shop_alias_timestamps || {};
      if (aliases.length === 0) continue;

      const kept = aliases.filter(alias => {
        const addedAt = timestamps[alias];
        if (!addedAt) return true; // 没有时间戳的保留（历史数据）
        return now - new Date(addedAt).getTime() < expireMs;
      });

      if (kept.length < aliases.length) {
        const removed = aliases.filter(a => !kept.includes(a));
        const newTimestamps = { ...timestamps };
        removed.forEach(a => delete newTimestamps[a]);
        await this.shopRepo.update(shop.shop_id, {
          shop_aliases: kept.length > 0 ? kept : null,
          shop_alias_timestamps: Object.keys(newTimestamps).length > 0 ? newTimestamps : null,
        });
        cleaned += removed.length;
        this.logger.log(`店铺 ${shop.shop_number} 清理过期别名：${removed.join(', ')}`);
      }
    }

    if (cleaned > 0) {
      this.logger.log(`共清理 ${cleaned} 个过期别名，已释放回随机池`);
    }
  }
}
