import React, { lazy, Suspense } from 'react'
import { TrendingUp, Wallet, PiggyBank, Percent, FileText, Sun, Moon } from 'lucide-react'
import { MetricCard } from '@/components/ui/MetricCard'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatPercent } from '@/lib/format'

const SalesChart = lazy(() => import('@/components/charts/SalesChart').then(m => ({ default: m.SalesChart })))
const ExpensePie = lazy(() => import('@/components/charts/ExpensePie').then(m => ({ default: m.ExpensePie })))
const CalendarHeatmap = lazy(() => import('@/components/charts/CalendarHeatmap').then(m => ({ default: m.CalendarHeatmap })))
const ProfitWaterfall = lazy(() => import('@/components/charts/ProfitWaterfall').then(m => ({ default: m.ProfitWaterfall })))
const AlertsPanel = lazy(() => import('@/components/alerts/AlertsPanel').then(m => ({ default: m.AlertsPanel })))
const DataTable = lazy(() => import('@/components/data/DataTable').then(m => ({ default: m.DataTable })))
const VendorPurchaseBreakdown = lazy(() => import('@/components/Dashboard/VendorPurchaseBreakdown').then(m => ({ default: m.VendorPurchaseBreakdown })))

interface ExpenseBaselineDb {
  id: string
  store_id: string
  month: string
  rent: number
  utilities: number
  labor_cost: number
  sumOther?: number
}

interface MonthlyExpenseDb {
  id: string
  store_id: string
  month: string
  labor_cost: number
}

interface KpisType {
  totalSales: number
  purchaseTotal: number
  purchaseRate: number
  laborTotal: number
  laborRate: number
  primeCost: number
  primeCostRate: number
  grossProfit: number
  operatingProfit: number
  profitMargin: number
  profitGrowth?: number
  salesGrowth?: number
  reportCount: number
  totalCustomers: number
  averageTicket: number
  averageDailySales: number
  lunchSales: number
  dinnerSales: number
  lunchCustomers: number
  dinnerCustomers: number
  lunchAverageTicket: number
  dinnerAverageTicket: number
  lunchReportCount: number
  dinnerReportCount: number
}

interface TargetType {
  targetSales?: number
  targetProfit?: number
  targetProfitMargin?: number
  targetCostRate?: number
  targetLaborRate?: number
}

interface MonthlyDetailedAnalysisProps {
  displayKpis: KpisType
  displayOtherExpenses: number
  displayReports: any[]
  rangeReports: any[]
  thisMonthReports: any[]
  displayLabel: string
  displayDeltaLabel: string
  currentTarget: TargetType | null
  storeId: string
  rangeMonths: number
  expenseBaseline: ExpenseBaselineDb | null
  vendorPurchases: any[]
  baselineMap: Map<string, ExpenseBaselineDb>
  monthlyExpenseMap: Map<string, MonthlyExpenseDb>
  filterMonth: string | undefined
  onPeriodClick: (period: string) => void
  onMonthChange: (month: string | undefined) => void
}

const ChartSkeleton = () => (
  <div className="bg-white dark:bg-gray-800 rounded-lg border p-6">
    <Skeleton className="h-8 w-48 mb-4" />
    <Skeleton className="h-64 w-full" />
  </div>
)

