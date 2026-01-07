import React from 'react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import { DailyReportData } from '@/types'
import { DailyExpenseReference } from '@/hooks/useExpenseBaseline'

interface ExpensePieProps {
  reports: DailyReportData[]
  period?: 'daily' | 'weekly' | 'monthly'
  className?: string
  title?: string
  expenseBaseline?: DailyExpenseReference
  daysCount?: number
  dateRangeEnd?: Date
}

const COLORS = {
  '仕入': '#ef4444',        // red-500
  '人件費': '#f97316',      // orange-500
  'その他経費': '#f59e0b',  // amber-500
  '営業利益': '#10b981'      // emerald-500 (green for profit)
}

const ExpensePieComponent: React.FC<ExpensePieProps> = ({
  reports,
  period = 'daily',
  className,
  title,
  expenseBaseline,
  daysCount,
  dateRangeEnd
}) => {
  const expenseData = React.useMemo(() => {
    // 今日の日付（時刻は00:00:00にリセット）
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 期間終了日が指定されている場合、今日との比較で小さい方を使用
    const effectiveEndDate = dateRangeEnd ? new Date(Math.min(dateRangeEnd.getTime(), today.getTime())) : today

    // 日付ごとにグループ化して仕入れの重複カウントを防ぐ
    const dailyGroups = new Map<string, {
      sales: number
      purchase: number
      laborCost: number
      utilities: number
      rent: number
      consumables: number
      promotion: number
      cleaning: number
      misc: number
      communication: number
      others: number
    }>()

    // 未来の日付の日報データを除外
    const filteredReports = reports.filter(report => {
      const reportDate = new Date(report.date)
      reportDate.setHours(0, 0, 0, 0)
      return reportDate <= effectiveEndDate
    })

    filteredReports.forEach(report => {
      const key = report.date
      if (!dailyGroups.has(key)) {
        dailyGroups.set(key, {
          sales: 0,
          purchase: 0,
          laborCost: 0,
          utilities: 0,
          rent: 0,
          consumables: 0,
          promotion: 0,
          cleaning: 0,
          misc: 0,
          communication: 0,
          others: 0
        })
      }

      const group = dailyGroups.get(key)!
      group.sales += report.sales
      // 仕入れは1日分の合計なので、最大値を使用（重複カウント防止）
      if (report.purchase > 0) {
        group.purchase = Math.max(group.purchase, report.purchase)
      }
      group.laborCost += report.laborCost
      group.utilities += report.utilities
      group.rent += report.rent || 0
      group.consumables += report.consumables || 0
      group.promotion += report.promotion
      group.cleaning += report.cleaning
      group.misc += report.misc
      group.communication += report.communication
      group.others += report.others
    })

    // 日次グループから合計を計算
    const totals = Array.from(dailyGroups.values()).reduce((acc, day) => ({
      sales: acc.sales + day.sales,
      purchase: acc.purchase + day.purchase,
      laborCost: acc.laborCost + day.laborCost,
      utilities: acc.utilities + day.utilities,
      rent: acc.rent + day.rent,
      consumables: acc.consumables + day.consumables,
      promotion: acc.promotion + day.promotion,
      cleaning: acc.cleaning + day.cleaning,
      misc: acc.misc + day.misc,
      communication: acc.communication + day.communication,
      others: acc.others + day.others
    }), {
      sales: 0,
      purchase: 0,
      laborCost: 0,
      utilities: 0,
      rent: 0,
      consumables: 0,
      promotion: 0,
      cleaning: 0,
      misc: 0,
      communication: 0,
      others: 0
    })

    console.log('💰 ExpensePie - Totals from reports:', {
      reportCount: filteredReports.length,
      originalReportCount: reports.length,
      totalPurchase: totals.purchase,
      totalLaborCost: totals.laborCost,
      sampleReports: filteredReports.slice(0, 3).map(r => ({
        date: r.date,
        operationType: r.operationType,
        purchase: r.purchase,
        laborCost: r.laborCost,
        sales: r.sales
      })),
      allLaborCosts: filteredReports.map(r => r.laborCost)
    })

    // 実際にデータがある日数を計算（ユニークな日付の数、未来の日付を除外）
    const uniqueDates = new Set(filteredReports.map(r => r.date))
    const actualDaysCount = uniqueDates.size

    // 実際のデータ日数を計算（参考経費適用に使用）
    const effectiveDays = actualDaysCount > 0 ? actualDaysCount : (daysCount || 0)

    // 人件費の計算: 日報に人件費データがあればそれを使用、なければ参考経費から計算
    let finalLaborCost = totals.laborCost
    if (totals.laborCost === 0 && expenseBaseline && expenseBaseline.laborCost > 0) {
      // 日報に人件費データがない場合、参考経費から計算
      finalLaborCost = expenseBaseline.laborCost * effectiveDays
      console.log('💡 ExpensePie - Using baseline labor cost:', {
        dailyBaseline: expenseBaseline.laborCost,
        days: effectiveDays,
        calculatedTotal: finalLaborCost
      })
    }

    // その他経費の合計を計算（人件費を除く）
    let otherExpensesExcludingLabor = totals.utilities + totals.rent +
                                      totals.consumables + totals.promotion + totals.cleaning +
                                      totals.misc + totals.communication + totals.others

    // 参考経費が提供されている場合、それを使用（実際のデータ日数を優先）
    // 注意: expenseBaseline.sumOther には人件費は含まれていない
    if (expenseBaseline && expenseBaseline.sumOther > 0) {
      // 実際にデータがある日数分の参考経費を計算
      otherExpensesExcludingLabor = expenseBaseline.sumOther * effectiveDays
    }

    // 総経費 = 仕入 + 人件費 + その他経費
    const totalExpenses = totals.purchase + finalLaborCost + otherExpensesExcludingLabor

    // 営業利益 = 売上 - 総経費
    const operatingProfit = totals.sales - totalExpenses

    const beforeFilter = [
      { name: '仕入', value: totals.purchase },
      { name: '人件費', value: finalLaborCost },
      { name: 'その他経費', value: otherExpensesExcludingLabor },
      { name: '営業利益', value: operatingProfit > 0 ? operatingProfit : 0 }
    ]

    console.log('🔍 ExpensePie - Before filter:', beforeFilter)
    console.log('🔍 ExpensePie - Filter check:', beforeFilter.map(item => ({
      name: item.name,
      value: item.value,
      isPositive: item.value > 0,
      type: typeof item.value
    })))

    const result = beforeFilter.filter(item => item.value > 0)

    console.log('📊 ExpensePie - Final data:', {
      purchase: totals.purchase,
      laborCostFromReports: totals.laborCost,
      finalLaborCost: finalLaborCost,
      otherExpenses: otherExpensesExcludingLabor,
      operatingProfit,
      totalSales: totals.sales,
      result
    })

    return { data: result, totalSales: totals.sales }
  }, [reports, expenseBaseline, daysCount, dateRangeEnd])

  const expenseChartData = expenseData.data
  const totalSales = expenseData.totalSales

  const total = expenseChartData.reduce((sum, item) => sum + item.value, 0)

  const getTitle = () => {
    if (title) return title
    switch (period) {
      case 'daily':
        return '経費内訳（過去7日間）'
      case 'weekly':
        return '経費内訳（過去30日間）'
      case 'monthly':
        return '経費内訳（過去3ヶ月）'
      default:
        return '経費内訳'
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          {getTitle()}
        </CardTitle>
        {period === 'weekly' && (
          <p className="text-xs text-muted-foreground mt-1">
            今週（7日間）の損益を計算しています。
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="mb-4 text-center">
          <div className="text-sm text-muted-foreground">合計売上</div>
          <div className="text-2xl font-bold text-blue-600">{formatCurrency(totalSales)}</div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={expenseChartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              innerRadius={40}
            >
              {expenseChartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS] || '#6b7280'} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [
                `${formatCurrency(value)} (${((value / total) * 100).toFixed(1)}%)`
              ]}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px'
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '14px' }}
              formatter={(value, entry) => {
                const itemValue = entry.payload?.value || 0
                const percentage = total > 0 ? ((itemValue / total) * 100).toFixed(1) : '0.0'
                return `${value}: ${formatCurrency(itemValue)} (${percentage}%)`
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export const ExpensePie = React.memo(ExpensePieComponent)