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
const crypto = __importStar(require("crypto"));
const bcrypt = __importStar(require("bcrypt"));
const nodemailer = __importStar(require("nodemailer"));
const loginFailMap = new Map();
const LOGIN_MAX_FAIL = 10;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const cardFailMap = new Map();
const CARD_MAX_FAIL = 5;
const CARD_LOCKOUT_MS = 30 * 60 * 1000;
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
    let payload;
    let signed = false;
    const lastDot = token.lastIndexOf('.');
    if (lastDot > 0) {
        payload = token.slice(0, lastDot);
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
        signed = true;
    }
    else {
        payload = token;
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
        return { userId, accountNumber, signed };
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
let MerchantController = MerchantController_1 = class MerchantController {
    constructor(dataSource) {
        this.dataSource = dataSource;
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
        const headerToken = req.headers?.['x-session-token'];
        if (!headerToken)
            return;
        const user = await this.dataSource.getRepository(user_entity_1.User).findOne({ where: { user_id: userId } });
        if (user?.session_token && user.session_token !== headerToken) {
            throw new common_1.UnauthorizedException('SESSION_EXPIRED');
        }
    }
    async register(dto) {
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
            throw new common_1.BadRequestException('该账号已存在');
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
        const newShop = shopRepo.create({
            shop_number: shopNumber,
            owner_id: user.user_id,
            shop_name: shopName || `店铺${shopNumber}`,
            status: 'active',
            commission_rate: 0.1,
        });
        await shopRepo.save(newShop);
        this.logger.log(`注册: 账号=${account}, 店号=${shopNumber}`);
        return {
            success: true,
            message: '注册成功。可用账号或店号登录，密码相同。',
            accountNumber: account,
            shopNumber,
        };
    }
    async forgotPassword(body) {
        const email = (body.email || '').trim().toLowerCase();
        if (!email)
            throw new common_1.BadRequestException('请输入邮箱');
        const userRepo = this.dataSource.getRepository(user_entity_1.User);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const user = await userRepo.findOne({ where: { email } });
        if (!user)
            throw new common_1.NotFoundException('该邮箱未绑定任何账号');
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
        return { success: true, message: '新密码已发送到你的邮箱' };
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
        if (user.session_token && !dto.force_login) {
            return {
                has_active_session: true,
                last_login_at: user.last_login_at ?? null,
                last_login_ua: user.last_login_ua ?? null,
            };
        }
        const sessionToken = crypto.randomBytes(32).toString('hex');
        user.session_token = sessionToken;
        user.last_login_at = new Date();
        user.last_login_ua = (req.headers?.['user-agent'] || '').slice(0, 512) || null;
        await userRepo.save(user);
        const token = createSignedToken(user.user_id, user.account_number);
        this.logger.log(`老板登录: ${user.account_number}, 角色: ${user.role}`);
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
            const userRepo = this.dataSource.getRepository(user_entity_1.User);
            const user = await userRepo.findOne({ where: { user_id: userId } });
            if (user) {
                user.session_token = null;
                await userRepo.save(user);
            }
        }
        catch { }
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
                subscription_expires_at: shop.subscription_expires_at ?? null,
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
    async bindingPending(shopId) {
        if (!shopId)
            throw new common_1.BadRequestException('缺少 shopId');
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
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
    async bindingIncoming(mainShopId) {
        if (!mainShopId)
            throw new common_1.BadRequestException('缺少 mainShopId');
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
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
    async myBinding(shopId) {
        if (!shopId)
            throw new common_1.BadRequestException('缺少 shopId');
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
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
        const { mainShopId, count, password } = body;
        if (!mainShopId)
            throw new common_1.BadRequestException('缺少 mainShopId');
        const n = Math.min(Math.max(parseInt(String(count)) || 1, 1), 10);
        const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
        if (!tokenInfo)
            throw new common_1.UnauthorizedException('请先登录');
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const userRepo = this.dataSource.getRepository(user_entity_1.User);
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const mainShop = await shopRepo.findOne({ where: { shop_id: Number(mainShopId) } });
        if (!mainShop)
            throw new common_1.NotFoundException('大庄店铺不存在');
        if (mainShop.owner_id !== tokenInfo.userId)
            throw new common_1.UnauthorizedException('无权操作该店铺');
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
                const letters = 'abcdefghjkmnpqrstuvwxyz';
                const rand2 = Array.from({ length: 2 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
                return shopNumber + rand2;
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
    async subShops(mainShopId) {
        if (!mainShopId)
            throw new common_1.BadRequestException('缺少 mainShopId');
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
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
    async subShopData(mainShopId, drawId) {
        if (!mainShopId)
            throw new common_1.BadRequestException('缺少 mainShopId');
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        let targetDrawId = null;
        let drawStatus = 'pending';
        let drawDate = null;
        if (drawId && Number(drawId) > 0) {
            targetDrawId = Number(drawId);
            const dr = await drawRepo.findOne({ where: { draw_id: targetDrawId } });
            drawStatus = dr?.status ?? 'pending';
            drawDate = dr?.draw_date ?? null;
        }
        else {
            const completed = await drawRepo.findOne({
                where: { status: (0, typeorm_1.In)(['completed', 'COMPLETED']) },
                order: { draw_id: 'DESC' },
            });
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
                    const pending = await drawRepo.findOne({ where: { status: 'pending' }, order: { draw_id: 'DESC' } });
                    if (pending) {
                        targetDrawId = pending.draw_id;
                        drawStatus = 'pending';
                        drawDate = pending.draw_date ?? null;
                    }
                }
            }
            else {
                const pending = await drawRepo.findOne({ where: { status: 'pending' }, order: { draw_id: 'DESC' } });
                if (pending) {
                    targetDrawId = pending.draw_id;
                    drawStatus = 'pending';
                    drawDate = pending.draw_date ?? null;
                }
            }
        }
        const bindings = await bindingRepo.find({
            where: { main_shop_id: Number(mainShopId), status: 'active' },
        });
        if (bindings.length === 0)
            return { draw_id: targetDrawId, sub_shops: [] };
        const subShopIds = bindings.map(b => b.sub_shop_id);
        const [subShops, allOrders] = await Promise.all([
            shopRepo.find({ where: { shop_id: (0, typeorm_1.In)(subShopIds) } }),
            orderRepo.find({
                where: {
                    shop_id: (0, typeorm_1.In)(subShopIds),
                    ...(targetDrawId ? { draw_id: targetDrawId } : {}),
                    status: (0, typeorm_1.In)([1, 2, 3]),
                },
                select: ['order_id', 'shop_id', 'draw_id', 'amount', 'win_amount', 'status'],
            }),
        ]);
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
            };
        });
        const totalMainNet = result.reduce((s, r) => s + r.main_net_profit, 0);
        const totalSalesAll = result.reduce((s, r) => s + r.total_sales, 0);
        const totalCommission = result.reduce((s, r) => s + r.sub_commission, 0);
        return {
            draw_id: targetDrawId,
            draw_status: drawStatus,
            draw_date: drawDate,
            sub_shops: result,
            summary: {
                total_sales: Math.round(totalSalesAll * 100) / 100,
                total_commission_paid: Math.round(totalCommission * 100) / 100,
                main_total_net: Math.round(totalMainNet * 100) / 100,
            },
        };
    }
    async bindingHistory(mainShopId, limit) {
        if (!mainShopId)
            throw new common_1.BadRequestException('缺少 mainShopId');
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        const bindingRepo = this.dataSource.getRepository(shop_binding_entity_1.ShopBinding);
        const orderRepo = this.dataSource.getRepository(order_entity_1.Order);
        const { Not } = await Promise.resolve().then(() => __importStar(require('typeorm')));
        const completedDraws = await drawRepo.find({
            where: { status: (0, typeorm_1.In)(['completed', 'COMPLETED']), archived_at: Not((0, typeorm_1.IsNull)()) },
            order: { draw_id: 'DESC' },
            take: Number(limit) || 20,
        });
        if (completedDraws.length === 0)
            return { history: [] };
        const bindings = await bindingRepo.find({
            where: { main_shop_id: Number(mainShopId), status: 'active' },
        });
        if (bindings.length === 0)
            return { history: [] };
        const subShopIds = bindings.map(b => b.sub_shop_id);
        const drawIds = completedDraws.map(d => d.draw_id);
        const allHistoryOrders = await orderRepo.find({
            where: {
                draw_id: (0, typeorm_1.In)(drawIds),
                shop_id: (0, typeorm_1.In)(subShopIds),
                status: (0, typeorm_1.In)([1, 2, 3]),
            },
            select: ['shop_id', 'draw_id', 'amount', 'win_amount', 'status'],
        });
        const ordersByDraw = new Map();
        for (const o of allHistoryOrders) {
            if (!ordersByDraw.has(o.draw_id))
                ordersByDraw.set(o.draw_id, []);
            ordersByDraw.get(o.draw_id).push(o);
        }
        const commissionRateMap = new Map(bindings.map(b => [b.sub_shop_id, Number(b.commission_rate)]));
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
        return { history };
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
        const shopRepo = this.dataSource.getRepository(shop_entity_1.Shop);
        const cardRepo = this.dataSource.getRepository(card_code_entity_1.CardCode);
        const shop = await shopRepo.findOne({ where: { shop_id: Number(shopId) } });
        if (!shop)
            throw new common_1.NotFoundException('店铺不存在');
        const card = await cardRepo.findOne({ where: { code: normalizedCode } });
        if (!card || card.used_at) {
            const entry = cardFailMap.get(ip) || { count: 0, until: 0 };
            entry.count += 1;
            if (entry.count >= CARD_MAX_FAIL)
                entry.until = Date.now() + CARD_LOCKOUT_MS;
            cardFailMap.set(ip, entry);
            throw new common_1.BadRequestException(!card ? '卡密不存在' : '该卡密已被使用');
        }
        const base = shop.subscription_expires_at && shop.subscription_expires_at > new Date()
            ? new Date(shop.subscription_expires_at)
            : new Date();
        if (card.type === 'monthly') {
            base.setMonth(base.getMonth() + 1);
        }
        else if (card.type === 'half_yearly') {
            base.setMonth(base.getMonth() + 6);
        }
        else {
            base.setFullYear(base.getFullYear() + 1);
        }
        const lockResult = await cardRepo.createQueryBuilder()
            .update(card_code_entity_1.CardCode)
            .set({ used_by_shop_id: shop.shop_id, used_at: new Date() })
            .where('id = :id AND used_at IS NULL', { id: card.id })
            .execute();
        if (!lockResult.affected || lockResult.affected === 0) {
            throw new common_1.BadRequestException('该卡密已被使用');
        }
        await shopRepo.update(shop.shop_id, { subscription_expires_at: base });
        cardFailMap.delete(ip);
        this.logger.log(`卡密激活成功：code=${normalizedCode} shop=${shop.shop_number} expires=${base.toISOString().slice(0, 10)}`);
        return {
            success: true,
            type: card.type,
            subscription_expires_at: base,
            message: `激活成功，到期日：${base.toISOString().slice(0, 10)}`,
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
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('forgot-password'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
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
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
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
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
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
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
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
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "subShops", null);
__decorate([
    (0, common_1.Get)('binding/sub-shop-data'),
    __param(0, (0, common_1.Query)('mainShopId')),
    __param(1, (0, common_1.Query)('drawId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MerchantController.prototype, "subShopData", null);
__decorate([
    (0, common_1.Get)('binding/history'),
    __param(0, (0, common_1.Query)('mainShopId')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
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
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], MerchantController);
//# sourceMappingURL=merchant.controller.js.map