'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ============================================
// 顾客端 - Billete 四位数下单
// ============================================

type OrderStatus = 'pending' | 'paid' | 'won' | 'lost';

interface Order {
  id: number;
  storeCode: string;
  numbers: string;
  betAmount: number;
  verificationCode: string;
  status: OrderStatus;
  createdAt: string;
}

interface Shop {
  storeCode: string;
  name: string;
}

// ------------------------------------------
// 首页：输入5位店号
// ------------------------------------------
export default function HomePage() {
  const router = useRouter();
  const [storeCode, setStoreCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (storeCode.length !== 5 || !/^\d+$/.test(storeCode)) {
      setError('请输入5位数字店号');
      return;
    }
    setLoading(true);
    try {
      // 模拟验证店号
      const res = await fetch(`/api/shops/${storeCode}`);
      if (!res.ok) throw new Error('店号不存在');
      router.push(`/shop/${storeCode}`);
    } catch {
      setError('店号不存在，请确认后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🎰</div>
          <h1 className="text-3xl font-bold text-gray-800">巴拿马彩票</h1>
          <p className="text-gray-500 mt-2">Billete 四位数投注</p>
        </div>
        
        <input
          type="text"
          maxLength={5}
          value={storeCode}
          onChange={(e) => setStoreCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
          placeholder="请输入5位店号"
          className="w-full text-center text-4xl font-mono tracking-widest py-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
          autoFocus
        />
        
        {error && <p className="text-red-500 text-center mt-4">{error}</p>}
        
        <button
          type="submit"
          disabled={loading || storeCode.length !== 5}
          className="w-full mt-6 bg-blue-600 text-white py-4 rounded-xl font-bold text-lg disabled:bg-gray-300"
        >
          {loading ? '验证中...' : '进入下单'}
        </button>
      </form>
    </div>
  );
}

// ------------------------------------------
// 选号页面
// ------------------------------------------
export function SelectionPage({ storeCode }: { storeCode: string }) {
  const [selectedNumber, setSelectedNumber] = useState('');
  const [betAmount, setBetAmount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);

  const handleSubmit = async () => {
    if (selectedNumber.length !== 4) {
      alert('请输入4位号码');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode,
          numbers: selectedNumber,
          betAmount,
          gameType: 'BILLETE',
        }),
      });
      const data = await res.json();
      setOrder(data);
    } catch (err) {
      alert('下单失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 订单已创建 - 黄色等待区
  if (order && order.status === 'pending') {
    return <PendingState order={order} />;
  }

  // 已支付状态 - 绿色
  if (order && order.status === 'paid') {
    return <PaidState order={order} />;
  }

  // 默认选号界面
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm p-4 sticky top-0">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <span className="font-bold">店号: {storeCode}</span>
          <span className="text-sm text-gray-500">Billete</span>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4">
        {/* 号码输入 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-4">
          <p className="text-sm text-gray-600 mb-3">输入4位号码 (0000-9999)</p>
          <input
            type="text"
            maxLength={4}
            value={selectedNumber}
            onChange={(e) => setSelectedNumber(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="____"
            className="w-full text-center text-5xl font-mono tracking-[1em] py-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
            autoFocus
          />
        </div>

        {/* 快速选号 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <p className="text-sm text-gray-600 mb-3">快速选号</p>
          <div className="grid grid-cols-4 gap-2">
            {['0000', '1111', '2222', '3333', '1234', '5678', '9999', '8888'].map(num => (
              <button
                key={num}
                onClick={() => setSelectedNumber(num)}
                className={`py-2 rounded-lg font-mono ${
                  selectedNumber === num
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* 投注金额 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <p className="text-sm text-gray-600 mb-3">投注金额</p>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 5, 10].map(amt => (
              <button
                key={amt}
                onClick={() => setBetAmount(amt)}
                className={`py-3 rounded-xl font-bold ${
                  betAmount === amt 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                ${amt}
              </button>
            ))}
          </div>
        </div>

        {/* 奖金说明 */}
        <div className="bg-yellow-50 rounded-2xl p-4 mb-4">
          <p className="text-sm font-bold text-yellow-800 mb-2">💰 奖金说明</p>
          <div className="text-xs text-yellow-700 space-y-1">
            <p>头奖四位: $2000 | 二奖四位: $600 | 三奖四位: $300</p>
            <p>三位数: $50/$20/$10 | 两位数: $3/$2/$1</p>
            <p className="text-yellow-600">* 所有中奖可累加</p>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || selectedNumber.length !== 4}
          className="w-full bg-green-600 text-white py-4 rounded-2xl font-bold text-xl disabled:bg-gray-300"
        >
          {loading ? '提交中...' : `确认投注 $${betAmount}`}
        </button>
      </main>
    </div>
  );
}

// ------------------------------------------
// 状态：等待支付（黄色）
// ------------------------------------------
function PendingState({ order }: { order: Order }) {
  return (
    <div className="min-h-screen bg-yellow-400 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 text-center max-w-md w-full">
        <div className="text-6xl mb-4">⏳</div>
        <h2 className="text-2xl font-bold mb-2">待支付</h2>
        <p className="text-gray-600 mb-6">请将 <span className="font-bold text-xl">${order.betAmount}</span> 交给店员</p>
        
        <div className="bg-gray-100 rounded-2xl p-6 mb-6">
          <p className="text-sm text-gray-500 mb-2">核销码</p>
          <p className="text-6xl font-mono font-bold text-blue-600 tracking-widest">
            {order.verificationCode}
          </p>
        </div>

        <div className="text-left bg-gray-50 rounded-xl p-4 mb-4">
          <p><span className="text-gray-500">号码：</span><span className="font-mono font-bold text-xl">{order.numbers}</span></p>
          <p><span className="text-gray-500">金额：</span>${order.betAmount}</p>
        </div>

        <RealTimeStatus orderId={order.id} />
      </div>
    </div>
  );
}

// ------------------------------------------
// 状态：已支付（绿色）
// ------------------------------------------
function PaidState({ order }: { order: Order }) {
  return (
    <div className="min-h-screen bg-green-500 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 text-center max-w-md w-full">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-2xl font-bold mb-2">已支付</h2>
        <p className="text-gray-600 mb-6">等待开奖...</p>
        
        <div className="bg-gray-100 rounded-2xl p-6">
          <p className="text-sm text-gray-500 mb-2">您的号码</p>
          <p className="text-4xl font-mono font-bold">{order.numbers}</p>
          <p className="text-green-600 font-bold mt-2">投注 ${order.betAmount}</p>
        </div>

        <RealTimeStatus orderId={order.id} />
      </div>
    </div>
  );
}

// ------------------------------------------
// 实时状态轮询
// ------------------------------------------
function RealTimeStatus({ orderId }: { orderId: number }) {
  const [status, setStatus] = useState<string>('pending');

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status);
          if (data.status === 'paid') {
            window.location.reload();
          }
        }
      } catch (err) {
        console.error('Status check failed', err);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [orderId]);

  return (
    <div className="mt-4 text-xs text-gray-400">
      最后更新: {new Date().toLocaleTimeString()}
    </div>
  );
}
