import { DataSource, Repository } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { Shop } from '../../entities/shop.entity';
import { Draw } from '../../entities/draw.entity';
export declare class SettlementService {
    private readonly dataSource;
    private readonly orderRepo;
    private readonly shopRepo;
    private readonly drawRepo;
    private readonly logger;
    constructor(dataSource: DataSource, orderRepo: Repository<Order>, shopRepo: Repository<Shop>, drawRepo: Repository<Draw>);
    settleDraw(drawId: number): Promise<{
        totalOrders: number;
        totalSales: number;
        totalPayout: number;
        wins: number;
        results: any[];
    }>;
    private settleOrder;
    private calculateBilletePayout;
    private calculateChancePayout;
    private parseDrawResult;
    getSettlementStats(shopId?: number, startDate?: Date, endDate?: Date): Promise<any>;
    getHistoryForShop(shopId: number, limit?: number): Promise<{
        drawId?: number;
        date: string;
        drawDate: string;
        totalSales: number;
        totalPayout: number;
        netProfit: number;
    }[]>;
}