export const MonthlyDetailedAnalysis: React.FC<MonthlyDetailedAnalysisProps> = ({
  displayKpis,
  displayOtherExpenses,
  displayReports,
  rangeReports,
  thisMonthReports,
  displayLabel,
  displayDeltaLabel,
  currentTarget,
  storeId,
  rangeMonths,
  expenseBaseline,
  vendorPurchases,
  baselineMap,
  monthlyExpenseMap,
  filterMonth,
  onPeriodClick,
  onMonthChange
}) => {
  return (
    <div className="space-y-6">
      <div className="bg-purple-50 dark:bg-purple-950 border-l-4 border-purple-500 p-4 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-2xl" role="img" aria-label="microscope">🔬</span>
          <h2 className="text-lg font-bold text-purple-900 dark:text-purple-100">
            詳細分析データ
          </h2>
        </div>
        <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">
          月次分析に必要な全項目のKPI、ランチ/ディナー別の売上、トレンドグラフ、カレンダーヒートマップ、経費内訳をご確認いただけます。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          label={`${displayLabel}のFLコスト`}
          value={formatCurrency(displayKpis.primeCost)}
          icon={Wallet}
          tone="danger"
          hint="仕入+人件費"
          details={[
            { label: '仕入', value: `${formatCurrency(displayKpis.purchaseTotal)} (${formatPercent(displayKpis.purchaseRate)})` },
            { label: '人件費', value: `${formatCurrency(displayKpis.laborTotal)} (${formatPercent(displayKpis.laborRate)})` }
          ]}
        />

        <MetricCard
          label={`${displayLabel}の営業利益`}
          value={formatCurrency(displayKpis.operatingProfit)}
          delta={displayKpis.profitGrowth !== undefined ? {
            value: displayKpis.profitGrowth,
            isPositive: displayKpis.profitGrowth >= 0,
            label: displayDeltaLabel
          } : undefined}
          icon={PiggyBank}
          tone={displayKpis.operatingProfit >= 0 ? "success" : "danger"}
          hint={`利益率 ${formatPercent(displayKpis.profitMargin)}`}
          details={[
            { label: '粗利益', value: formatCurrency(displayKpis.grossProfit) },
            { label: 'その他経費', value: formatCurrency(displayOtherExpenses) }
          ]}
        />

        <MetricCard
          label="FLコスト率"
          value={formatPercent(displayKpis.primeCostRate)}
          icon={Percent}
          tone={displayKpis.primeCostRate <= 58 ? 'success' : displayKpis.primeCostRate <= 62 ? 'warning' : 'danger'}
          hint={`原価率${formatPercent(displayKpis.purchaseRate)}${currentTarget?.targetCostRate ? ` (目標${formatPercent(currentTarget.targetCostRate)})` : ''} / 人件費率${formatPercent(displayKpis.laborRate)}${currentTarget?.targetLaborRate ? ` (目標${formatPercent(currentTarget.targetLaborRate)})` : ''}`}
          details={[
            { label: 'FLコスト', value: formatCurrency(displayKpis.primeCost) },
            { label: '対売上比', value: displayKpis.totalSales > 0 ? formatPercent((displayKpis.primeCost / displayKpis.totalSales) * 100) : '0%' }
          ]}
        />

        <MetricCard
          label="営業利益率"
          value={formatPercent(displayKpis.profitMargin)}
          icon={Percent}
          tone={displayKpis.profitMargin >= 15 ? "success" : displayKpis.profitMargin >= 10 ? "warning" : "danger"}
          hint="営業利益 ÷ 売上高"
          details={[
            { label: '営業利益', value: formatCurrency(displayKpis.operatingProfit) },
            { label: '目標利益率', value: currentTarget?.targetProfitMargin ? formatPercent(currentTarget.targetProfitMargin) : '-' }
          ]}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          label="平均日商"
          value={formatCurrency(displayKpis.averageDailySales)}
          icon={FileText}
          tone="neutral"
          hint="1日あたり平均売上"
          details={[
            { label: '営業日数', value: `${displayKpis.reportCount}日` },
            { label: '合計売上', value: formatCurrency(displayKpis.totalSales) }
          ]}
        />

        <MetricCard
          label="客数"
          value={displayKpis.totalCustomers > 0 ? `${displayKpis.totalCustomers.toLocaleString('ja-JP')} 名` : '未入力'}
          icon={FileText}
          tone={displayKpis.totalCustomers > 0 ? "info" : "neutral"}
          hint={displayKpis.totalCustomers > 0 ? `平均客単価: ${formatCurrency(displayKpis.averageTicket)}` : "日報で客数を入力してください"}
          details={displayKpis.totalCustomers > 0 ? [
            { label: '平均客単価', value: formatCurrency(displayKpis.averageTicket) },
            { label: '1日平均客数', value: `${Math.round(displayKpis.totalCustomers / displayKpis.reportCount)}名` }
          ] : [
            { label: 'データなし', value: '-' }
          ]}
        />

        <MetricCard
          label="FL以外の経費"
          value={formatCurrency(displayOtherExpenses)}
          icon={Wallet}
          tone="danger"
          hint="FL以外の経費（参考経費から算出）"
          details={[
            { label: '対売上比', value: displayKpis.totalSales > 0 ? formatPercent((displayOtherExpenses / displayKpis.totalSales) * 100) : '0%' },
            { label: '1日平均', value: displayKpis.reportCount > 0 ? formatCurrency(displayOtherExpenses / displayKpis.reportCount) : '-' }
          ]}
        />

        <MetricCard
          label="ランチ/ディナー比率"
          value={displayKpis.totalSales > 0 ? `${Math.round((displayKpis.lunchSales / displayKpis.totalSales) * 100)}% / ${Math.round((displayKpis.dinnerSales / displayKpis.totalSales) * 100)}%` : '-'}
          icon={TrendingUp}
          tone="info"
          hint="売上構成比"
          details={[
            { label: 'ランチ', value: formatCurrency(displayKpis.lunchSales) },
            { label: 'ディナー', value: formatCurrency(displayKpis.dinnerSales) }
          ]}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MetricCard
          label={`${displayLabel}のランチ売上`}
          value={formatCurrency(displayKpis.lunchSales)}
          icon={Sun}
          tone="warning"
          hint={`${displayKpis.lunchReportCount}日間の報告`}
          details={displayKpis.lunchCustomers > 0 ? [
            { label: '客単価', value: formatCurrency(displayKpis.lunchAverageTicket) },
            { label: '客数', value: `${displayKpis.lunchCustomers.toLocaleString()}人` },
            { label: '売上比率', value: displayKpis.totalSales > 0 ? formatPercent((displayKpis.lunchSales / displayKpis.totalSales) * 100) : '0%' }
          ] : [
            { label: 'データなし', value: '-' }
          ]}
        />

        <MetricCard
          label={`${displayLabel}のディナー売上`}
          value={formatCurrency(displayKpis.dinnerSales)}
          icon={Moon}
          tone="info"
          hint={`${displayKpis.dinnerReportCount}日間の報告`}
          details={displayKpis.dinnerCustomers > 0 ? [
            { label: '客単価', value: formatCurrency(displayKpis.dinnerAverageTicket) },
            { label: '客数', value: `${displayKpis.dinnerCustomers.toLocaleString()}人` },
            { label: '売上比率', value: displayKpis.totalSales > 0 ? formatPercent((displayKpis.dinnerSales / displayKpis.totalSales) * 100) : '0%' }
          ] : [
            { label: 'データなし', value: '-' }
          ]}
        />
      </div>

      <Suspense fallback={<div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><ChartSkeleton /><ChartSkeleton /></div>}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SalesChart
            reports={rangeReports}
            period="monthly"
            maxPoints={rangeMonths}
            targetSales={currentTarget?.targetSales}
            onDataPointClick={onPeriodClick}
            expenseBaseline={expenseBaseline}
          />
          <ExpensePie
            reports={displayReports}
            period="monthly"
            title={`${displayLabel}の経費内訳`}
            expenseBaseline={expenseBaseline}
            daysCount={displayReports.length}
          />
        </div>
      </Suspense>

      {storeId !== 'all' && vendorPurchases.length > 0 && (
        <Suspense fallback={<ChartSkeleton />}>
          <VendorPurchaseBreakdown
            purchases={vendorPurchases}
            title={`${displayLabel}の仕入内訳`}
            showPercentage={true}
          />
        </Suspense>
      )}

      <Suspense fallback={<div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><ChartSkeleton /><ChartSkeleton /></div>}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CalendarHeatmap reports={thisMonthReports} />
          <ProfitWaterfall
            reports={displayReports}
            expenseBaseline={expenseBaseline}
            adjustedLaborCost={displayKpis.laborTotal}
          />
        </div>
      </Suspense>

      <Suspense fallback={<ChartSkeleton />}>
        <AlertsPanel
          kpis={displayKpis}
          targetCostRate={currentTarget?.targetCostRate}
          targetLaborRate={currentTarget?.targetLaborRate}
        />
      </Suspense>

      <Suspense fallback={<ChartSkeleton />}>
        <DataTable
          reports={rangeReports}
          period="monthly"
          groupByStore={false}
          onPeriodClick={onPeriodClick}
          baselineMap={baselineMap}
          monthlyExpenseMap={monthlyExpenseMap}
          selectedMonth={filterMonth}
          onMonthChange={onMonthChange}
          showMonthSelector={true}
        />
      </Suspense>
    </div>
  )
}

export default MonthlyDetailedAnalysis
