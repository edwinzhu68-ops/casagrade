import { Repository } from 'typeorm';
import { Draw } from '../entities/draw.entity';
export declare function getNextPeriodNoForScope(drawRepo: Repository<Draw>, scope: {
    shopId: number | null;
    lotteryType: string;
}): Promise<number>;
export declare function backfillDrawPeriodNo(drawRepo: Repository<Draw>, logger?: {
    log: (m: string) => void;
}): Promise<void>;
