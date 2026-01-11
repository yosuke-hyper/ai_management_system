import React, { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TrendingUp, PiggyBank, Download, ChevronDown, ChevronUp, ShoppingCart, X, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MetricCard } from '@/components/ui/MetricCard'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { useReports } from '@/hooks/useReports'
import { useKpis } from '@/hooks/useKpis'
import { useExpenseBaseline } from '@/hooks/useExpenseBaseline'
import { useTargets } from '@/hooks/useTargets'
import { formatCurrency, formatPercent } from '@/lib/format'
import { useAuth } from '@/contexts/AuthContext'
import { useAdminData } from '@/contexts/AdminDataContext'
import { useBrands } from '@/hooks/useBrands'
import { getExpenseBaseline, ExpenseBaselineDb, getMonthlyExpenses, MonthlyExpenseDb, getVendorPurchasesForPeriod } from '@/services/supabase'

const MonthlyDetailedAnalysis = lazy(() => import('@/components/Dashboard/MonthlyDetailedAnalysis'))
const MonthlySalesExport = lazy(() => import('@/components/Export/MonthlySalesExport').then(m => ({ default: m.MonthlySalesExport })))
const ProfitLossModal = lazy(() => import('@/components/analysis/ProfitLossModal').then(m => ({ default: m.ProfitLossModal })))

