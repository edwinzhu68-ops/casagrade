// ============================================
// 第三步：超市老板核销后台
// ============================================

'use client';

import { useState, useEffect } from 'react';

// ------------------------------------------
// 老板端主页面
// ------------------------------------------
export default function MerchantDashboard() {
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [todayStats, setTodayStats] = useState({ total: 0, count: 0 });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  // 页面加载时获取今日统计
  useEffect(() => {
    fetchTodayStats();
    fetchRecentOrders();
  }, []);

  const fetchTodayStats = async () => {
    try {
      const res = await fetch('/api/merchant/stats');
      const data = await res.json();
      setTodayStats(data);
    } catch (err) {
      console.error('Failed to fetch stats', err);
    }
  };

  const fetchRecentOrders = async () => {
    try {
      const res = await fetch('/api/merchant/recent');
      const data = await res.json();
      setRecentOrders(data);
    } catch (err) {
      console.error('Failed to fetch orders', err);
    }
  };

  // 核销提交
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (verificationCode.length !== 5) {
      setResult({ success: false, message: '请输入5位核销码' });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/merchant/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationCode }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setResult({ success: true, message: `✅ 核销成功！${data.order.numbers.join('-')} $${data.order.betAmount}` });
        setVerificationCode('');
        fetchTodayStats();
        fetchRecentOrders();
        
        // 3秒后自动清除结果
        setTimeout(() => setResult(null), 3000);
      } else {
        setResult({ success: false, message: data.message || '核销失败' });
      }
    } catch {
      setResult({ success: false, message: '网络错误，请重试' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* 顶部大字输入框 - 3秒核销 */}
      <div className="bg-gray-800 p-6 sticky top-0 z-10">
        <form onSubmit={handleVerify} className="max-w-2xl mx-auto">
          <label className="block text-sm text-gray-400 mb-2">
            输入顾客核销码确认收款
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={5}
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="00000"
              className="flex-1 text-5xl font-mono text-center bg-gray-700 border-2 border-gray-600 rounded-xl py-4 focus:border-green-500 focus:outline-none"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || verificationCode.length !== 5}
              className="bg-green-600 px-8 py-4 rounded-xl font-bold text-xl disabled:bg-gray-600"
            >
              {loading ? '核销中...' : '确认'}
            </button>
          </div>
        </form>

        {/* 核销结果提示 */}
        {result && (
          <div className={`mt-4 p-4 rounded-xl text-center text-xl font-bold ${
            result.success ? 'bg-green-600' : 'bg-red-600'
          }`}>
            {result.message}
          </div>
        )}
      </div>

      {/* 今日统计 */}
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">📊 今日收入</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-700 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-green-400">${todayStats.total.toFixed(2)}</p>
              <p className="text-gray-400 text-sm">现金收入</p>
            </div>
            <div className="bg-gray-700 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-blue-400">{todayStats.count}</p>
              <p className="text-gray-400 text-sm">订单数</p>
            </div>
          </div>
        </div>

        {/* 最近订单列表 */}
        <div className="bg-gray-800 rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-4">📋 最近订单</h2>
          <div className="space-y-2">
            {recentOrders.filter(o => o.status !== 'Canceled').length === 0 ? (
              <p className="text-gray-500 text-center py-8">暂无订单</p>
            ) : (
              recentOrders
                .filter(order => order.status !== 'Canceled')
                .map(order => (
                <div
                  key={order.id}
                  className="bg-gray-700 rounded-xl p-4 flex justify-between items-center"
                >
                  <div>
                    <span className="font-mono text-lg">{order.verificationCode}</span>
                    <span className="text-gray-400 ml-4">{order.numbers.join(' - ')}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">${order.betAmount}</p>
                    <p className={`text-xs ${order.status === 'Paid' ? 'text-green-400' : 'text-yellow-400'}`}>
                      {order.status}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
