"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
require("reflect-metadata");
try {
    require('dotenv/config');
}
catch { }
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger = new common_1.Logger('Bootstrap');
function writeErrorLog(msg) {
    const logDir = path.join(__dirname, '..', 'logs');
    const logFile = path.join(logDir, `error-${new Date().toISOString().split('T')[0]}.log`);
    const logMsg = `[${new Date().toISOString()}] ${msg}\n`;
    try {
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        fs.appendFileSync(logFile, logMsg);
    }
    catch (e) {
        console.error('Failed to write error log:', e);
    }
    console.error(msg);
}
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
        if (exception instanceof Error) {
            const errorMsg = isDev
                ? `${exception.message}\n${exception.stack}`
                : `${exception.message}`;
            writeErrorLog(`[UnhandledException] ${errorMsg}`);
            res.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
                statusCode: common_1.HttpStatus.INTERNAL_SERVER_ERROR,
                message: isDev ? exception.message : 'Internal server error',
                error: 'Internal Server Error',
            });
        }
        else {
            writeErrorLog(`[UnhandledException] Unknown error: ${JSON.stringify(exception)}`);
            res.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
                statusCode: common_1.HttpStatus.INTERNAL_SERVER_ERROR,
                message: 'Internal server error',
                error: 'Internal Server Error',
            });
        }
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = __decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);
process.on('uncaughtException', (error) => {
    writeErrorLog(`[Process-uncaughtException] ${error.message}\n${error.stack}`);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    const msg = reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason);
    writeErrorLog(`[Process-unhandledRejection] ${msg}`);
});
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });
    app.useGlobalFilters(new AllExceptionsFilter());
    const allowedOrigins = process.env.ALLOWED_ORIGINS;
    const isDev = process.env.NODE_ENV !== 'production';
    const defaultOrigins = isDev
        ? ['https://www.casagrade.com', 'https://casagrade.com', 'https://api.casagrade.com', 'http://localhost:3005', 'http://localhost:8080']
        : ['https://www.casagrade.com', 'https://casagrade.com', 'https://api.casagrade.com'];
    const origins = allowedOrigins
        ? allowedOrigins.split(',').map((s) => s.trim()).filter(Boolean)
        : defaultOrigins;
    app.enableCors({ origin: origins, credentials: true });
    app.setGlobalPrefix('api');
    const port = process.env.PORT || 3000;
    await app.listen(port);
    logger.log(`🚀 Lottery API running on http://localhost:${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map