import React from 'react';
import { Target, ArrowRight, Calendar } from 'lucide-react';

interface MonthlyTargetReminderCardProps {
  monthName: string;
  hasTargetSet: boolean;
  isFirstWeekOfMonth: boolean;
  storeId?: string;
  onOpenTargetSettings?: () => void;
}

export const MonthlyTargetReminderCard: React.FC<MonthlyTargetReminderCardProps> = ({
  monthName,
  hasTargetSet,
  isFirstWeekOfMonth,
  onOpenTargetSettings,
}) => {
  if (hasTargetSet || !isFirstWeekOfMonth) {
    return null;
  }

  const formatMonthDisplay = (yyyymm: string) => {
    const [year, month] = yyyymm.split('-');
    return `${year}年${parseInt(month, 10)}月`;
  };

  return (
    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-5">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-100">
          <Target className="w-6 h-6 text-emerald-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              月初のおすすめ
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              <Calendar className="w-3 h-3" />
              {formatMonthDisplay(monthName)}
            </span>
          </div>

          <h3 className="font-semibold text-gray-900 text-lg">月次目標を設定しましょう</h3>

          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            新しい月が始まりました。今月の売上目標を設定すると、日々の達成度がグラフで確認できます。
          </p>

          <button
            onClick={onOpenTargetSettings}
            className="inline-flex items-center gap-2 mt-3 text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            目標を設定する
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
