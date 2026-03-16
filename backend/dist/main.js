"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
try {
    require('dotenv/config');
}
catch { }
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
let AllExceptionsFilter = class AllExceptionsFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse();
        if (exception instanceof common_1.HttpException) {
            const status = exception.getStatus();
            const body = exception.getResponse();
            return res.status(status).json(typeof body === 'object' ? body : { message: body });
        }
        const isDev = process.env.NODE_ENV !== 'production';
        const message = isDev && exception instanceof Error ? exception.message : 'Internal server error';
        if (!isDev && exception instanceof Error) {
            console.error('[UnhandledException]', exception.message, exception.stack);
        }
        res.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
            statusCode: common_1.HttpStatus.INTERNAL_SERVER_ERROR,
            message,
            error: 'Internal Server Error',
        });
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = __decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.useGlobalFilters(new AllExceptionsFilter());
    const allowedOrigins = process.env.ALLOWED_ORIGINS;
    const isDev = process.env.NODE_ENV !== 'production';
    const defaultOrigins = isDev
        ? ['https://www.casagrade.com', 'https://api.casagrade.com', 'http://localhost:3005', 'http://localhost:8080']
        : ['https://www.casagrade.com', 'https://api.casagrade.com'];
    const origins = allowedOrigins
        ? allowedOrigins.split(',').map((s) => s.trim()).filter(Boolean)
        : defaultOrigins;
    app.enableCors({ origin: origins, credentials: true });
    app.setGlobalPrefix('api');
    const port = process.env.PORT || 3000;
    await app.listen(port);
    console.log(`🚀 Lottery API running on http://localhost:${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map