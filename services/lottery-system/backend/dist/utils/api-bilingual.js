"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.badBilingual = badBilingual;
exports.notFoundBilingual = notFoundBilingual;
exports.unauthorizedBilingual = unauthorizedBilingual;
const common_1 = require("@nestjs/common");
function badBilingual(es, zh) {
    return new common_1.BadRequestException({ message: es, messageZh: zh });
}
function notFoundBilingual(es, zh) {
    return new common_1.NotFoundException({ message: es, messageZh: zh });
}
function unauthorizedBilingual(es, zh) {
    return new common_1.UnauthorizedException({ message: es, messageZh: zh });
}
//# sourceMappingURL=api-bilingual.js.map