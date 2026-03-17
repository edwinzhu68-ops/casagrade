import { Repository } from 'typeorm';
import { Shop } from '../../entities/shop.entity';
export declare class AliasCleanupService {
    private readonly shopRepo;
    private readonly logger;
    constructor(shopRepo: Repository<Shop>);
    cleanupExpiredAliases(): Promise<void>;
}
