import { useState, useEffect, useMemo, useCallback, useRef, useTransition } from 'react'
import { type DailyReportData } from '@/types'
import { getDailyReports, getMonthlyExpenses } from '@/services/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/contexts/OrganizationContext'
import { generateMockReports } from '@/lib/mock'
import { ric } from '@/lib/idle'
import { getStores } from '@/services/supabase'
import { supabase } from '@/lib/supabase'

export interface ReportFilters {
  storeId?: string
  brandId?: string
  dateFrom?: string
  dateTo?: string
  period?: 'daily' | 'weekly' | 'monthly'
}

// ✅ グローバル重複ガード: 同一キーのリクエストを全コンポーネントで共有
const GLOBAL_INFLIGHT = new Map<string, Promise<void>>()

export const useReports = (filters: ReportFilters = {}) => {
  const [data, setData] = useState<DailyReportData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isError, setIsError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { user, isDemoMode } = useAuth()
  const { organizationId } = useOrganization()

  // ✅ 安定キー：依存の変化だけ検知（参照安定）
  const stableKey = useMemo(
    () => JSON.stringify({
      s: filters.storeId ?? '',
      b: filters.brandId ?? '',
      f: filters.dateFrom ?? '',
      t: filters.dateTo ?? '',
      p: filters.period ?? '',
      u: user?.id ?? ''
    }),
    [filters.storeId, filters.brandId, filters.dateFrom, filters.dateTo, filters.period, user?.id]
  )

  // ✅ 古いリクエストを中断するためのAbortController
  const abortRef = useRef<AbortController | null>(null)

  // ✅ ローカル二重発火ガード（後方互換性のため残す）
  const inflightRef = useRef<Map<string, Promise<DailyReportData[]>>>(new Map())

  const fetchReports = useCallback(async (signal: AbortSignal, key: string, demoMode: boolean) => {
    // ✅ keyから値を復元（クロージャで古い値を掴まない）
    if (!key || key === 'undefined') {
      console.warn('⚠️ useReports: Invalid key provided:', key);
      return;
    }

    const params = JSON.parse(key) as { s: string; b: string; f: string; t: string; p: string; u: string }

    // デモモード：固定デモデータを返す（fixed_demo_*テーブルのみ参照）
    if (demoMode) {
      console.log('🎭 useReports: Demo mode active - using fixed_demo_reports only')

      // ✅ グローバル重複ガード: 同一キーは1回だけ実行
      if (GLOBAL_INFLIGHT.has(key)) {
        await GLOBAL_INFLIGHT.get(key)
        return
      }

      // 二重発火チェック（ローカル）
      if (inflightRef.current.has(key)) {
        return inflightRef.current.get(key)!
      }

      setIsLoading(true)

      // ✅ グローバルジョブを登録
      const globalJob = (async () => {
        const targetStoreId = (params.s && params.s !== 'all') ? params.s : undefined
        const targetBrandId = params.b || undefined
        console.log('🔍 useReports fetching fixed demo data:', { params, targetStoreId, targetBrandId, table: 'fixed_demo_reports' })

        if (signal.aborted) return

        // brandIdが指定されている場合、その業態の店舗IDを取得
        let brandStoreIds: string[] | undefined = undefined
        if (targetBrandId && !targetStoreId) {
          console.log('🔍 useReports DEMO: Filtering by brandId:', targetBrandId)
          const { data: brandStores } = await supabase
            .from('fixed_demo_stores')
            .select('id, name, brand_id')
            .eq('brand_id', targetBrandId)

          brandStoreIds = brandStores?.map(s => s.id) || []
          console.log('✅ useReports DEMO: Found brand stores:', brandStores)
          console.log('📍 useReports DEMO: Store IDs for filter:', brandStoreIds)
        }

        // 固定デモデータを取得
        let query = supabase
          .from('fixed_demo_reports')
          .select('*')

        if (targetStoreId) {
          query = query.eq('store_id', targetStoreId)
        } else if (brandStoreIds && brandStoreIds.length > 0) {
          query = query.in('store_id', brandStoreIds)
        }

        if (params.f) {
          query = query.gte('date', params.f)
        }

        if (params.t) {
          query = query.lte('date', params.t)
        }

        query = query.order('date', { ascending: false })

        const { data: reports, error } = await query

        if (error) {
          console.error('❌ Failed to fetch fixed demo reports:', error)
          setIsError(true)
          setError('デモデータの読み込みに失敗しました')
          setIsLoading(false)
          return []
        }

        // 店舗名を取得
        const { data: stores } = await supabase
          .from('fixed_demo_stores')
          .select('id, name')

        const storeMap = new Map(stores?.map(s => [s.id, s.name]) || [])

        // データ変換
        const initialData: DailyReportData[] = (reports || []).map(r => ({
          id: r.id,
          storeId: r.store_id,
          storeName: storeMap.get(r.store_id) || '不明',
          staffName: 'デモスタッフ',
          date: r.date,
          operationType: (r.operation_type as 'lunch' | 'dinner' | 'full_day') || 'full_day',
          sales: Number(r.sales || 0),
          customers: Number(r.customers || r.customer_count || 0),
          lunchCustomers: Number(r.lunch_customers || 0),
          dinnerCustomers: Number(r.dinner_customers || 0),
          purchase: Number(r.purchase || 0),
          laborCost: Number(r.labor_cost || 0),
          utilities: Number(r.utilities || 0),
          promotion: Number(r.promotion || 0),
          cleaning: Number(r.cleaning || 0),
          misc: Number(r.misc || 0),
          communication: Number(r.communication || 0),
          others: Number(r.others || 0),
          rent: Number(r.rent || 0),
          consumables: Number(r.consumables || 0),
          reportText: r.report_text || r.memo || '',
          createdAt: r.created_at || new Date().toISOString()
        }))

        if (!signal.aborted) {
          startTransition(() => {
            setData(initialData)
            setIsLoading(false)
            setIsError(false)
            setError(null)
          })
        }

        return initialData
      })()

      GLOBAL_INFLIGHT.set(key, globalJob)
      const promise = globalJob.then(() => {
        GLOBAL_INFLIGHT.delete(key)
        return data
      })

      inflightRef.current.set(key, promise)
      promise.finally(() => {
        inflightRef.current.delete(key)
      })

      return promise
    }

    if (!params.u) {
      // ユーザーがいない場合は空データ
      setData([])
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setIsError(false)
      setError(null)

      // スーパー管理者の場合、組織コンテキストを設定
      if (organizationId) {
        const { setSelectedOrganizationContext } = await import('@/services/organizationService')
        await setSelectedOrganizationContext(organizationId)
      }

      // Supabaseから日次報告を取得
      const { data: reportsData, error: reportsError } = await getDailyReports({
        storeId: params.s || undefined,
        brandId: params.b || undefined,
        dateFrom: params.f || undefined,
        dateTo: params.t || undefined,
        userId: params.u
      })

      // ✅ 中断されていたらsetStateしない（古いレスポンスの反映防止）
      if (signal.aborted) {
        // console.log('⚠️ useReports: Request aborted')
        return
      }

      if (reportsError) {
        throw new Error(reportsError.message)
      }

      let filteredData = reportsData || []
      let uniqueLocalCount = 0

      // ローカルストレージの既存データも取得（移行期間用）
      const localReports: DailyReportData[] = JSON.parse(localStorage.getItem('userReports') || '[]')
      if (localReports.length > 0) {
        // console.log('📦 useReports: ローカルデータも含めます:', localReports.length, '件')
        // ローカルデータをマージする際、storeIdでフィルタリング
        const filteredLocal = localReports.filter(r => {
          if (params.s && params.s !== 'all' && r.storeId !== params.s) return false
          if (params.f && r.date < params.f) return false
          if (params.t && r.date > params.t) return false
          return true
        })

        // console.log('📦 ローカルデータフィルター結果', {
        //   totalLocal: localReports.length,
        //   filteredLocal: filteredLocal.length,
        //   filters: params,
        //   sampleDates: filteredLocal.slice(0, 5).map(r => r.date)
        // })

        // 重複を防ぐ：同じdate+storeIdの組み合わせがSupabaseにある場合はローカルを除外
        const uniqueLocal = filteredLocal.filter(localReport => {
          return !filteredData.some(supabaseReport =>
            supabaseReport.date === localReport.date &&
            supabaseReport.storeId === localReport.storeId
          )
        })

        if (uniqueLocal.length > 0) {
          uniqueLocalCount = uniqueLocal.length
          // console.log('📦 重複を除外後:', uniqueLocalCount, '件のローカルデータを追加')
          filteredData = [...filteredData, ...uniqueLocal]
        }
      }

      // 月次経費データは日報リストに混ぜない
      // 月次経費は別途MonthlyExpenseForm等で管理

      // 日付順にソート
      filteredData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      // console.log('📊 useReports: 最終データ', {
      //   total: filteredData.length,
      //   supabase: (reportsData || []).length,
      //   local: uniqueLocalCount,
      //   sample: filteredData[0] // 最新の1件をサンプル表示
      // })

      // ✅ 中断チェック
      if (signal.aborted) return
      setData(filteredData)
    } catch (err) {
      // ✅ 中断チェック
      if (signal.aborted) return
      setIsError(true)
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました')
    } finally {
      // ✅ 中断チェック
      if (!signal.aborted) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // ✅ 旧リクエストを必ず中断
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    fetchReports(controller.signal, stableKey, isDemoMode)

    return () => {
      controller.abort()
    }
  }, [stableKey, isDemoMode, fetchReports])

  return {
    data,
    isLoading: isLoading || isPending,
    isError,
    error,
    refetch: fetchReports
  }
}