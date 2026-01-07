import React, { useState, useMemo, useEffect, useCallback, useRef, Suspense, lazy } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TrendingUp, Wallet, PiggyBank, Percent, FileText, CreditCard as Edit, Trash2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Sun, Moon, ShoppingCart, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MetricCard } from '@/components/ui/MetricCard'
import { SalesChart } from '@/components/Charts/SalesChart'
import { ExpensePie } from '@/components/Charts/ExpensePie'
import { DataTable } from '@/components/data/DataTable'
import { KpiBullets } from '@/components/Charts/KpiBullets'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { DailyTargetInput } from '@/components/Dashboard/DailyTargetInput'
import { MonthSelector } from '@/components/ui/month-selector'
import { TodayTargetCard } from '@/components/Dashboard/TodayTargetCard'
import { StatusMetricCard } from '@/components/Dashboard/StatusMetricCard'
import { MonthlyProgressCard } from '@/components/Dashboard/MonthlyProgressCard'
import { ActionSuggestionsCard } from '@/components/Dashboard/ActionSuggestionsCard'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useReports } from '@/hooks/useReports'
import { useKpis } from '@/hooks/useKpis'
import { useExpenseBaseline } from '@/hooks/useExpenseBaseline'
import { useTargets } from '@/hooks/useTargets'
import { useDailyTarget } from '@/hooks/useDailyTarget'
import { formatCurrency, formatPercent } from '@/lib/format'
import { useAuth } from '@/contexts/AuthContext'
import { useAdminData } from '@/contexts/AdminDataContext'
import { deleteDailyReport, getDailyTargets, getExpenseBaseline, ExpenseBaselineDb, getVendorPurchasesForDate } from '@/services/supabase'
import { useBrands } from '@/hooks/useBrands'
import { VendorPurchaseBreakdown } from '@/components/Dashboard/VendorPurchaseBreakdown'
import { EmptyDashboardState } from '@/components/Onboarding/EmptyDashboardState'
import { TodayInsightCard, generateTodayInsight } from '@/components/Onboarding/TodayInsightCard'
import { MonthlyTargetReminderCard } from '@/components/Onboarding/MonthlyTargetReminderCard'

const TargetSettings = lazy(() => import('@/components/Dashboard/TargetSettings').then(m => ({ default: m.TargetSettings })))

