import { User } from './user.entity';
export declare class Shop {
    shop_id: number;
    shop_number: string;
    owner_id: number;
    owner: User;
    shop_name: string;
    commission_rate: number;
    status: string;
    single_bet_limit: number;
    daily_bet_limit: number;
    created_at: Date;
    updated_at: Date;
}
