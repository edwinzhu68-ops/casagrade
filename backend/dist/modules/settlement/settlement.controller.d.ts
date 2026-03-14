import { SettlementService } from './settlement.service';
export declare class SettlementController {
    private readonly settlementService;
    constructor(settlementService: SettlementService);
    settleDraw(drawId: number): Promise<{
        success: boolean;
        message: string;
        data: {
            totalOrders: number;
            totalSales: number;
            totalPayout: number;
            wins: number;
            results: any[];
        };
    }>;
    getStats(shopId?: string, startDate?: string, endDate?: string): Promise<{
        success: boolean;
        data: any;
    }>;
}
