import { Request } from 'express';
import { DataSource } from 'typeorm';
import { DrawDayService } from './draw-day.service';
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
    private readonly drawDayService;
    private readonly logger;
    constructor(dataSource: DataSource, drawDayService: DrawDayService);
    fetchFirebase(): Promise<{
        success: boolean;
        data: {
            drawType: string;
            drawDate: string;
            drawHora: string;
            primer: string;
            segundo: string;
            tercero: string;
            letras: string;
            expectedDigits: {
                p: number;
                s: number;
                t: number;
            };
        };
    }>;
    fetchLnb(): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
    } | {
        success: boolean;
        data: {
            primer: string;
            segundo: string;
            tercero: string;
            drawDate: string;
            source: string;
        };
        error?: undefined;
    }>;
    private findPreviousDrawIdByPeriod;
    getLatestDraw(): Promise<{
        draw: any;
        message: string;
    } | {
        draw: {
            drawId: number;
            periodNo: any;
            previousDrawId: number;
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
            periodNo: any;
            previousDrawId: number;
            drawTime: string;
            drawDate: string;
            status: string;
            isManualOverride: boolean;
        };
        message?: undefined;
    }>;
    getNextDate(): {
        date: string;
        time: string;
    };
    setDrawTime(dto: SetDrawTimeDto): Promise<{
        success: boolean;
        error: string;
        drawId?: undefined;
        drawTime?: undefined;
        drawDate?: undefined;
    } | {
        success: boolean;
        drawId: number;
        drawTime: string;
        drawDate: string;
        error?: undefined;
    }>;
    manualDraw(dto: ManualDrawDto & {
        billete?: string;
        segundas?: string;
        terceras?: string;
    }): Promise<{
        success: boolean;
        error: string;
        drawId?: undefined;
        primer?: undefined;
        segundo?: undefined;
        tercero?: undefined;
    } | {
        success: boolean;
        drawId: number;
        primer: string;
        segundo: string;
        tercero: string;
        error?: undefined;
    }>;
    resetDrawTime(): Promise<{
        success: boolean;
        drawId: number;
        drawDate: string;
        drawTime: string;
    }>;
    resetPendingDraw(): Promise<{
        success: boolean;
        drawId: number;
        drawDate: string;
        drawTime: string;
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
    clearSettlement(req: Request): Promise<{
        success: boolean;
        message: string;
    }>;
    cleanupNullDrawOrders(): Promise<{
        success: boolean;
        deleted: number;
    }>;
}
export {};