export const DashboardDaily: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const sp = new URLSearchParams(location.search)
  const storeId = sp.get('store') || 'all'
  const brandId = sp.get('brand') || ''
  const { user, canAccessStore, isDemoMode } = useAuth()
  const { getBrandById } = useBrands()
  const { stores, targets: adminTargets, upsertTarget: adminUpsertTarget, deleteTarget: adminDeleteTarget } = useAdminData()
  const selectedBrand = getBrandById(brandId)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [reportListPage, setReportListPage] = useState(0)
  const [filterMonth, setFilterMonth] = useState<string | undefined>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [reportListFilterMonth, setReportListFilterMonth] = useState<string | undefined>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [chartMonth, setChartMonth] = useState<string | undefined>(undefined)
  const [baselineMap, setBaselineMap] = useState<Map<string, ExpenseBaselineDb>>(new Map())
  const baselineLoadingRef = React.useRef(false)
  const lastBaselineKeysRef = React.useRef<string>('')
  const reportsPerPage = 30
  const [vendorPurchases, setVendorPurchases] = useState<any[]>([])
  const [loadingVendorPurchases, setLoadingVendorPurchases] = useState(false)
  const [showTargetSettingsModal, setShowTargetSettingsModal] = useState(false)

  // 段階的開示: 詳細分析エリアの表示/非表示を管理
  const [showDetailedAnalysis, setShowDetailedAnalysis] = useState(() => {
    // LocalStorageから前回の状態を復元（上級者向け）
    const saved = localStorage.getItem('showDetailedAnalysis')
    return saved === 'true'
  })

  // 状態変更時にLocalStorageに保存
  useEffect(() => {
    localStorage.setItem('showDetailedAnalysis', String(showDetailedAnalysis))
  }, [showDetailedAnalysis])

  // ✅ onPeriodClick をメモ化
  const handlePeriodClick = useCallback((date: string) => {
    setSelectedDate(date)
  }, [])

  // ✅ onMonthChange をメモ化
  const handleMonthChange = useCallback((month: string | undefined) => {
    setFilterMonth(month)
  }, [])

  // ✅ グラフ用の月次フィルター変更ハンドラ
  const handleChartMonthChange = useCallback((month: string | undefined) => {
    setChartMonth(month)
  }, [])

  // ✅ 日報一覧用の月次フィルター変更ハンドラ
  const handleReportListMonthChange = useCallback((month: string | undefined) => {
    setReportListFilterMonth(month)
    setReportListPage(0) // Reset to first page when filter changes
  }, [])

  // 日報削除処理
  const handleDelete = async (reportId: string, reportDate: string) => {
    if (!confirm(`${reportDate}の日報を削除してもよろしいですか？\nこの操作は取り消せません。`)) {
      return
    }

    setDeleting(reportId)
    try {
      const { error } = await deleteDailyReport(reportId)
      if (error) {
        console.error('削除エラー:', error)
        alert('日報の削除に失敗しました')
      } else {
        console.log('✅ 日報を削除しました:', reportId)
        // データを再読み込み
        refetch()
      }
    } catch (e) {
      console.error('削除エラー:', e)
      alert('日報の削除に失敗しました')
    } finally {
      setDeleting(null)
    }
  }

  // 権限チェック
  useEffect(() => {
    if (!user) return

    // 本部ビューはownerのみ許可
    if (brandId === 'headquarters' && user.role !== 'owner') {
      console.log('❌ User role not allowed for headquarters. Redirecting...')
      navigate('/dashboard/daily', { replace: true })
      return
    }

    // 全店舗表示はadmin/ownerのみ許可（デモモードは常に許可）
    console.log('🔐 All stores check:', { storeId, role: user.role, isDemo: isDemoMode })
    if (storeId === 'all' && user.role !== 'admin' && user.role !== 'owner' && !isDemoMode) {
      console.log('❌ User role not allowed for "all" stores. Redirecting...')
      const accessibleStores = user.storeIds || []
      if (accessibleStores.length > 0) {
        navigate(`/dashboard/daily?store=${accessibleStores[0]}`, { replace: true })
      }
      return
    }
    console.log('✅ All stores permission check passed')

    // 特定店舗選択時の権限チェック
    if (storeId !== 'all' && !canAccessStore(storeId)) {
      const accessibleStores = user.storeIds || []
      if (accessibleStores.length > 0) {
        navigate(`/dashboard/daily?store=${accessibleStores[0]}`, { replace: true })
      } else if (user.role !== 'admin') {
        navigate('/dashboard/daily', { replace: true })
      }
    }
  }, [storeId, brandId, user?.id, user?.role, canAccessStore, navigate, isDemoMode])

  // Get today's data
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // 今月のデータ（月初から今日まで）
  const now = new Date()
  // タイムゾーンの影響を避けるため、ローカル日付から明示的に YYYY-MM-DD を生成
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const currentYYYYMM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  console.log('📅 DashboardDaily 日付計算:', {
    now: now.toISOString(),
    monthStart,
    today,
    currentYYYYMM
  })

  // フィルターオブジェクトをメモ化
  // 'all'は全店舗を意味するのでundefinedとして渡す
  // 'headquarters'は全業態を意味するのでbrandIdをundefinedとする
  const effectiveStoreId = storeId === 'all' ? undefined : storeId
  const effectiveBrandId = (brandId === 'headquarters' || !brandId) ? undefined : brandId

  const todayFilters = useMemo(() => ({
    storeId: effectiveStoreId,
    brandId: effectiveBrandId,
    dateFrom: today,
    dateTo: today
  }), [effectiveStoreId, effectiveBrandId, today])

  const yesterdayFilters = useMemo(() => ({
    storeId: effectiveStoreId,
    brandId: effectiveBrandId,
    dateFrom: yesterday,
    dateTo: yesterday
  }), [effectiveStoreId, effectiveBrandId, yesterday])

  const weekFilters = useMemo(() => ({
    storeId: effectiveStoreId,
    brandId: effectiveBrandId,
    dateFrom: sevenDaysAgo,
    dateTo: today
  }), [effectiveStoreId, effectiveBrandId, sevenDaysAgo, today])

  const allReportsFilters = useMemo(() => {
    // Performance: Console logging removed
    return {
      storeId: effectiveStoreId,
      brandId: effectiveBrandId,
      dateTo: today
    }
  }, [effectiveStoreId, effectiveBrandId, today])

  const { data: todayReports, isLoading, isError, error, refetch } = useReports(todayFilters)
  const { data: yesterdayReports } = useReports(yesterdayFilters)
  const { data: weekReports } = useReports(weekFilters)
  const { data: allReports } = useReports(allReportsFilters)

  // デバッグ: データ取得状況を確認
  useEffect(() => {
    console.log('📊 DashboardDaily データ状況:', {
      allReports: allReports.length,
      todayReports: todayReports.length,
      weekReports: weekReports.length,
      filters: allReportsFilters,
      isDemoMode,
      user: user?.email
    })
  }, [allReports, todayReports, weekReports, allReportsFilters, isDemoMode, user])

  // 全期間の日別目標を取得
  const [dailyTargets, setDailyTargets] = React.useState<Record<string, number>>({})

  React.useEffect(() => {
    const fetchDailyTargets = async () => {
      if (storeId === 'all') {
        return
      }

      const { data, error } = await getDailyTargets({
        storeId,
        dateTo: today
      })

      if (data && !error) {
        const targetsMap: Record<string, number> = {}
        data.forEach((target: any) => {
          targetsMap[target.date] = target.target_sales
        })
        setDailyTargets(targetsMap)
      }
    }

    fetchDailyTargets()
  }, [storeId, today])


  const { data: monthReports } = useReports({
    storeId,
    brandId: brandId || undefined,
    dateFrom: monthStart,
    dateTo: today
  })

  // デバッグ: 月次データのフィルター状況を確認
  useEffect(() => {
    console.log('📅 DashboardDaily 月次データ:', {
      monthStart,
      today,
      monthReportsCount: monthReports.length,
      dates: monthReports.map(r => r.date).slice(0, 10),
      totalSales: monthReports.reduce((sum, r) => sum + r.sales, 0),
      totalLaborCost: monthReports.reduce((sum, r) => sum + r.laborCost, 0),
      sampleLaborCosts: monthReports.slice(0, 5).map(r => ({ date: r.date, operationType: r.operationType, laborCost: r.laborCost })),
      storeId
    })
  }, [monthStart, today, monthReports, storeId])

  // 参考経費データを取得（選択された日付の月の経費を取得）
  const selectedDateMonth = useMemo(() => {
    if (selectedDate) {
      return selectedDate.slice(0, 7) // YYYY-MM
    }
    return currentYYYYMM
  }, [selectedDate, currentYYYYMM])

  const { expenseBaseline } = useExpenseBaseline(storeId, selectedDateMonth)

  // 必要なキーを抽出（安定した文字列として）
  const dailyExpenseKeysNeeded = useMemo(() => {
    const keysSet = new Set<string>()
    allReports.forEach(report => {
      const yyyymm = report.date.slice(0, 7)
      keysSet.add(`${report.storeId}__${yyyymm}`)
    })
    return Array.from(keysSet).sort().join(',')
  }, [allReports])

  // DataTable用: 全日報の参考経費を取得
  useEffect(() => {
    if (!dailyExpenseKeysNeeded) {
      return
    }

    // キーが変わっていなければスキップ
    if (dailyExpenseKeysNeeded === lastBaselineKeysRef.current) {
      return
    }

    // 既にロード中ならスキップ
    if (baselineLoadingRef.current) {
      return
    }

    const loadBaselines = async () => {
      baselineLoadingRef.current = true
      lastBaselineKeysRef.current = dailyExpenseKeysNeeded

      try {
        const map = new Map<string, ExpenseBaselineDb>()
        const keysArray = dailyExpenseKeysNeeded.split(',').filter(k => k)

        // バッチで取得（Promise.all）
        const promises = keysArray.map(async (key) => {
          const [sid, ym] = key.split('__')
          const { data } = await getExpenseBaseline(sid, ym)
          if (data) {
            map.set(key, data)
          }
        })

        await Promise.all(promises)
        setBaselineMap(map)
      } finally {
        baselineLoadingRef.current = false
      }
    }

    loadBaselines()
  }, [dailyExpenseKeysNeeded])

  // 目標データを取得
  const { targets, getTargetForStore, getAllStoresTarget, refetch: refetchTargets } = useTargets(storeId, currentYYYYMM)

  // 日別目標データを取得（本日のみ、選択日は対象外）
  const displayDate = selectedDate || today
  const { target: dailyTarget, saveTarget: saveDailyTarget, isLoading: dailyTargetLoading } = useDailyTarget(
    storeId !== 'all' ? storeId : null,
    displayDate
  )

  // 月の経過日数を計算（今日が何日目か）
  const daysIntoMonth = now.getDate()

  const todayKpis = useKpis(todayReports, yesterdayReports, expenseBaseline)
  const weekKpis = useKpis(weekReports, undefined, expenseBaseline)
  const monthKpis = useKpis(monthReports, undefined, expenseBaseline)

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

  // 月次目標設定リマインダー用のロジック
  const isFirstWeekOfMonth = useMemo(() => {
    return now.getDate() <= 7
  }, [now])

  const hasMonthlyTargetSet = useMemo(() => {
    if (!currentTarget) return false
    return currentTarget.targetSales > 0
  }, [currentTarget])

  // 選択された日付のデータを取得（全履歴データから取得）
  const selectedDateReports = React.useMemo(() => {
    return selectedDate
      ? allReports.filter(r => r.date === selectedDate)
      : todayReports
  }, [selectedDate, allReports, todayReports])

  const selectedDateYesterday = React.useMemo(() => {
    return selectedDate
      ? new Date(new Date(selectedDate).getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      : yesterday
  }, [selectedDate, yesterday])

  const selectedDateYesterdayReports = React.useMemo(() => {
    return allReports.filter(r => r.date === selectedDateYesterday)
  }, [allReports, selectedDateYesterday])

  // 選択された日付のKPIを常に計算（Hooksのルールに従う）
  const selectedDateKpis = useKpis(selectedDateReports, selectedDateYesterdayReports, expenseBaseline)

  // 表示用のKPIを選択日付または本日で切り替え
  const displayKpis = selectedDate ? selectedDateKpis : todayKpis

  // 仕入内訳データの取得
  useEffect(() => {
    const fetchVendorPurchases = async () => {
      if (!displayDate || storeId === 'all') {
        setVendorPurchases([])
        return
      }

      setLoadingVendorPurchases(true)
      try {
        const { data, error } = await getVendorPurchasesForDate(storeId, displayDate)
        if (error) {
          console.error('仕入内訳取得エラー:', error)
          setVendorPurchases([])
        } else {
          setVendorPurchases(data || [])
        }
      } catch (e) {
        console.error('仕入内訳取得エラー:', e)
        setVendorPurchases([])
      } finally {
        setLoadingVendorPurchases(false)
      }
    }

    fetchVendorPurchases()
  }, [displayDate, storeId])

  // その他経費を計算（参考経費を使用）
  const otherExpenses = React.useMemo(() => {
    // 実際のその他経費を計算
    const actualOtherExpenses = selectedDateReports.reduce((sum, report) => {
      return sum + report.utilities + report.promotion + report.cleaning +
             report.misc + report.communication + report.others +
             (report.rent || 0) + (report.consumables || 0)
    }, 0)

    // 実際の経費がある場合はそれを使用、なければ参考経費を使用
    if (actualOtherExpenses > 0) {
      return actualOtherExpenses
    }

    // 参考経費から1日あたりの経費を計算
    if (expenseBaseline && expenseBaseline.sumOther > 0) {
      return expenseBaseline.sumOther
    }

    return 0
  }, [selectedDateReports, expenseBaseline])

  // 営業利益を計算（粗利益 - その他経費）
  const operatingProfit = React.useMemo(() => {
    return displayKpis.grossProfit - otherExpenses
  }, [displayKpis.grossProfit, otherExpenses])

  // 選択された日付の本日のFLコストを計算（仕入+人件費）
  const selectedDateExpenses = React.useMemo(() => {
    return displayKpis.purchaseTotal + displayKpis.laborTotal
  }, [displayKpis.purchaseTotal, displayKpis.laborTotal])

  // 目標達成状況を計算（将来の機能拡張用に保持）
  const targetAchievement = React.useMemo((): {
    targetSales: number
    actualSales: number
    achievementRate: number
    isAchieved: boolean
    difference: number
  } | null => {
    if (!dailyTarget || dailyTarget.targetSales === 0) {
      return null
    }

    const actualSales = displayKpis.totalSales
    const targetSales = dailyTarget.targetSales
    const achievementRate = (actualSales / targetSales) * 100
    const isAchieved = actualSales >= targetSales
    const difference = actualSales - targetSales

    return {
      targetSales,
      actualSales,
      achievementRate,
      isAchieved,
      difference
    }
  }, [dailyTarget, displayKpis.totalSales])

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

  if (allReports.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyDashboardState
          title="まだデータがありません"
          description="データを入力すると、売上・利益のトレンドがグラフで確認できます。サンプルデータで30秒で体験できます。"
        />
      </div>
    )
  }

  return (
    <div className="space-y-6" data-tour="main-content">
      {/* 本日データなし通知 */}
      {!selectedDate && todayReports.length === 0 && allReports.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-yellow-800">
                本日（{today}）の日報データがありません
              </h3>
              <p className="mt-1 text-sm text-yellow-700">
                最新のデータは <strong>{allReports[0]?.date}</strong> です。過去のデータを表示するには、下の日報一覧から日付をクリックしてください。
              </p>
              {!isDemoMode && storeId !== 'all' && (
                <div className="mt-3">
                  <Button
                    onClick={() => navigate('/dashboard/report')}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white font-medium shadow-md hover:shadow-lg transition-all duration-200"
                    size="sm"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    今日の日報を入力する
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              日次ダッシュボード
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {selectedBrand && (
                <Badge
                  variant="outline"
                  className="text-xs sm:text-sm font-medium"
                  style={{
                    borderColor: selectedBrand.color,
                    color: selectedBrand.color,
                    backgroundColor: `${selectedBrand.color}15`
                  }}
                >
                  {selectedBrand.icon} {selectedBrand.displayName}
                </Badge>
              )}
              {storeId === 'all' && (
                <Badge variant="default" className="bg-blue-600 text-xs sm:text-sm">
                  {selectedBrand && brandId ? `${selectedBrand.displayName}業態 全店舗集計` : '全店舗集計'}
                </Badge>
              )}
              {selectedDate && (
                <Badge variant="default" className="bg-purple-600 text-xs sm:text-sm">
                  {new Date(selectedDate).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
            {!isDemoMode && storeId !== 'all' && (
              <Button
                onClick={() => navigate('/dashboard/report')}
                className="flex-1 sm:flex-initial bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 text-sm sm:text-base py-2 sm:py-3 px-4 sm:px-6"
                size="lg"
                data-tour="new-report-button"
              >
                <Plus className="w-5 h-5 mr-2" />
                日報を入力
              </Button>
            )}
            {selectedDate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(null)}
                className="flex-shrink-0 text-xs sm:text-sm"
              >
                本日に戻る
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            分析期間: {new Date(displayDate).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {storeId === 'all' && selectedBrand && brandId ? (
              <>
                {selectedBrand.displayName}業態の全店舗の本日の業績と過去7日間のトレンド分析（合計値）
              </>
            ) : storeId === 'all' ? (
              '全店舗の本日の業績と過去7日間のトレンド分析（合計値）'
            ) : (
              <>
                {selectedBrand && brandId && `${selectedBrand.displayName}の`}
                本日の業績と過去7日間のトレンド分析
              </>
            )}
            {storeId !== 'all' && user?.role !== 'admin' && (
              <span className="text-blue-600 ml-1">（担当店舗データ）</span>
            )}
          </p>
        </div>
      </div>

      {/* 今日のポイント - インサイトカード */}
      {!selectedDate && (
        <div className="space-y-4">
          <TodayInsightCard
            insight={generateTodayInsight(
              displayKpis.totalSales,
              yesterdayReports.length > 0 ? yesterdayReports.reduce((sum, r) => sum + r.sales, 0) : undefined,
              displayKpis.purchaseRate,
              displayKpis.laborRate,
              dailyTarget?.targetSales
            )}
          />
          <MonthlyTargetReminderCard
            monthName={currentYYYYMM}
            hasTargetSet={hasMonthlyTargetSet}
            isFirstWeekOfMonth={isFirstWeekOfMonth}
            storeId={storeId}
            onOpenTargetSettings={() => setShowTargetSettingsModal(true)}
          />
        </div>
      )}

      {/* 新しい目標達成度UI - Phase 1 & 2 */}
      {!selectedDate && dailyTarget && dailyTarget.targetSales > 0 && (
        <>
          <TodayTargetCard
            currentSales={displayKpis.totalSales}
            targetSales={dailyTarget.targetSales}
            averageCustomerPrice={displayKpis.averageTicket}
            date={today}
          />

          <ActionSuggestionsCard
            currentHour={new Date().getHours()}
            salesAchievement={(displayKpis.totalSales / dailyTarget.targetSales) * 100}
            customerCountAchievement={displayKpis.totalCustomers > 0 ? 100 : 0}
            averageSpendingAchievement={displayKpis.averageTicket > 0 ? 100 : 0}
            remainingSales={Math.max(0, dailyTarget.targetSales - displayKpis.totalSales)}
            remainingCustomers={displayKpis.averageTicket > 0 ? Math.ceil(Math.max(0, dailyTarget.targetSales - displayKpis.totalSales) / displayKpis.averageTicket) : 0}
            requiredAverageSpendingIncrease={0}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatusMetricCard
              emoji="💰"
              label="売上"
              value={formatCurrency(displayKpis.totalSales)}
              achievementRate={(displayKpis.totalSales / dailyTarget.targetSales) * 100}
              target={dailyTarget.targetSales}
              current={displayKpis.totalSales}
              unit="円"
            />
            <StatusMetricCard
              emoji="👥"
              label="客数"
              value={`${displayKpis.totalCustomers}組`}
              achievementRate={displayKpis.totalCustomers > 0 ? 100 : 0}
              target={displayKpis.totalCustomers}
              current={displayKpis.totalCustomers}
              unit="組"
              showRemaining={false}
            />
            <StatusMetricCard
              emoji="🍽️"
              label="客単価"
              value={formatCurrency(displayKpis.averageTicket)}
              achievementRate={displayKpis.averageTicket > 0 ? 100 : 0}
              target={displayKpis.averageTicket}
              current={displayKpis.averageTicket}
              unit="円"
              showRemaining={false}
            />
            <StatusMetricCard
              emoji="😊"
              label="利益"
              value={formatCurrency(displayKpis.operatingProfit)}
              achievementRate={displayKpis.operatingProfit > 0 ? 100 : 0}
              target={displayKpis.operatingProfit}
              current={displayKpis.operatingProfit}
              unit="円"
              showRemaining={false}
            />
          </div>

          {currentTarget && (
            <MonthlyProgressCard
              currentSales={monthKpis.totalSales}
              targetSales={currentTarget.targetSales}
              currentProfit={monthKpis.operatingProfit}
              targetProfit={currentTarget.targetProfit || (currentTarget.targetSales * (currentTarget.targetProfitMargin / 100))}
              daysRemaining={new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()}
              monthName={currentYYYYMM}
            />
          )}
        </>
      )}

      {/* 重要KPI 3つ - 常時表示 */}
      <div data-tour="kpi-cards">
      {/* 売上カード - 1列全体表示 */}
      <MetricCard
        label={selectedDate ? `${selectedDate}の売上` : "本日の売上"}
        value={formatCurrency(displayKpis.totalSales)}
        delta={displayKpis.salesGrowth !== undefined ? {
          value: displayKpis.salesGrowth,
          isPositive: displayKpis.salesGrowth >= 0,
          label: "前日比"
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
          label={selectedDate ? `${selectedDate}の仕入/原価` : "本日の仕入/原価"}
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
          label={selectedDate ? `${selectedDate}の粗利益` : "本日の粗利益"}
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
      </div>

      {/* 段階的開示: トリガーボタン */}
      <div className="relative">
        {/* 水平線 */}
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t-2 border-gray-200 dark:border-gray-700"></div>
        </div>

        {/* トリガーボタン */}
        <div className="relative flex justify-center">
          <button
            onClick={() => setShowDetailedAnalysis(!showDetailedAnalysis)}
            className={`inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold shadow-md transition-all duration-200 ${
              showDetailedAnalysis
                ? 'bg-blue-600 text-white hover:bg-blue-700 border-2 border-blue-600'
                : 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700 border-2 border-blue-500 dark:border-blue-400'
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
          <div className="bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-500 p-4 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-2xl" role="img" aria-label="microscope">🔬</span>
              <h2 className="text-lg font-bold text-blue-900 dark:text-blue-100">
                詳細データ
              </h2>
            </div>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              経営者・マネージャー向けの詳細なKPIとグラフ、データ管理機能です。
            </p>
          </div>

          {/* タブで分析とデータ一覧を整理 */}
          <Tabs defaultValue="analysis" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="analysis">📊 分析・グラフ</TabsTrigger>
              <TabsTrigger value="data-list">✏️ 日報編集</TabsTrigger>
            </TabsList>

            {/* 分析タブ */}
            <TabsContent value="analysis" className="space-y-6 mt-6">

      {/* 日別売上目標入力 */}
      {storeId !== 'all' && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-6">
            {!selectedDate ? (
              <DailyTargetInput
                date={today}
                storeId={storeId}
                currentTarget={dailyTarget?.targetSales || null}
                onSave={saveDailyTarget}
                isLoading={dailyTargetLoading}
              />
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-muted-foreground">
                    {selectedDate}の売上目標
                  </span>
                </div>
                {dailyTargets[selectedDate] ? (
                  <div className="text-lg font-bold text-blue-600">
                    {formatCurrency(dailyTargets[selectedDate])}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">
                    目標未設定
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPI Cards - Sales Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MetricCard
          label={selectedDate ? `${selectedDate}のランチ売上` : "本日のランチ売上"}
          value={formatCurrency(displayKpis.lunchSales)}
          icon={Sun}
          tone="warning"
          hint={`${displayKpis.lunchReportCount}件の報告`}
          details={displayKpis.lunchCustomers > 0 ? [
            { label: '客単価', value: formatCurrency(displayKpis.lunchAverageTicket) },
            { label: '客数', value: `${displayKpis.lunchCustomers.toLocaleString()}人` },
            { label: '売上比率', value: displayKpis.totalSales > 0 ? formatPercent((displayKpis.lunchSales / displayKpis.totalSales) * 100) : '0%' }
          ] : [
            { label: 'データなし', value: '-' }
          ]}
        />

        <MetricCard
          label={selectedDate ? `${selectedDate}のディナー売上` : "本日のディナー売上"}
          value={formatCurrency(displayKpis.dinnerSales)}
          icon={Moon}
          tone="info"
          hint={`${displayKpis.dinnerReportCount}件の報告`}
          details={displayKpis.dinnerCustomers > 0 ? [
            { label: '客単価', value: formatCurrency(displayKpis.dinnerAverageTicket) },
            { label: '客数', value: `${displayKpis.dinnerCustomers.toLocaleString()}人` },
            { label: '売上比率', value: displayKpis.totalSales > 0 ? formatPercent((displayKpis.dinnerSales / displayKpis.totalSales) * 100) : '0%' }
          ] : [
            { label: 'データなし', value: '-' }
          ]}
        />
      </div>

      {/* KPI Cards - Profitability */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricCard
          label={selectedDate ? `${selectedDate}のFLコスト` : "本日のFLコスト"}
          value={formatCurrency(selectedDateExpenses)}
          icon={Wallet}
          tone="danger"
          hint="仕入+人件費"
          details={[
            { label: '仕入', value: `${formatCurrency(displayKpis.purchaseTotal)} (${formatPercent(displayKpis.purchaseRate)})` },
            { label: '人件費', value: `${formatCurrency(displayKpis.laborTotal)} (${formatPercent(displayKpis.laborRate)})` }
          ]}
        />

        <MetricCard
          label={selectedDate ? `${selectedDate}の営業利益` : "本日の営業利益"}
          value={formatCurrency(operatingProfit)}
          delta={displayKpis.profitGrowth !== undefined ? {
            value: displayKpis.profitGrowth,
            isPositive: displayKpis.profitGrowth >= 0,
            label: "前日比"
          } : undefined}
          icon={Percent}
          tone={operatingProfit >= 0 ? "success" : "danger"}
          hint={`利益率 ${formatPercent(displayKpis.totalSales > 0 ? (operatingProfit / displayKpis.totalSales) * 100 : 0)}`}
          details={[
            { label: '粗利益', value: formatCurrency(displayKpis.grossProfit) },
            { label: 'その他経費', value: formatCurrency(otherExpenses) }
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


      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-tour="sales-chart">
        <SalesChart
          reports={allReports}
          period="daily"
          targetSales={dailyTarget?.targetSales}
          expenseBaseline={expenseBaseline}
          maxPoints={31}
          selectedMonth={chartMonth}
          onMonthChange={handleChartMonthChange}
        />
        <ExpensePie
          reports={selectedDateReports}
          period="daily"
          title={selectedDate ? `${selectedDate}の経費内訳` : "本日の経費内訳"}
          expenseBaseline={expenseBaseline}
          daysCount={1}
        />
      </div>

      {/* 仕入内訳 */}
      {storeId !== 'all' && vendorPurchases.length > 0 && (
        <VendorPurchaseBreakdown
          purchases={vendorPurchases}
          title={selectedDate ? `${selectedDate}の仕入内訳` : "本日の仕入内訳"}
          showPercentage={true}
        />
      )}

      {/* Data Table */}
      <DataTable
        reports={allReports}
        period="daily"
        groupByStore={false}
        onPeriodClick={handlePeriodClick}
        dailyTargets={dailyTargets}
        baselineMap={baselineMap}
        selectedMonth={filterMonth}
        onMonthChange={handleMonthChange}
        showMonthSelector={true}
      />

            </TabsContent>

            {/* データ一覧タブ */}
            <TabsContent value="data-list" className="space-y-6 mt-6">

      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
        <p className="text-sm text-muted-foreground">
          📝 過去の日報データを確認・編集・削除できます。日付をクリックすると、その日のデータを詳細分析エリアに表示します。
        </p>
      </div>

      {/* 日報リスト（編集可能） */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">
                日報データ管理
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {(() => {
                    const filtered = reportListFilterMonth
                      ? allReports.filter(r => r.date.slice(0, 7) === reportListFilterMonth)
                      : allReports
                    // グループ化してカウント
                    const groupedSet = new Set<string>()
                    filtered.forEach(r => groupedSet.add(`${r.date}-${r.storeId}`))
                    return `${groupedSet.size}件`
                  })()}
                </span>
              </CardTitle>
            </div>

            {/* 月選択ドロップダウン */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">表示期間:</span>
              <MonthSelector
                selectedMonth={reportListFilterMonth}
                onMonthChange={handleReportListMonthChange}
                availableMonths={(() => {
                  const monthsSet = new Set<string>()
                  allReports.forEach(report => {
                    const month = report.date.slice(0, 7)
                    monthsSet.add(month)
                  })
                  return Array.from(monthsSet).sort().reverse()
                })()}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {(() => {
            const filteredReports = reportListFilterMonth
              ? allReports.filter(r => r.date.slice(0, 7) === reportListFilterMonth)
              : allReports

            if (filteredReports.length === 0) {
              return <p className="text-sm text-muted-foreground">日報データがありません</p>
            }

            // 日付とstoreIdでグループ化（ランチとディナーを統合）
            const groupedReports = new Map<string, {
              date: string
              storeId: string
              storeName: string
              staffName?: string
              staffRole?: string
              lunchSales: number
              dinnerSales: number
              totalSales: number
              purchase: number
              reportText?: string
              reportIds: string[]
              lunchReportId?: string
              dinnerReportId?: string
              lunchLastEditedBy?: string
              dinnerLastEditedBy?: string
            }>()

            filteredReports.forEach(report => {
              const key = `${report.date}-${report.storeId}`

              if (!groupedReports.has(key)) {
                groupedReports.set(key, {
                  date: report.date,
                  storeId: report.storeId,
                  storeName: report.storeName,
                  staffName: report.staffName,
                  staffRole: report.staffRole,
                  lunchSales: 0,
                  dinnerSales: 0,
                  totalSales: 0,
                  purchase: 0,
                  reportText: report.reportText,
                  reportIds: []
                })
              }

              const group = groupedReports.get(key)!

              if (report.operationType === 'lunch') {
                group.lunchSales += report.sales
                group.lunchReportId = report.id
                group.lunchLastEditedBy = report.lastEditedBy
                // 仕入れは1日分なので、最初に見つかった方の値を使用（重複カウント防止）
                if (group.purchase === 0 && report.purchase > 0) {
                  group.purchase = report.purchase
                }
              } else if (report.operationType === 'dinner' || report.operationType === 'full_day') {
                group.dinnerSales += report.sales
                group.dinnerReportId = report.id
                group.dinnerLastEditedBy = report.lastEditedBy
                // 仕入れは1日分なので、最初に見つかった方の値を使用（重複カウント防止）
                if (group.purchase === 0 && report.purchase > 0) {
                  group.purchase = report.purchase
                }
              }

              group.totalSales += report.sales
              group.reportIds.push(report.id)
            })

            // 日付順にソート
            const sortedGroupedReports = Array.from(groupedReports.values()).sort((a, b) =>
              new Date(b.date).getTime() - new Date(a.date).getTime()
            )

            return (
              <>
                <div className="space-y-3">
                  {sortedGroupedReports.slice(reportListPage * reportsPerPage, (reportListPage + 1) * reportsPerPage).map((group) => {
                const grossProfit = group.totalSales - group.purchase
                const grossProfitMargin = group.totalSales > 0 ? (grossProfit / group.totalSales) * 100 : 0

                return (
                  <div key={`${group.date}-${group.storeId}`} className="flex flex-col p-3 sm:p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setSelectedDate(group.date)}
                          className={`font-medium text-sm sm:text-base hover:text-blue-600 transition-colors ${selectedDate === group.date ? 'text-purple-600 underline' : ''}`}
                        >
                          {group.date}
                        </button>
                        <Badge variant="outline" className="text-xs">{group.storeName}</Badge>
                        {group.staffName && (
                          <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
                            <span className="font-medium">{group.staffName}</span>
                            {group.staffRole && (
                              <Badge variant="secondary" className="text-xs">
                                {group.staffRole === 'admin' ? '統括' : group.staffRole === 'manager' ? '店長' : 'スタッフ'}
                              </Badge>
                            )}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 text-xs sm:text-sm">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <Sun className="h-3.5 w-3.5 text-amber-500" />
                            <span className="text-muted-foreground">ランチ:</span>
                            <span className="font-medium text-amber-600">{formatCurrency(group.lunchSales)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Moon className="h-3.5 w-3.5 text-indigo-500" />
                            <span className="text-muted-foreground">ディナー:</span>
                            <span className="font-medium text-indigo-600">{formatCurrency(group.dinnerSales)}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600 font-semibold">合計売上: {formatCurrency(group.totalSales)}</span>
                            {dailyTargets[group.date] && (
                              <Badge
                                variant={group.totalSales >= dailyTargets[group.date] ? "default" : "destructive"}
                                className={group.totalSales >= dailyTargets[group.date] ? "bg-green-600" : ""}
                              >
                                {group.totalSales >= dailyTargets[group.date] ? "達成" : "未達成"}
                              </Badge>
                            )}
                          </div>
                          <span className="text-red-600">仕入: {formatCurrency(group.purchase)}</span>
                          <span className={grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                            粗利益: {formatCurrency(grossProfit)} ({formatPercent(grossProfitMargin)})
                          </span>
                        </div>
                      </div>
                      {group.reportText && (
                        <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{group.reportText}</p>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch gap-2 mt-3 pt-3 border-t">
                      {!isDemoMode && (
                        <>
                          {group.lunchReportId && (
                            <div className="flex-1 flex flex-col gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  navigate(`/dashboard/report?id=${group.lunchReportId}`)
                                }}
                                className="w-full border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-400"
                              >
                                <Sun className="h-4 w-4 mr-2" />
                                ランチを編集
                              </Button>
                              {group.lunchLastEditedBy && (
                                <span className="text-xs text-muted-foreground text-center">
                                  修正: {group.lunchLastEditedBy}
                                </span>
                              )}
                            </div>
                          )}
                          {group.dinnerReportId && (
                            <div className="flex-1 flex flex-col gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  navigate(`/dashboard/report?id=${group.dinnerReportId}`)
                                }}
                                className="w-full border-indigo-300 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800 hover:border-indigo-400"
                              >
                                <Moon className="h-4 w-4 mr-2" />
                                ディナーを編集
                              </Button>
                              {group.dinnerLastEditedBy && (
                                <span className="text-xs text-muted-foreground text-center">
                                  修正: {group.dinnerLastEditedBy}
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                      {group.reportIds.length > 0 && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            console.log('削除ボタンクリック:', group.reportIds, group.date, 'isDemoMode:', isDemoMode)
                            if (isDemoMode) {
                              alert('デモモードでは削除できません')
                              return
                            }

                            const hasLunch = group.lunchReportId
                            const hasDinner = group.dinnerReportId
                            let message = `${group.date}の日報を削除してもよろしいですか？\n`

                            if (hasLunch && hasDinner) {
                              message += 'ランチとディナー両方のデータが削除されます。\n'
                            } else if (hasLunch) {
                              message += 'ランチのデータが削除されます。\n'
                            } else if (hasDinner) {
                              message += 'ディナーのデータが削除されます。\n'
                            }

                            message += 'この操作は取り消せません。'

                            if (!confirm(message)) return

                            // すべてのレポートを削除
                            Promise.all(group.reportIds.map(id => deleteDailyReport(id)))
                              .then(() => {
                                console.log('✅ 日報を削除しました')
                                refetch()
                              })
                              .catch(error => {
                                console.error('削除エラー:', error)
                                alert('日報の削除に失敗しました')
                              })
                          }}
                          disabled={deleting === group.reportIds[0] || isDemoMode}
                          className="flex-1 sm:flex-none sm:min-w-[140px]"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {deleting === group.reportIds[0] ? '削除中...' : '削除'}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
              </div>

                {/* Pagination */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    {sortedGroupedReports.length} 件中{' '}
                    {reportListPage * reportsPerPage + 1}-
                    {Math.min((reportListPage + 1) * reportsPerPage, sortedGroupedReports.length)} 件を表示
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReportListPage(prev => Math.max(0, prev - 1))}
                      disabled={reportListPage === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      前へ
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReportListPage(prev => prev + 1)}
                      disabled={(reportListPage + 1) * reportsPerPage >= sortedGroupedReports.length}
                    >
                      次へ
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )
          })()}
        </CardContent>
      </Card>

            </TabsContent>
          </Tabs>

        </CollapsibleContent>
      </Collapsible>

      {showTargetSettingsModal && (
        <Suspense fallback={<div className="flex items-center justify-center p-8">読み込み中...</div>}>
          <TargetSettings
            stores={stores}
            existingTargets={adminTargets}
            onClose={() => setShowTargetSettingsModal(false)}
            onSaved={() => {
              setShowTargetSettingsModal(false)
              refetchTargets()
            }}
            upsertTarget={adminUpsertTarget}
            deleteTarget={adminDeleteTarget}
          />
        </Suspense>
      )}
    </div>
  )
}