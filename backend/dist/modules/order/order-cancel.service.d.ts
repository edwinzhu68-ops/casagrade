import { OnModuleInit } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Order } from '../../entities/order.entity';
export declare class OrderCancelService implements OnModuleInit {
    private readonly orderRepo;
    private readonly logger;
    private timer;
    constructor(orderRepo: Repository<Order>);
    onModuleInit(): void;
    cancelExpiredPendingOrders(): Promise<void>;
}
