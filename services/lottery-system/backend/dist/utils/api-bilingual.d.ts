import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
export declare function badBilingual(es: string, zh: string): BadRequestException;
export declare function notFoundBilingual(es: string, zh: string): NotFoundException;
export declare function unauthorizedBilingual(es: string, zh: string): UnauthorizedException;
