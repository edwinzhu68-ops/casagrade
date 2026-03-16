export declare class User {
    user_id: number;
    account_number: string;
    phone: string;
    email: string | null;
    password_hash: string;
    role: string;
    session_token: string | null;
    last_login_at: Date | null;
    last_login_ua: string | null;
    created_at: Date;
    updated_at: Date;
}
