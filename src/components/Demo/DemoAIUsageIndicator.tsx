import React from 'react';
import { Sparkles, MessageSquare, FileText, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { DemoAIUsageStatus } from '@/hooks/useDemoAIUsage';

interface DemoAIUsageIndicatorProps {
  status: DemoAIUsageStatus | null;
  loading?: boolean;
  compact?: boolean;
  featureType?: 'chat' | 'report' | 'both';
  onUpgradeClick?: () => void;
}

export const DemoAIUsageIndicator: React.FC<DemoAIUsageIndicatorProps> = ({
  status,
  loading = false,
  compact = false,
  featureType = 'both',
  onUpgradeClick
}) => {
  console.log('🎯 DemoAIUsageIndicator:', {
    hasStatus: !!status,
    found: status?.found,
    loading,
    chatUsed: status?.chat?.used,
    chatLimit: status?.chat?.limit,
    reportUsed: status?.report?.used,
    reportLimit: status?.report?.limit
  });

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
        <span>読み込み中...</span>
      </div>
    );
  }

  if (!status || !status.found) {
    console.log('⚠️ DemoAIUsageIndicator: No status or not found');
    return null;
  }

  const { chat, report, isExpired } = status;

  if (isExpired) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
        <div className="flex items-center gap-2 text-red-800 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>デモ期間が終了しました</span>
        </div>
      </div>
    );
  }

  const getChatProgressColor = () => {
    const percentage = (chat.used / chat.limit) * 100;
    if (percentage >= 100) return 'bg-red-500';
    if (percentage >= 80) return 'bg-orange-500';
    return 'bg-blue-500';
  };

  const getReportProgressColor = () => {
    const percentage = (report.used / report.limit) * 100;
    if (percentage >= 100) return 'bg-red-500';
    if (percentage >= 80) return 'bg-orange-500';
    return 'bg-green-500';
  };

  const chatPercentage = (chat.used / chat.limit) * 100;
  const reportPercentage = (report.used / report.limit) * 100;

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        {(featureType === 'chat' || featureType === 'both') && (
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-600" />
            <Badge
              variant={chat.remaining > 0 ? 'default' : 'destructive'}
              className="text-xs"
            >
              チャット {chat.remaining}/{chat.limit}
            </Badge>
          </div>
        )}
        {(featureType === 'report' || featureType === 'both') && (
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-green-600" />
            <Badge
              variant={report.remaining > 0 ? 'default' : 'destructive'}
              className="text-xs"
            >
              レポート {report.remaining}/{report.limit}
            </Badge>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          デモ版AI機能の利用状況
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(featureType === 'chat' || featureType === 'both') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <span className="font-medium">AIチャット</span>
              </div>
              <Badge
                variant={chat.remaining > 0 ? 'default' : 'destructive'}
                className="text-xs"
              >
                残り {chat.remaining}/{chat.limit} 回
              </Badge>
            </div>
            <div className="relative">
              <Progress value={chatPercentage} className="h-2" />
              <div
                className={`absolute top-0 left-0 h-2 rounded-full transition-all ${getChatProgressColor()}`}
                style={{ width: `${chatPercentage}%` }}
              />
            </div>
            {chat.remaining === 0 && (
              <p className="text-xs text-red-600">
                チャット機能の利用上限に達しました
              </p>
            )}
          </div>
        )}

        {(featureType === 'report' || featureType === 'both') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-green-600" />
                <span className="font-medium">AI分析レポート</span>
              </div>
              <Badge
                variant={report.remaining > 0 ? 'default' : 'destructive'}
                className="text-xs"
              >
                残り {report.remaining}/{report.limit} 回
              </Badge>
            </div>
            <div className="relative">
              <Progress value={reportPercentage} className="h-2" />
              <div
                className={`absolute top-0 left-0 h-2 rounded-full transition-all ${getReportProgressColor()}`}
                style={{ width: `${reportPercentage}%` }}
              />
            </div>
            {report.remaining === 0 && (
              <p className="text-xs text-red-600">
                レポート生成機能の利用上限に達しました
              </p>
            )}
          </div>
        )}

        {(chat.remaining === 0 || report.remaining === 0) && onUpgradeClick && (
          <div className="pt-2 border-t border-blue-200">
            <div className="bg-blue-50 rounded-lg p-3 space-y-2">
              <p className="text-xs text-blue-900 font-medium">
                本登録で無制限に利用できます
              </p>
              <ul className="text-xs text-blue-800 space-y-1">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-0.5">✓</span>
                  <span>AI機能が無制限で利用可能</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-0.5">✓</span>
                  <span>データの入力・編集が可能</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-0.5">✓</span>
                  <span>14日間の無料トライアル</span>
                </li>
              </ul>
              <Button
                onClick={onUpgradeClick}
                size="sm"
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
              >
                無料で本登録を始める
              </Button>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground pt-2 border-t border-blue-200">
          <p>デモ版では高品質なChatGPT APIを体験できます</p>
          <p className="mt-1">
            有効期限: {new Date(status.expiresAt).toLocaleDateString('ja-JP')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
