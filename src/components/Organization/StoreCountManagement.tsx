import { useState, useEffect } from 'react';
import { useOrganization } from '../../contexts/OrganizationContext';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Store, AlertCircle, Info, TrendingUp } from 'lucide-react';
import { subscriptionService, SubscriptionLimits } from '../../services/subscriptionService';
import { supabase } from '../../lib/supabase';

interface StoreCountManagementProps {
  onUpdate?: () => void;
}

export function StoreCountManagement({ onUpdate }: StoreCountManagementProps = {}) {
  const { organization } = useOrganization();
  const [limits, setLimits] = useState<SubscriptionLimits | null>(null);
  const [currentPlan, setCurrentPlan] = useState<{
    name: string;
    displayName: string;
    price: number;
    billingCycle: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (organization) {
      loadPlanData();
    }
  }, [organization?.id]);

  const loadPlanData = async () => {
    if (!organization?.id) return;

    setLoading(true);
    try {
      console.log('🔄 店舗数管理: プランデータを読み込み中...', organization.id);

      const limitsData = await subscriptionService.getSubscriptionLimits(organization.id);
      console.log('📊 店舗数管理: 制限データ取得:', limitsData);
      setLimits(limitsData);

      const subscription = await subscriptionService.getCurrentSubscription(organization.id);
      console.log('📦 店舗数管理: サブスクリプション取得:', subscription);

      if (subscription && subscription.plan) {
        const billingCycle = subscription.plan.billing_cycle === 'annual' ? '年払い' : '月払い';

        const plan = {
          name: subscription.plan.name,
          displayName: subscription.plan.display_name,
          price: subscription.plan.price,
          billingCycle
        };

        console.log('✅ 店舗数管理: プラン情報を設定:', plan);
        setCurrentPlan(plan);
      } else {
        console.warn('⚠️ 店舗数管理: サブスクリプションまたはプランが見つかりません');
        setError('サブスクリプション情報が見つかりません');
      }
    } catch (err: any) {
      console.error('❌ 店舗数管理: プランデータの読み込み失敗:', err);
      setError(err.message || 'プランデータの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };


  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </Card>
    );
  }

  if (error || !limits || !currentPlan) {
    return (
      <Card className="p-6">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-yellow-900 mb-1">
              店舗数管理情報を読み込めませんでした
            </h3>
            {error && (
              <p className="text-xs text-yellow-700 mb-3">{error}</p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={loadPlanData}
              className="text-xs"
            >
              再読み込み
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const storeUsagePercent = limits.maxStores > 0 ? (limits.currentStores / limits.maxStores) * 100 : 0;
  const isOverRecommended = limits.maxStores > 0 && limits.currentStores > limits.maxStores;

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Store className="w-6 h-6 text-blue-600" />
          店舗数の管理
        </h3>
        <p className="text-sm text-gray-600">
          現在のプランと店舗数の状況を確認できます。
        </p>
      </div>

      <div className="mb-6">
        <div className="bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">現在のプラン</span>
            <Badge className="bg-blue-600 text-white">
              {currentPlan.displayName}プラン
            </Badge>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            ¥{currentPlan.price.toLocaleString()}
            <span className="text-sm font-normal text-gray-600 ml-1">
              {currentPlan.billingCycle === '年払い' ? '/年' : '/月'}
            </span>
          </div>
          <div className="text-xs text-gray-600 mt-1">
            {currentPlan.billingCycle}
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="p-4 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">登録店舗数</span>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">
                {limits.currentStores}店舗
              </div>
              {limits.maxStores > 0 && (
                <div className="text-xs text-gray-500 mt-1">
                  推奨: {limits.maxStores}店舗まで
                </div>
              )}
            </div>
          </div>

          {isOverRecommended && (
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-900 mb-1">
                    推奨店舗数を超えています
                  </p>
                  <p className="text-xs text-yellow-800">
                    現在のプランでは{limits.maxStores}店舗までの利用を推奨しています。
                    より多くの店舗を効率的に管理するには、上位プランへのアップグレードをご検討ください。
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-2">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-900 mb-2">
              プラン別の推奨店舗数
            </p>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• <strong>Starter:</strong> 1店舗での運用に最適</li>
              <li>• <strong>Standard:</strong> 2〜3店舗の管理に対応</li>
              <li>• <strong>Premium:</strong> 4店舗以上の多店舗展開に最適</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-sm text-gray-700">
          <strong>店舗の追加:</strong> 店舗管理ページから新しい店舗を登録できます。
          プランの推奨店舗数を超えても登録は可能ですが、パフォーマンス向上のため上位プランへのアップグレードをお勧めします。
        </p>
      </div>
    </Card>
  );
}
