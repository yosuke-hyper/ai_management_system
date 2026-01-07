import React from 'react';
import { X, AlertTriangle, Info, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatPercent, formatCurrency } from '@/lib/format';
import { AnomalyResult, getSeverityColor, getSeverityLabel, getMetricName } from '@/services/anomalyDetection';

interface AnomalyDetailModalProps {
  result: AnomalyResult;
  metricType: string;
  onClose: () => void;
}

export function AnomalyDetailModal({ result, metricType, onClose }: AnomalyDetailModalProps) {
  const severityColor = getSeverityColor(result.severity);
  const severityLabel = getSeverityLabel(result.severity);
  const metricName = getMetricName(metricType);

  const isPercentageMetric = metricType.includes('ratio') || metricType === 'fl_cost';
  const isCurrencyMetric = metricType === 'sales';

  const formatValue = (value: number) => {
    if (isPercentageMetric) {
      return formatPercent(value);
    } else if (isCurrencyMetric) {
      return formatCurrency(value);
    } else {
      return `${Math.round(value)}人`;
    }
  };

  const deviation = result.current_value - result.average_value;
  const deviationPercent = result.average_value > 0
    ? ((deviation / result.average_value) * 100).toFixed(1)
    : '0';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <CardHeader className="relative border-b">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-start gap-3 pr-12">
            <div className={`p-3 rounded-full bg-${severityColor}-100`}>
              {result.is_anomaly ? (
                <AlertTriangle className={`w-6 h-6 text-${severityColor}-600`} />
              ) : (
                <Info className="w-6 h-6 text-green-600" />
              )}
            </div>
            <div className="flex-1">
              <CardTitle className="text-xl mb-2">
                {metricName}の異常検知結果
              </CardTitle>
              {result.is_anomaly && (
                <Badge
                  variant="outline"
                  className={`bg-${severityColor}-100 text-${severityColor}-800 border-${severityColor}-300`}
                >
                  {severityLabel}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* AIからのメッセージ */}
          <div className={`p-4 rounded-lg border-2 ${
            result.is_anomaly
              ? `bg-${severityColor}-50 border-${severityColor}-200`
              : 'bg-green-50 border-green-200'
          }`}>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-12 h-12">
                <img
                  src={result.is_anomaly ? '/images/avatar/thinking.png' : '/images/avatar/happy.png'}
                  alt="AI Avatar"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  result.is_anomaly ? `text-${severityColor}-900` : 'text-green-900'
                }`}>
                  {result.message}
                </p>
              </div>
            </div>
          </div>

          {/* 数値比較 */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              数値の比較
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="text-xs text-blue-600 mb-1">今日の値</div>
                <div className="text-2xl font-bold text-blue-900">
                  {formatValue(result.current_value)}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="text-xs text-gray-600 mb-1">過去90日の平均</div>
                <div className="text-2xl font-bold text-gray-900">
                  {formatValue(result.average_value)}
                </div>
              </div>

              <div className={`p-4 rounded-lg border ${
                Math.abs(parseFloat(deviationPercent)) > 20
                  ? 'bg-red-50 border-red-200'
                  : 'bg-green-50 border-green-200'
              }`}>
                <div className="text-xs text-gray-600 mb-1">差分</div>
                <div className={`text-2xl font-bold flex items-center gap-1 ${
                  Math.abs(parseFloat(deviationPercent)) > 20
                    ? 'text-red-900'
                    : 'text-green-900'
                }`}>
                  {deviation > 0 ? (
                    <TrendingUp className="w-5 h-5" />
                  ) : deviation < 0 ? (
                    <TrendingDown className="w-5 h-5" />
                  ) : null}
                  {deviationPercent}%
                </div>
              </div>
            </div>
          </div>

          {/* 統計情報 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">統計情報</h3>

            <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">標準偏差:</span>
                <span className="font-mono font-medium">
                  {isPercentageMetric
                    ? formatPercent(result.std_deviation)
                    : isCurrencyMetric
                    ? formatCurrency(result.std_deviation)
                    : `${Math.round(result.std_deviation)}人`
                  }
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">Zスコア:</span>
                <span className="font-mono font-medium">
                  {result.std_deviation > 0
                    ? Math.abs((result.current_value - result.average_value) / result.std_deviation).toFixed(2)
                    : '0.00'
                  }
                </span>
              </div>

              {result.std_deviation > 0 && (
                <div className="pt-2 border-t border-gray-200 text-xs text-gray-500">
                  💡 Zスコアが2.5以上の場合、統計的に異常値と判定されます
                </div>
              )}
            </div>
          </div>

          {/* 分析理由 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">分析の詳細</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {result.reason}
              </p>
            </div>
          </div>

          {/* アクションボタン */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
            <Button
              onClick={onClose}
              className="flex-1"
              variant={result.is_anomaly ? "default" : "outline"}
            >
              {result.is_anomaly ? '確認しました' : '閉じる'}
            </Button>

            {result.is_anomaly && result.severity === 'high' && (
              <Button
                onClick={() => {
                  window.history.back();
                }}
                variant="outline"
                className="flex-1"
              >
                日報を修正する
              </Button>
            )}
          </div>

          {result.is_anomaly && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800">
                ⚠️ この警告は参考情報です。特別な事情（イベント、休日、悪天候など）で異常値となる場合もあります。
                必要に応じて日報にメモを追加してください。
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
