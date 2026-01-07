import React, { useMemo, useEffect, useState, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TrendingUp, Wallet, PiggyBank, Percent, FileText, ChevronDown, ChevronUp, Sun, Moon, ShoppingCart } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { MetricCard } from '@/components/ui/MetricCard'
import { SalesChart } from '@/components/Charts/SalesChart'
import { ExpensePie } from '@/components/Charts/ExpensePie'
import { DataTable } from '@/components/data/DataTable'
import { KpiBullets } from '@/components/Charts/KpiBullets'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { WeekSelector } from '@/components/ui/week-selector'
import { useReports } from '@/hooks/useReports'
import { useKpis } from '@/hooks/useKpis'
import { useExpenseBaseline } from '@/hooks/useExpenseBaseline'
import { useTargets } from '@/hooks/useTargets'
import { formatCurrency, formatPercent } from '@/lib/format'
import { useAuth } from '@/contexts/AuthContext'
import { useAdminData } from '@/contexts/AdminDataContext'
import { useBrands } from '@/hooks/useBrands'
import { getExpenseBaseline, ExpenseBaselineDb, getMonthlyExpenses, MonthlyExpenseDb, getVendorPurchasesForPeriod } from '@/services/supabase'
import { VendorPurchaseBreakdown } from '@/components/Dashboard/VendorPurchaseBreakdown'