export const DashboardMonthly: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const sp = new URLSearchParams(location.search)
  const storeId = sp.get('store') || 'all'
  const brandId = sp.get('brand') || ''
  const { user, canAccessStore, isDemoMode } = useAuth()
  const { stores } = useAdminData()
  const { getBrandById } = useBrands()
  const selectedBrand = getBrandById(brandId)

  // 今月のデータ（KPI用）- 日付計算は一度だけ実行
  const { now, thisMonthStart, today, currentYYYYMM, lastMonthStart, lastMonthEnd, currentYear, currentMonth } = useMemo(() => {
    const currentDate = new Date()
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const monthStart = new Date(year, month, 1)
    const todayStr = currentDate.toISOString().split('T')[0]
    const yyyymm = `${year}-${String(month + 1).padStart(2, '0')}`
    const prevMonthStart = new Date(year, month - 1, 1)
    const prevMonthEnd = new Date(year, month, 0)

    return {
      now: currentDate,
      thisMonthStart: monthStart,
      today: todayStr,
      currentYYYYMM: yyyymm,
      lastMonthStart: prevMonthStart,
      lastMonthEnd: prevMonthEnd,
      currentYear: year,
      currentMonth: month
    }
  }, [])

  const { targets, getTargetForStore, getAllStoresTarget } = useTargets(storeId, currentYYYYMM)
  const { expenseBaseline, monthlyExpenseBaseline } = useExpenseBaseline(storeId, currentYYYYMM)

  // 権限チェック
  useEffect(() => {
    if (!user) return

    // 本部ビューはownerのみ許可
    if (brandId === 'headquarters' && user.role !== 'owner') {
      navigate('/dashboard/monthly', { replace: true })
      return
    }

    // 全店舗表示はadmin/ownerのみ許可（デモモードは常に許可）
    if (storeId === 'all' && user.role !== 'admin' && user.role !== 'owner' && !isDemoMode) {
      const accessibleStores = user.storeIds || []
      if (accessibleStores.length > 0) {
        navigate(`/dashboard/monthly?store=${accessibleStores[0]}`, { replace: true })
      }
      return
    }

    // 特定店舗選択時の権限チェック
    if (storeId !== 'all' && !canAccessStore(storeId)) {
      const accessibleStores = user.storeIds || []
      if (accessibleStores.length > 0) {
        navigate(`/dashboard/monthly?store=${accessibleStores[0]}`, { replace: true })
      } else if (user.role !== 'admin') {
        navigate('/dashboard/monthly', { replace: true })
      }
    }
  }, [storeId, brandId, user?.id, user?.role, canAccessStore, navigate, isDemoMode])

  // 表示範囲：3/6/12ヶ月（デフォルト3ヶ月）
  const [rangeMonths, setRangeMonths] = useState<3 | 6 | 12>(3)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [filterMonth, setFilterMonth] = useState<string | undefined>(undefined)
  const [showExportModal, setShowExportModal] = useState(false)
  // 分析モード：今月のみ or 選択期間の合算
  const [analysisMode, setAnalysisMode] = useState<'current-month' | 'range'>('current-month')
  const [vendorPurchases, setVendorPurchases] = useState<any[]>([])
  const [loadingVendorPurchases, setLoadingVendorPurchases] = useState(false)

  // 段階的開示: 詳細分析エリアの表示/非表示を管理
  const [showDetailedAnalysis, setShowDetailedAnalysis] = useState(() => {
    const saved = localStorage.getItem('showDetailedAnalysisMonthly')
    return saved === 'true'
  })

  useEffect(() => {
    localStorage.setItem('showDetailedAnalysisMonthly', String(showDetailedAnalysis))
  }, [showDetailedAnalysis])

  // ✅ onPeriodClick をメモ化（DataTable の columns 再生成を防ぐ）
  const handlePeriodClick = useCallback((period: string) => {
    setSelectedMonth(period)
  }, [])

  // ✅ onMonthChange をメモ化
  const handleMonthChange = useCallback((month: string | undefined) => {
    setFilterMonth(month)
  }, [])

  // 全モード: useReportsを使用（デモモードも含む）
  const rangeStartDate = useMemo(() => {
    const year = currentYear
    const month = currentMonth - (rangeMonths - 1)
    return new Date(year, month, 1).toISOString().split('T')[0]
  }, [currentYear, currentMonth, rangeMonths])

  // 'headquarters'は全業態を意味するのでbrandIdをundefinedとする
  const effectiveBrandId = (brandId === 'headquarters' || !brandId) ? undefined : brandId

  const rangeFilters = useMemo(() => ({
    storeId,
    brandId: effectiveBrandId,
    dateFrom: rangeStartDate,
    dateTo: today
  }), [storeId, effectiveBrandId, rangeStartDate, today])

  const { data: rangeReports, isLoading, isError, error, refetch } = useReports(rangeFilters)

  // rangeReportsから今月分と先月分をフィルタリング（追加のAPI呼び出しなし）
  const thisMonthReports = useMemo(() => {
    const startStr = thisMonthStart.toISOString().split('T')[0]
    return rangeReports.filter(r => r.date >= startStr && r.date <= today)
  }, [rangeReports, thisMonthStart, today])

  const lastMonthReports = useMemo(() => {
    const startStr = lastMonthStart.toISOString().split('T')[0]
    const endStr = lastMonthEnd.toISOString().split('T')[0]
    return rangeReports.filter(r => r.date >= startStr && r.date <= endStr)
  }, [rangeReports, lastMonthStart, lastMonthEnd])

  const thisMonthKpis = useKpis(thisMonthReports, lastMonthReports, expenseBaseline)
  const yearKpis = useKpis(rangeReports, undefined, expenseBaseline)

  // ✅ DataTable用: rangeReports全体のbaselineMapを作成（最適化版）
  const [baselineMap, setBaselineMap] = useState<Map<string, ExpenseBaselineDb>>(new Map())
  const [monthlyExpenseMap, setMonthlyExpenseMap] = useState<Map<string, MonthlyExpenseDb>>(new Map())
  const baselineLoadingRef = useRef(false)
  const lastKeysRef = useRef<string>('')

  // 必要なキーを抽出（安定した文字列として）
  const expenseKeysNeeded = useMemo(() => {
    const keysSet = new Set<string>()
    rangeReports.forEach(r => {
      const yyyymm = r.date.slice(0, 7)
      keysSet.add(`${r.storeId}__${yyyymm}`)
    })
    return Array.from(keysSet).sort().join(',')
  }, [rangeReports])

  useEffect(() => {
    if (!expenseKeysNeeded) {
      return
    }

    // キーが変わっていなければスキップ
    if (expenseKeysNeeded === lastKeysRef.current) {
      return
    }

    // 既にロード中ならスキップ
    if (baselineLoadingRef.current) {
      return
    }

    const loadBaselines = async () => {
      baselineLoadingRef.current = true
      lastKeysRef.current = expenseKeysNeeded

      try {
        const baselineMapData = new Map<string, ExpenseBaselineDb>()
        const monthlyExpenseMapData = new Map<string, MonthlyExpenseDb>()
        const keysArray = expenseKeysNeeded.split(',').filter(k => k)

        // バッチで取得（Promise.all）
        const promises = keysArray.map(async (key) => {
          const [sid, ym] = key.split('__')

          // 参考経費を取得
          const { data: baselineData } = await getExpenseBaseline(sid, ym)
          if (baselineData) {
            baselineMapData.set(key, baselineData)
          }

          // 月次経費入力データを取得
          const { data: monthlyExpenseData } = await getMonthlyExpenses({
            storeId: sid,
            month: ym
          })
          if (monthlyExpenseData && monthlyExpenseData.length > 0) {
            monthlyExpenseMapData.set(key, monthlyExpenseData[0])
          }
        })

        await Promise.all(promises)
        setBaselineMap(baselineMapData)
        setMonthlyExpenseMap(monthlyExpenseMapData)
      } finally {
        baselineLoadingRef.current = false
      }
    }

    loadBaselines()
  }, [expenseKeysNeeded])

  // 仕入内訳データの取得（月次）
  useEffect(() => {
    const fetchVendorPurchases = async () => {
      if (storeId === 'all' || !thisMonthStart || !today) {
        setVendorPurchases([])
        return
      }

      const startDate = thisMonthStart.toISOString().split('T')[0]

      setLoadingVendorPurchases(true)
      try {
        const { data, error } = await getVendorPurchasesForPeriod(storeId, startDate, today)
        if (error) {
          console.error('月次仕入内訳取得エラー:', error)
          setVendorPurchases([])
        } else {
          setVendorPurchases(data || [])
        }
      } catch (e) {
        console.error('月次仕入内訳取得エラー:', e)
        setVendorPurchases([])
      } finally {
        setLoadingVendorPurchases(false)
      }
    }

    fetchVendorPurchases()
  }, [storeId, thisMonthStart, today])

  // 月次のその他経費を計算（参考経費を使用、人件費を除外）
  const thisMonthOtherExpenses = useMemo(() => {
    // 実際のその他経費を計算（人件費は含まない）
    const actualOtherExpenses = thisMonthReports.reduce((sum, report) => {
      return sum + report.utilities + report.promotion + report.cleaning +
             report.misc + report.communication + report.others +
             (report.rent || 0) + (report.consumables || 0)
    }, 0)

    // 実際の経費がある場合はそれを使用、なければ参考経費を使用
    if (actualOtherExpenses > 0) {
      return actualOtherExpenses
    }

    // 参考経費から日数分の経費を計算（人件費を除外）
    if (expenseBaseline && expenseBaseline.sumOther > 0) {
      // ユニークな日数でカウント（同じ日にランチ・ディナー複数入力されていても1日としてカウント）
      const uniqueDates = new Set(thisMonthReports.map(r => r.date))
      return expenseBaseline.sumOther * uniqueDates.size
    }

    return 0
  }, [thisMonthReports, expenseBaseline])

  // 月次の人件費と営業利益を再計算
  const adjustedThisMonthKpis = useMemo(() => {
    // monthlyExpenseBaseline.laborCostは既に休日設定に基づいて営業日数で按分済み
    // 日報があるユニークな日数を計算（同じ日にランチ・ディナー複数入力されていても1日としてカウント）
    const uniqueDates = new Set(thisMonthReports.map(r => r.date))
    const daysWithReports = uniqueDates.size
    const dailyLaborCost = expenseBaseline.laborCost || 0
    const monthlyLaborCostFromBaseline = dailyLaborCost * daysWithReports

    // 実際の人件費（日報入力値）
    const actualLaborCost = thisMonthKpis.laborTotal

    // 参考経費がある場合はそれを使用、なければ実際の値
    const adjustedLaborCost = monthlyLaborCostFromBaseline > 0
      ? monthlyLaborCostFromBaseline
      : actualLaborCost

    // FLコストと率を再計算
    const adjustedPrimeCost = thisMonthKpis.purchaseTotal + adjustedLaborCost
    const adjustedLaborRate = thisMonthKpis.totalSales > 0 ? (adjustedLaborCost / thisMonthKpis.totalSales) * 100 : 0
    const adjustedPrimeCostRate = thisMonthKpis.totalSales > 0 ? (adjustedPrimeCost / thisMonthKpis.totalSales) * 100 : 0

    // 営業利益を再計算（粗利益 - 人件費 - その他経費）
    const operatingProfit = thisMonthKpis.grossProfit - adjustedLaborCost - thisMonthOtherExpenses
    const profitMargin = thisMonthKpis.totalSales > 0 ? (operatingProfit / thisMonthKpis.totalSales) * 100 : 0

    return {
      ...thisMonthKpis,
      laborTotal: adjustedLaborCost,
      laborRate: adjustedLaborRate,
      primeCost: adjustedPrimeCost,
      primeCostRate: adjustedPrimeCostRate,
      operatingProfit,
      profitMargin
    }
  }, [thisMonthKpis, thisMonthOtherExpenses, expenseBaseline, thisMonthReports])

  // 期間合算用のその他経費を計算
  const rangeOtherExpenses = useMemo(() => {
    // 実際のその他経費を計算（人件費は含まない）
    const actualOtherExpenses = rangeReports.reduce((sum, report) => {
      return sum + report.utilities + report.promotion + report.cleaning +
             report.misc + report.communication + report.others +
             (report.rent || 0) + (report.consumables || 0)
    }, 0)

    // 実際の経費がある場合はそれを使用、なければ参考経費を使用
    if (actualOtherExpenses > 0) {
      return actualOtherExpenses
    }

    // 各月のbaselineMapから合算
    let totalOtherExpenses = 0
    rangeReports.forEach(report => {
      const yyyymm = report.date.slice(0, 7)
      const key = `${report.storeId}__${yyyymm}`
      const baseline = baselineMap.get(key)
      if (baseline && baseline.sumOther > 0) {
        totalOtherExpenses += baseline.sumOther
      }
    })

    return totalOtherExpenses
  }, [rangeReports, baselineMap])

  // 期間合算のKPIを計算
  const rangeKpis = useKpis(rangeReports, undefined, undefined)

  // 期間合算の人件費と営業利益を再計算
  const adjustedRangeKpis = useMemo(() => {
    // 各月のmonthlyExpenseMapから人件費を合算
    const monthsSet = new Set<string>()
    rangeReports.forEach(report => {
      const yyyymm = report.date.slice(0, 7)
      monthsSet.add(`${report.storeId}__${yyyymm}`)
    })

    let totalMonthlyLaborCost = 0
    monthsSet.forEach(key => {
      const monthlyExpense = monthlyExpenseMap.get(key)
      if (monthlyExpense && monthlyExpense.labor_cost > 0) {
        totalMonthlyLaborCost += monthlyExpense.labor_cost
      }
    })

    // 実際の人件費（日報入力値）
    const actualLaborCost = rangeKpis.laborTotal

    // どちらか大きい方を使用（または参考経費がない場合は実際の値）
    const adjustedLaborCost = totalMonthlyLaborCost > 0
      ? totalMonthlyLaborCost
      : actualLaborCost

    // FLコストと率を再計算
    const adjustedPrimeCost = rangeKpis.purchaseTotal + adjustedLaborCost
    const adjustedLaborRate = rangeKpis.totalSales > 0 ? (adjustedLaborCost / rangeKpis.totalSales) * 100 : 0
    const adjustedPrimeCostRate = rangeKpis.totalSales > 0 ? (adjustedPrimeCost / rangeKpis.totalSales) * 100 : 0

    // 営業利益を再計算（粗利益 - 人件費 - その他経費）
    const operatingProfit = rangeKpis.grossProfit - adjustedLaborCost - rangeOtherExpenses
    const profitMargin = rangeKpis.totalSales > 0 ? (operatingProfit / rangeKpis.totalSales) * 100 : 0

    return {
      ...rangeKpis,
      laborTotal: adjustedLaborCost,
      laborRate: adjustedLaborRate,
      primeCost: adjustedPrimeCost,
      primeCostRate: adjustedPrimeCostRate,
      operatingProfit,
      profitMargin
    }
  }, [rangeKpis, rangeOtherExpenses, monthlyExpenseMap, rangeReports])

  // 業態に属する店舗を計算
  const brandStores = useMemo(() => {
    if (effectiveBrandId && storeId === 'all') {
      return stores.filter(s => s.brandId === effectiveBrandId)
    }
    return []
  }, [effectiveBrandId, storeId, stores])

  // 店舗またはall店舗の目標を取得（業態フィルタリング対応）
  const currentTarget = useMemo(() => {
    if (storeId === 'all') {
      const baseTarget = getAllStoresTarget()

      if (effectiveBrandId && brandStores.length > 0) {
        const brandTargets = targets.filter(t =>
          brandStores.some(s => s.id === t.storeId) && t.period === currentYYYYMM
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
          targetLaborRate: brandLaborRate
        }
      }

      return baseTarget
    } else {
      const target = getTargetForStore(storeId)
      return target ? {
        targetSales: target.targetSales,
        targetProfit: target.targetProfit,
        targetProfitMargin: target.targetProfitMargin,
        targetCostRate: target.targetCostRate,
        targetLaborRate: target.targetLaborRate
      } : null
    }
  }, [storeId, effectiveBrandId, brandStores, targets, currentYYYYMM, getTargetForStore, getAllStoresTarget])

  // 表示データとラベルを分析モードに応じて切り替え
  const displayKpis = analysisMode === 'current-month' ? adjustedThisMonthKpis : adjustedRangeKpis
  const displayOtherExpenses = analysisMode === 'current-month' ? thisMonthOtherExpenses : rangeOtherExpenses
  const displayReports = analysisMode === 'current-month' ? thisMonthReports : rangeReports
  const displayLabel = analysisMode === 'current-month' ? '今月' : `直近${rangeMonths}ヶ月`
  const displayDeltaLabel = analysisMode === 'current-month' ? '前月比' : '対前期比'

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (isError && error) {
    return (
      <ErrorState
        title="データの読み込みに失敗しました"
        message={error}
        onRetry={refetch}
      />
    )
  }

  if (rangeReports.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="データがありません"
        description="日次報告を作成すると、ここに月次ダッシュボードが表示されます。"
        action={{
          label: "サンプルデータを生成",
          onClick: () => window.location.reload()
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          月次ダッシュボード
          {storeId === 'all' && (
            <Badge variant="default" className="ml-2 bg-blue-600">
              全店舗集計
            </Badge>
          )}
        </h1>
        <p className="text-muted-foreground text-sm">
          分析期間: {thisMonthStart.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })} 〜 {now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <p className="text-muted-foreground text-sm">
          {storeId === 'all'
            ? `全登録店舗の今月の業績と過去${rangeMonths}ヶ月のトレンド分析（合計値）`
            : `今月の業績と過去${rangeMonths}ヶ月のトレンド分析`
          }
        </p>

        {/* 分析設定パネル */}
        <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* 左側：分析モード */}
            <div className="flex-1">
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                分析モード
              </label>
              <Tabs value={analysisMode} onValueChange={(v) => setAnalysisMode(v as 'current-month' | 'range')}>
                <TabsList>
                  <TabsTrigger value="current-month">
                    今月のみ
                  </TabsTrigger>
                  <TabsTrigger value="range">
                    期間合算
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* 中央：期間範囲選択 */}
            <div className="flex-1">
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                表示期間
              </label>
              <Tabs value={String(rangeMonths)} onValueChange={(v)=>setRangeMonths(Number(v) as 3|6|12)}>
                <TabsList>
                  <TabsTrigger value="3">
                    直近3ヶ月
                  </TabsTrigger>
                  <TabsTrigger value="6">
                    直近6ヶ月
                  </TabsTrigger>
                  <TabsTrigger value="12">
                    直近12ヶ月
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* 右側：エクスポートボタン */}
            <div className="flex items-end">
              <Button
                onClick={() => setShowExportModal(true)}
                variant="outline"
                className="gap-2 bg-white hover:bg-gray-50 border-gray-300"
              >
                <Download className="w-4 h-4" />
                データエクスポート
              </Button>
            </div>
          </div>

          {/* 現在の選択状態を表示 */}
          <div className="mt-3 pt-3 border-t border-blue-200">
            <p className="text-xs text-gray-600">
              {analysisMode === 'current-month'
                ? `今月のデータのみを表示しています（過去${rangeMonths}ヶ月のトレンドグラフも表示）`
                : `直近${rangeMonths}ヶ月の合算データを表示しています`
              }
            </p>
          </div>
        </div>
      </div>

      {/* 重要KPI 3つ - 常時表示 */}
      {/* 売上カード - 1列全体表示 */}
      <MetricCard
        label={`${displayLabel}の売上`}
        value={formatCurrency(displayKpis.totalSales)}
        delta={displayKpis.salesGrowth !== undefined ? {
          value: displayKpis.salesGrowth,
          isPositive: displayKpis.salesGrowth >= 0,
          label: displayDeltaLabel
        } : undefined}
        icon={TrendingUp}
        tone="info"
        hint={`${displayKpis.reportCount}件の報告`}
        details={displayKpis.totalCustomers > 0 ? [
          { label: '平均客単価', value: formatCurrency(displayKpis.averageTicket) },
          { label: '客数', value: `${displayKpis.totalCustomers.toLocaleString()}人` }
        ] : [
          { label: '客数データ', value: '未入力' }
        ]}
        size="hero"
      />

      {/* 原価と粗利益 - 2列表示 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MetricCard
          label={`${displayLabel}の仕入/原価`}
          value={formatCurrency(displayKpis.purchaseTotal)}
          icon={ShoppingCart}
          tone="warning"
          hint="売上原価"
          details={[
            { label: '原価率', value: formatPercent(displayKpis.purchaseRate) },
            { label: '対売上比', value: displayKpis.totalSales > 0 ? formatPercent((displayKpis.purchaseTotal / displayKpis.totalSales) * 100) : '0%' }
          ]}
        />

        <MetricCard
          label={`${displayLabel}の粗利益`}
          value={formatCurrency(displayKpis.grossProfit)}
          icon={PiggyBank}
          tone={displayKpis.grossProfit >= 0 ? "success" : "danger"}
          hint="売上 - 仕入"
          details={[
            { label: '原価率', value: formatPercent(displayKpis.purchaseRate) },
            { label: '粗利率', value: formatPercent(100 - displayKpis.purchaseRate) }
          ]}
        />
      </div>

      {/* 段階的開示: トリガーボタン */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t-2 border-gray-200 dark:border-gray-700"></div>
        </div>

        <div className="relative flex justify-center">
          <button
            onClick={() => setShowDetailedAnalysis(!showDetailedAnalysis)}
            className={`inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold shadow-md transition-all duration-200 ${
              showDetailedAnalysis
                ? 'bg-purple-600 text-white hover:bg-purple-700 border-2 border-purple-600'
                : 'bg-white dark:bg-gray-800 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-gray-700 border-2 border-purple-500 dark:border-purple-400'
            }`}
          >
            {showDetailedAnalysis ? (
              <>
                詳細分析を閉じる
                <ChevronUp className="w-5 h-5" />
              </>
            ) : (
              <>
                <span className="text-xl" role="img" aria-label="chart">📊</span>
                詳細な分析データとグラフを表示
                <ChevronDown className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* 詳細分析エリア（段階的開示） */}
      <Collapsible open={showDetailedAnalysis} onOpenChange={setShowDetailedAnalysis}>
        <CollapsibleContent className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
          <Suspense fallback={
            <div className="space-y-6">
              <Skeleton className="h-24" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Skeleton className="h-64" />
                <Skeleton className="h-64" />
              </div>
            </div>
          }>
            <MonthlyDetailedAnalysis
              displayKpis={displayKpis}
              displayOtherExpenses={displayOtherExpenses}
              displayReports={displayReports}
              rangeReports={rangeReports}
              thisMonthReports={thisMonthReports}
              displayLabel={displayLabel}
              displayDeltaLabel={displayDeltaLabel}
              currentTarget={currentTarget}
              storeId={storeId}
              rangeMonths={rangeMonths}
              expenseBaseline={expenseBaseline}
              vendorPurchases={vendorPurchases}
              baselineMap={baselineMap}
              monthlyExpenseMap={monthlyExpenseMap}
              filterMonth={filterMonth}
              onPeriodClick={handlePeriodClick}
              onMonthChange={handleMonthChange}
            />
          </Suspense>
        </CollapsibleContent>
      </Collapsible>

      {/* P&L Modal */}
      {selectedMonth && (
        <Suspense fallback={null}>
          <ProfitLossModal
            month={selectedMonth}
            reports={rangeReports}
            storeId={storeId}
            onClose={() => setSelectedMonth(null)}
          />
        </Suspense>
      )}

      {/* Monthly Sales Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">月次売上一覧エクスポート</h2>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              <Suspense fallback={<div className="flex items-center justify-center p-8">読み込み中...</div>}>
                <MonthlySalesExport
                  defaultMonth={currentYYYYMM}
                  defaultStoreId={storeId}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}