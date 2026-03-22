import { OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
export declare class OrderCancelService implements OnModuleInit {
    private readonly dataSource;
    private readonly logger;
    private timer;
    constructor(dataSource: DataSource);
    onModuleInit(): void;
    private isInStopSellPeriod;
    cancelExpiredPendingOrders(): Promise<void>;
}
