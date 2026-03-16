import { CanActivate, ExecutionContext } from '@nestjs/common';
export declare class AdminTokenGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean;
}
