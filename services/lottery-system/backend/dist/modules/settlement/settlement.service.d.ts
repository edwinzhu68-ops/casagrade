import { DataSource, Repository } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { Shop } from '../../entities/shop.entity';
import { Draw } from '../../entities/draw.entity';
interface DrawResult {
    primer: string;
    segundo: string;
    tercero: string;
}
export interface WinningN123 {
    n1: string;
    n2: string;
    n3: string;
}
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
    settleShopLotteryDraw(drawId: number): Promise<{
        totalOrders: number;
        totalSales: number;
        totalPayout: number;
        wins: number;
        results: any[];
    }>;
    parseWinningN123(raw: string | null | undefined): WinningN123;
    drawResultFromN123(n: WinningN123): DrawResult;
    private settleOrderWithDrawResult;
    private settleTicaNicaOrder;
    private calculateTicaNicaBilletePayout;
    private calculateBilletePayout;
    private calculateChancePayout;
    private parseDrawResult;
    getSettlementStats(shopId?: number, startDate?: Date, endDate?: Date): Promise<any>;
    getHistoryForShop(shopId: number, limit?: number, lotteryKind?: string): Promise<{
        drawId?: number;
        date: string;
        drawDate: string;
        totalSales: number;
        totalPayout: number;
        netProfit: number;
    }[]>;
}
export {};
