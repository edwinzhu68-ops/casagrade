import { DataSource } from 'typeorm';
interface SetDrawTimeDto {
    drawTime?: string;
    drawDate?: string;
}
interface ManualDrawDto {
    primer: string;
    segundo?: string;
    tercero?: string;
    drawTime?: string;
}
export declare class DrawController {
    private readonly dataSource;
    private readonly logger;
    constructor(dataSource: DataSource);
    fetchFirebase(): Promise<{
        success: boolean;
        data: {
            drawType: string;
            primer: string;
            segundo: string;
            tercero: string;
            letras: string;
        };
    }>;
    getLatestDraw(): Promise<{
        draw: any;
        message: string;
    } | {
        draw: {
            drawId: number;
            primer: any;
            segundo: any;
            tercero: any;
            drawTime: string;
            drawDate: string;
            status: string;
        };
        message?: undefined;
    }>;
    getPendingDraw(): Promise<{
        draw: any;
        message: string;
    } | {
        draw: {
            drawId: number;
            drawTime: string;
            drawDate: string;
            status: string;
        };
        message?: undefined;
    }>;
    getNextDate(): {
        date: string;
        time: string;
    };
    setDrawTime(dto: SetDrawTimeDto): Promise<{
        success: boolean;
        drawId: number;
        drawTime: string;
        drawDate: string;
    }>;
    manualDraw(dto: ManualDrawDto & {
        billete?: string;
        segundas?: string;
        terceras?: string;
    }): Promise<{
        success: boolean;
        drawId: number;
        primer: string;
        segundo: string;
        tercero: string;
    }>;
    rollbackDraw(): Promise<{
        success: boolean;
        error: string;
        drawId?: undefined;
        drawDate?: undefined;
        drawTime?: undefined;
    } | {
        success: boolean;
        drawId: number;
        drawDate: Date;
        drawTime: string;
        error?: undefined;
    }>;
}
export declare class AdminController {
    private readonly dataSource;
    private readonly logger;
    constructor(dataSource: DataSource);
    clearSettlement(): Promise<{
        success: boolean;
        message: string;
        drawId: number;
    }>;
    cleanupNullDrawOrders(): Promise<{
        success: boolean;
        deleted: number;
    }>;
}
export {};
