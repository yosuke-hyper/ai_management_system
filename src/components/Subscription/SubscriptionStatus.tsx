import { useState, useEffect } from 'react';
import { subscriptionService, SubscriptionLimits } from '../../services/subscriptionService';
import { useOrganization } from '../../contexts/OrganizationContext';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { AlertCircle, CheckCircle, Clock, Store, Users, MessageSquare, DollarSign, Sparkles } from 'lucide-react';

interface SubscriptionStatusProps {
  refreshKey?: number;
}

export function SubscriptionStatus({ refreshKey }: SubscriptionStatusProps = {}) {
  const { organization } = useOrganization();
  const [limits, setLimits] = useState<SubscriptionLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<{
    name: string;
    displayName: string;
    price: number;
    billingCycle: string;
    monthlyEquivalent?: number;
  } | null>(null);

  useEffect(() => {
    if (organization) {
      loadLimits();
      loadPlanInfo();
    }
  }, [organization, refreshKey]);

  const loadLimits = async () => {
    if (!organization) return;
    try {
      console.log('🔄 サブスクリプション制限を読み込み中...', organization.id);
      const data = await subscriptionService.getSubscriptionLimits(organization.id);
      console.log('✅ サブスクリプション制限を取得:', data);
      setLimits(data);
      setError(null);
    } catch (error: any) {
      console.error('❌ サブスクリプション制限の読み込み失敗:', error);
      setError(error.message || 'サブスクリプション情報の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const loadPlanInfo = async () => {
    if (!organization) return;
    try {
      console.log('🔄 プラン情報を読み込み中...', organization.id);
      const subscription = await subscriptionService.getCurrentSubscription(organization.id);
      console.log('📦 取得したサブスクリプション:', subscription);

      if (subscription && subscription.plan) {
        const billingCycle = subscription.plan.billing_cycle === 'annual' ? '年払い' : '月払い';

        const planInfo = {
          name: subscription.plan.name,
          displayName: subscription.plan.display_name,
          price: subscription.plan.price,
          billingCycle,
          monthlyEquivalent: subscription.plan.billing_cycle === 'annual'
            ? subscription.plan.monthly_equivalent_price
            : undefined
        };

        console.log('✅ プラン情報を設定:', planInfo);
        setCurrentPlan(planInfo);
      } else {
        console.log('⚠️ サブスクリプションまたはプラン情報が見つかりません');
      }
    } catch (error: any) {
      console.error('❌ プラン情報の読み込み失敗:', error);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-sm text-gray-500">読み込み中...</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-red-600 mr-2 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-900">
              サブスクリプション情報の読み込みに失敗しました
            </p>
            <p className="text-xs text-red-700 mt-1">{error}</p>
          </div>
        </div>
      </Card>
    );
  }

  if (!limits) {
    return (
      <Card className="p-6">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-900">
              サブスクリプション情報が見つかりません
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              プランを選択してください
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const storeUsagePercent = limits.maxStores > 0 ? (limits.currentStores / limits.maxStores) * 100 : 0;
  const userUsagePercent = (limits.currentUsers / limits.maxUsers) * 100;
  const aiUsagePercent = (limits.currentAiUsage / limits.aiUsageLimit) * 100;

  const getStatusColor = (percent: number) => {
    if (percent >= 90) return 'text-red-600';
    if (percent >= 70) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getProgressColor = (percent: number) => {
    if (percent >= 90) return 'bg-red-600';
    if (percent >= 70) return 'bg-yellow-600';
    return 'bg-green-600';
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">サブスクリプション状況</h3>
        {limits.isTrialing ? (
          <Badge variant="outline" className="border-blue-600 text-blue-600">
            <Clock className="w-4 h-4 mr-1" />
            トライアル中
          </Badge>
        ) : (
          <Badge variant="outline" className="border-green-600 text-green-600">
            <CheckCircle className="w-4 h-4 mr-1" />
            アクティブ
          </Badge>
        )}
      </div>

      {limits.isTrialing && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start">
            <Clock className="w-5 h-5 text-blue-600 mr-2 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900">
                トライアル期間残り：{limits.daysUntilExpiry}日
              </p>
              <p className="text-xs text-blue-700 mt-1">
                トライアル終了後も継続してご利用いただくには、プランの選択が必要です。
              </p>
            </div>
          </div>
        </div>
      )}

      {currentPlan && limits && (
        <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-slate-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">現在のプラン</span>
              {limits.isCampaignPrice && limits.discountRate && (
                <Badge className="bg-gradient-to-r from-red-500 to-pink-500 text-white border-0 text-xs">
                  <Sparkles className="w-3 h-3 mr-1" />
                  {limits.discountRate}%OFF適用中
                </Badge>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-blue-700">
                {currentPlan.displayName}プラン ({currentPlan.billingCycle})
              </div>
            </div>
          </div>
          <div className="border-t border-blue-200 pt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600">プラン単価</span>
              <div className="text-right">
                {limits.isCampaignPrice && limits.originalPricePerStore && (
                  <div className="text-xs text-gray-400 line-through">
                    ￥{limits.originalPricePerStore.toLocaleString()}
                  </div>
                )}
                <span className={`text-sm font-medium ${limits.isCampaignPrice ? 'text-red-600' : 'text-gray-700'}`}>
                  ￥{limits.pricePerStore.toLocaleString()}/店舗/{limits.billingCycle === 'monthly' ? '月' : '年'}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600">登録店舗数</span>
              <span className="text-sm font-medium text-gray-700">{limits.currentStores}店舗</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-blue-100">
              <span className="text-sm font-semibold text-gray-800">合計料金</span>
              <div className="text-right">
                <div className={`text-2xl font-bold ${limits.isCampaignPrice ? 'text-red-600' : 'text-gray-900'}`}>
                  ￥{(limits.billingCycle === 'monthly' ? limits.totalMonthlyPrice : limits.totalAnnualPrice).toLocaleString()}
                  <span className="text-sm font-normal text-gray-600">
                    {limits.billingCycle === 'monthly' ? '/月' : '/年'}
                  </span>
                </div>
                {limits.billingCycle === 'annual' && (
                  <div className={`text-xs ${limits.isCampaignPrice ? 'text-red-600' : 'text-green-600'}`}>
                    月額換算 ￥{Math.round(limits.totalAnnualPrice / 12).toLocaleString()}
                  </div>
                )}
                {limits.isCampaignPrice && (
                  <div className="text-xs text-gray-500 mt-1">
                    キャンペーン期間: 2025/12〜2026/5
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <Store className="w-5 h-5 text-gray-600 mr-2" />
              <span className="text-sm font-medium">店舗数</span>
            </div>
            <span className={`text-sm font-semibold ${getStatusColor(storeUsagePercent)}`}>
              {limits.currentStores}店舗
            </span>
          </div>
          {limits.currentStores > 1 && (
            <p className={`text-xs mt-1 ${limits.isCampaignPrice ? 'text-red-600' : 'text-gray-500'}`}>
              {limits.currentStores}店舗 × ￥{limits.pricePerStore.toLocaleString()} = ￥{(limits.billingCycle === 'monthly' ? limits.totalMonthlyPrice : limits.totalAnnualPrice).toLocaleString()}
              {limits.isCampaignPrice && ' (キャンペーン価格)'}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <Users className="w-5 h-5 text-gray-600 mr-2" />
              <span className="text-sm font-medium">ユーザー数</span>
            </div>
            <span className={`text-sm font-semibold ${getStatusColor(userUsagePercent)}`}>
              {limits.currentUsers} / {limits.maxUsers}
            </span>
          </div>
          <Progress value={userUsagePercent} className="h-2" indicatorClassName={getProgressColor(userUsagePercent)} />
          <p className="text-xs text-gray-500 mt-1">
            最大{limits.maxUsers}人まで利用可能
          </p>
          {userUsagePercent >= 90 && (
            <p className="text-xs text-red-600 mt-1 flex items-center">
              <AlertCircle className="w-3 h-3 mr-1" />
              ユーザー数の上限に近づいています
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <MessageSquare className="w-5 h-5 text-gray-600 mr-2" />
              <span className="text-sm font-medium">AI利用回数（今月）</span>
            </div>
            <span className={`text-sm font-semibold ${getStatusColor(aiUsagePercent)}`}>
              {limits.currentAiUsage} / {limits.aiUsageLimit}
            </span>
          </div>
          <Progress value={aiUsagePercent} className="h-2" indicatorClassName={getProgressColor(aiUsagePercent)} />
          <p className="text-xs text-gray-500 mt-1">
            {limits.aiUsageLimit}回/店舗/月（全{limits.currentStores}店舗で合計{limits.aiUsageLimit * limits.currentStores}回）
          </p>
          {aiUsagePercent >= 90 && (
            <p className="text-xs text-red-600 mt-1 flex items-center">
              <AlertCircle className="w-3 h-3 mr-1" />
              AI利用回数の上限に近づいています
            </p>
          )}
        </div>
      </div>

      {storeUsagePercent >= 90 && (
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm font-medium text-yellow-900 mb-2">
            店舗数が上限に達しました
          </p>
          <p className="text-xs text-yellow-800">
            5店舗以上をご利用の場合は、割引プランをご用意しております。お気軽にお問い合わせください。
          </p>
        </div>
      )}

      {(storeUsagePercent < 90 && (userUsagePercent >= 70 || aiUsagePercent >= 70)) && (
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-900">
            利用上限に近づいています。より多くの機能をご利用いただくには、プランのアップグレードをご検討ください。
          </p>
        </div>
      )}
    </Card>
  );
}
