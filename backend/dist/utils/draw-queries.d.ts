import { Repository } from 'typeorm';
import { Draw } from '../entities/draw.entity';
export declare function findNationalPendingDraw(drawRepo: Repository<Draw>): Promise<Draw | null>;
export declare function findNationalLastCompletedDraw(drawRepo: Repository<Draw>): Promise<Draw | null>;
export declare function findNationalLatestCompletedUnarchivedDraw(drawRepo: Repository<Draw>): Promise<Draw | null>;
export declare function findShopPendingLocalDraw(drawRepo: Repository<Draw>, shopId: number, lotteryType: 'TICA' | 'NICA'): Promise<Draw | null>;
