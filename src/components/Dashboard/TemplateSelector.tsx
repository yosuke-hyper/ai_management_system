import React from 'react';
import { X, Sparkles, CheckCircle2 } from 'lucide-react';
import { getTemplatesForBrand, getBrandLabel, type TargetTemplate } from '@/lib/targetTemplates';

interface TemplateSelectorProps {
  brandType?: string;
  onSelect: (template: TargetTemplate) => void;
  onClose: () => void;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  brandType,
  onSelect,
  onClose
}) => {
  const templates = getTemplatesForBrand(brandType);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">業態別テンプレート選択</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {getBrandLabel(brandType)}の標準的な目標値パターン
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <strong>ヒント：</strong>テンプレートを適用後も、数値は手動で調整できます。
              月間目標売上は各店舗の規模に応じて個別に設定してください。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {templates.map((template, index) => (
              <div
                key={index}
                className="group relative border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6 hover:border-blue-500 dark:hover:border-blue-400 transition-all cursor-pointer hover:shadow-xl"
                onClick={() => onSelect(template)}
              >
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <CheckCircle2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>

                <div className="mb-4">
                  <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                    {template.name}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    {template.description}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                    {template.recommendedFor}
                  </p>
                </div>

                <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">目標営業利益率</span>
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">
                      {template.targetProfitMargin}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">目標原価率</span>
                    <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                      {template.targetCostRate}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">目標人件費率</span>
                    <span className="text-lg font-bold text-cyan-600 dark:text-cyan-400">
                      {template.targetLaborRate}%
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(template);
                    }}
                    className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    このテンプレートを適用
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <h5 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">各パターンの特徴</h5>
            <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <li>• <strong>高利益型：</strong>高付加価値商品・サービスで利益率を重視</li>
              <li>• <strong>バランス型：</strong>業界標準的なバランスの取れた経営</li>
              <li>• <strong>回転効率型：</strong>客数・回転率を重視した薄利多売経営</li>
            </ul>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
