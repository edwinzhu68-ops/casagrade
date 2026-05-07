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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MerchantController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MerchantController = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const user_entity_1 = require("../../entities/user.entity");
const shop_entity_1 = require("../../entities/shop.entity");
const shop_binding_entity_1 = require("../../entities/shop-binding.entity");
const card_code_entity_1 = require("../../entities/card-code.entity");
const order_entity_1 = require("../../entities/order.entity");
const draw_entity_1 = require("../../entities/draw.entity");
const session_entity_1 = require("../../entities/session.entity");
const draw_queries_1 = require("../../utils/draw-queries");
const local_lottery_service_1 = require("../local-lottery/local-lottery.service");
const crypto = __importStar(require("crypto"));
const bcrypt = __importStar(require("bcryptjs"));
const nodemailer = __importStar(require("nodemailer"));
const loginFailMap = new Map();
const LOGIN_MAX_FAIL = 10;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const cardFailMap = new Map();
const CARD_MAX_FAIL = 5;
const CARD_LOCKOUT_MS = 30 * 60 * 1000;
const forgotPwMap = new Map();
const FORGOT_PW_MAX_PER_HOUR = 3;
const FORGOT_PW_WINDOW_MS = 60 * 60 * 1000;
const registerMap = new Map();
const REGISTER_MAX_PER_HOUR = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of loginFailMap) {
        if (entry.until < now)
            loginFailMap.delete(ip);
    }
    for (const [ip, entry] of cardFailMap) {
        if (entry.until < now)
            cardFailMap.delete(ip);
    }
    for (const [ip, entry] of forgotPwMap) {
        if (entry.resetAt < now)
            forgotPwMap.delete(ip);
    }
    for (const [ip, entry] of registerMap) {
        if (entry.resetAt < now)
            registerMap.delete(ip);
    }
}, 60 * 60 * 1000);
const TOKEN_SECRET = () => process.env.TOKEN_SECRET || 'lottery-token-secret-change-in-prod';
function createSignedToken(userId, accountNumber) {
    const payload = Buffer.from(`${userId}:${accountNumber}`).toString('base64');
    const sig = crypto.createHmac('sha256', TOKEN_SECRET()).update(payload).digest('hex').slice(0, 32);
    return `${payload}.${sig}`;
}
function parseSignedToken(token) {
    if (!token)
        return null;
    const lastDot = token.lastIndexOf('.');
    if (lastDot <= 0)
        return null;
    const payload = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);
    const expected = crypto.createHmac('sha256', TOKEN_SECRET()).update(payload).digest('hex').slice(0, 32);
    try {
        const sigBuf = Buffer.from(sig);
        const expBuf = Buffer.from(expected);
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf))
            return null;
    }
    catch {
        return null;
    }
    try {
        const decoded = Buffer.from(payload, 'base64').toString('utf8');
        const colonIdx = decoded.indexOf(':');
        if (colonIdx < 1)
            return null;
        const userId = parseInt(decoded.slice(0, colonIdx), 10);
        const accountNumber = decoded.slice(colonIdx + 1);
        if (!userId || isNaN(userId))
            return null;
        return { userId, accountNumber, signed: true };
    }
    catch {
        return null;
    }
}
async function findShopByNumber(shopRepo, number) {
    const byPrimary = await shopRepo.findOne({ where: { shop_number: number } });
    if (byPrimary)
        return byPrimary;
    const safe = number.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    return shopRepo
        .createQueryBuilder('s')
        .where(`s.shop_aliases LIKE :pattern`, { pattern: `%"${safe}"%` })
        .getOne() ?? null;
}
const MAX_SESSIONS = 3;
let MerchantController = MerchantController_1 = class MerchantController {
    constructor(dataSource, localLotteryService) {
        this.dataSource = dataSource;
        this.localLotteryService = localLotteryService;
        this.logger = new common_1.Logger(MerchantController_1.name);
    }
    async onModuleInit() {
        const qr = this.dataSource.createQueryRunner();
        for (const sql of [
            `ALTER TABLE users ADD COLUMN session_token VARCHAR(64)`,
            `ALTER TABLE users ADD COLUMN last_login_at DATETIME`,
            `ALTER TABLE users ADD COLUMN last_login_ua VARCHAR(512)`,
            `ALTER TABLE users ADD COLUMN device_id VARCHAR(64)`,
        ]) {
            try {
                await qr.query(sql);
            }
            catch { }
        }
        await qr.release();
    }
    async verifySession(req, userId) {
        const headerToken = (req.headers?.['x-session-token'] || '').toString().trim();
        if (!headerToken) {
            throw new common_1.UnauthorizedException('SESSION_EXPIRED');
        }
        const sessionRepo = this.dataSource.getRepository(session_entity_1.Session);
        const session = await sessionRepo.findOne({ where: { user_id: userId, token: headerToken } });
        if (session) {
            try {
                session.last_active = new Date();
                await sessionRepo.save(session);
            }
            catch { }
            return;
        }
        const user = await this.dataSource.getRepository(user_entity_1.User).findOne({ where: { user_id: userId } });
        if (user?.session_token && user.session_token === headerToken) {
            return;
        }
        throw new common_1.UnauthorizedException('SESSION_EXPIRED');
    }
    async register(dto, req) {
        const ip = (req?.headers?.['x-forwarded-for'] || req?.ip || 'unknown').toString().split(',')[0].trim();
        const now = Date.now();
        const entry = registerMap.get(ip);
        if (entry && entry.resetAt > now) {
            if (entry.count >= REGISTER_MAX_PER_HOUR) {
                throw new common_1.BadRequestException('注册过于频繁，请 1 小时后再试');
            }
            entry.count++;
        }
        else {
            registerMap.set(ip, { count: 1, resetAt: now + REGISTER_WINDOW_MS });
        }
        const account = (dto.account || dto.accountNumber || '').trim().toLowerCase();
        const password = dto.password || '';
        const passwordConfirm = dto.passwordConfirm ?? dto.password;
        const shopName = (dto.shop_name || '').trim() || null;
        const email = (dto.email || '').trim() || null;
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new common_1.BadRequestException('邮箱格式不正确');
        }
        if (!account || account.length < 4 || account.length > 32) {
            throw new common_1.BadRequestException('账号为4-32位字母或数字');
        }
        if (!/^[A-Za-z0-9]+$/.test(account)) {
            throw new common_1.BadRequestException('账号只能包含字母或数字');
        }
        if (/^\d+$/.test(account)) {
            throw new common_1.BadRequestException('账号不能为纯数字，纯数字保留为店号');
        }
        if (password.length < 6) {
            throw new common_1.BadRequestException('密码至少6位');
        }
        if (!/^[A-Za-z0-9]+$/.test(password) || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
            throw new common_1.BadRequestException('密码只能包含字母和数字，且必须同时包含字母和数字');
        }
        if (password !== passwordConfirm) {
            throw new common_1.BadRequestException('两次密码不一致');
        }
        const userRepo = this.dataSource.getRepository(user_entity_1.User);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const existing = await userRepo.findOne({ where: { account_number: account } });
        if (existing) {
            throw new common_1.BadRequestException('该账号无法注册，请尝试其他账号');
        }
        const deviceId = (dto.device_id || '').trim() || null;
        if (deviceId) {
            const deviceExisting = await userRepo.findOne({ where: { device_id: deviceId } });
            if (deviceExisting) {
                throw new common_1.BadRequestException(`此设备已注册账号，一台设备仅限注册一个账号。如忘记密码请联系客服。`);
            }
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const user = userRepo.create({
            account_number: account,
            password_hash: passwordHash,
            role: 'merchant',
            email,
            device_id: deviceId,
        });
        await userRepo.save(user);
        const allShops = await shopRepo.find({ select: ['shop_number'] });
        const taken = new Set(allShops.map(s => s.shop_number));
        let shopNumber = null;
        for (const len of [3, 4, 5, 6, 7, 8, 9]) {
            const min = Math.pow(10, len - 1);
            const max = Math.pow(10, len) - 1;
            const available = [];
            for (let n = min; n <= max; n++) {
                const sn = String(n);
                if (/^(.)\1+$/.test(sn))
                    continue;
                if (!taken.has(sn))
                    available.push(n);
            }
            if (available.length > 0) {
                shopNumber = String(available[Math.floor(Math.random() * available.length)]);
                break;
            }
        }
        if (!shopNumber) {
            throw new common_1.BadRequestException('暂无可用的随机店号，请稍后再试或联系管理员分配');
        }
        const trialExpires = new Date();
        trialExpires.setDate(trialExpires.getDate() + 30);
        const newShop = shopRepo.create({
            shop_number: shopNumber,
            owner_id: user.user_id,
            shop_name: shopName || `店铺${shopNumber}`,
            status: 'active',
            commission_rate: 0.1,
            subscription_expires_at: trialExpires,
        });
        await shopRepo.save(newShop);
        this.logger.log(`注册: 账号=${account}, 店号=${shopNumber}, 试用到期=${trialExpires.toISOString().slice(0, 10)}`);
        return {
            success: true,
            message: '注册成功，免费试用30天。可用账号或店号登录，密码相同。',
            accountNumber: account,
            shopNumber,
            trialExpiresAt: trialExpires.toISOString().slice(0, 10),
        };
    }
    async forgotPassword(body, req) {
        const email = (body.email || '').trim().toLowerCase();
        if (!email)
            throw new common_1.BadRequestException('请输入邮箱');
        const ip = (req?.headers?.['x-forwarded-for'] || req?.ip || 'unknown').toString().split(',')[0].trim();
        const now = Date.now();
        const entry = forgotPwMap.get(ip);
        if (entry && entry.resetAt > now) {
            if (entry.count >= FORGOT_PW_MAX_PER_HOUR) {
                throw new common_1.BadRequestException('操作过于频繁，请 1 小时后再试');
            }
            entry.count++;
        }
        else {
            forgotPwMap.set(ip, { count: 1, resetAt: now + FORGOT_PW_WINDOW_MS });
        }
        const userRepo = this.dataSource.getRepository(user_entity_1.User);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const user = await userRepo.findOne({ where: { email } });
        if (!user) {
            return { success: true, message: '如邮箱已注册，新密码邮件已发送' };
        }
        const lowerChars = 'abcdefghjkmnpqrstuvwxyz';
        const upperChars = 'ABCDEFGHJKMNPQRSTUVWXYZ';
        const digitChars = '23456789';
        const allChars = lowerChars + upperChars + digitChars;
        const randByte = () => crypto.randomBytes(1)[0];
        const pick = (s) => s[randByte() % s.length];
        let newPassword = pick(upperChars) + pick(lowerChars) + pick(digitChars) + pick(digitChars);
        for (let i = 0; i < 8; i++)
            newPassword += pick(allChars);
        const arr = newPassword.split('');
        for (let i = arr.length - 1; i > 0; i--) {
            const j = randByte() % (i + 1);
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        newPassword = arr.join('');
        const passwordHash = await bcrypt.hash(newPassword, 10);
        user.password_hash = passwordHash;
        await userRepo.save(user);
        const shop = await shopRepo.findOne({ where: { owner_id: user.user_id } });
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: Number(process.env.SMTP_PORT) || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
        await transporter.sendMail({
            from: `"Lotería Sistema" <${process.env.SMTP_USER}>`,
            to: email,
            subject: 'Tu nueva contraseña - Sistema de Lotería',
            text: `Tu nueva contraseña temporal es: ${newPassword}\n\nCuenta: ${user.account_number}\nTienda: ${shop?.shop_number || '-'}\n\nCambia tu contraseña después de iniciar sesión.`,
            html: `<p>Tu nueva contraseña temporal es: <strong>${newPassword}</strong></p><p>Cuenta: ${user.account_number}<br>Tienda: ${shop?.shop_number || '-'}</p><p style="color:#888;font-size:12px">Cambia tu contraseña después de iniciar sesión.</p>`,
        });
        this.logger.log(`找回密码: 账号=${user.account_number}, 邮箱=${email}`);
        return { success: true, message: '如邮箱已注册，新密码邮件已发送' };
    }
    async login(dto, req) {
        const account = String(dto.account ?? dto.accountNumber ?? '').trim().toLowerCase();
        if (!account)
            throw new common_1.UnauthorizedException('请输入账号或店号');
        const ip = (req.headers?.['x-forwarded-for'] || req.ip || 'unknown').toString().split(',')[0].trim();
        const failEntry = loginFailMap.get(ip);
        if (failEntry && failEntry.count >= LOGIN_MAX_FAIL) {
            if (Date.now() < failEntry.until) {
                const remainMin = Math.ceil((failEntry.until - Date.now()) / 60000);
                throw new common_1.UnauthorizedException(`登录失败次数过多，请 ${remainMin} 分钟后再试`);
            }
            else {
                loginFailMap.delete(ip);
            }
        }
        const userRepo = this.dataSource.getRepository(user_entity_1.User);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        let user = await userRepo.createQueryBuilder('u')
            .where('LOWER(u.account_number) = :account', { account })
            .getOne();
        if (!user && /^\d{1,9}$/.test(account)) {
            const shop = await findShopByNumber(shopRepo, account);
            if (shop?.owner_id) {
                user = await userRepo.findOne({ where: { user_id: shop.owner_id } });
            }
        }
        if (!user) {
            throw new common_1.UnauthorizedException('账号不存在');
        }
        const stored = user.password_hash || '';
        const isBcrypt = /^\$2[aby]\$/.test(stored);
        let passwordOk = false;
        if (isBcrypt) {
            passwordOk = await bcrypt.compare(dto.password, stored);
        }
        else {
            const sha = crypto.createHash('sha256').update(dto.password).digest('hex');
            passwordOk = stored === sha || stored === dto.password;
        }
        if (!passwordOk) {
            const cur = loginFailMap.get(ip) ?? { count: 0, until: 0 };
            cur.count++;
            cur.until = Date.now() + LOGIN_LOCKOUT_MS;
            loginFailMap.set(ip, cur);
            throw new common_1.UnauthorizedException('密码错误');
        }
        loginFailMap.delete(ip);
        const sessionRepo = this.dataSource.getRepository(session_entity_1.Session);
        const ua = (req.headers?.['user-agent'] || '').slice(0, 200) || null;
        const deviceType = (dto.device_type || 'web').toLowerCase() === 'app' ? 'app' : 'web';
        const deviceName = dto.device_name || ua || deviceType;
        const existingSessions = await sessionRepo.find({
            where: { user_id: user.user_id },
            order: { created_at: 'ASC' },
        });
        if (existingSessions.length >= MAX_SESSIONS) {
            const toRemove = existingSessions.slice(0, existingSessions.length - MAX_SESSIONS + 1);
            await sessionRepo.remove(toRemove);
        }
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const newSession = sessionRepo.create({
            user_id: user.user_id,
            token: sessionToken,
            device_type: deviceType,
            device_name: deviceName,
            last_active: new Date(),
        });
        await sessionRepo.save(newSession);
        user.session_token = sessionToken;
        user.last_login_at = new Date();
        user.last_login_ua = ua;
        await userRepo.save(user);
        const token = createSignedToken(user.user_id, user.account_number);
        this.logger.log(`老板登录: ${user.account_number}, 设备: ${deviceType}, 角色: ${user.role}`);
        return {
            token,
            session_token: sessionToken,
            userId: user.user_id,
            accountNumber: user.account_number,
            role: user.role,
            last_login_at: user.last_login_at,
            last_login_ua: user.last_login_ua,
        };
    }
    async logout(req) {
        try {
            const { userId } = this.parseTokenFull(req);
            const sessionToken = (req.headers?.['x-session-token'] || '').trim();
            const sessionRepo = this.dataSource.getRepository(session_entity_1.Session);
            if (sessionToken) {
                await sessionRepo.delete({ user_id: userId, token: sessionToken });
            }
            try {
                await this.dataSource.getRepository(user_entity_1.User).update(userId, { session_token: null, updated_at: new Date() });
            }
            catch { }
        }
        catch { }
        return { success: true };
    }
    async getSessions(req) {
        const { userId } = this.parseTokenFull(req);
        const sessionRepo = this.dataSource.getRepository(session_entity_1.Session);
        const sessions = await sessionRepo.find({
            where: { user_id: userId },
            order: { created_at: 'DESC' },
        });
        const currentToken = (req.headers?.['x-session-token'] || '').trim();
        return sessions.map(s => ({
            session_id: s.session_id,
            device_type: s.device_type,
            device_name: s.device_name,
            created_at: s.created_at,
            is_current: s.token === currentToken,
        }));
    }
    async deleteSession(sessionId, req) {
        const { userId } = this.parseTokenFull(req);
        const sessionRepo = this.dataSource.getRepository(session_entity_1.Session);
        const session = await sessionRepo.findOne({
            where: { session_id: Number(sessionId), user_id: userId },
        });
        if (!session)
            throw new common_1.NotFoundException('会话不存在');
        await sessionRepo.remove(session);
        return { success: true };
    }
    async getShops(userId, req) {
        let userIdNum;
        let accountNumber = null;
        if (userId) {
            userIdNum = parseInt(userId, 10);
        }
        else {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
                throw new common_1.UnauthorizedException('请先登录');
            }
            const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
            if (!raw)
                throw new common_1.UnauthorizedException('无效的token');
            const parsed = parseSignedToken(raw);
            if (!parsed)
                throw new common_1.UnauthorizedException('无效或已过期的token，请重新登录');
            userIdNum = parsed.userId;
            accountNumber = parsed.accountNumber || null;
        }
        if (!userIdNum || isNaN(userIdNum)) {
            throw new common_1.UnauthorizedException('无效的用户ID');
        }
        await this.verifySession(req, userIdNum);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const userRepo = this.dataSource.getRepository(user_entity_1.User);
        let currentUser = null;
        if (!accountNumber) {
            currentUser = await userRepo.findOne({ where: { user_id: userIdNum } });
            if (currentUser?.account_number)
                accountNumber = currentUser.account_number.trim();
        }
        else {
            currentUser = await userRepo.findOne({ where: { user_id: userIdNum } });
        }
        if (accountNumber && /^\d{1,9}$/.test(accountNumber)) {
            const shopByNumber = await shopRepo.findOne({
                where: { shop_number: accountNumber },
            });
            if (shopByNumber && shopByNumber.owner_id === userIdNum) {
                return {
                    shops: [{
                            shop_id: shopByNumber.shop_id,
                            shop_number: shopByNumber.shop_number,
                            shop_name: shopByNumber.shop_name,
                            status: shopByNumber.status,
                            commission_rate: shopByNumber.commission_rate,
                            subscription_expires_at: shopByNumber.subscription_expires_at ?? null,
                            limit_chance: shopByNumber.limit_chance ?? null,
                            limit_billete: shopByNumber.limit_billete ?? null,
                            tica_limit_chance: shopByNumber.tica_limit_chance ?? null,
                            tica_limit_palet: shopByNumber.tica_limit_palet ?? null,
                            nica_limit_chance: shopByNumber.nica_limit_chance ?? null,
                            nica_limit_palet: shopByNumber.nica_limit_palet ?? null,
                            tica_custom_period: shopByNumber.tica_custom_period ?? null,
                            nica_custom_period: shopByNumber.nica_custom_period ?? null,
                            rate_billete_1: shopByNumber.rate_billete_1 ?? null,
                            rate_billete_2: shopByNumber.rate_billete_2 ?? null,
                            rate_billete_3: shopByNumber.rate_billete_3 ?? null,
                            rate_chance_1: shopByNumber.rate_chance_1 ?? null,
                            rate_chance_2: shopByNumber.rate_chance_2 ?? null,
                            rate_chance_3: shopByNumber.rate_chance_3 ?? null,
                            tica_chance_1: shopByNumber.tica_chance_1 ?? null,
                            tica_chance_2: shopByNumber.tica_chance_2 ?? null,
                            tica_chance_3: shopByNumber.tica_chance_3 ?? null,
                            loteria_enabled: shopByNumber.loteria_enabled !== false,
                            tica_enabled: !!shopByNumber.tica_enabled,
                            nica_enabled: !!shopByNumber.nica_enabled,
                            accepting_tica_orders: shopByNumber.accepting_tica_orders !== false,
                            accepting_nica_orders: shopByNumber.accepting_nica_orders !== false,
                        }],
                    last_login_at: currentUser?.last_login_at ?? null,
                    last_login_ua: currentUser?.last_login_ua ?? null,
                };
            }
        }
        let shops = await shopRepo.find({
            where: { owner_id: userIdNum },
            order: { shop_id: 'DESC' },
        });
        return {
            shops: shops.map(shop => ({
                shop_id: shop.shop_id,
                shop_number: shop.shop_number,
                shop_name: shop.shop_name,
                status: shop.status,
                commission_rate: shop.commission_rate,
                limit_chance: shop.limit_chance ?? null,
                limit_billete: shop.limit_billete ?? null,
                tica_limit_chance: shop.tica_limit_chance ?? null,
                tica_limit_palet: shop.tica_limit_palet ?? null,
                nica_limit_chance: shop.nica_limit_chance ?? null,
                nica_limit_palet: shop.nica_limit_palet ?? null,
                tica_custom_period: shop.tica_custom_period ?? null,
                nica_custom_period: shop.nica_custom_period ?? null,
                rate_billete_1: shop.rate_billete_1 ?? null,
                rate_billete_2: shop.rate_billete_2 ?? null,
                rate_billete_3: shop.rate_billete_3 ?? null,
                rate_chance_1: shop.rate_chance_1 ?? null,
                rate_chance_2: shop.rate_chance_2 ?? null,
                rate_chance_3: shop.rate_chance_3 ?? null,
                tica_chance_1: shop.tica_chance_1 ?? null,
                tica_chance_2: shop.tica_chance_2 ?? null,
                tica_chance_3: shop.tica_chance_3 ?? null,
                chain_1_2: shop.chain_1_2 ?? 1000,
                chain_1_3: shop.chain_1_3 ?? 1000,
                chain_2_1: shop.chain_2_1 ?? 0,
                chain_2_3: shop.chain_2_3 ?? 200,
                chain_3_1: shop.chain_3_1 ?? 0,
                chain_3_2: shop.chain_3_2 ?? 0,
                subscription_expires_at: shop.subscription_expires_at ?? null,
                loteria_enabled: shop.loteria_enabled !== false,
                tica_enabled: !!shop.tica_enabled,
                nica_enabled: !!shop.nica_enabled,
                accepting_tica_orders: shop.accepting_tica_orders !== false,
                accepting_nica_orders: shop.accepting_nica_orders !== false,
            })),
            last_login_at: currentUser?.last_login_at ?? null,
            last_login_ua: currentUser?.last_login_ua ?? null,
        };
    }
    async getShop(shopId) {
        const shop = await this.dataSource.getRepository(shop_entity_1.Shop).findOne({
            where: { shop_id: parseInt(shopId) },
        });
        if (!shop) {
            throw new common_1.NotFoundException('店铺不存在');
        }
        return {
            shop_id: shop.shop_id,
            shop_number: shop.shop_number,
            shop_name: shop.shop_name,
            status: shop.status,
            commission_rate: shop.commission_rate,
            single_bet_limit: shop.single_bet_limit,
            daily_bet_limit: shop.daily_bet_limit,
        };
    }
    async bindingRequest(body, req) {
        const { mainShopId, subShopNumber } = body;
        if (!mainShopId || !subShopNumber) {
            throw new common_1.BadRequestException('缺少参数');
        }
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const mainShop = await shopRepo.findOne({ where: { shop_id: Number(mainShopId) } });
        if (!mainShop)
            throw new common_1.NotFoundException('大庄店铺不存在');
        const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
        if (!tokenInfo)
            throw new common_1.UnauthorizedException('请先登录');
        if (mainShop.owner_id !== tokenInfo.userId) {
            throw new common_1.UnauthorizedException('无权操作该店铺');
        }
        const subShop = await shopRepo.findOne({ where: { shop_number: String(subShopNumber) } });
        if (!subShop)
            throw new common_1.NotFoundException('小庄不存在，请确认店号正确');
        if (mainShop.shop_id === subShop.shop_id) {
            throw new common_1.BadRequestException('不能绑定自己');
        }
        const existing = await bindingRepo.findOne({ where: { sub_shop_id: subShop.shop_id } });
        if (existing) {
            const newRate = (body.commissionRate !== undefined && body.commissionRate >= 0 && body.commissionRate <= 100)
                ? body.commissionRate / 100
                : existing.commission_rate ?? 0.20;
            if (existing.status === 'active')
                throw new common_1.BadRequestException('此店号已被绑定');
            if (existing.status === 'pending')
                throw new common_1.BadRequestException('该小庄已有待确认的绑定邀请');
            existing.main_shop_id = mainShop.shop_id;
            existing.status = 'pending';
            existing.commission_rate = newRate;
            await bindingRepo.save(existing);
            return { success: true, message: '绑定邀请已重新发送，等待小庄确认' };
        }
        const rate = (body.commissionRate !== undefined && body.commissionRate >= 0 && body.commissionRate <= 100)
            ? body.commissionRate / 100
            : 0.20;
        const binding = bindingRepo.create({
            main_shop_id: mainShop.shop_id,
            sub_shop_id: subShop.shop_id,
            commission_rate: rate,
            status: 'pending',
        });
        await bindingRepo.save(binding);
        this.logger.log(`大庄邀请绑定: 大庄=${mainShop.shop_number} → 小庄=${subShop.shop_number}`);
        return { success: true, message: '绑定邀请已发送，等待小庄确认' };
    }
    async bindingPending(shopId, req) {
        if (!shopId)
            throw new common_1.BadRequestException('缺少 shopId');
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
        if (!tokenInfo)
            throw new common_1.UnauthorizedException('请先登录');
        const subShop = await shopRepo.findOne({ where: { shop_id: Number(shopId) } });
        if (!subShop || subShop.owner_id !== tokenInfo.userId) {
            throw new common_1.UnauthorizedException('无权查看该店铺数据');
        }
        const pending = await bindingRepo.find({
            where: { sub_shop_id: Number(shopId), status: 'pending' },
            order: { created_at: 'ASC' },
        });
        const result = await Promise.all(pending.map(async (b) => {
            const main = await shopRepo.findOne({ where: { shop_id: b.main_shop_id } });
            return {
                binding_id: b.binding_id,
                main_shop_id: b.main_shop_id,
                main_shop_number: main?.shop_number ?? '',
                main_shop_name: main?.shop_name ?? '',
                commission_rate: Number(b.commission_rate),
                created_at: b.created_at,
            };
        }));
        return { pending: result };
    }
    async bindingSubRequest(body) {
        const { subShopId, mainShopNumber } = body;
        if (!subShopId || !mainShopNumber)
            throw new common_1.BadRequestException('缺少参数');
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const subShop = await shopRepo.findOne({ where: { shop_id: Number(subShopId) } });
        if (!subShop)
            throw new common_1.NotFoundException('小庄不存在');
        const mainShop = await findShopByNumber(shopRepo, String(mainShopNumber));
        if (!mainShop)
            throw new common_1.NotFoundException(`找不到店号 ${mainShopNumber}`);
        if (mainShop.shop_id === subShop.shop_id)
            throw new common_1.BadRequestException('不能绑定自己');
        const existing = await bindingRepo.findOne({ where: { sub_shop_id: subShop.shop_id } });
        if (existing) {
            if (existing.status === 'active')
                throw new common_1.BadRequestException('您已绑定大庄，请先解绑');
            if (existing.status === 'pending')
                throw new common_1.BadRequestException('已有待确认的申请，请等待大庄审批');
            existing.main_shop_id = mainShop.shop_id;
            existing.status = 'pending';
            existing.commission_rate = 0.20;
            await bindingRepo.save(existing);
            return { success: true, message: `申请已发送，等待大庄 ${mainShop.shop_number} 确认` };
        }
        const binding = bindingRepo.create({
            main_shop_id: mainShop.shop_id,
            sub_shop_id: subShop.shop_id,
            commission_rate: 0.20,
            status: 'pending',
        });
        await bindingRepo.save(binding);
        this.logger.log(`小庄申请绑定: 小庄=${subShop.shop_number} → 大庄=${mainShop.shop_number}`);
        return { success: true, message: `申请已发送，等待大庄 ${mainShop.shop_number} 确认` };
    }
    async bindingIncoming(mainShopId, req) {
        if (!mainShopId)
            throw new common_1.BadRequestException('缺少 mainShopId');
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
        if (!tokenInfo)
            throw new common_1.UnauthorizedException('请先登录');
        const mainShop = await shopRepo.findOne({ where: { shop_id: Number(mainShopId) } });
        if (!mainShop || mainShop.owner_id !== tokenInfo.userId) {
            throw new common_1.UnauthorizedException('无权查看该店铺数据');
        }
        const incoming = await bindingRepo.find({
            where: { main_shop_id: Number(mainShopId), status: 'pending' },
            order: { created_at: 'ASC' },
        });
        const result = await Promise.all(incoming.map(async (b) => {
            const sub = await shopRepo.findOne({ where: { shop_id: b.sub_shop_id } });
            return {
                binding_id: b.binding_id,
                sub_shop_id: b.sub_shop_id,
                sub_shop_number: sub?.shop_number ?? '',
                sub_shop_name: sub?.shop_name ?? '',
                commission_rate: Number(b.commission_rate),
                created_at: b.created_at,
            };
        }));
        return { incoming: result };
    }
    async bindingApprove(id, body, req) {
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const binding = await bindingRepo.findOne({ where: { binding_id: Number(id) } });
        if (!binding)
            throw new common_1.NotFoundException('绑定申请不存在');
        if (binding.status !== 'pending')
            throw new common_1.BadRequestException('该申请不是待审批状态');
        const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
        if (!tokenInfo)
            throw new common_1.UnauthorizedException('请先登录');
        const mainShop = await shopRepo.findOne({ where: { shop_id: binding.main_shop_id } });
        const subShop = await shopRepo.findOne({ where: { shop_id: binding.sub_shop_id } });
        const isMain = mainShop?.owner_id === tokenInfo.userId;
        const isSub = subShop?.owner_id === tokenInfo.userId;
        if (!isMain && !isSub)
            throw new common_1.UnauthorizedException('无权操作该绑定');
        binding.status = 'active';
        if (body.commission_rate !== undefined) {
            if (!isMain)
                throw new common_1.UnauthorizedException('仅大庄可修改佣金率');
            const rate = Number(body.commission_rate);
            if (rate < 0 || rate > 1)
                throw new common_1.BadRequestException('佣金率需在 0~1 之间');
            binding.commission_rate = rate;
        }
        await bindingRepo.save(binding);
        this.logger.log(`绑定审批通过: bindingId=${id}`);
        return { success: true, message: '已批准绑定申请' };
    }
    async bindingReject(id, req) {
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const binding = await bindingRepo.findOne({ where: { binding_id: Number(id) } });
        if (!binding)
            throw new common_1.NotFoundException('绑定申请不存在');
        if (binding.status !== 'pending')
            throw new common_1.BadRequestException('该申请不是待审批状态');
        const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
        if (!tokenInfo)
            throw new common_1.UnauthorizedException('请先登录');
        const mainShop = await shopRepo.findOne({ where: { shop_id: binding.main_shop_id } });
        const subShop = await shopRepo.findOne({ where: { shop_id: binding.sub_shop_id } });
        const isMain = mainShop?.owner_id === tokenInfo.userId;
        const isSub = subShop?.owner_id === tokenInfo.userId;
        if (!isMain && !isSub)
            throw new common_1.UnauthorizedException('无权操作该绑定');
        binding.status = 'rejected';
        await bindingRepo.save(binding);
        this.logger.log(`绑定拒绝: bindingId=${id}`);
        return { success: true, message: '已拒绝绑定申请' };
    }
    async bindingDelete(id, req) {
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const binding = await bindingRepo.findOne({ where: { binding_id: Number(id) } });
        if (!binding)
            throw new common_1.NotFoundException('绑定关系不存在');
        const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
        if (!tokenInfo)
            throw new common_1.UnauthorizedException('请先登录');
        const mainShop = await shopRepo.findOne({ where: { shop_id: binding.main_shop_id } });
        const subShop = await shopRepo.findOne({ where: { shop_id: binding.sub_shop_id } });
        const isMain = mainShop?.owner_id === tokenInfo.userId;
        const isSub = subShop?.owner_id === tokenInfo.userId;
        if (!isMain && !isSub)
            throw new common_1.UnauthorizedException('无权解除该绑定');
        await bindingRepo.remove(binding);
        this.logger.log(`解绑: bindingId=${id}`);
        return { success: true, message: '已解绑' };
    }
    async bindingSetCommission(id, body, req) {
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const binding = await bindingRepo.findOne({ where: { binding_id: Number(id) } });
        if (!binding)
            throw new common_1.NotFoundException('绑定关系不存在');
        if (binding.status !== 'active')
            throw new common_1.BadRequestException('绑定关系未激活');
        const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
        if (!tokenInfo)
            throw new common_1.UnauthorizedException('请先登录');
        const mainShop = await shopRepo.findOne({ where: { shop_id: binding.main_shop_id } });
        if (!mainShop || mainShop.owner_id !== tokenInfo.userId)
            throw new common_1.UnauthorizedException('无权修改该绑定佣金率');
        const rate = Number(body.commission_rate);
        if (isNaN(rate) || rate < 0 || rate > 1)
            throw new common_1.BadRequestException('佣金率需在 0~1 之间');
        binding.commission_rate = rate;
        await bindingRepo.save(binding);
        return { success: true, commission_rate: rate };
    }
    async myBinding(shopId, req) {
        if (!shopId)
            throw new common_1.BadRequestException('缺少 shopId');
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
        if (!tokenInfo)
            throw new common_1.UnauthorizedException('请先登录');
        const subShop = await shopRepo.findOne({ where: { shop_id: Number(shopId) } });
        if (!subShop || subShop.owner_id !== tokenInfo.userId) {
            throw new common_1.UnauthorizedException('无权查看该店铺数据');
        }
        const binding = await bindingRepo.findOne({ where: { sub_shop_id: Number(shopId) } });
        if (!binding)
            return { binding: null };
        const mainShop = await shopRepo.findOne({ where: { shop_id: binding.main_shop_id } });
        return {
            binding: {
                binding_id: binding.binding_id,
                status: binding.status,
                commission_rate: Number(binding.commission_rate),
                main_shop_id: binding.main_shop_id,
                main_shop_number: mainShop?.shop_number ?? '',
                main_shop_name: mainShop?.shop_name ?? '',
            },
        };
    }
    async batchCreateSubs(body, req) {
        const { mainShopId, count, password, adminOverride } = body;
        if (!mainShopId)
            throw new common_1.BadRequestException('缺少 mainShopId');
        const isAdmin = adminOverride && !!req.headers?.['x-admin-token'];
        const n = isAdmin
            ? Math.max(parseInt(String(count)) || 1, 1)
            : Math.min(Math.max(parseInt(String(count)) || 1, 1), 10);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const userRepo = this.dataSource.getRepository(user_entity_1.User);
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const mainShop = await shopRepo.findOne({ where: { shop_id: Number(mainShopId) } });
        if (!mainShop)
            throw new common_1.NotFoundException('大庄店铺不存在');
        if (!isAdmin) {
            const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
            if (!tokenInfo)
                throw new common_1.UnauthorizedException('请先登录');
            if (mainShop.owner_id !== tokenInfo.userId)
                throw new common_1.UnauthorizedException('无权操作该店铺');
        }
        if (password != null && String(password).trim() !== '') {
            const trimmed = String(password).trim();
            if (trimmed.length < 6 || !/[A-Za-z]/.test(trimmed) || !/\d/.test(trimmed)) {
                throw new common_1.BadRequestException('密码需 6+ 位，且同时包含字母和数字');
            }
        }
        const allShops = await shopRepo.find({ select: ['shop_number'] });
        const usedShopNumbers = new Set(allShops.map(s => s.shop_number));
        const allUsers = await userRepo.find({ select: ['account_number'] });
        const usedAccounts = new Set(allUsers.map(u => u.account_number));
        const allExistingNums = allShops
            .map(s => parseInt(s.shop_number, 10))
            .filter(n => n >= 10000 && !isNaN(n));
        let next = allExistingNums.length > 0 ? Math.max(...allExistingNums) + 1 : 10000;
        const created = [];
        for (let i = 0; i < n; i++) {
            while (usedShopNumbers.has(String(next)) || usedAccounts.has(String(next)))
                next++;
            if (next > 9999999999)
                throw new common_1.BadRequestException('店号已用尽');
            const shopNumber = String(next);
            const accountNumber = shopNumber;
            const customPwd = (password || '').trim();
            const pwd = customPwd || (() => {
                const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                let s = '';
                for (let i = 0; i < 8; i++)
                    s += chars[Math.floor(Math.random() * chars.length)];
                return s;
            })();
            const passwordHash = await bcrypt.hash(pwd, 10);
            const user = userRepo.create({ account_number: accountNumber, password_hash: passwordHash });
            await userRepo.save(user);
            const shop = shopRepo.create({
                shop_number: shopNumber,
                owner_id: user.user_id,
                shop_name: `小庄${shopNumber}`,
                status: 'active',
                commission_rate: 0.1,
            });
            await shopRepo.save(shop);
            const binding = bindingRepo.create({
                main_shop_id: mainShop.shop_id,
                sub_shop_id: shop.shop_id,
                commission_rate: 0.20,
                status: 'active',
            });
            await bindingRepo.save(binding);
            usedShopNumbers.add(shopNumber);
            usedAccounts.add(accountNumber);
            created.push({ shopNumber, account: accountNumber, password: pwd });
            next++;
        }
        this.logger.log(`大庄批量注册小庄: 大庄=${mainShop.shop_number} 创建${n}个 [${created.map(c => c.shopNumber).join(',')}]`);
        return { success: true, created, count: created.length };
    }
    async subShops(mainShopId, req) {
        if (!mainShopId)
            throw new common_1.BadRequestException('缺少 mainShopId');
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
        if (!tokenInfo)
            throw new common_1.UnauthorizedException('请先登录');
        const mainShop = await shopRepo.findOne({ where: { shop_id: Number(mainShopId) } });
        if (!mainShop || mainShop.owner_id !== tokenInfo.userId) {
            throw new common_1.UnauthorizedException('无权查看该店铺数据');
        }
        const bindings = await bindingRepo.find({
            where: { main_shop_id: Number(mainShopId), status: 'active' },
            order: { created_at: 'ASC' },
        });
        const result = await Promise.all(bindings.map(async (b) => {
            const sub = await shopRepo.findOne({ where: { shop_id: b.sub_shop_id } });
            return {
                binding_id: b.binding_id,
                sub_shop_id: b.sub_shop_id,
                sub_shop_number: sub?.shop_number ?? '',
                sub_shop_name: sub?.shop_name ?? '',
                commission_rate: Number(b.commission_rate),
            };
        }));
        return { sub_shops: result };
    }
    async subShopData(mainShopId, drawId, lotteryKind, req) {
        if (!mainShopId)
            throw new common_1.BadRequestException('缺少 mainShopId');
        const kind = (lotteryKind || 'NACIONAL').toString().toUpperCase();
        if (kind !== 'NACIONAL' && kind !== 'TICA' && kind !== 'NICA') {
            throw new common_1.BadRequestException('无效的 lotteryKind');
        }
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
        if (!tokenInfo)
            throw new common_1.UnauthorizedException('请先登录');
        const mainShopAuth = await shopRepo.findOne({ where: { shop_id: Number(mainShopId) } });
        if (!mainShopAuth || mainShopAuth.owner_id !== tokenInfo.userId) {
            throw new common_1.UnauthorizedException('无权查看该店铺数据');
        }
        const bindings = await bindingRepo.find({
            where: { main_shop_id: Number(mainShopId), status: 'active' },
        });
        const emptyPayload = (drawIdVal, st, dt) => ({
            draw_id: drawIdVal,
            draw_status: st,
            draw_date: dt,
            lottery_kind: kind,
            sub_shops: [],
            summary: { total_sales: 0, total_commission_paid: 0, main_total_net: 0 },
        });
        if (bindings.length === 0)
            return emptyPayload(null, 'pending', null);
        const subShopIds = bindings.map(b => b.sub_shop_id);
        let targetDrawId = null;
        let drawStatus = 'pending';
        let drawDate = null;
        let allOrders = [];
        const periodDrawBySub = new Map();
        if (kind === 'NACIONAL') {
            if (drawId && Number(drawId) > 0) {
                targetDrawId = Number(drawId);
                const dr = await drawRepo.findOne({ where: { draw_id: targetDrawId } });
                drawStatus = dr?.status ?? 'pending';
                drawDate = dr?.draw_date ?? null;
            }
            else {
                const completed = await (0, draw_queries_1.findNationalLastCompletedDraw)(drawRepo);
                if (completed) {
                    const base = new Date(typeof completed.draw_date === 'string'
                        ? completed.draw_date + 'T09:00:00'
                        : completed.draw_date);
                    const archiveAt = new Date(base);
                    archiveAt.setDate(archiveAt.getDate() + 1);
                    archiveAt.setHours(9, 0, 0, 0);
                    const shouldArchive = completed.main_shop_archived || new Date() >= archiveAt;
                    if (!shouldArchive) {
                        targetDrawId = completed.draw_id;
                        drawStatus = 'completed';
                        drawDate = completed.draw_date ?? null;
                    }
                    else {
                        const pending = await (0, draw_queries_1.findNationalPendingDraw)(drawRepo);
                        if (pending) {
                            targetDrawId = pending.draw_id;
                            drawStatus = 'pending';
                            drawDate = pending.draw_date ?? null;
                        }
                    }
                }
                else {
                    const pending = await (0, draw_queries_1.findNationalPendingDraw)(drawRepo);
                    if (pending) {
                        targetDrawId = pending.draw_id;
                        drawStatus = 'pending';
                        drawDate = pending.draw_date ?? null;
                    }
                }
            }
            allOrders = await orderRepo.find({
                where: {
                    shop_id: (0, typeorm_1.In)(subShopIds),
                    ...(targetDrawId ? { draw_id: targetDrawId } : {}),
                    status: (0, typeorm_1.In)([1, 2, 3]),
                },
                select: ['order_id', 'shop_id', 'draw_id', 'amount', 'win_amount', 'status', 'lottery_type'],
            });
            allOrders = allOrders.filter(o => {
                const lt = String(o.lottery_type ?? 'NACIONAL').toUpperCase();
                return lt === 'NACIONAL' || lt === '' || lt === 'NULL';
            });
        }
        else {
            const localKind = kind;
            let mainPeriod = null;
            try {
                mainPeriod = await this.localLotteryService.ensureShopPendingDraw(Number(mainShopId), localKind, true);
            }
            catch {
                mainPeriod = null;
            }
            targetDrawId = mainPeriod?.draw_id ?? null;
            drawStatus = mainPeriod?.status || 'pending';
            drawDate = mainPeriod?.draw_date ?? null;
            await Promise.all(bindings.map(async (b) => {
                try {
                    const d = await this.localLotteryService.ensureShopPendingDraw(b.sub_shop_id, localKind, true);
                    periodDrawBySub.set(b.sub_shop_id, d.draw_id);
                }
                catch {
                    periodDrawBySub.set(b.sub_shop_id, null);
                }
            }));
            const raw = await orderRepo.find({
                where: {
                    shop_id: (0, typeorm_1.In)(subShopIds),
                    lottery_type: localKind,
                    status: (0, typeorm_1.In)([1, 2, 3]),
                },
                select: ['order_id', 'shop_id', 'draw_id', 'amount', 'win_amount', 'status', 'lottery_type'],
            });
            allOrders = raw.filter(o => periodDrawBySub.get(o.shop_id) != null && o.draw_id === periodDrawBySub.get(o.shop_id));
        }
        const [subShops] = await Promise.all([shopRepo.find({ where: { shop_id: (0, typeorm_1.In)(subShopIds) } })]);
        const subShopMap = new Map(subShops.map(s => [s.shop_id, s]));
        const ordersByShop = new Map();
        for (const o of allOrders) {
            if (!ordersByShop.has(o.shop_id))
                ordersByShop.set(o.shop_id, []);
            ordersByShop.get(o.shop_id).push(o);
        }
        const result = bindings.map(b => {
            const sub = subShopMap.get(b.sub_shop_id);
            const validOrders = ordersByShop.get(b.sub_shop_id) ?? [];
            const totalSales = validOrders.reduce((sum, o) => sum + Number(o.amount), 0);
            const totalPayout = validOrders.reduce((sum, o) => sum + Number(o.win_amount || 0), 0);
            const commissionRate = Number(b.commission_rate);
            const xiaozhuangCommission = totalSales * commissionRate;
            const dazhuangNet = totalSales * (1 - commissionRate) - totalPayout;
            const pd = kind === 'NACIONAL' ? targetDrawId : periodDrawBySub.get(b.sub_shop_id) ?? null;
            return {
                binding_id: b.binding_id,
                sub_shop_id: b.sub_shop_id,
                sub_shop_number: sub?.shop_number ?? '',
                sub_shop_name: sub?.shop_name ?? '',
                commission_rate: commissionRate,
                total_sales: Math.round(totalSales * 100) / 100,
                total_payout: Math.round(totalPayout * 100) / 100,
                sub_commission: Math.round(xiaozhuangCommission * 100) / 100,
                main_net_profit: Math.round(dazhuangNet * 100) / 100,
                order_count: validOrders.length,
                period_draw_id: pd,
            };
        });
        const totalMainNet = result.reduce((s, r) => s + r.main_net_profit, 0);
        const totalSalesAll = result.reduce((s, r) => s + r.total_sales, 0);
        const totalCommission = result.reduce((s, r) => s + r.sub_commission, 0);
        return {
            draw_id: targetDrawId,
            draw_status: drawStatus,
            draw_date: drawDate,
            lottery_kind: kind,
            sub_shops: result,
            summary: {
                total_sales: Math.round(totalSalesAll * 100) / 100,
                total_commission_paid: Math.round(totalCommission * 100) / 100,
                main_total_net: Math.round(totalMainNet * 100) / 100,
            },
        };
    }
    async bindingHistory(mainShopId, limit, lotteryKind, req) {
        if (!mainShopId)
            throw new common_1.BadRequestException('缺少 mainShopId');
        const kind = (lotteryKind || 'NACIONAL').toString().toUpperCase();
        if (kind !== 'NACIONAL' && kind !== 'TICA' && kind !== 'NICA') {
            throw new common_1.BadRequestException('无效的 lotteryKind');
        }
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
        if (!tokenInfo)
            throw new common_1.UnauthorizedException('请先登录');
        const mainShopAuth = await shopRepo.findOne({ where: { shop_id: Number(mainShopId) } });
        if (!mainShopAuth || mainShopAuth.owner_id !== tokenInfo.userId) {
            throw new common_1.UnauthorizedException('无权查看该店铺数据');
        }
        const bindings = await bindingRepo.find({
            where: { main_shop_id: Number(mainShopId), status: 'active' },
        });
        if (bindings.length === 0)
            return { history: [], lottery_kind: kind };
        const subShopIds = bindings.map(b => b.sub_shop_id);
        const commissionRateMap = new Map(bindings.map(b => [b.sub_shop_id, Number(b.commission_rate)]));
        const lim = Number(limit) || 20;
        if (kind === 'NACIONAL') {
            const completedDraws = await drawRepo.find({
                where: {
                    status: (0, typeorm_1.In)(['completed', 'COMPLETED']),
                    archived_at: (0, typeorm_1.Not)((0, typeorm_1.IsNull)()),
                    shop_id: (0, typeorm_1.IsNull)(),
                },
                order: { draw_id: 'DESC' },
                take: lim,
            });
            if (completedDraws.length === 0)
                return { history: [], lottery_kind: kind };
            const drawIds = completedDraws.map(d => d.draw_id);
            let allHistoryOrders = await orderRepo.find({
                where: {
                    draw_id: (0, typeorm_1.In)(drawIds),
                    shop_id: (0, typeorm_1.In)(subShopIds),
                    status: (0, typeorm_1.In)([1, 2, 3]),
                },
                select: ['shop_id', 'draw_id', 'amount', 'win_amount', 'status', 'lottery_type'],
            });
            allHistoryOrders = allHistoryOrders.filter(o => {
                const lt = String(o.lottery_type ?? 'NACIONAL').toUpperCase();
                return lt === 'NACIONAL' || lt === '' || lt === 'NULL';
            });
            const ordersByDraw = new Map();
            for (const o of allHistoryOrders) {
                if (!ordersByDraw.has(o.draw_id))
                    ordersByDraw.set(o.draw_id, []);
                ordersByDraw.get(o.draw_id).push(o);
            }
            const history = completedDraws.map(draw => {
                const validOrders = ordersByDraw.get(draw.draw_id) ?? [];
                const totalSales = validOrders.reduce((s, o) => s + Number(o.amount), 0);
                const totalPayout = validOrders.reduce((s, o) => s + Number(o.win_amount || 0), 0);
                let totalCommission = 0;
                for (const o of validOrders) {
                    const rate = commissionRateMap.get(o.shop_id) ?? 0;
                    totalCommission += Number(o.amount) * rate;
                }
                const mainNet = totalSales - totalPayout - totalCommission;
                return {
                    draw_id: draw.draw_id,
                    draw_date: draw.draw_date,
                    total_sales: Math.round(totalSales * 100) / 100,
                    total_payout: Math.round(totalPayout * 100) / 100,
                    total_commission: Math.round(totalCommission * 100) / 100,
                    main_net_profit: Math.round(mainNet * 100) / 100,
                    order_count: validOrders.length,
                };
            });
            return { history, lottery_kind: kind };
        }
        const localKind = kind;
        const localDraws = await drawRepo.find({
            where: {
                shop_id: (0, typeorm_1.In)(subShopIds),
                lottery_type: localKind,
                status: (0, typeorm_1.In)(['completed', 'COMPLETED']),
                archived_at: (0, typeorm_1.Not)((0, typeorm_1.IsNull)()),
            },
            order: { draw_id: 'DESC' },
            take: Math.min(Math.max(lim * 8, lim), 300),
        });
        const history = [];
        for (const draw of localDraws) {
            if (history.length >= lim)
                break;
            const validOrders = await orderRepo.find({
                where: {
                    draw_id: draw.draw_id,
                    shop_id: draw.shop_id,
                    lottery_type: localKind,
                    status: (0, typeorm_1.In)([1, 2, 3]),
                },
                select: ['shop_id', 'draw_id', 'amount', 'win_amount', 'status'],
            });
            if (!validOrders.length)
                continue;
            const totalSales = validOrders.reduce((s, o) => s + Number(o.amount), 0);
            const totalPayout = validOrders.reduce((s, o) => s + Number(o.win_amount || 0), 0);
            let totalCommission = 0;
            for (const o of validOrders) {
                const rate = commissionRateMap.get(o.shop_id) ?? 0;
                totalCommission += Number(o.amount) * rate;
            }
            const mainNet = totalSales - totalPayout - totalCommission;
            history.push({
                draw_id: draw.draw_id,
                draw_date: draw.draw_date,
                sub_shop_id: draw.shop_id,
                total_sales: Math.round(totalSales * 100) / 100,
                total_payout: Math.round(totalPayout * 100) / 100,
                total_commission: Math.round(totalCommission * 100) / 100,
                main_net_profit: Math.round(mainNet * 100) / 100,
                order_count: validOrders.length,
            });
        }
        return { history, lottery_kind: kind };
    }
    async bindingPendingCount(shopId) {
        if (!shopId)
            return { count: 0 };
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const count = await bindingRepo.count({
            where: { sub_shop_id: Number(shopId), status: 'pending' },
        });
        return { count };
    }
    async activateCard(shopId, code, req) {
        const normalizedCode = (code || '').trim().toUpperCase();
        if (!shopId)
            throw new common_1.BadRequestException('缺少 shopId');
        if (!normalizedCode)
            throw new common_1.BadRequestException('请输入卡密');
        const ip = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
        const cardFail = cardFailMap.get(ip);
        if (cardFail && cardFail.count >= CARD_MAX_FAIL && Date.now() < cardFail.until) {
            const mins = Math.ceil((cardFail.until - Date.now()) / 60000);
            throw new common_1.BadRequestException(`尝试次数过多，请 ${mins} 分钟后再试`);
        }
        const CARD_DAYS = { monthly: 30, half_yearly: 180, yearly: 365 };
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const shop = await shopRepo.findOne({ where: { shop_id: Number(shopId) } });
        if (!shop)
            throw new common_1.NotFoundException('店铺不存在');
        let resultBase;
        let cardType;
        try {
            resultBase = await this.dataSource.transaction(async (manager) => {
                const card = await manager.findOne(card_code_entity_1.CardCode, { where: { code: normalizedCode } });
                if (!card) {
                    throw new common_1.BadRequestException('__CARD_NOT_FOUND__');
                }
                cardType = card.type;
                const claim = await manager.createQueryBuilder()
                    .update(card_code_entity_1.CardCode)
                    .set({ used_by_shop_id: shop.shop_id, used_at: new Date() })
                    .where('id = :id AND used_at IS NULL', { id: card.id })
                    .execute();
                if (!claim.affected) {
                    throw new common_1.BadRequestException('__CARD_USED__');
                }
                const freshShop = await manager.findOne(shop_entity_1.Shop, { where: { shop_id: shop.shop_id } });
                const now = new Date();
                const base = freshShop?.subscription_expires_at && freshShop.subscription_expires_at > now
                    ? new Date(freshShop.subscription_expires_at)
                    : now;
                base.setDate(base.getDate() + (CARD_DAYS[card.type] || 30));
                await manager.update(shop_entity_1.Shop, shop.shop_id, { subscription_expires_at: base });
                return base;
            });
        }
        catch (err) {
            const msg = String(err?.message || '');
            if (msg === '__CARD_NOT_FOUND__' || msg === '__CARD_USED__') {
                const entry = cardFailMap.get(ip) || { count: 0, until: 0 };
                entry.count += 1;
                if (entry.count >= CARD_MAX_FAIL)
                    entry.until = Date.now() + CARD_LOCKOUT_MS;
                cardFailMap.set(ip, entry);
                throw new common_1.BadRequestException(msg === '__CARD_NOT_FOUND__' ? '卡密不存在' : '该卡密已被使用');
            }
            throw err;
        }
        cardFailMap.delete(ip);
        this.logger.log(`卡密激活成功：code=${normalizedCode} shop=${shop.shop_number} expires=${resultBase.toISOString().slice(0, 10)}`);
        return {
            success: true,
            type: cardType,
            subscription_expires_at: resultBase,
            message: `激活成功，到期日：${resultBase.toISOString().slice(0, 10)}`,
        };
    }
    parseTokenUserId(req) {
        const authHeader = req.headers?.authorization;
        if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
            throw new common_1.UnauthorizedException('请先登录');
        }
        const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
        if (!raw)
            throw new common_1.UnauthorizedException('无效的token');
        const parsed = parseSignedToken(raw);
        if (!parsed)
            throw new common_1.UnauthorizedException('无效或已过期的token，请重新登录');
        return parsed.userId;
    }
    parseTokenFull(req) {
        const authHeader = req.headers?.authorization;
        if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
            throw new common_1.UnauthorizedException('请先登录');
        }
        const raw = authHeader.replace(/^\s*bearer\s+/i, '').trim();
        if (!raw)
            throw new common_1.UnauthorizedException('无效的token');
        const parsed = parseSignedToken(raw);
        if (!parsed)
            throw new common_1.UnauthorizedException('无效或已过期的token，请重新登录');
        return { userId: parsed.userId, accountNumber: parsed.accountNumber };
    }
    async changePassword(body, req) {
        const { userId, accountNumber } = this.parseTokenFull(req);
        const { currentPassword, newPassword } = body;
        if (!currentPassword || !newPassword)
            throw new common_1.BadRequestException('请填写当前密码和新密码');
        if (newPassword.length < 6)
            throw new common_1.BadRequestException('新密码不能少于6位');
        if (!/^[A-Za-z0-9]+$/.test(newPassword) || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
            throw new common_1.BadRequestException('新密码只能包含字母和数字，且必须同时包含字母和数字');
        }
        const userRepo = this.dataSource.getRepository(user_entity_1.User);
        const user = await userRepo.findOne({ where: { user_id: userId } });
        if (!user)
            throw new common_1.UnauthorizedException('用户不存在');
        if (accountNumber && user.account_number.toLowerCase() !== accountNumber.toLowerCase()) {
            throw new common_1.UnauthorizedException('无效的token，请重新登录');
        }
        const ok = await bcrypt.compare(currentPassword, user.password_hash);
        if (!ok)
            throw new common_1.BadRequestException('当前密码不正确');
        user.password_hash = await bcrypt.hash(newPassword, 10);
        await userRepo.save(user);
        return { success: true, message: '密码已修改' };
    }
    async changeEmail(body, req) {
        const { userId, accountNumber } = this.parseTokenFull(req);
        const email = (body.email || '').trim().toLowerCase();
        const currentPassword = (body.currentPassword || '').trim();
        if (!email)
            throw new common_1.BadRequestException('请输入邮箱');
        if (!currentPassword)
            throw new common_1.BadRequestException('请输入当前密码');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            throw new common_1.BadRequestException('邮箱格式不正确');
        const userRepo = this.dataSource.getRepository(user_entity_1.User);
        const user = await userRepo.findOne({ where: { user_id: userId } });
        if (!user)
            throw new common_1.UnauthorizedException('用户不存在');
        if (accountNumber && user.account_number.toLowerCase() !== accountNumber.toLowerCase()) {
            throw new common_1.UnauthorizedException('无效的token，请重新登录');
        }
        const passwordOk = await bcrypt.compare(currentPassword, user.password_hash);
        if (!passwordOk)
            throw new common_1.BadRequestException('当前密码不正确');
        await this.verifySession(req, userId);
        const existing = await userRepo.findOne({ where: { email } });
        if (existing && existing.user_id !== userId)
            throw new common_1.BadRequestException('该邮箱已被其他账号使用');
        user.email = email;
        await userRepo.save(user);
        return { success: true, message: '邮箱已更新' };
    }
};
exports.MerchantController = MerchantController;
__decorate([
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('forgot-password'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "forgotPassword", null);
__decorate([
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('logout'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "logout", null);
__decorate([
    (0, common_1.Get)('sessions'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "getSessions", null);
__decorate([
    (0, common_1.Delete)('sessions/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "deleteSession", null);
__decorate([
    (0, common_1.Get)('shops'),
    __param(0, (0, common_1.Query)('userId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "getShops", null);
__decorate([
    (0, common_1.Get)('shops/:shopId'),
    __param(0, (0, common_1.Param)('shopId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "getShop", null);
__decorate([
    (0, common_1.Post)('binding/request'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "bindingRequest", null);
__decorate([
    (0, common_1.Get)('binding/pending'),
    __param(0, (0, common_1.Query)('shopId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "bindingPending", null);
__decorate([
    (0, common_1.Post)('binding/sub-request'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "bindingSubRequest", null);
__decorate([
    (0, common_1.Get)('binding/incoming'),
    __param(0, (0, common_1.Query)('mainShopId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "bindingIncoming", null);
__decorate([
    (0, common_1.Post)('binding/:id/approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "bindingApprove", null);
__decorate([
    (0, common_1.Post)('binding/:id/reject'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "bindingReject", null);
__decorate([
    (0, common_1.Delete)('binding/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "bindingDelete", null);
__decorate([
    (0, common_1.Patch)('binding/:id/commission'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "bindingSetCommission", null);
__decorate([
    (0, common_1.Get)('binding/my-binding'),
    __param(0, (0, common_1.Query)('shopId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "myBinding", null);
__decorate([
    (0, common_1.Post)('binding/batch-create-subs'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "batchCreateSubs", null);
__decorate([
    (0, common_1.Get)('binding/sub-shops'),
    __param(0, (0, common_1.Query)('mainShopId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "subShops", null);
__decorate([
    (0, common_1.Get)('binding/sub-shop-data'),
    __param(0, (0, common_1.Query)('mainShopId')),
    __param(1, (0, common_1.Query)('drawId')),
    __param(2, (0, common_1.Query)('lotteryKind')),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "subShopData", null);
__decorate([
    (0, common_1.Get)('binding/history'),
    __param(0, (0, common_1.Query)('mainShopId')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('lotteryKind')),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "bindingHistory", null);
__decorate([
    (0, common_1.Get)('binding/pending-count'),
    __param(0, (0, common_1.Query)('shopId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "bindingPendingCount", null);
__decorate([
    (0, common_1.Post)('activate-card'),
    __param(0, (0, common_1.Body)('shopId')),
    __param(1, (0, common_1.Body)('code')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "activateCard", null);
__decorate([
    (0, common_1.Post)('change-password'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "changePassword", null);
__decorate([
    (0, common_1.Post)('change-email'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "changeEmail", null);
exports.MerchantController = MerchantController = MerchantController_1 = __decorate([
    (0, common_1.Controller)('merchant'),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        local_lottery_service_1.LocalLotteryService])
], MerchantController);
//# sourceMappingURL=merchant.controller.js.map