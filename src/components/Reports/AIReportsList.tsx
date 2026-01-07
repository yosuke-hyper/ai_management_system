import { FileText, Calendar, TrendingUp, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAIReports } from '../../hooks/useAIReports';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface AIReportsListProps {
  reports?: any[];
  storeId?: string;
  onReportSelect: (reportId: string) => void;
  onDelete?: (reportId: string) => Promise<void>;
}

export function AIReportsList({ reports: propReports, storeId, onReportSelect, onDelete }: AIReportsListProps) {
  const { reports: fetchedReports, loading, error } = useAIReports(storeId);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reports = propReports !== undefined ? propReports : fetchedReports;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600">レポートの読み込みに失敗しました</p>
        <p className="text-sm text-gray-500 mt-2">{error}</p>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="p-12 text-center">
        <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">レポートがありません</h3>
        <p className="text-gray-500">
          自動生成されたレポートがここに表示されます
        </p>
      </div>
    );
  }

  const handleDelete = async (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation();
    console.log('🔘 Delete button clicked for report:', reportId);

    if (!onDelete) {
      console.warn('⚠️ No onDelete handler provided');
      return;
    }

    const confirmed = window.confirm('このレポートを削除してもよろしいですか？\nこの操作は取り消せません。');
    console.log('❓ User confirmation:', confirmed);

    if (confirmed) {
      setDeletingId(reportId);
      console.log('⏳ Starting delete operation...');

      try {
        await onDelete(reportId);
        console.log('✅ Delete completed successfully');
        alert('レポートを削除しました。');
      } catch (error) {
        console.error('❌ Delete failed with error:', error);
        const errorMessage = error instanceof Error ? error.message : 'レポートの削除に失敗しました。';
        alert(`削除エラー:\n${errorMessage}`);
      } finally {
        setDeletingId(null);
        console.log('🏁 Delete operation finished');
      }
    }
  };

  return (
    <div className="space-y-4">
      {reports.map((report) => (
        <Card key={report.id} className="p-4 sm:p-6 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => onReportSelect(report.id)}>
          <div className="space-y-4">
            {/* ヘッダー部分 */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={report.report_type === 'weekly' ? 'default' : 'secondary'}>
                  {report.report_type === 'weekly' ? '期間指定' : '月次'}
                </Badge>
                <div className="flex items-center text-xs sm:text-sm text-gray-500">
                  <Calendar className="w-3 h-3 sm:w-4 sm:h-4 mr-1 flex-shrink-0" />
                  <span className="whitespace-nowrap">{report.period_start} 〜</span>
                  <span className="whitespace-nowrap ml-1">{report.period_end}</span>
                </div>
              </div>
              <div className="text-xs sm:text-sm text-gray-500">
                {new Date(report.generated_at).toLocaleString('ja-JP', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>

            {/* タイトルと概要 */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                {report.title}
              </h3>
              <p className="text-sm sm:text-base text-gray-600 line-clamp-2">
                {report.summary}
              </p>
            </div>

            {/* メトリクス */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="bg-blue-50 rounded-lg p-2 sm:p-3">
                <div className="text-[10px] sm:text-xs text-gray-600 mb-1">売上</div>
                <div className="text-sm sm:text-lg font-bold text-blue-600 break-all">
                  ¥{(report.metrics.totalSales / 10000).toFixed(0)}万
                </div>
              </div>

              <div className="bg-green-50 rounded-lg p-2 sm:p-3">
                <div className="text-[10px] sm:text-xs text-gray-600 mb-1">営業利益</div>
                <div className="text-sm sm:text-lg font-bold text-green-600 break-all">
                  ¥{(Math.round(report.metrics.operatingProfit) / 10000).toFixed(0)}万
                </div>
              </div>

              <div className="bg-purple-50 rounded-lg p-2 sm:p-3">
                <div className="text-[10px] sm:text-xs text-gray-600 mb-1">利益率</div>
                <div className="text-sm sm:text-lg font-bold text-purple-600">
                  {report.metrics.profitMargin.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* フッター */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 flex-shrink-0" />
                <span className="text-xs sm:text-sm text-gray-500">
                  {report.key_insights.length}件の重要な発見
                </span>
              </div>
              <div className="flex items-center gap-2">
                {onDelete && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleDelete(e, report.id)}
                    disabled={deletingId === report.id}
                    className="text-xs sm:text-sm text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    {deletingId === report.id ? (
                      <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                    )}
                  </Button>
                )}
                <Button variant="outline" size="sm" className="text-xs sm:text-sm">
                  詳細を見る
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
