import React, { useState } from 'react'
import { Tabs } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Database, Upload, Download, FileText } from 'lucide-react'
import { CSVImport } from '@/components/Data/CSVImport'
import { DataExport } from '@/components/Data/DataExport'

export const DataManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import')

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Database className="w-8 h-8 text-blue-600" />
            データ管理
          </h1>
          <p className="mt-2 text-slate-600">
            データのインポート・エクスポート、一括管理を行えます
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          {
            id: 'import',
            label: 'CSVインポート',
            icon: Upload
          },
          {
            id: 'export',
            label: 'データエクスポート',
            icon: Download
          }
        ]}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as 'import' | 'export')}
      />

      {/* Content */}
      <div className="mt-6">
        {activeTab === 'import' && (
          <div>
            <CSVImport />
          </div>
        )}

        {activeTab === 'export' && (
          <div>
            <DataExport />
          </div>
        )}
      </div>

      {/* Help Card */}
      <Card className="p-6 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <FileText className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-blue-900 mb-2">
              使い方ガイド
            </h3>
            <div className="text-sm text-blue-800 space-y-2">
              <p>
                <strong>CSVインポート:</strong> POSレジや他システムからエクスポートしたデータを一括登録できます
              </p>
              <p>
                <strong>データエクスポート:</strong> 登録済みのデータをCSVやExcel形式でダウンロードできます
              </p>
              <p className="mt-3">
                詳しい使い方は{' '}
                <a
                  href="/CSV_IMPORT_USER_MANUAL.md"
                  target="_blank"
                  className="underline font-semibold"
                >
                  ユーザーマニュアル
                </a>
                {' '}や{' '}
                <a
                  href="/POS_SETUP_GUIDES.md"
                  target="_blank"
                  className="underline font-semibold"
                >
                  POS設定ガイド
                </a>
                {' '}をご覧ください
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
