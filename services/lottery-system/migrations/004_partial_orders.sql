-- ============================================
// 飞单模式数据库设计
-- ============================================

-- 超市表 - 绑定模式
ALTER TABLE shops DROP COLUMN IF EXISTS shop_rate;
ALTER TABLE shops DROP COLUMN IF EXISTS daily_bet_limit;
ALTER TABLE shops DROP COLUMN IF EXISTS single_bet_limit;

-- 新增：
ALTER TABLE shops ADD COLUMN binding_type VARCHAR(20) DEFAULT 'NONE';  
-- NONE(独立), FULL(全额庄家), PARTIAL(飞单)

ALTER TABLE shops ADD COLUMN master_id_full INTEGER REFERENCES master_agents(master_id);
-- 全额庄家绑定

ALTER TABLE shops ADD COLUMN master_id_partial INTEGER REFERENCES master_agents(master_id);
-- 飞单庄家绑定

-- 订单表 - 区分全额/飞单
ALTER TABLE orders ADD COLUMN order_type VARCHAR(20) DEFAULT 'FULL'; 
-- FULL(全额), PARTIAL(飞单)

ALTER TABLE orders ADD COLUMN master_id_responsible INTEGER REFERENCES master_agents(master_id);
-- 负责该单的庄家ID（全额=绑定的庄家，飞单=飞单庄家）

-- 飞单详情表
CREATE TABLE order_partials (
    partial_id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(order_id),
    master_id INTEGER REFERENCES master_agents(master_id),
    numbers VARCHAR(50) NOT NULL,              -- 飞给庄家的号码，逗号分隔
    numbers_count INT NOT NULL,               -- 飞出的号码数量
    bet_amount DECIMAL(10,2) NOT NULL,      -- 飞单金额
    shop_payout DECIMAL(10,2) DEFAULT 0,     -- 超市所得（按比例）
    master_profit DECIMAL(10,2) DEFAULT 0,   -- 庄家利润
    settled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 飞单规则表（超市设置）
CREATE TABLE partial_rules (
    rule_id SERIAL PRIMARY KEY,
    store_code VARCHAR(5) REFERENCES shops(store_code),
    master_id INTEGER REFERENCES master_agents(master_id),
    
    -- 飞单设置
    numbers_to_fly VARCHAR(50),              -- 要飞的号码，如 "01,02,03" 或 "ODD" (奇数) / "EVEN" (偶数)
    numbers_count INT DEFAULT 1,             -- 飞几个号
    fly_percentage DECIMAL(5,2) DEFAULT 0,   -- 飞单比例（如飞50%金额）
    fly_all_if_match BOOLEAN DEFAULT FALSE, -- 如果飞的号码全中，是否飞全部金额
    
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
// 完整订单创建流程
-- ============================================

/*
下单逻辑：

1. 顾客选号：05-12-18-25-33，$10

2. 超市设置：
   - binding_type = PARTIAL (飞单模式)
   - 飞单规则：飞奇数号码，奇数有 05, 15, 23, 31, 35
   
3. 系统判断：
   - 飞的号码：05, 25, 33 (3个奇数)
   - 飞的金额：$10 × (3/5) = $6
   - 超市自留：$4

4. 创建订单：
   - order_type = PARTIAL
   - master_id_responsible = 飞单庄家ID
   
5. 创建飞单记录：
   - numbers = "05,25,33"
   - numbers_count = 3
   - bet_amount = $6

6. 结算时：
   - 飞的号码如果中奖 → 庄家赔付
   - 自留号码如果中奖 → 超市赔付
*/
