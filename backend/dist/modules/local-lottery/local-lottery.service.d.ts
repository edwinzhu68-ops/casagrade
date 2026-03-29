import { DataSource } from 'typeorm';
import { Request } from 'express';
import { Shop } from '../../entities/shop.entity';
import { Draw } from '../../entities/draw.entity';
import { SettlementService } from '../settlement/settlement.service';
export interface LocalCreateOrderDto {
    shopId?: number;
    shop_id?: number;
    lotteryKind: 'TICA' | 'NICA';
    numbers: {
        n: string;
        q: number;
    }[];
    amount: number;
    gameType?: string;
    game_type?: string;
    clientId?: string;
    ipAddress?: string;
    idempotency_key?: string;
}
export declare class LocalLotteryService {
    private readonly dataSource;
    private readonly settlementService;
    private readonly logger;
    constructor(dataSource: DataSource, settlementService: SettlementService);
    assertLocalFeatureForKind(shop: Shop | null, kind: 'TICA' | 'NICA'): void;
    ensureShopPendingDraw(shopId: number, kind: 'TICA' | 'NICA', skipFeatureCheck?: boolean): Promise<Draw>;
    getCurrent(shopId: number, kind: 'TICA' | 'NICA'): Promise<{
        draw_id: number;
        period_no: number;
        custom_period: any;
        shop_id: number;
        lottery_type: "TICA" | "NICA";
        status: string;
        draw_date: Date;
        draw_time: string;
    }>;
    createOrder(dto: LocalCreateOrderDto, req: Request): Promise<{
        order_id: number;
        order_number: string;
        order_hash: string;
        verification_code: string;
        amount: number;
        status: number;
        created_at: Date;
        lottery_type: "TICA" | "NICA";
        draw_id: number;
    } | {
        order_id: number;
        order_number: string;
        order_hash: string;
        verification_code: string;
        amount: number;
        status: number;
        created_at: Date;
        lottery_type: "TICA" | "NICA";
        _idempotent: boolean;
    }>;
    settleAndRollNext(shopId: number, kind: 'TICA' | 'NICA', n1: string, n2: string, n3: string): Promise<{
        totalOrders: number;
        totalSales: number;
        totalPayout: number;
        wins: number;
        results: any[];
        settled_draw_id: number;
        next_draw_id: number;
        winning_numbers: {
            n1: string;
            n2: string;
            n3: string;
        };
    }>;
    assertShopOwner(shopId: number, operatorUserId: number): Promise<Shop>;
    patchAccepting(shopId: number, body: {
        acceptingTicaOrders?: boolean;
        acceptingNicaOrders?: boolean;
    }, operatorUserId: number): Promise<{
        success: boolean;
        accepting_tica_orders: any;
        accepting_nica_orders: any;
    }>;
    updateMerchantOrderLines(orderNumber: string, shopId: number, numbers: {
        n: string;
        q: number;
    }[], operatorUserId: number): Promise<{
        success: boolean;
        order_number: string;
        amount: number;
        numbers: {
            n: string;
            q: number;
        }[];
        game_type: string;
        lottery_type: string;
    }>;
    private computeExpectedAmountFromLines;
    patchShopSettings(shopId: number, body: {
        ticaEnabled?: boolean;
        nicaEnabled?: boolean;
        acceptingTicaOrders?: boolean;
        acceptingNicaOrders?: boolean;
    }, operatorUserId: number): Promise<{
        success: boolean;
        tica_enabled: boolean;
        nica_enabled: boolean;
        accepting_tica_orders: boolean;
        accepting_nica_orders: boolean;
    }>;
    private generateOrderNumber;
    private generateVerificationCode;
}
