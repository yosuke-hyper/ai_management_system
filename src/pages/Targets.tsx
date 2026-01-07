import React from 'react'
import { useLocation } from 'react-router-dom'
import { Target, TrendingUp, Users, Calendar, AlertCircle, CheckCircle, Percent } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MonthlyProgressCard } from '@/components/Dashboard/MonthlyProgressCard'
import { StatusMetricCard } from '@/components/Dashboard/StatusMetricCard'
import { SalesChart } from '@/components/Charts/SalesChart'
import { useReports } from '@/hooks/useReports'
import { useTargets } from '@/hooks/useTargets'
import { useKpis } from '@/hooks/useKpis'
import { useExpenseBaseline } from '@/hooks/useExpenseBaseline'
import { useAdminData } from '@/contexts/AdminDataContext'
import { useBrands } from '@/hooks/useBrands'
import { formatCurrency, formatPercent, formatNumber } from '@/lib/format'

export const Targets: React.FC = () => {
  const location = useLocation()
  const sp = new URLSearchParams(location.search)
  const storeId = sp.get('store') || 'all'
  const brandId = sp.get('brand') || ''
  const { stores } = useAdminData()
  const { getBrandById } = useBrands()
  const selectedBrand = getBrandById(brandId)

  const [selectedPeriod, setSelectedPeriod] = React.useState<string>(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const initial = `${year}-${month}`
    console.log('📅 Initial period:', { now: now.toISOString(), initial })
    return initial
  })

  const { expenseBaseline, monthlyExpenseBaseline } = useExpenseBaseline(storeId, selectedPeriod)

  const startDate = `${selectedPeriod}-01`
  const endDate = React.useMemo(() => {
    const [year, month] = selectedPeriod.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    return `${selectedPeriod}-${String(lastDay).padStart(2, '0')}`
  }, [selectedPeriod])

  const { data: monthReports, isLoading } = useReports({
    storeId,
    brandId,
    dateFrom: startDate,
    dateTo: endDate
  })

  console.log('📊 Targets: monthReports', {
    count: monthReports.length,
    startDate,
    endDate,
    storeId,
    selectedPeriod,
    firstReport: monthReports[0],
    lastReport: monthReports[monthReports.length - 1]
  })

  const brandStores = React.useMemo(() => {
    console.log('🔍 Targets: Calculating brandStores', { brandId, storeId, totalStores: stores.length })
    if (brandId && brandId !== 'headquarters' && storeId === 'all') {
      const filtered = stores.filter(s => {
        console.log('🔍 Checking store:', s.name, 'brandId:', s.brandId, 'matches:', s.brandId === brandId)
        return s.brandId === brandId
      })
      console.log('✅ Filtered brandStores:', filtered.map(s => ({ name: s.name, brandId: s.brandId })))
      return filtered
    }
    console.log('⚠️ No brand filter applied, returning empty array')
    return []
  }, [brandId, storeId, stores])

  const { targets, getAllStoresTarget, calculateTargetMetrics } = useTargets(storeId, selectedPeriod)
  const baseKpis = useKpis(monthReports)

  // 月次経費を日報データ分だけ日割りで加算して正しい営業利益を計算
  const monthKpis = React.useMemo(() => {
    // データがない場合はbaseKpisをそのまま返す
    if (monthReports.length === 0) {
      return baseKpis
    }

    // 単一店舗で月次経費データがある場合のみ追加計算
    if (storeId !== 'all' && monthlyExpenseBaseline && expenseBaseline.monthly) {
      const daysWithReports = monthReports.length
      const monthlyTotal = monthlyExpenseBaseline.totalExpense
      const openDays = expenseBaseline.monthly.open_days || 31
      const proRatedMonthlyExpense = Math.round((monthlyTotal / openDays) * daysWithReports)

      const totalExpenses = baseKpis.totalExpenses + proRatedMonthlyExpense
      const operatingProfit = baseKpis.totalSales - totalExpenses
      const profitMargin = baseKpis.totalSales > 0 ? (operatingProfit / baseKpis.totalSales) * 100 : 0

      return {
        ...baseKpis,
        totalExpenses,
        operatingProfit,
        profitMargin
      }
    }

    // 全店舗選択時、または月次経費データがない場合はbaseKpisをそのまま使用
    return baseKpis
  }, [baseKpis, monthlyExpenseBaseline, expenseBaseline, monthReports.length, storeId])
  
  const allStoresTarget = React.useMemo(() => {
    const baseTarget = getAllStoresTarget()

    if (brandId && storeId === 'all' && brandStores.length > 0) {
      const brandTargets = targets.filter(t =>
        brandStores.some(s => s.id === t.storeId) && t.period === selectedPeriod
      )

      const brandTargetSales = brandTargets.reduce((sum, t) => sum + t.targetSales, 0)
      const brandTargetProfit = brandTargets.reduce((sum, t) => sum + t.targetProfit, 0)
      const brandProfitMargin = brandTargetSales > 0 ? (brandTargetProfit / brandTargetSales) * 100 : 0
      const brandCostRate = brandTargets.length > 0
        ? brandTargets.reduce((sum, t) => sum + t.targetCostRate, 0) / brandTargets.length
        : 0
      const brandLaborRate = brandTargets.length > 0
        ? brandTargets.reduce((sum, t) => sum + t.targetLaborRate, 0) / brandTargets.length
        : 0

      return {
        targetSales: brandTargetSales,
        targetProfit: brandTargetProfit,
        targetProfitMargin: brandProfitMargin,
        targetCostRate: brandCostRate,
        targetLaborRate: brandLaborRate,
        targetAverageSpend: baseTarget.targetAverageSpend || 1000
      }
    }

    return baseTarget
  }, [getAllStoresTarget, brandId, storeId, brandStores, targets, selectedPeriod])

  console.log('🎯 Targets Page Debug:', {
    selectedPeriod,
    storeId,
    brandId,
    brandStores: brandStores.length,
    allStoresTarget,
    monthKpis: {
      totalSales: monthKpis.totalSales,
      operatingProfit: monthKpis.operatingProfit
    }
  })

  const targetMetrics = calculateTargetMetrics(
    monthKpis.totalSales,
    monthKpis.operatingProfit,
    allStoresTarget.targetSales,
    allStoresTarget.targetProfit
  )

  // 現時点での客単価と必要客数を計算
  const customerMetrics = React.useMemo(() => {
    // 現在の客単価を計算（データがない場合はデフォルト値1000円）
    const currentAverageSpend = monthKpis.totalCustomers > 0
      ? monthKpis.totalSales / monthKpis.totalCustomers
      : (allStoresTarget?.targetAverageSpend || 1000)

    // 必要日商を達成するための必要客数/日
    const requiredDailyCustomers = currentAverageSpend > 0 && targetMetrics.requiredDailySales > 0
      ? Math.ceil(targetMetrics.requiredDailySales / currentAverageSpend)
      : 0

    // 現在の日平均客数
    const daysWithReports = monthReports.length
    const currentDailyCustomers = daysWithReports > 0
      ? monthKpis.totalCustomers / daysWithReports
      : 0

    // 客数達成率（現在の日平均客数 / 必要な日平均客数）
    const customerAchievementRate = requiredDailyCustomers > 0
      ? (currentDailyCustomers / requiredDailyCustomers) * 100
      : 0

    return {
      currentAverageSpend,
      requiredDailyCustomers,
      currentDailyCustomers,
      customerAchievementRate
    }
  }, [monthKpis.totalSales, monthKpis.totalCustomers, targetMetrics.requiredDailySales, targetMetrics.requiredCustomers, allStoresTarget?.targetAverageSpend, monthReports.length])

  const displayDate = React.useMemo(() => {
    const [year, month] = selectedPeriod.split('-').map(Number)
    const date = new Date(year, month - 1, 1)
    const formatted = date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long'
    })
    console.log('📅 displayDate calculation:', {
      selectedPeriod,
      year,
      month,
      'month-1': month - 1,
      date: date.toISOString(),
      formatted
    })
    return formatted
  }, [selectedPeriod])

  const availableMonths = React.useMemo(() => {
    const months: { value: string; label: string }[] = []
    const now = new Date()

    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const value = `${year}-${month}`
      const label = date.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long'
      })
      months.push({ value, label })
    }

    console.log('📅 Available months generated:', months)
    return months
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-32 bg-muted rounded-lg"></div>
            </div>
          ))}
        </div>
        <div className="h-96 bg-muted rounded-lg animate-pulse"></div>
      </div>
    )
  }

  const hasData = monthReports.length > 0
  const hasTargets = allStoresTarget.targetSales > 0 || allStoresTarget.targetProfit > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-2xl font-bold text-foreground">
              目標達成度
            </h1>
            {selectedBrand && (
              <Badge
                variant="outline"
                className="text-xs"
                style={{
                  borderColor: selectedBrand.color,
                  color: selectedBrand.color
                }}
              >
                {selectedBrand.icon} {selectedBrand.displayName}
              </Badge>
            )}
            {storeId !== 'all' && stores.find(s => s.id === storeId) && (
              <Badge variant="outline" className="text-xs">
                {stores.find(s => s.id === storeId)?.name}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {displayDate}の目標進捗
            {storeId === 'all' && selectedBrand && ` - ${selectedBrand.displayName}業態全店舗`}
            {storeId === 'all' && !selectedBrand && ' - 全店舗'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <select
            value={selectedPeriod}
            onChange={(e) => {
              console.log('📅 Period changed:', {
                from: selectedPeriod,
                to: e.target.value,
                availableMonths
              })
              setSelectedPeriod(e.target.value)
            }}
            className="px-3 py-2 bg-background border border-input rounded-lg text-sm font-medium hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {availableMonths.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* First-time user guidance */}
      {!hasData && !hasTargets && (
        <Card className="border-2 border-blue-300 bg-blue-50 dark:bg-blue-950">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <Target className="h-8 w-8 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" />
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100">
                  目標達成度の追跡を始めましょう
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  目標達成度を確認するには、以下の手順を完了してください：
                </p>
                <ol className="list-decimal list-inside space-y-2 text-sm text-blue-700 dark:text-blue-300">
                  <li>まず、月次目標を設定します（売上目標、利益目標など）</li>
                  <li>日報を入力して日々の実績を記録します</li>
                  <li>このページで進捗状況と達成率を確認できます</li>
                </ol>
                <div className="pt-2">
                  <a
                    href="/data-management"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Target className="h-4 w-4" />
                    目標を設定する
                  </a>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!hasData && hasTargets && (
        <Card className="border-2 border-yellow-300 bg-yellow-50 dark:bg-yellow-950">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <TrendingUp className="h-8 w-8 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-1" />
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-yellow-900 dark:text-yellow-100">
                  日報を入力して進捗を追跡しましょう
                </h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  目標が設定されています。日報を入力すると、リアルタイムで達成率と必要な日商を確認できます。
                </p>
                <div className="pt-2">
                  <a
                    href="/report-form"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <TrendingUp className="h-4 w-4" />
                    日報を入力する
                  </a>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* New Simplified Progress Card */}
      <MonthlyProgressCard
        currentSales={monthKpis.totalSales}
        targetSales={allStoresTarget.targetSales}
        currentProfit={monthKpis.operatingProfit}
        targetProfit={allStoresTarget.targetProfit}
        daysRemaining={targetMetrics.daysRemaining}
        monthName={displayDate}
      />

      {/* Achievement Cards - Simplified */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusMetricCard
          emoji="💰"
          label="売上"
          value={formatCurrency(monthKpis.totalSales)}
          achievementRate={targetMetrics.salesAchievement}
          target={allStoresTarget.targetSales}
          current={monthKpis.totalSales}
          unit="円"
        />

        <StatusMetricCard
          emoji="😊"
          label="営業利益"
          value={formatCurrency(monthKpis.operatingProfit)}
          achievementRate={targetMetrics.profitAchievement}
          target={allStoresTarget.targetProfit}
          current={monthKpis.operatingProfit}
          unit="円"
        />

        <StatusMetricCard
          emoji="📅"
          label="必要日商"
          value={formatCurrency(targetMetrics.requiredDailySales)}
          achievementRate={targetMetrics.daysRemaining > 0 ? 100 : 0}
          target={targetMetrics.requiredDailySales}
          current={targetMetrics.requiredDailySales}
          unit="円"
          showRemaining={false}
        />

        <StatusMetricCard
          emoji="👥"
          label="必要客数/日"
          value={`${formatNumber(customerMetrics.requiredDailyCustomers)}名`}
          achievementRate={customerMetrics.customerAchievementRate}
          target={customerMetrics.requiredDailyCustomers}
          current={customerMetrics.currentDailyCustomers}
          unit="名"
          showRemaining={true}
          additionalInfo={`現在の客単価: ${formatCurrency(customerMetrics.currentAverageSpend)}`}
        />
      </div>

      {/* Cost and Labor Rate Targets */}
      {(allStoresTarget.targetCostRate > 0 || allStoresTarget.targetLaborRate > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {allStoresTarget.targetCostRate > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-5 w-5 text-orange-600" />
                  原価率
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">実績</span>
                    <span className={`text-2xl font-bold ${
                      monthKpis.purchaseRate <= allStoresTarget.targetCostRate ? 'text-green-600' :
                      monthKpis.purchaseRate <= allStoresTarget.targetCostRate + 5 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {formatPercent(monthKpis.purchaseRate)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">目標</span>
                    <span className="font-medium">{formatPercent(allStoresTarget.targetCostRate)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm pt-2 border-t">
                    <span className="text-muted-foreground">差異</span>
                    <span className={`font-medium ${
                      monthKpis.purchaseRate <= allStoresTarget.targetCostRate ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {monthKpis.purchaseRate <= allStoresTarget.targetCostRate ? '✓ 達成' : `+${formatPercent(monthKpis.purchaseRate - allStoresTarget.targetCostRate)}`}
                    </span>
                  </div>
                  {monthKpis.purchaseRate > allStoresTarget.targetCostRate && (
                    <div className="flex items-center gap-2 p-2 mt-2 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-900">
                      <AlertCircle className="h-4 w-4 text-red-700 dark:text-red-400 flex-shrink-0" />
                      <p className="text-xs text-red-700 dark:text-red-300">
                        原価率が目標を上回っています。仕入管理の見直しが必要です。
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {allStoresTarget.targetLaborRate > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-cyan-600" />
                  人件費率
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">実績</span>
                    <span className={`text-2xl font-bold ${
                      monthKpis.laborRate <= allStoresTarget.targetLaborRate ? 'text-green-600' :
                      monthKpis.laborRate <= allStoresTarget.targetLaborRate + 5 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {formatPercent(monthKpis.laborRate)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">目標</span>
                    <span className="font-medium">{formatPercent(allStoresTarget.targetLaborRate)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm pt-2 border-t">
                    <span className="text-muted-foreground">差異</span>
                    <span className={`font-medium ${
                      monthKpis.laborRate <= allStoresTarget.targetLaborRate ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {monthKpis.laborRate <= allStoresTarget.targetLaborRate ? '✓ 達成' : `+${formatPercent(monthKpis.laborRate - allStoresTarget.targetLaborRate)}`}
                    </span>
                  </div>
                  {monthKpis.laborRate > allStoresTarget.targetLaborRate && (
                    <div className="flex items-center gap-2 p-2 mt-2 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-900">
                      <AlertCircle className="h-4 w-4 text-red-700 dark:text-red-400 flex-shrink-0" />
                      <p className="text-xs text-red-700 dark:text-red-300">
                        人件費率が目標を上回っています。シフト調整の検討が必要です。
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}


      {/* Action Items */}
      {hasData && hasTargets && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              アクション項目
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {targetMetrics.salesAchievement < 90 && (
                <div className="flex items-center gap-3 p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-yellow-700 dark:text-yellow-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">売上目標達成のため日商向上が必要</p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      残り{targetMetrics.daysRemaining}日で{formatCurrency(targetMetrics.requiredDailySales)}/日の売上が必要
                    </p>
                  </div>
                  <Badge variant="outline">高優先度</Badge>
                </div>
              )}

              {monthKpis.profitMargin < 15 && hasTargets && (
                <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-700 dark:text-red-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-900 dark:text-red-100">利益率改善が必要</p>
                    <p className="text-xs text-red-700 dark:text-red-300">
                      現在{formatPercent(monthKpis.profitMargin)}、目標{formatPercent(allStoresTarget.targetProfitMargin)}
                    </p>
                  </div>
                  <Badge variant="destructive">重要</Badge>
                </div>
              )}

              {targetMetrics.salesAchievement >= 100 && targetMetrics.profitAchievement >= 100 && (
                <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-700 dark:text-green-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-900 dark:text-green-100">目標達成おめでとうございます！</p>
                    <p className="text-xs text-green-700 dark:text-green-300">
                      売上・利益ともに目標を上回っています
                    </p>
                  </div>
                  <Badge>達成</Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sales Chart with Target Line */}
      <SalesChart
        reports={monthReports}
        period="daily"
        targetSales={allStoresTarget.targetSales / 30} // Daily target
        expenseBaseline={expenseBaseline}
      />

    </div>
  )
}