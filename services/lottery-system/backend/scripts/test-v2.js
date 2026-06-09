/**
 * 彩票系统核心测试脚本 v2.1
 * 
 * 优先级测试：
 * 🔴 最高: 结算金额正确性（Billete各档位、Chance叠加）
 * 🔴 最高: 幂等性（重复下单/兑奖不会多处理）
 * 🟠 高:   并发下单时限额不超卖
 * 🟠 高:   开奖事务完整性（无脏数据）
 * 🟡 中:   压测：100并发 <500ms
 * 🟡 中:   期次流转正确性
 * 
 * 使用: node test-v2.js
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

// 赔率定义（与代码一致）
const BILLETE_RATES = { exact: [2000, 600, 300], first3: [50, 20, 10], last3: [50, 20, 10], first2: [3, 0, 0], last2: [3, 2, 1], last1: [1, 0, 0] };
const CHANCE_RATES = [14, 3, 2];

function log(level, msg) {
  console.log(`[${new Date().toISOString().slice(11,23)}] [${level}] ${msg}`);
}

async function api(method, path, body = null, headers = {}) {
  const options = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body) options.body = JSON.stringify(body);
  const start = Date.now();
  try {
    const res = await fetch(`${API_BASE}${path}`, options);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data, latency: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e.message, latency: Date.now() - start };
  }
}

function calcBilleteWin(betNum, primer, segundo, tercero, qty) {
  const b = betNum.slice(-4).padStart(4, '0');
  const p = (primer || '').replace(/\D/g, '').padStart(4, '0');
  const sDigits = (segundo || '').replace(/\D/g, '');
  const tDigits = (tercero || '').replace(/\D/g, '');
  // GORDITO：二三奖均为2位时，Billete只与头奖比，与后端 isGordito 逻辑一致
  const isGordito = sDigits.length <= 2 && tDigits.length <= 2;
  let total = 0;
  // 头奖（4位完整比较）
  if (b === p) total += BILLETE_RATES.exact[0] * qty;
  else if (b.slice(0,3) === p.slice(0,3)) total += BILLETE_RATES.first3[0] * qty;
  else if (b.slice(1,4) === p.slice(1,4)) total += BILLETE_RATES.last3[0] * qty;
  else if (b.slice(0,2) === p.slice(0,2)) total += BILLETE_RATES.first2[0] * qty;
  else if (b.slice(2,4) === p.slice(2,4)) total += BILLETE_RATES.last2[0] * qty;
  else if (b.slice(-1) === p.slice(-1)) total += BILLETE_RATES.last1[0] * qty;
  if (isGordito) return total; // GORDITO模式：二三奖跳过
  // 二奖（须为4位才参与）
  if (sDigits.length >= 4) {
    const s = sDigits.padStart(4, '0');
    if (b === s) total += BILLETE_RATES.exact[1] * qty;
    else if (b.slice(0,3) === s.slice(0,3)) total += BILLETE_RATES.first3[1] * qty;
    else if (b.slice(1,4) === s.slice(1,4)) total += BILLETE_RATES.last3[1] * qty;
    else if (b.slice(2,4) === s.slice(2,4)) total += BILLETE_RATES.last2[1] * qty;
  }
  // 三奖（须为4位才参与）
  if (tDigits.length >= 4) {
    const t = tDigits.padStart(4, '0');
    if (b === t) total += BILLETE_RATES.exact[2] * qty;
    else if (b.slice(0,3) === t.slice(0,3)) total += BILLETE_RATES.first3[2] * qty;
    else if (b.slice(1,4) === t.slice(1,4)) total += BILLETE_RATES.last3[2] * qty;
    else if (b.slice(2,4) === t.slice(2,4)) total += BILLETE_RATES.last2[2] * qty;
  }
  return total;
}

function calcChanceWin(betNum, primer, segundo, tercero, qty) {
  const b = betNum.slice(-2).padStart(2, '0');
  const p2 = (primer || '').replace(/\D/g, '').slice(-2).padStart(2, '0');
  const s2 = (segundo || '').replace(/\D/g, '').slice(-2).padStart(2, '0');
  const t2 = (tercero || '').replace(/\D/g, '').slice(-2).padStart(2, '0');
  let total = 0;
  if (b === p2) total += CHANCE_RATES[0] * qty;
  if (b === s2) total += CHANCE_RATES[1] * qty;
  if (b === t2) total += CHANCE_RATES[2] * qty;
  return total;
}

function calcExpected(numbers, win) {
  let total = 0;
  for (const bet of numbers) {
    const num = bet.n;
    const qty = bet.q;
    const numLen = num.replace(/\D/g, '').length;
    if (numLen >= 4) total += calcBilleteWin(num, win.primer, win.segundo, win.tercero, qty);
    else if (numLen >= 2) total += calcChanceWin(num, win.primer, win.segundo, win.tercero, qty);
  }
  return total;
}

async function ensurePendingDraw() {
  const p = await api('GET', '/api/draw/pending');
  if (!p.data.draw) {
    await api('POST', '/api/draw/time', { drawTime: new Date().toISOString() }, { 'X-Admin-Token': process.env.ADMIN_TOKEN || 'admin-secret' });
  }
}

async function createTestShop(prefix) {
  await ensurePendingDraw(); // 先确保有待开奖期
  const account = `${prefix}${Date.now()}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
  const res = await api('POST', '/api/merchant/register', {
    account,
    password: 'Test1234',
    shopName: `${prefix}Shop`,
  });
  if (!res.ok) return null;
  const login = await api('POST', '/api/merchant/login', { accountNumber: account, password: 'Test1234', force_login: true });
  if (!login.ok) return null;
  // 获取 shopId
  const shops = await api('GET', '/api/merchant/shops', null, { Authorization: `Bearer ${login.data.token}` });
  const shopId = shops.ok ? (shops.data.shops?.[0]?.shop_id || shops.data.shop?.shop_id) : null;
  return { shopId, token: login.data.token, account, shopNumber: res.data.shopNumber };
}

async function clearSettlement() {
  await api('POST', '/api/admin/clear-settlement', {}, { 'X-Admin-Token': process.env.ADMIN_TOKEN || 'admin-secret' });
}

async function manualDraw(billete, segundas, tercero) {
  return api('POST', '/api/draw/manual', { billete, segundas, tercero }, { 'X-Admin-Token': process.env.ADMIN_TOKEN || 'admin-secret' });
}

const stats = { passed: 0, failed: 0, errors: [] };

function pass(msg) { stats.passed++; log('PASS', msg); }
function fail(msg, d) { stats.failed++; log('FAIL', msg + (d ? `: ${JSON.stringify(d)}` : '')); stats.errors.push({ msg, d }); }
function sec(name) { log('INFO', `════════ ${name} ════════`); }

// ============================================================
// 测试1: 结算金额正确性
// ============================================================
async function testSettlement() {
  sec('测试1: 结算金额正确性 (🔴最高)');
  
  const shop = await createTestShop('ST');
  if (!shop) { fail('创建店铺失败'); return; }
  const h = { Authorization: `Bearer ${shop.token}` };
  pass(`创建店铺: ${shop.account}`);
  
  const tests = [
    { nums: [{n:'1234',q:1}], win:{primer:'1234',segundo:'0000',tercero:'0000'}, expect:2000, desc:'Billete四位全中×1=2000' },
    { nums: [{n:'1234',q:5}], win:{primer:'1234',segundo:'0000',tercero:'0000'}, expect:10000, desc:'Billete四位×5=10000' },
    { nums: [{n:'1235',q:1}], win:{primer:'1234',segundo:'0000',tercero:'0000'}, expect:50, desc:'Billete前三位=50' },
    { nums: [{n:'5234',q:1}], win:{primer:'1234',segundo:'0000',tercero:'0000'}, expect:50, desc:'Billete后三位=50' },
    { nums: [{n:'3456',q:1}], win:{primer:'1234',segundo:'3456',tercero:'0000'}, expect:600, desc:'Billete二奖四位=600' },
    // Chance叠加：三个奖末两位都是'34'才能触发14+3+2=19
    { nums: [{n:'34',q:1}], win:{primer:'1234',segundo:'5634',tercero:'7834'}, expect:19, desc:'Chance叠加14+3+2=19' },
    { nums: [{n:'34',q:10}], win:{primer:'1234',segundo:'5634',tercero:'7834'}, expect:190, desc:'Chance×10=190' },
    // 混合：Billete只中头奖(2000)，Chance只中头奖(14)，segundo/tercero不干扰Billete
    { nums: [{n:'1234',q:1},{n:'34',q:1}], win:{primer:'1234',segundo:'5678',tercero:'9012'}, expect:2000+14, desc:'混合:Billete2000+Chance14' },
    // GORDITO（二三奖2位）：头奖命中，二三奖跳过 → 2000
    { nums: [{n:'1234',q:1}], win:{primer:'1234',segundo:'34',tercero:'56'}, expect:2000, desc:'GORDITO:头奖命中=2000' },
    // GORDITO：bet末两位恰好==segundo末两位，但GORDITO模式下二奖不参与 → 0
    { nums: [{n:'1234',q:1}], win:{primer:'9999',segundo:'34',tercero:'56'}, expect:0, desc:'GORDITO:二三奖不计算=0' },
  ];
  
  for (const t of tests) {
    const order = await api('POST', '/api/orders', { shopId: shop.shopId, numbers: t.nums, amount: t.nums.reduce((s,n)=>s+(n.n.length>=4?1:0.25)*n.q,0), gameType: 'billete' }, h);
    if (!order.ok) { fail(`下单失败: ${t.desc}`, order.data); await clearSettlement(); await new Promise(r=>setTimeout(r,200)); continue; }
    await api('POST', `/api/orders/${order.data.order_number}/confirm`, { shopId: shop.shopId }, h);
    await manualDraw(t.win.primer, t.win.segundo, t.win.tercero);
    await new Promise(r=>setTimeout(r,300));
    const detail = await api('GET', `/api/orders/${order.data.order_number}`, null, h);
    const actual = detail.data.win_amount || 0;
    if (Math.abs(actual - t.expect) < 0.01) {
      pass(`${t.desc} → ${actual} ✅`);
    } else {
      fail(`${t.desc} → 期望${t.expect}, 实际${actual}`, { nums: t.nums, win: t.win });
    }
    // 用rollback恢复pending期，避免下一轮因无pending draw而下单失败
    await api('POST', '/api/draw/rollback', {}, { 'X-Admin-Token': process.env.ADMIN_TOKEN || 'admin-secret' });
    await new Promise(r=>setTimeout(r,200));
  }
}

// ============================================================
// 测试2: 幂等性
// ============================================================
async function testIdempotency() {
  sec('测试2: 幂等性 (🔴最高)');
  
  const shop = await createTestShop('ID');
  if (!shop) { fail('创建店铺失败'); return; }
  const h = { Authorization: `Bearer ${shop.token}` };
  pass(`创建店铺: ${shop.account}`);
  
  // 重复下单
  const key = `idem${Date.now()}`;
  const o1 = await api('POST', '/api/orders', { shopId: shop.shopId, numbers: [{n:'9999',q:1}], amount: 1, idempotency_key: key, gameType: 'billete' }, h);
  if (!o1.ok) { fail('第一次下单失败'); return; }
  const o2 = await api('POST', '/api/orders', { shopId: shop.shopId, numbers: [{n:'9999',q:1}], amount: 1, idempotency_key: key, gameType: 'billete' }, h);
  if (o2.ok && o2.data._idempotent) pass('重复下单(同key)→返回相同订单 ✅'); else fail('幂等下单失败', o2.data);
  
  await clearSettlement(); await new Promise(r=>setTimeout(r,200));
  
  // 重复兑奖
  const o = await api('POST', '/api/orders', { shopId: shop.shopId, numbers: [{n:'8888',q:1}], amount: 1, gameType: 'billete' }, h);
  await api('POST', `/api/orders/${o.data.order_number}/confirm`, { shopId: shop.shopId }, h);
  await manualDraw('8888','1111','2222');
  await new Promise(r=>setTimeout(r,300));
  const r1 = await api('POST', `/api/orders/${o.data.order_number}/redeem`, { shopId: shop.shopId }, h);
  const r2 = await api('POST', `/api/orders/${o.data.order_number}/redeem`, { shopId: shop.shopId }, h);
  if (r1.ok && !r2.ok) pass('重复兑奖→第一次成功,第二次被拒 ✅'); else fail('幂等兑奖失败', { r1: r1.ok, r2: r2.ok });
}

// ============================================================
// 测试3: 并发限额
// ============================================================
async function testConcurrentLimits() {
  sec('测试3: 并发下单限额 (🟠高)');
  
  const shop = await createTestShop('CL');
  if (!shop) { fail('创建店铺失败'); return; }
  const h = { Authorization: `Bearer ${shop.token}` };
  pass(`创建店铺: ${shop.account}`);
  
  // 设置限额10张
  await api('PATCH', `/api/shop/${shop.shopId}/limits`, { limitChance: 10, limitBillete: 10 }, h);
  
  // 并发下单同一号码15张
  const promises = [];
  for (let i = 0; i < 15; i++) {
    promises.push(api('POST', '/api/orders', { shopId: shop.shopId, numbers: [{n:'7777',q:1}], amount: 1, gameType: 'billete' }, h));
  }
  const results = await Promise.all(promises);
  const success = results.filter(r=>r.ok).length;
  
  await new Promise(r=>setTimeout(r,500));
  
  // 检查实际销售
  const orders = await api('GET', `/api/shop/${shop.shopId}/orders`, null, h);
  let total = 0;
  if (orders.ok && orders.data.orders) {
    for (const o of orders.data.orders) {
      for (const n of (o.numbers||[])) {
        if (n.n === '7777') total += n.q;
      }
    }
  }
  
  log('INFO', `并发15笔,限额10,成功${success},实际售出${total}`);
  if (total <= 10) pass(`限额控制正确: ${total}≤10 ✅`); else fail(`超卖! ${total}>10`);
}

// ============================================================
// 测试4: 事务完整性
// ============================================================
async function testTransactionIntegrity() {
  sec('测试4: 开奖事务完整性 (🟠高)');
  
  const shop = await createTestShop('TX');
  if (!shop) { fail('创建店铺失败'); return; }
  const h = { Authorization: `Bearer ${shop.token}` };
  pass(`创建店铺: ${shop.account}`);
  
  // 创建10笔订单
  for (let i = 0; i < 10; i++) {
    const o = await api('POST', '/api/orders', { shopId: shop.shopId, numbers: [{n:String(1000+i),q:1}], amount: 1, gameType: 'billete' }, h);
    if (o.ok) await api('POST', `/api/orders/${o.data.order_number}/confirm`, { shopId: shop.shopId }, h);
  }
  
  await manualDraw('1234','5678','9012');
  await new Promise(r=>setTimeout(r,500));
  
  const check = await api('GET', `/api/shop/${shop.shopId}/orders`, null, h);
  let allOk = true;
  let won = 0;
  if (check.ok && check.data.orders) {
    for (const o of check.data.orders) {
      // API返回字符串状态('settled'=2, 'won'=3)
      if (o.status !== 'settled' && o.status !== 'won') { fail(`订单${o.order_number}状态异常:${o.status}`); allOk = false; }
      if (o.status === 'won') won++;
    }
  }
  if (allOk) pass(`所有订单状态正确(2=已开奖,3=已中奖),中奖${won}笔 ✅`);
}

// ============================================================
// 测试5: 性能压测
// ============================================================
async function testPerformance() {
  sec('测试5: 性能压测 (🟡中)');
  
  const shop = await createTestShop('PF');
  if (!shop) { fail('创建店铺失败'); return; }
  const h = { Authorization: `Bearer ${shop.token}` };
  pass(`创建店铺: ${shop.account}`);
  
  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(api('POST', '/api/orders', { shopId: shop.shopId, numbers: [{n:String(1000+i),q:1}], amount: 1, gameType: 'billete' }, h));
  }
  const start = Date.now();
  const results = await Promise.all(promises);
  const duration = Date.now() - start;
  const success = results.filter(r=>r.ok).length;
  const avgLat = results.reduce((s,r)=>s+(r.latency||0),0)/results.length;
  
  log('INFO', `100并发: ${duration}ms, 成功${success}/100, 平均${avgLat.toFixed(0)}ms`);
  if (avgLat < 500) pass(`平均延迟${avgLat.toFixed(0)}ms<500ms ✅`); else fail(`延迟过高: ${avgLat.toFixed(0)}ms`);
}

// ============================================================
// 测试6: 期次流转
// ============================================================
async function testPeriodFlow() {
  sec('测试6: 期次流转 (🟡中)');
  
  await clearSettlement();
  const pending = await api('GET', '/api/draw/pending');
  log('INFO', `当前待开奖期: ${pending.data.draw?.drawId || '无'}`);
  
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  const dateStr = tomorrow.toISOString().slice(0,10);
  const setTime = await api('POST', '/api/draw/time', { drawTime: `${dateStr}T15:00:00` }, { 'X-Admin-Token': process.env.ADMIN_TOKEN || 'admin-secret' });
  if (setTime.ok) pass(`设置开奖时间: ${dateStr} 15:00 ✅`); else fail('设置开奖时间失败', setTime.data);
  
  const reset = await api('POST', '/api/draw/reset-time', {}, { 'X-Admin-Token': process.env.ADMIN_TOKEN || 'admin-secret' });
  if (reset.ok) pass('重置为默认开奖日 ✅'); else fail('重置失败', reset.data);
}

// ============================================================
// 快速3年模拟
// ============================================================
async function testThreeYearFast() {
  sec('测试7: 快速3年模拟 (312期)');
  
  const start = Date.now();
  let success = 0, failed = 0;
  
  for (let i = 0; i < 312; i++) {
    const p = await api('GET', '/api/draw/pending');
    if (!p.data.draw) await api('POST', '/api/draw/time', { drawTime: new Date().toISOString() }, { 'X-Admin-Token': process.env.ADMIN_TOKEN || 'admin-secret' });
    
    const win = String(Math.floor(Math.random()*100000)).padStart(4,'0');
    const res = await manualDraw(win, String(Math.floor(Math.random()*10000)).padStart(4,'0'), String(Math.floor(Math.random()*10000)).padStart(4,'0'));
    if (res.ok) success++; else failed++;
    
    if ((i+1) % 50 === 0) log('INFO', `进度: ${i+1}/312 (${((Date.now()-start)/1000).toFixed(1)}s)`);
    if (i < 311) { await clearSettlement(); await new Promise(r=>setTimeout(r,10)); }
  }
  
  const duration = ((Date.now()-start)/1000).toFixed(1);
  log('INFO', `312期完成: 成功${success},失败${failed},耗时${duration}秒`);
  if (failed === 0) pass(`312期连续开奖全部成功 ✅`); else fail(`${failed}期失败`);
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  log('INFO', '╔════════════════════════════════╗');
  log('INFO', '║  彩票系统核心测试 v2.1      ║');
  log('INFO', '╚════════════════════════════════╝');
  log('INFO', `API: ${API_BASE}`);
  
  const start = Date.now();
  
  await testSettlement();
  await new Promise(r=>setTimeout(r,500));
  
  await testIdempotency();
  await new Promise(r=>setTimeout(r,500));
  
  await testConcurrentLimits();
  await new Promise(r=>setTimeout(r,500));
  
  await testTransactionIntegrity();
  await new Promise(r=>setTimeout(r,500));
  
  await testPerformance();
  await new Promise(r=>setTimeout(r,500));
  
  await testPeriodFlow();
  await new Promise(r=>setTimeout(r,500));
  
  // 快速3年模拟(可选)
  // await testThreeYearFast();
  
  log('INFO', '');
  log('INFO', '════════ 测试结果 ════════');
  log('INFO', `通过: ${stats.passed}, 失败: ${stats.failed}, 耗时: ${((Date.now()-start)/1000).toFixed(1)}秒`);
  
  if (stats.errors.length) {
    log('ERROR', '失败详情:');
    stats.errors.forEach((e,i) => log('ERROR', `  ${i+1}. ${e.msg}`));
  }
  
  log('INFO', '');
  log('WARN', '⚠️ 测试完成! 数据库已有测试数据');
  log('WARN', '恢复命令:');
  log('WARN', `  cp ~/lottery-system/backups/lottery.db.backup.20260318_201040 /var/www/lottery-system/backend/lottery.db`);
  log('WARN', '  pm2 restart lottery-api');
  
  return stats;
}

main().then(s => process.exit(s.failed > 0 ? 1 : 0)).catch(e => { console.error(e); process.exit(1); });
