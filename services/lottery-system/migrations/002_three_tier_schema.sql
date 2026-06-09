-- ============================================
// 1. 数据库逻辑更新 - 三级架构 + 分润
-- ============================================

-- ------------------------------------------
-- 角色表：区分系统角色
-- ------------------------------------------
CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(20) NOT NULL UNIQUE,  -- 'admin', 'master_agent', 'merchant'
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 预置角色
INSERT INTO roles (role_name, description) VALUES 
    ('admin', '系统管理员'),
    ('master_agent', '大庄家'),
    ('merchant', '超市老板');

-- ------------------------------------------
-- 大庄家表
-- ------------------------------------------
CREATE TABLE master_agents (
    master_id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    balance DECIMAL(12,2) DEFAULT 0,         -- 庄家账户余额
    total_revenue DECIMAL(12,2) DEFAULT 0,   -- 累计营收
    status VARCHAR(20) DEFAULT 'ACTIVE',     -- ACTIVE, SUSPENDED
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------
-- 超市表 - 关联庄家 + 分润设置
-- ------------------------------------------
CREATE TABLE shops (
    store_code VARCHAR(5) PRIMARY KEY,
    master_id INTEGER REFERENCES master_agents(master_id),  -- 所属庄家
    
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    
    -- 分润设置
    commission_rate DECIMAL(5,2) DEFAULT 10.00,   -- 给水比例 % (老板抽成)
    payout_rate DECIMAL(5,2) DEFAULT 80.00,       -- 返奖率 % (用于计算赔率)
    
    -- 限额控制
    daily_bet_limit DECIMAL(10,2) DEFAULT 5000,   -- 每日投注上限
    single_bet_limit DECIMAL(10,2) DEFAULT 100,   -- 单笔投注上限
    
    status VARCHAR(20) DEFAULT 'ACTIVE',         -- ACTIVE, SUSPENDED
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------
-- 订单表 - 分润金额字段
-- ------------------------------------------
CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    store_code VARCHAR(5) REFERENCES shops(store_code),
    master_id INTEGER REFERENCES master_agents(master_id),  -- 冗余便于查询
    
    customer_name VARCHAR(50),
    customer_phone VARCHAR(20),
    
    selection JSONB NOT NULL,
    bet_amount DECIMAL(10,2) NOT NULL,
    multiplier INT DEFAULT 1,
    
    status VARCHAR(20) DEFAULT 'Pending',  -- Pending/Paid/Won/Lost/Cancelled
    verification_code VARCHAR(5) NOT NULL,
    
    draw_id INTEGER REFERENCES draws(draw_id),
    paid_at TIMESTAMP,
    settled_at TIMESTAMP,
    
    -- 分润金额（结算后填充）
    shop_commission DECIMAL(10,2) DEFAULT 0,   -- 超市抽成 = 流水 * commission_rate
    master_revenue DECIMAL(10,2) DEFAULT 0,    -- 庄家收入 = 流水 - shop_commission
    
    -- 中奖相关
    win_amount DECIMAL(10,2) DEFAULT 0,        -- 中奖金额
    net_payout DECIMAL(10,2) DEFAULT 0,        -- 净赔付 = win_amount - shop_commission
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------
-- 结算记录表
-- ------------------------------------------
CREATE TABLE settlements (
    settlement_id SERIAL PRIMARY KEY,
    master_id INTEGER REFERENCES master_agents(master_id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    total_bets DECIMAL(12,2) DEFAULT 0,        -- 总投注
    total_commission DECIMAL(12,2) DEFAULT 0,  -- 庄家总抽成
    total_winnings DECIMAL(12,2) DEFAULT 0,   -- 总赔付
    net_revenue DECIMAL(12,2) DEFAULT 0,      -- 净收入
    
    status VARCHAR(20) DEFAULT 'PENDING',      -- PENDING, PAID, CONFIRMED
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------
-- 每日销售汇总（方便庄家看板）
-- ------------------------------------------
CREATE TABLE daily_summary (
    id SERIAL PRIMARY KEY,
    master_id INTEGER REFERENCES master_agents(master_id),
    store_code VARCHAR(5) REFERENCES shops(store_code),
    summary_date DATE NOT NULL,
    
    total_orders INT DEFAULT 0,
    total_bets DECIMAL(12,2) DEFAULT 0,
    total_paid DECIMAL(12,2) DEFAULT 0,
    total_commission DECIMAL(12,2) DEFAULT 0,
    total_winnings DECIMAL(12,2) DEFAULT 0,
    net_revenue DECIMAL(12,2) DEFAULT 0,
    
    UNIQUE(master_id, store_code, summary_date)
);

-- 索引
CREATE INDEX idx_orders_master ON orders(master_id);
CREATE INDEX idx_orders_shop_daily ON orders(store_code, created_at);
CREATE INDEX idx_daily_summary_master ON daily_summary(master_id, summary_date);
