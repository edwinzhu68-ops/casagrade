import { Controller, Post, Get, Body, Param, Query, Inject, Logger, Req, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from '../../entities/user.entity';
import { Shop } from '../../entities/shop.entity';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

interface LoginDto {
  account?: string;
  accountNumber?: string;
  password: string;
}

interface RegisterDto {
  account?: string;
  accountNumber?: string;
  password: string;
  passwordConfirm?: string;
  shop_name?: string;
}

@Controller('merchant')
export class MerchantController {
  private readonly logger = new Logger(MerchantController.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * POST /merchant/register - 注册新门店账号（创建用户+店铺，店号随机5位）
   */
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const account = (dto.account || dto.accountNumber || '').trim();
    const password = dto.password || '';
    const passwordConfirm = dto.passwordConfirm ?? dto.password;
    const shopName = (dto.shop_name || '').trim() || null;

    if (!account || account.length < 4 || account.length > 32) {
      throw new BadRequestException('账号为4-32位字母或数字');
    }
    if (!/^[A-Za-z0-9]+$/.test(account)) {
      throw new BadRequestException('账号只能包含字母或数字');
    }
    if (password.length < 6) {
      throw new BadRequestException('密码至少6位');
    }
    if (password !== passwordConfirm) {
      throw new BadRequestException('两次密码不一致');
    }

    const userRepo = this.dataSource.getRepository(User);
    const shopRepo = this.dataSource.getRepository(Shop);
    const existing = await userRepo.findOne({ where: { account_number: account } });
    if (existing) {
      throw new BadRequestException('该账号已存在');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = userRepo.create({
      account_number: account,
      password_hash: passwordHash,
      role: 'merchant',
    });
    await userRepo.save(user);

    let shopNumber: string;
    for (let i = 0; i < 20; i++) {
      shopNumber = String(Math.floor(10000 + Math.random() * 90000));
      const exists = await shopRepo.findOne({ where: { shop_number: shopNumber } });
      if (!exists) break;
    }
    const shop = shopRepo.create({
      shop_number: shopNumber!,
      owner_id: user.user_id,
      shop_name: shopName || `店铺${shopNumber}`,
      status: 'active',
      commission_rate: 0.1,
    });
    await shopRepo.save(shop);

    this.logger.log(`注册: 账号=${account}, 店号=${shopNumber}`);

    return {
      success: true,
      message: '注册成功',
      accountNumber: account,
      shop_number: shopNumber,
      shop_id: shop.shop_id,
    };
  }

  /**
   * POST /merchant/login - 老板登录
   * 支持 account 或 accountNumber 字段
   */
  @Post('login')
  async login(@Body() dto: LoginDto) {
    // 兼容 accountNumber 和 account 字段
    const account = dto.account || dto.accountNumber;

    // 查找用户
    const user = await this.dataSource.getRepository(User).findOne({
      where: { account_number: account },
    });

    if (!user) {
      throw new UnauthorizedException('账号不存在');
    }

    const stored = user.password_hash || '';
    const isBcrypt = /^\$2[aby]\$/.test(stored);
    let passwordOk = false;
    if (isBcrypt) {
      passwordOk = await bcrypt.compare(dto.password, stored);
    } else {
      const sha = crypto.createHash('sha256').update(dto.password).digest('hex');
      passwordOk = stored === sha || stored === dto.password;
    }
    if (!passwordOk) {
      throw new UnauthorizedException('密码错误');
    }

    // 返回token（简化版：用account_number做token）
    const token = Buffer.from(`${user.user_id}:${user.account_number}`).toString('base64');

    this.logger.log(`老板登录: ${user.account_number}, 角色: ${user.role}`);

    return {
      token,
      userId: user.user_id,
      accountNumber: user.account_number,
      role: user.role,
    };
  }

  /**
   * GET /merchant/shops?userId=1 - 获取当前老板的店铺列表
   * 支持两种方式：
   * 1. query参数: /api/merchant/shops?userId=1
   * 2. Authorization header: Bearer token (token是 base64(userId:account))
   */
  @Get('shops')
  async getShops(
    @Query('userId') userId: string,
    @Req() req: any
  ) {
    let userIdNum: number;

    // 优先从query参数获取
    if (userId) {
      userIdNum = parseInt(userId);
    } else {
      // 从Authorization header解析
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.replace('Bearer ', '');
          const decoded = Buffer.from(token, 'base64').toString();
          userIdNum = parseInt(decoded.split(':')[0]);
        } catch (e) {
          throw new UnauthorizedException('无效的token');
        }
      } else {
        throw new UnauthorizedException('请先登录');
      }
    }

    if (!userIdNum || isNaN(userIdNum)) {
      throw new UnauthorizedException('无效的用户ID');
    }

    const shops = await this.dataSource.getRepository(Shop).find({
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
      })),
    };
  }

  /**
   * GET /merchant/shops/:shopId - 获取单个店铺信息
   */
  @Get('shops/:shopId')
  async getShop(@Param('shopId') shopId: string) {
    const shop = await this.dataSource.getRepository(Shop).findOne({
      where: { shop_id: parseInt(shopId) },
    });

    if (!shop) {
      throw new NotFoundException('店铺不存在');
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
}
