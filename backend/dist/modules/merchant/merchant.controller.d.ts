import { OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
interface LoginDto {
    account?: string;
    accountNumber?: string;
    password: string;
    force_login?: boolean;
}
interface RegisterDto {
    account?: string;
    accountNumber?: string;
    password: string;
    passwordConfirm?: string;
    shop_name?: string;
    email?: string;
}
export declare class MerchantController implements OnModuleInit {
    private readonly dataSource;
    private readonly logger;
    constructor(dataSource: DataSource);
    onModuleInit(): Promise<void>;
    private verifySession;
    register(dto: RegisterDto): Promise<{
        success: boolean;
        message: string;
        accountNumber: string;
    }>;
    forgotPassword(body: {
        email: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    login(dto: LoginDto, req: any): Promise<{
        has_active_session: boolean;
        last_login_at: Date;
        last_login_ua: string;
        token?: undefined;
        session_token?: undefined;
        userId?: undefined;
        accountNumber?: undefined;
        role?: undefined;
    } | {
        token: string;
        session_token: string;
        userId: number;
        accountNumber: string;
        role: string;
        last_login_at: Date;
        last_login_ua: string;
        has_active_session?: undefined;
    }>;
    logout(req: any): Promise<{
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
            subscription_expires_at: Date;
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
    }, req: any): Promise<{
        success: boolean;
        message: string;
    }>;
    bindingPending(shopId: string): Promise<{
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
    bindingIncoming(mainShopId: string): Promise<{
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
    myBinding(shopId: string): Promise<{
        binding: {
            binding_id: number;
            status: string;
            commission_rate: number;
            main_shop_id: number;
            main_shop_number: string;
            main_shop_name: string;
        };
    }>;
    subShops(mainShopId: string): Promise<{
        sub_shops: {
            binding_id: number;
            sub_shop_id: number;
            sub_shop_number: string;
            sub_shop_name: string;
            commission_rate: number;
        }[];
    }>;
    subShopData(mainShopId: string, drawId: string): Promise<{
        draw_id: number;
        sub_shops: any[];
        draw_status?: undefined;
        draw_date?: undefined;
        summary?: undefined;
    } | {
        draw_id: number;
        draw_status: string;
        draw_date: Date;
        sub_shops: {
            binding_id: number;
            sub_shop_id: number;
            sub_shop_number: string;
            sub_shop_name: string;
            commission_rate: number;
            total_sales: number;
            total_payout: number;
            sub_commission: number;
            main_net_profit: number;
            order_count: number;
        }[];
        summary: {
            total_sales: number;
            total_commission_paid: number;
            main_total_net: number;
        };
    }>;
    bindingHistory(mainShopId: string, limit: string): Promise<{
        history: {
            draw_id: number;
            draw_date: Date;
            total_sales: number;
            total_payout: number;
            total_commission: number;
            main_net_profit: number;
            order_count: number;
        }[];
    }>;
    bindingPendingCount(shopId: string): Promise<{
        count: number;
    }>;
    activateCard(shopId: number, code: string): Promise<{
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
