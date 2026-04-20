import { OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LocalLotteryService } from '../local-lottery/local-lottery.service';
interface LoginDto {
    account?: string;
    accountNumber?: string;
    password: string;
    force_login?: boolean;
    device_type?: string;
    device_name?: string;
}
interface RegisterDto {
    account?: string;
    accountNumber?: string;
    password: string;
    passwordConfirm?: string;
    shop_name?: string;
    email?: string;
    device_id?: string;
}
export declare class MerchantController implements OnModuleInit {
    private readonly dataSource;
    private readonly localLotteryService;
    private readonly logger;
    constructor(dataSource: DataSource, localLotteryService: LocalLotteryService);
    onModuleInit(): Promise<void>;
    private verifySession;
    register(dto: RegisterDto): Promise<{
        success: boolean;
        message: string;
        accountNumber: string;
        shopNumber: string;
        trialExpiresAt: string;
    }>;
    forgotPassword(body: {
        email: string;
    }, req: any): Promise<{
        success: boolean;
        message: string;
    }>;
    login(dto: LoginDto, req: any): Promise<{
        token: string;
        session_token: string;
        userId: number;
        accountNumber: string;
        role: string;
        last_login_at: Date;
        last_login_ua: string;
    }>;
    logout(req: any): Promise<{
        success: boolean;
    }>;
    getSessions(req: any): Promise<{
        session_id: number;
        device_type: string;
        device_name: string;
        created_at: Date;
        is_current: boolean;
    }[]>;
    deleteSession(sessionId: string, req: any): Promise<{
        success: boolean;
    }>;
    getShops(userId: string, req: any): Promise<{
        shops: {
            shop_id: number;
            shop_number: string;
            shop_name: string;
            status: string;
            commission_rate: number;
            subscription_expires_at: Date;
            limit_chance: any;
            limit_billete: any;
            tica_limit_chance: any;
            tica_limit_palet: any;
            nica_limit_chance: any;
            nica_limit_palet: any;
            tica_custom_period: any;
            nica_custom_period: any;
            rate_billete_1: any;
            rate_billete_2: any;
            rate_billete_3: any;
            rate_chance_1: any;
            rate_chance_2: any;
            rate_chance_3: any;
            loteria_enabled: boolean;
            tica_enabled: boolean;
            nica_enabled: boolean;
            accepting_tica_orders: boolean;
            accepting_nica_orders: boolean;
        }[];
        last_login_at: Date;
        last_login_ua: string;
    } | {
        shops: {
            shop_id: number;
            shop_number: string;
            shop_name: string;
            status: string;
            commission_rate: number;
            limit_chance: any;
            limit_billete: any;
            tica_limit_chance: any;
            tica_limit_palet: any;
            nica_limit_chance: any;
            nica_limit_palet: any;
            tica_custom_period: any;
            nica_custom_period: any;
            rate_billete_1: any;
            rate_billete_2: any;
            rate_billete_3: any;
            rate_chance_1: any;
            rate_chance_2: any;
            rate_chance_3: any;
            chain_1_2: any;
            chain_1_3: any;
            chain_2_1: any;
            chain_2_3: any;
            chain_3_1: any;
            chain_3_2: any;
            subscription_expires_at: Date;
            loteria_enabled: boolean;
            tica_enabled: boolean;
            nica_enabled: boolean;
            accepting_tica_orders: boolean;
            accepting_nica_orders: boolean;
        }[];
        last_login_at: Date;
        last_login_ua: string;
    }>;
    getShop(shopId: string): Promise<{
        shop_id: number;
        shop_number: string;
        shop_name: string;
        status: string;
        commission_rate: number;
        single_bet_limit: number;
        daily_bet_limit: number;
    }>;
    bindingRequest(body: {
        mainShopId: number;
        subShopNumber: string;
        commissionRate?: number;
    }, req: any): Promise<{
        success: boolean;
        message: string;
    }>;
    bindingPending(shopId: string, req: any): Promise<{
        pending: {
            binding_id: number;
            main_shop_id: number;
            main_shop_number: string;
            main_shop_name: string;
            commission_rate: number;
            created_at: Date;
        }[];
    }>;
    bindingSubRequest(body: {
        subShopId: number;
        mainShopNumber: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    bindingIncoming(mainShopId: string, req: any): Promise<{
        incoming: {
            binding_id: number;
            sub_shop_id: number;
            sub_shop_number: string;
            sub_shop_name: string;
            commission_rate: number;
            created_at: Date;
        }[];
    }>;
    bindingApprove(id: string, body: {
        commission_rate?: number;
    }, req: any): Promise<{
        success: boolean;
        message: string;
    }>;
    bindingReject(id: string, req: any): Promise<{
        success: boolean;
        message: string;
    }>;
    bindingDelete(id: string, req: any): Promise<{
        success: boolean;
        message: string;
    }>;
    bindingSetCommission(id: string, body: {
        commission_rate: number;
    }, req: any): Promise<{
        success: boolean;
        commission_rate: number;
    }>;
    myBinding(shopId: string, req: any): Promise<{
        binding: {
            binding_id: number;
            status: string;
            commission_rate: number;
            main_shop_id: number;
            main_shop_number: string;
            main_shop_name: string;
        };
    }>;
    batchCreateSubs(body: {
        mainShopId: number;
        count: number;
        password?: string;
        adminOverride?: boolean;
    }, req: any): Promise<{
        success: boolean;
        created: {
            shopNumber: string;
            account: string;
            password: string;
        }[];
        count: number;
    }>;
    subShops(mainShopId: string, req: any): Promise<{
        sub_shops: {
            binding_id: number;
            sub_shop_id: number;
            sub_shop_number: string;
            sub_shop_name: string;
            commission_rate: number;
        }[];
    }>;
    subShopData(mainShopId: string, drawId: string, lotteryKind: string | undefined, req: any): Promise<{
        draw_id: number;
        draw_status: string;
        draw_date: Date;
        lottery_kind: string;
        sub_shops: any[];
        summary: {
            total_sales: number;
            total_commission_paid: number;
            main_total_net: number;
        };
    }>;
    bindingHistory(mainShopId: string, limit: string, lotteryKind: string | undefined, req: any): Promise<{
        history: any[];
        lottery_kind: string;
    }>;
    bindingPendingCount(shopId: string): Promise<{
        count: number;
    }>;
    activateCard(shopId: number, code: string, req: any): Promise<{
        success: boolean;
        type: string;
        subscription_expires_at: Date;
        message: string;
    }>;
    private parseTokenUserId;
    private parseTokenFull;
    changePassword(body: {
        currentPassword: string;
        newPassword: string;
    }, req: any): Promise<{
        success: boolean;
        message: string;
    }>;
    changeEmail(body: {
        email: string;
        currentPassword?: string;
    }, req: any): Promise<{
        success: boolean;
        message: string;
    }>;
}
export {};
