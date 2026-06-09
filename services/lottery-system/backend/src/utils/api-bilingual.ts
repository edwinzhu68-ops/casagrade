import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';

/**
 * 顾客端 / 商户端 API：默认 `message` 为西语，`messageZh` 为中文（前端按语言选用）
 */
export function badBilingual(es: string, zh: string): BadRequestException {
  return new BadRequestException({ message: es, messageZh: zh });
}

export function notFoundBilingual(es: string, zh: string): NotFoundException {
  return new NotFoundException({ message: es, messageZh: zh });
}

export function unauthorizedBilingual(es: string, zh: string): UnauthorizedException {
  return new UnauthorizedException({ message: es, messageZh: zh });
}
