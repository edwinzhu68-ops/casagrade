import { DataSource } from 'typeorm';
interface LoginDto {
    account?: string;
    accountNumber?: string;
    password: string;
}
export declare class MerchantController {
    private readonly dataSource;
    private readonly logger;
    constructor(dataSource: DataSource);
    login(dto: LoginDto): Promise<{
        token: string;
        userId: number;
        accountNumber: string;
        role: string;
    }>;
    getShops(userId: string, req: any): Promise<{
        shops: {
            shop_id: number;
            shop_number: string;
            shop_name: string;
            status: string;
            commission_rate: number;
        }[];
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
}
export {};
