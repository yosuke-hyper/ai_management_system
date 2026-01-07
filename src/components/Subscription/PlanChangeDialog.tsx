import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Check, AlertCircle, Store } from 'lucide-react';
import { subscriptionService } from '@/services/subscriptionService';

interface PlanChangeDialogProps {
  currentPlanName?: string;
  currentBillingCycle?: string;
  currentContractedStores?: number;
  newPlanName: string;
  newPlanDisplay: string;
  newPlanPrice: number;
  newBillingCycle: 'monthly' | 'annual';
  organizationId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function PlanChangeDialog({
  currentPlanName,
  currentBillingCycle,
  currentContractedStores,
  newPlanName,
  newPlanDisplay,
  newPlanPrice,
  newBillingCycle,
  organizationId,
  onClose,
  onSuccess
}: PlanChangeDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [contractedStores, setContractedStores] = useState<number>(currentContractedStores || 1);

  useEffect(() => {
    if (currentContractedStores) {
      setContractedStores(currentContractedStores);
    }
  }, [currentContractedStores]);

  const billingCycleLabel = newBillingCycle === 'monthly' ? '月払い' : '年払い';

  const handleConfirm = async () => {
    setLoading(true);
    setError('');

    // バリデーション
    if (contractedStores < 1) {
      setError('契約店舗数は1以上を指定してください');
      setLoading(false);
      return;
    }

    if (contractedStores > 100) {
      setError('契約店舗数は100以下を指定してください。それ以上の店舗数が必要な場合はお問い合わせください');
      setLoading(false);
      return;
    }

    try {
      await subscriptionService.changePlan(
        organizationId,
        newPlanName as 'starter' | 'standard' | 'premium',
        newBillingCycle,
        contractedStores
      );
      onSuccess();
    } catch (err: any) {
      console.error('プラン変更エラー:', err);
      setError(err.message || 'プラン変更に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">プラン変更の確認</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={loading}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-6 space-y-4">
          {currentPlanName && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">現在のプラン</div>
              <div className="font-medium text-gray-900">
                {currentPlanName === 'starter' && 'Starter'}
                {currentPlanName === 'standard' && 'Standard'}
                {currentPlanName === 'premium' && 'Premium'}
                プラン（{currentBillingCycle === 'monthly' ? '月払い' : '年払い'}）
              </div>
            </div>
          )}

          <div className="flex items-center justify-center py-2">
            <div className="text-2xl text-gray-400">↓</div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-slate-50 rounded-lg p-4 border-2 border-blue-200">
            <div className="text-sm text-blue-600 font-medium mb-1">新しいプラン</div>
            <div className="font-bold text-xl text-gray-900 mb-2">
              {newPlanDisplay}プラン（{billingCycleLabel}）
            </div>
            <div className="text-2xl font-bold text-blue-600">
              ¥{newPlanPrice.toLocaleString()}
              <span className="text-sm text-gray-600 font-normal ml-1">
                {newBillingCycle === 'monthly' ? '/ 月' : '/ 年'}
              </span>
            </div>
          </div>

          {/* 契約店舗数入力 */}
          <div className="bg-white border-2 border-gray-300 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <div className="flex items-center gap-2 mb-1">
                <Store className="w-4 h-4 text-gray-600" />
                契約店舗数
              </div>
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={contractedStores}
              onChange={(e) => setContractedStores(parseInt(e.target.value) || 1)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-2">
              管理する店舗数を指定してください（推奨: {newPlanName === 'starter' ? '1店舗' : newPlanName === 'standard' ? '2-3店舗' : '4店舗以上'}）
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Check className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">プラン変更について</p>
                <ul className="space-y-1 text-xs">
                  <li>• 変更は即座に適用されます</li>
                  <li>• 次回更新日から新しい料金が適用されます</li>
                  <li>• プランの機能はすぐにご利用いただけます</li>
                </ul>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex gap-3 p-6 border-t border-gray-200">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="flex-1"
          >
            キャンセル
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                変更中...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                プランを変更
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
