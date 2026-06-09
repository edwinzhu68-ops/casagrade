// ============================================
// 大庄家管理后台 - 超市固定抽成模式
// ============================================

'use client';

import { useState, useEffect } from 'react';

interface Shop {
  storeCode: string;
  name: string;
  shopRate: number;        // 超市抽成比例 (20%)
  dailyBetLimit: number;
  status: string;
  todaySales: number;     // 今日营业额
  todayShopPayout: number; // 今日超市所得
  todayMasterProfit: number; // 今日庄家利润
}

interface DashboardStats {
  totalShops: number;
  activeShops: number;
  todayOrders: number;
  todaySales: number;
  todayShopPayout: number;
  todayWinnings: number;
  todayMasterProfit: number;
}

export default function MasterAgentDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalShops: 0, activeShops: 0, todayOrders: 0, todaySales: 0,
    todayShopPayout: 0, todayWinnings: 0, todayMasterProfit: 0
  });
  const [shops, setShops] = useState<Shop[]>([]);
  const [showAddShop, setShowAddShop] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('today');

  useEffect(() => {
    fetchDashboard();
    fetchShops();
  }, [selectedPeriod]);

  const fetchDashboard = async () => {
    try {
      const res = await fetch(`/api/master/dashboard?period=${selectedPeriod}`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch dashboard', err);
    }
  };

  const fetchShops = async () => {
    try {
      const res = await fetch('/api/master/shops');
      const data = await res.json();
      setShops(data);
    } catch (err) {
      console.error('Failed to fetch shops', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* 顶部统计 */}
      <div className="bg-gray-800 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">🎰 大庄家控制台</h1>
            <div className="flex gap-2">
              {['today', 'week', 'month'].map(p => (
                <button
                  key={p}
                  onClick={() => setSelectedPeriod(p)}
                  className={`px-4 py-2 rounded-lg ${
                    selectedPeriod === p ? 'bg-blue-600' : 'bg-gray-700'
                  }`}
                >
                  {p === 'today' ? '今日' : p === 'week' ? '本周' : '本月'}
                </button>
              ))}
            </div>
          </div>

          {/* 核心指标 - 带颜色逻辑 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="合作超市" value={stats.activeShops} sub={`/${stats.totalShops}`} color="blue" />
            <StatCard label="今日订单" value={stats.todayOrders} color="purple" />
            <StatCard label="总营业额" value={`$${stats.todaySales.toFixed(0)}`} color="yellow" />
            <StatCard 
              label="庄家利润" 
              value={`$${stats.todayMasterProfit.toFixed(0)}`} 
              color={stats.todayMasterProfit >= 0 ? "green" : "red"} 
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            <StatCard 
              label="超市抽成" 
              value={`$${stats.todayShopPayout.toFixed(0)}`} 
              sub="超市固定所得" 
              color="orange" 
            />
            <StatCard label="中奖赔付" value={`$${stats.todayWinnings.toFixed(0)}`} sub="庄家支出" color="red" />
            <StatCard 
              label="净利润率" 
              value={stats.todaySales > 0 ? `${((stats.todayMasterProfit / stats.todaySales) * 100).toFixed(1)}%` : '0%'} 
              color={stats.todayMasterProfit >= 0 ? "cyan" : "red"}
            />
          </div>
        </div>
      </div>

      {/* 超市列表 - 利润颜色显示 */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">🏪 超市利润报表</h2>
          <button onClick={() => setShowAddShop(true)} className="bg-green-600 px-4 py-2 rounded-lg font-bold">
            + 添加超市
          </button>
        </div>

        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="p-3 text-left">店号</th>
                <th className="p-3 text-left">店名</th>
                <th className="p-3 text-center">抽成比例</th>
                <th className="p-3 text-right">营业额</th>
                <th className="p-3 text-right">超市抽成</th>
                <th className="p-3 text-right">庄家利润</th>
                <th className="p-3 text-center">状态</th>
              </tr>
            </thead>
            <tbody>
              {shops.map(shop => (
                <tr key={shop.storeCode} className="border-t border-gray-700">
                  <td className="p-3 font-mono">{shop.storeCode}</td>
                  <td className="p-3">{shop.name}</td>
                  <td className="p-3 text-center">
                    <span className="bg-orange-600 px-2 py-1 rounded">{shop.shopRate}%</span>
                  </td>
                  <td className="p-3 text-right">${shop.todaySales.toFixed(0)}</td>
                  <td className="p-3 text-right text-orange-400">${shop.todayShopPayout.toFixed(0)}</td>
                  <td className={`p-3 text-right font-bold ${
                    shop.todayMasterProfit >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    ${shop.todayMasterProfit.toFixed(0)}
                    {shop.todayMasterProfit >= 0 ? ' 🟢' : ' 🔴'}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-1 rounded ${shop.status === 'ACTIVE' ? 'bg-green-600' : 'bg-red-600'}`}>
                      {shop.status === 'ACTIVE' ? '营业' : '停业'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAddShop && (
        <AddShopModal onClose={() => setShowAddShop(false)} onSuccess={() => {
          setShowAddShop(false);
          fetchShops();
          fetchDashboard();
        }} />
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { 
  label: string; value: string | number; sub?: string; color: string 
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-600', purple: 'bg-purple-600', yellow: 'bg-yellow-600',
    green: 'bg-green-600', orange: 'bg-orange-600', red: 'bg-red-600', cyan: 'bg-cyan-600'
  };
  return (
    <div className={`${colors[color]} rounded-xl p-4`}>
      <p className="text-sm opacity-80">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-70">{sub}</p>}
    </div>
  );
}

function AddShopModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    storeCode: '', name: '', phone: '', shopRate: 20, dailyBetLimit: 5000
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/master/shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-xl font-bold mb-4">添加新超市</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">5位店号</label>
            <input type="text" maxLength={5} value={form.storeCode}
              onChange={e => setForm({...form, storeCode: e.target.value.replace(/\D/g, '').slice(0,5)})}
              className="w-full bg-gray-700 rounded-lg p-3 font-mono text-center text-xl" placeholder="00001" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">店名</label>
            <input type="text" value={form.name}
              onChange={e => setForm({...form, name: e.target.value})}
              className="w-full bg-gray-700 rounded-lg p-3" placeholder="超市名称" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">超市抽成比例 (%)</label>
            <input type="number" value={form.shopRate}
              onChange={e => setForm({...form, shopRate: Number(e.target.value)})}
              className="w-full bg-gray-700 rounded-lg p-3" min={0} max={50} />
            <p className="text-xs text-gray-500 mt-1">超市固定获得销售额的X%，无论输赢</p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">每日投注上限</label>
            <input type="number" value={form.dailyBetLimit}
              onChange={e => setForm({...form, dailyBetLimit: Number(e.target.value)})}
              className="w-full bg-gray-700 rounded-lg p-3" min={0} />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 bg-gray-700 py-3 rounded-lg">取消</button>
          <button onClick={handleSubmit} disabled={loading || form.storeCode.length !== 5}
            className="flex-1 bg-green-600 py-3 rounded-lg font-bold disabled:opacity-50">
            {loading ? '添加中...' : '确认添加'}
          </button>
        </div>
      </div>
    </div>
  );
}
