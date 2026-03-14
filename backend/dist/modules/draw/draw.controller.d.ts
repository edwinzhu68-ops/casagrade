import { DataSource } from 'typeorm';
interface SetDrawTimeDto {
    drawTime: string;
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
            drawDate: Date;
            status: string;
        };
        message?: undefined;
    }>;
    setDrawTime(dto: SetDrawTimeDto): Promise<{
        success: boolean;
        drawId: number;
        drawTime: string;
    }>;
    manualDraw(dto: ManualDrawDto): Promise<{
        success: boolean;
        drawId: number;
        primer: string;
        segundo: string;
        tercero: string;
    }>;
}
export declare class AdminController {
    private readonly dataSource;
    private readonly logger;
    constructor(dataSource: DataSource);
    adminDraw(body: {
        primer?: string;
        segundo?: string;
        tercero?: string;
        drawTime?: string;
    }): Promise<{
        primer: string;
        segundo: string;
        tercero: string;
        success: boolean;
        drawId: number;
    }>;
}
export {};