export const DashboardWeekly: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const sp = new URLSearchParams(location.search)
  const storeId = sp.get('store') || 'all'
  const brandId = sp.get('brand') || ''
  const { user, canAccessStore, isDemoMode } = useAuth()
  const { stores } = useAdminData()
  const { getBrandById } = useBrands()
  const selectedBrand = getBrandById(brandId)
  const currentPeriod = new Date().toISOString().substring(0, 7)
  const { expenseBaseline } = useExpenseBaseline(storeId, currentPeriod)
  const { targets, getTargetForStore, getAllStoresTarget } = useTargets(storeId, currentPeriod)
  const [baselineMap, setBaselineMap] = useState<Map<string, ExpenseBaselineDb>>(new Map())
  const [monthlyExpenseMap, setMonthlyExpenseMap] = useState<Map<string, MonthlyExpenseDb>>(new Map())
  const [filterMonth, setFilterMonth] = useState<string | undefined>(undefined)
  const loadingRef = useRef(false)
  const lastLoadedKeysRef = useRef<string>('')
  const [vendorPurchases, setVendorPurchases] = useState<any[]>([])
  const [loadingVendorPurchases, setLoadingVendorPurchases] = useState(false)

  // 選択された週の開始日（YYYY-MM-DD形式）、nullは今週
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null)

  // 段階的開示: 詳細分析エリアの表示/非表示を管理
  const [showDetailedAnalysis, setShowDetailedAnalysis] = useState(() => {
    const saved = localStorage.getItem('showDetailedAnalysisWeekly')
    return saved === 'true'
  })

  useEffect(() => {
    localStorage.setItem('showDetailedAnalysisWeekly', String(showDetailedAnalysis))
  }, [showDetailedAnalysis])

  // 権限チェック
  useEffect(() => {
    if (!user) return

    // 本部ビューはownerのみ許可
    if (brandId === 'headquarters' && user.role !== 'owner') {
      navigate('/dashboard/weekly', { replace: true })
      return
    }

    // 全店舗表示はadmin/ownerのみ許可（デモモードは常に許可）
    if (storeId === 'all' && user.role !== 'admin' && user.role !== 'owner' && !isDemoMode) {
      const accessibleStores = user.storeIds || []
      if (accessibleStores.length > 0) {
        navigate(`/dashboard/weekly?store=${accessibleStores[0]}`, { replace: true })
      }
      return
    }

    // 特定店舗選択時の権限チェック
    if (storeId !== 'all' && !canAccessStore(storeId)) {
      const accessibleStores = user.storeIds || []
      if (accessibleStores.length > 0) {
        navigate(`/dashboard/weekly?store=${accessibleStores[0]}`, { replace: true })
      } else if (user.role !== 'admin') {
        navigate('/dashboard/weekly', { replace: true })
      }
    }
  }, [storeId, brandId, user?.id, user?.role, canAccessStore, navigate, isDemoMode])

  // 過去12週分の週リストを生成（月曜日始まり）
  const availableWeeks = useMemo(() => {
    const weeks: Array<{ start: Date; end: Date; label: string; value: string }> = []
    const now = new Date()

    // 現在の日付を日本時間の深夜0時に設定（タイムゾーンの影響を排除）
    const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    for (let i = 0; i < 12; i++) {
      // 月曜日を週の始まりとする（0=月曜、1=火曜、...6=日曜）
      const dow = (currentDate.getDay() + 6) % 7

      const weekStart = new Date(currentDate)
      weekStart.setDate(currentDate.getDate() - dow - (i * 7))

      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)

      const label = i === 0
        ? '今週'
        : `${weekStart.getMonth() + 1}/${weekStart.getDate()}週`

      weeks.push({
        start: weekStart,
        end: weekEnd,
        label,
        value: weekStart.toISOString().split('T')[0]
      })
    }

    return weeks
  }, [])

  // 選択された週の計算
  const { displayWeekStart, displayWeekEnd, prevWeekStart, prevWeekEnd, twoWeeksStart, now } = useMemo(() => {
    const selectedWeek = selectedWeekStart
      ? availableWeeks.find(w => w.value === selectedWeekStart)
      : availableWeeks[0]

    if (!selectedWeek) {
      // フォールバック：今週
      return {
        displayWeekStart: availableWeeks[0].start,
        displayWeekEnd: availableWeeks[0].end,
        prevWeekStart: new Date(availableWeeks[0].start.getTime() - 7 * 24 * 60 * 60 * 1000),
        prevWeekEnd: new Date(availableWeeks[0].start.getTime() - 1 * 24 * 60 * 60 * 1000),
        twoWeeksStart: new Date(availableWeeks[0].start.getTime() - 13 * 24 * 60 * 60 * 1000),
        now: new Date()
      }
    }

    const prevStart = new Date(selectedWeek.start)
    prevStart.setDate(selectedWeek.start.getDate() - 7)

    const prevEnd = new Date(selectedWeek.start)
    prevEnd.setDate(selectedWeek.start.getDate() - 1)

    const twoWeeksAgo = new Date(selectedWeek.start)
    twoWeeksAgo.setDate(selectedWeek.start.getDate() - 13)

    return {
      displayWeekStart: selectedWeek.start,
      displayWeekEnd: selectedWeek.end,
      prevWeekStart: prevStart,
      prevWeekEnd: prevEnd,
      twoWeeksStart: twoWeeksAgo,
      now: new Date()
    }
  }, [selectedWeekStart, availableWeeks])

  // 'headquarters'は全業態を意味するのでbrandIdをundefinedとする
  const effectiveBrandId = (brandId === 'headquarters' || !brandId) ? undefined : brandId

  // フィルターオブジェクトをメモ化（選択された週のデータ）
  const displayWeekFilters = useMemo(() => {
    // タイムゾーンの影響を避けるため、YYYY-MM-DD形式の文字列を直接生成
    const formatDate = (date: Date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    return {
      storeId,
      brandId: effectiveBrandId,
      dateFrom: formatDate(displayWeekStart),
      dateTo: formatDate(displayWeekEnd)
    }
  }, [storeId, effectiveBrandId, displayWeekStart, displayWeekEnd])

  // 仕入内訳データの取得（週次）
  useEffect(() => {
    const fetchVendorPurchases = async () => {
      if (storeId === 'all' || !displayWeekStart || !displayWeekEnd) {
        setVendorPurchases([])
        return
      }

      const formatDate = (date: Date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      const startDate = formatDate(displayWeekStart)
      const endDate = formatDate(displayWeekEnd)

      setLoadingVendorPurchases(true)
      try {
        const { data, error } = await getVendorPurchasesForPeriod(storeId, startDate, endDate)
        if (error) {
          console.error('週次仕入内訳取得エラー:', error)
          setVendorPurchases([])
        } else {
          setVendorPurchases(data || [])
        }
      } catch (e) {
        console.error('週次仕入内訳取得エラー:', e)
        setVendorPurchases([])
      } finally {
        setLoadingVendorPurchases(false)
      }
    }

    fetchVendorPurchases()
  }, [storeId, displayWeekStart, displayWeekEnd])

  const lastWeekFilters = useMemo(() => {
    const formatDate = (date: Date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    return {
      storeId,
      brandId: effectiveBrandId,
      dateFrom: formatDate(prevWeekStart),
      dateTo: formatDate(prevWeekEnd)
    }
  }, [storeId, effectiveBrandId, prevWeekStart, prevWeekEnd])

  const twoWeeksFilters = useMemo(() => {
    const formatDate = (date: Date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    return {
      storeId,
      brandId: effectiveBrandId,
      dateFrom: formatDate(twoWeeksStart),
      dateTo: formatDate(now)
    }
  }, [storeId, effectiveBrandId, twoWeeksStart, now])

  const ninetyDaysFilters = useMemo(() => {
    const formatDate = (date: Date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const today = new Date()
    return {
      storeId,
      brandId: effectiveBrandId,
      dateFrom: formatDate(ninetyDaysAgo),
      dateTo: formatDate(today)
    }
  }, [storeId, effectiveBrandId])

  const { data: displayWeekReports, isLoading, isError, error, refetch } = useReports(displayWeekFilters)
  const { data: lastWeekReports } = useReports(lastWeekFilters)
  const { data: twoWeeksReports } = useReports(twoWeeksFilters)
  const { data: ninetyDaysReports } = useReports(ninetyDaysFilters)

  // 必要なキーを抽出（安定した文字列として）
  const weeklyExpenseKeysNeeded = useMemo(() => {
    const keysSet = new Set<string>()
    ninetyDaysReports.forEach(report => {
      const yyyymm = report.date.slice(0, 7)
      keysSet.add(`${report.storeId}__${yyyymm}`)
    })
    return Array.from(keysSet).sort().join(',')
  }, [ninetyDaysReports])

  // DataTable用: 全日報の参考経費と月次経費を取得
  useEffect(() => {
    if (!weeklyExpenseKeysNeeded) {
      return
    }

    // キーが変わっていなければスキップ
    if (weeklyExpenseKeysNeeded === lastLoadedKeysRef.current) {
      return
    }

    // 既にロード中ならスキップ
    if (loadingRef.current) {
      return
    }

    const loadBaselines = async () => {
      loadingRef.current = true
      lastLoadedKeysRef.current = weeklyExpenseKeysNeeded

      try {
        const baselineMapData = new Map<string, ExpenseBaselineDb>()
        const monthlyExpenseMapData = new Map<string, MonthlyExpenseDb>()
        const keysArray = weeklyExpenseKeysNeeded.split(',').filter(k => k)

        for (const key of keysArray) {
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
        }

        setBaselineMap(baselineMapData)
        setMonthlyExpenseMap(monthlyExpenseMapData)
      } finally {
        loadingRef.current = false
      }
    }

    loadBaselines()
  }, [weeklyExpenseKeysNeeded])

  const displayWeekKpis = useKpis(displayWeekReports, lastWeekReports, expenseBaseline, displayWeekEnd)
  const ninetyDaysKpis = useKpis(ninetyDaysReports, undefined, expenseBaseline)

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
          brandStores.some(s => s.id === t.storeId) && t.period === currentPeriod
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
  }, [storeId, effectiveBrandId, brandStores, targets, currentPeriod, getTargetForStore, getAllStoresTarget])

  // その他経費を計算（人件費を除く）
  const otherExpenses = useMemo(() => {
    return displayWeekReports.reduce((sum, report) => {
      return sum + report.utilities + report.promotion + report.cleaning +
             report.misc + report.communication + report.others +
             (report.rent || 0) + (report.consumables || 0)
    }, 0)
  }, [displayWeekReports])

  // 経費を計算（仕入+その他経費）
  const weekExpenses = useMemo(() => {
    return displayWeekKpis.purchaseTotal + otherExpenses
  }, [displayWeekKpis.purchaseTotal, otherExpenses])

  // 営業利益を計算（粗利益 - その他経費）
  const operatingProfit = useMemo(() => {
    return displayWeekKpis.grossProfit - otherExpenses
  }, [displayWeekKpis.grossProfit, otherExpenses])

  // FLコスト（仕入+人件費）を計算
  const flCost = useMemo(() => {
    return displayWeekKpis.purchaseTotal + displayWeekKpis.laborTotal
  }, [displayWeekKpis.purchaseTotal, displayWeekKpis.laborTotal])

  // 週次目標を計算（月次目標を週換算）
  const weeklyTargets = useMemo(() => {
    if (!currentTarget) return null
    const weeksInMonth = 4.33
    return {
      targetSales: currentTarget.targetSales / weeksInMonth,
      targetFLCost: (currentTarget.targetSales / weeksInMonth) * ((currentTarget.targetCostRate + currentTarget.targetLaborRate) / 100),
      targetOperatingProfit: (currentTarget.targetSales / weeksInMonth) * (currentTarget.targetProfitMargin / 100)
    }
  }, [currentTarget])

  // 実際に経過した日数を計算（未来の日付を除外）
  const actualElapsedDays = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const weekStart = new Date(displayWeekStart)
    weekStart.setHours(0, 0, 0, 0)

    const weekEnd = new Date(displayWeekEnd)
    weekEnd.setHours(0, 0, 0, 0)

    // 期間の終了日は、週の終了日と今日のうち小さい方
    const effectiveEnd = new Date(Math.min(weekEnd.getTime(), today.getTime()))

    // 開始日が未来の場合は0日
    if (weekStart > today) {
      return 0
    }

    // 経過日数を計算（開始日と終了日を含む）
    const diffTime = effectiveEnd.getTime() - weekStart.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1 // +1で当日を含む

    return Math.max(0, diffDays)
  }, [displayWeekStart, displayWeekEnd])

  // 選択された週のラベル
  const displayWeekLabel = useMemo(() => {
    const selected = selectedWeekStart
      ? availableWeeks.find(w => w.value === selectedWeekStart)
      : availableWeeks[0]
    return selected?.label || '今週'
  }, [selectedWeekStart, availableWeeks])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
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

  if (ninetyDaysReports.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="データがありません"
        description="日次報告を作成すると、ここに週次ダッシュボードが表示されます。"
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
          週次ダッシュボード
          {storeId === 'all' && (
            <Badge variant="default" className="ml-2 bg-blue-600">
              全店舗集計
            </Badge>
          )}
        </h1>
        <p className="text-muted-foreground">
          分析期間: {displayWeekStart.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })} 〜 {displayWeekEnd.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <p className="text-muted-foreground text-sm">
          {storeId === 'all'
            ? '全登録店舗の今週の業績と過去30日間のトレンド分析（合計値）'
            : '今週の業績と過去30日間のトレンド分析'
          }
        </p>

        {/* 週選択パネル */}
        <div className="mt-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg">
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                表示する週を選択
              </label>
              <WeekSelector
                selectedWeek={selectedWeekStart}
                onWeekChange={setSelectedWeekStart}
                availableWeeks={availableWeeks}
              />
            </div>

            {/* 現在の選択状態を表示 */}
            <div className="pt-3 border-t border-green-200">
              <p className="text-xs text-gray-600">
                {displayWeekLabel}のデータを表示しています
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 重要KPI 3つ - 常時表示 */}
      {/* 売上カード - 1列全体表示 */}
      <MetricCard
        label={`${displayWeekLabel}の売上`}
        value={formatCurrency(displayWeekKpis.totalSales)}
        delta={displayWeekKpis.salesGrowth !== undefined ? {
          value: displayWeekKpis.salesGrowth,
          isPositive: displayWeekKpis.salesGrowth >= 0,
          label: "先週比"
        } : undefined}
        icon={TrendingUp}
        tone="info"
        hint={`${displayWeekKpis.reportCount}件の報告`}
        details={displayWeekKpis.totalCustomers > 0 ? [
          { label: '平均客単価', value: formatCurrency(displayWeekKpis.averageTicket) },
          { label: '客数', value: `${displayWeekKpis.totalCustomers.toLocaleString()}人` }
        ] : [
          { label: '客数データ', value: '未入力' }
        ]}
        size="hero"
      />

      {/* 原価と粗利益 - 2列表示 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MetricCard
          label={`${displayWeekLabel}の仕入/原価`}
          value={formatCurrency(displayWeekKpis.purchaseTotal)}
          icon={ShoppingCart}
          tone="warning"
          hint="売上原価"
          details={[
            { label: '原価率', value: formatPercent(displayWeekKpis.purchaseRate) },
            { label: '対売上比', value: displayWeekKpis.totalSales > 0 ? formatPercent((displayWeekKpis.purchaseTotal / displayWeekKpis.totalSales) * 100) : '0%' }
          ]}
        />

        <MetricCard
          label={`${displayWeekLabel}の粗利益`}
          value={formatCurrency(displayWeekKpis.grossProfit)}
          icon={PiggyBank}
          tone={displayWeekKpis.grossProfit >= 0 ? "success" : "danger"}
          hint="売上 - 仕入"
          details={[
            { label: '原価率', value: formatPercent(displayWeekKpis.purchaseRate) },
            { label: '粗利率', value: formatPercent(100 - displayWeekKpis.purchaseRate) }
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
                ? 'bg-emerald-600 text-white hover:bg-emerald-700 border-2 border-emerald-600'
                : 'bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-gray-700 border-2 border-emerald-500 dark:border-emerald-400'
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

          {/* 見出し */}
          <div className="bg-emerald-50 dark:bg-emerald-950 border-l-4 border-emerald-500 p-4 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-2xl" role="img" aria-label="microscope">🔬</span>
              <h2 className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                詳細分析データ
              </h2>
            </div>
            <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
              経営者・マネージャー向けの詳細なKPIとグラフです。原因の深掘りや長期トレンドの分析にご活用ください。
            </p>
          </div>

      {/* KPI Cards - Profitability */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricCard
          label={`${displayWeekLabel}のFLコスト`}
          value={formatCurrency(flCost)}
          icon={Wallet}
          tone="danger"
          hint="仕入+人件費"
          details={[
            { label: '仕入', value: `${formatCurrency(displayWeekKpis.purchaseTotal)} (${formatPercent(displayWeekKpis.purchaseRate)})` },
            { label: '人件費', value: `${formatCurrency(displayWeekKpis.laborTotal)} (${formatPercent(displayWeekKpis.laborRate)})` }
          ]}
        />

        <MetricCard
          label={`${displayWeekLabel}の営業利益`}
          value={formatCurrency(operatingProfit)}
          delta={displayWeekKpis.profitGrowth !== undefined ? {
            value: displayWeekKpis.profitGrowth,
            isPositive: displayWeekKpis.profitGrowth >= 0,
            label: "先週比"
          } : undefined}
          icon={Percent}
          tone={operatingProfit >= 0 ? "success" : "danger"}
          hint={`利益率 ${formatPercent(displayWeekKpis.totalSales > 0 ? (operatingProfit / displayWeekKpis.totalSales) * 100 : 0)}`}
          details={[
            { label: '粗利益', value: formatCurrency(displayWeekKpis.grossProfit) },
            { label: 'その他経費', value: formatCurrency(otherExpenses) }
          ]}
        />

        <MetricCard
          label="ランチ/ディナー比率"
          value={displayWeekKpis.totalSales > 0 ? `${Math.round((displayWeekKpis.lunchSales / displayWeekKpis.totalSales) * 100)}% / ${Math.round((displayWeekKpis.dinnerSales / displayWeekKpis.totalSales) * 100)}%` : '-'}
          icon={TrendingUp}
          tone="info"
          hint="売上構成比"
          details={[
            { label: 'ランチ', value: formatCurrency(displayWeekKpis.lunchSales) },
            { label: 'ディナー', value: formatCurrency(displayWeekKpis.dinnerSales) }
          ]}
        />
      </div>

      {/* KPI Cards - Lunch/Dinner Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MetricCard
          label={`${displayWeekLabel}のランチ売上`}
          value={formatCurrency(displayWeekKpis.lunchSales)}
          icon={Sun}
          tone="warning"
          hint={`${displayWeekKpis.lunchReportCount}日間の報告`}
          details={displayWeekKpis.lunchCustomers > 0 ? [
            { label: '客単価', value: formatCurrency(displayWeekKpis.lunchAverageTicket) },
            { label: '客数', value: `${displayWeekKpis.lunchCustomers.toLocaleString()}人` },
            { label: '売上比率', value: displayWeekKpis.totalSales > 0 ? formatPercent((displayWeekKpis.lunchSales / displayWeekKpis.totalSales) * 100) : '0%' }
          ] : [
            { label: 'データなし', value: '-' }
          ]}
        />

        <MetricCard
          label={`${displayWeekLabel}のディナー売上`}
          value={formatCurrency(displayWeekKpis.dinnerSales)}
          icon={Moon}
          tone="info"
          hint={`${displayWeekKpis.dinnerReportCount}日間の報告`}
          details={displayWeekKpis.dinnerCustomers > 0 ? [
            { label: '客単価', value: formatCurrency(displayWeekKpis.dinnerAverageTicket) },
            { label: '客数', value: `${displayWeekKpis.dinnerCustomers.toLocaleString()}人` },
            { label: '売上比率', value: displayWeekKpis.totalSales > 0 ? formatPercent((displayWeekKpis.dinnerSales / displayWeekKpis.totalSales) * 100) : '0%' }
          ] : [
            { label: 'データなし', value: '-' }
          ]}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SalesChart
          reports={ninetyDaysReports}
          period="weekly"
          targetSales={displayWeekKpis.averageDailySales * 7 * 1.15} // 15% above weekly average
          expenseBaseline={expenseBaseline}
        />
        <ExpensePie
          reports={displayWeekReports}
          period="weekly"
          title={`${displayWeekLabel}の経費内訳`}
          expenseBaseline={expenseBaseline}
          daysCount={actualElapsedDays}
          dateRangeEnd={displayWeekEnd}
        />
      </div>

      {/* 仕入内訳 */}
      {storeId !== 'all' && vendorPurchases.length > 0 && (
        <VendorPurchaseBreakdown
          purchases={vendorPurchases}
          title={`${displayWeekLabel}の仕入内訳`}
          showPercentage={true}
        />
      )}

      {/* Data Table */}
      <DataTable
        reports={displayWeekReports}
        period="weekly"
        groupByStore={false}
        baselineMap={baselineMap}
        monthlyExpenseMap={monthlyExpenseMap}
        selectedMonth={undefined}
        onMonthChange={undefined}
        showMonthSelector={false}
      />

        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}