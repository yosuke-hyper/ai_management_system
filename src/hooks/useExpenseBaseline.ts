import { useEffect, useState, useMemo } from 'react'
import { getExpenseBaseline, ExpenseBaselineDb, getStores } from '@/services/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/contexts/OrganizationContext'

// ✅ "storeId-YYYY-MM" 単位で「存在しない」をキャッシュ（404再試行防止）
const NO_BASELINE_CACHE = new Set<string>()

export interface DailyExpenseReference {
  laborCost: number
  utilities: number
  rent: number
  consumables: number
  promotion: number
  cleaning: number
  misc: number
  communication: number
  others: number
  sumOther: number
  totalExpense: number
}

export interface MonthlyExpenseReference {
  laborCost: number
  utilities: number
  rent: number
  consumables: number
  promotion: number
  cleaning: number
  misc: number
  communication: number
  others: number
  sumOther: number
  totalExpense: number
}

export const useExpenseBaseline = (storeId?: string, yyyymm?: string) => {
  // ✅ 安定キー生成
  const cacheKey = useMemo(() => (storeId && yyyymm) ? `${storeId}-${yyyymm}` : '', [storeId, yyyymm])
  const { user } = useAuth()
  const { organizationId } = useOrganization()

  const [daily, setDaily] = useState<DailyExpenseReference>({
    laborCost: 0,
    utilities: 0,
    rent: 0,
    consumables: 0,
    promotion: 0,
    cleaning: 0,
    misc: 0,
    communication: 0,
    others: 0,
    sumOther: 0,
    totalExpense: 0
  })
  const [monthlyTotal, setMonthlyTotal] = useState<MonthlyExpenseReference>({
    laborCost: 0,
    utilities: 0,
    rent: 0,
    consumables: 0,
    promotion: 0,
    cleaning: 0,
    misc: 0,
    communication: 0,
    others: 0,
    sumOther: 0,
    totalExpense: 0
  })
  const [monthly, setMonthly] = useState<ExpenseBaselineDb | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadBaseline = async () => {
      // Set organization context for super admins
      if (organizationId) {
        const { setSelectedOrganizationContext } = await import('@/services/organizationService')
        await setSelectedOrganizationContext(organizationId)
      }

      // Handle 'all' stores case - aggregate all store baselines
      if (storeId === 'all' && yyyymm) {
        setLoading(true)
        try {
          // Get all active stores
          const { data: storesData, error: storesError } = await getStores()
          if (storesError || !storesData) {
            setLoading(false)
            return
          }

          // Fetch expense baselines for all stores
          const baselinePromises = storesData.map(store =>
            getExpenseBaseline(store.id, yyyymm)
          )
          const baselineResults = await Promise.all(baselinePromises)

          // Aggregate the data
          let totalLaborCost = 0
          let totalUtilities = 0
          let totalRent = 0
          let totalConsumables = 0
          let totalPromotion = 0
          let totalCleaning = 0
          let totalMisc = 0
          let totalCommunication = 0
          let totalOthers = 0
          let totalOpenDays = 0
          let storeCount = 0

          baselineResults.forEach(result => {
            if (result.data) {
              totalLaborCost += (result.data.labor_cost_employee || 0) + (result.data.labor_cost_part_time || 0)
              totalUtilities += result.data.utilities || 0
              totalRent += result.data.rent || 0
              totalConsumables += result.data.consumables || 0
              totalPromotion += result.data.promotion || 0
              totalCleaning += result.data.cleaning || 0
              totalMisc += result.data.misc || 0
              totalCommunication += result.data.communication || 0
              totalOthers += result.data.others || 0
              totalOpenDays += result.data.open_days || 0
              storeCount++
            }
          })

          // Calculate average days per store
          const avgOpenDays = storeCount > 0 ? Math.round(totalOpenDays / storeCount) : 1
          const perDay = (value: number) => Math.round(value / Math.max(avgOpenDays, 1))

          // Set daily averages (per day across all stores combined)
          const dailyLaborCost = perDay(totalLaborCost)
          const dailyUtilities = perDay(totalUtilities)
          const dailyRent = perDay(totalRent)
          const dailyConsumables = perDay(totalConsumables)
          const dailyPromotion = perDay(totalPromotion)
          const dailyCleaning = perDay(totalCleaning)
          const dailyMisc = perDay(totalMisc)
          const dailyCommunication = perDay(totalCommunication)
          const dailyOthers = perDay(totalOthers)

          const dailySumOther = dailyUtilities + dailyRent + dailyConsumables +
                                dailyPromotion + dailyCleaning + dailyMisc +
                                dailyCommunication + dailyOthers

          setDaily({
            laborCost: dailyLaborCost,
            utilities: dailyUtilities,
            rent: dailyRent,
            consumables: dailyConsumables,
            promotion: dailyPromotion,
            cleaning: dailyCleaning,
            misc: dailyMisc,
            communication: dailyCommunication,
            others: dailyOthers,
            sumOther: dailySumOther,
            totalExpense: dailyLaborCost + dailySumOther
          })

          // Set monthly totals (sum of all stores)
          const monthlySumOther = totalUtilities + totalRent + totalConsumables +
                                   totalPromotion + totalCleaning + totalMisc +
                                   totalCommunication + totalOthers

          setMonthlyTotal({
            laborCost: totalLaborCost,
            utilities: totalUtilities,
            rent: totalRent,
            consumables: totalConsumables,
            promotion: totalPromotion,
            cleaning: totalCleaning,
            misc: totalMisc,
            communication: totalCommunication,
            others: totalOthers,
            sumOther: monthlySumOther,
            totalExpense: totalLaborCost + monthlySumOther
          })

          setMonthly(null) // No single baseline for 'all' stores
        } catch (err) {
          console.error('useExpenseBaseline (all stores): 予期しないエラー', err)
          setError(err instanceof Error ? err.message : '予期しないエラーが発生しました')
        } finally {
          setLoading(false)
        }
        return
      }

      if (!cacheKey) {
        const emptyExpense = {
          laborCost: 0,
          utilities: 0,
          rent: 0,
          consumables: 0,
          promotion: 0,
          cleaning: 0,
          misc: 0,
          communication: 0,
          others: 0,
          sumOther: 0,
          totalExpense: 0
        }
        setDaily(emptyExpense)
        setMonthlyTotal(emptyExpense)
        setMonthly(null)
        return
      }

      // ✅ キャッシュに「存在しない」記録があれば再試行しない
      if (NO_BASELINE_CACHE.has(cacheKey)) {
        console.log(`📋 useExpenseBaseline: キャッシュヒット (存在しない): ${cacheKey}`)
        const emptyExpense = {
          laborCost: 0,
          utilities: 0,
          rent: 0,
          consumables: 0,
          promotion: 0,
          cleaning: 0,
          misc: 0,
          communication: 0,
          others: 0,
          sumOther: 0,
          totalExpense: 0
        }
        setDaily(emptyExpense)
        setMonthlyTotal(emptyExpense)
        setMonthly(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const { data, error: fetchError } = await getExpenseBaseline(storeId!, yyyymm!)

        if (fetchError) {
          // ✅ 404系エラー（テーブルが存在しない or データなし）は「存在しない」としてキャッシュ
          const errorCode = (fetchError as any)?.code
          const errorMessage = fetchError.message || ''

          if (errorCode === 'PGRST116' || // Postgrest: relation does not exist
              errorCode === 'PGRST205' || // Could not find the table
              errorMessage.includes('Could not find the table') ||
              errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
            console.log(`⚠️ useExpenseBaseline: テーブル/データが存在しません (404) - キャッシュします: ${cacheKey}`)
            NO_BASELINE_CACHE.add(cacheKey)

            const emptyExpense = {
              laborCost: 0,
              utilities: 0,
              rent: 0,
              consumables: 0,
              promotion: 0,
              cleaning: 0,
              misc: 0,
              communication: 0,
              others: 0,
              sumOther: 0,
              totalExpense: 0
            }
            setDaily(emptyExpense)
            setMonthlyTotal(emptyExpense)
            setMonthly(null)
            setLoading(false)
            return
          }

          // ✅ その他のエラーは通常処理
          console.error('useExpenseBaseline: データ取得エラー', fetchError)
          setError(fetchError.message || 'データ取得に失敗しました')
          setLoading(false)
          return
        }

        // 月の日数を計算
        const [year, month] = yyyymm.split('-').map(Number)
        const daysInMonth = new Date(year, month, 0).getDate()
        const openDays = data?.open_days || daysInMonth

        // 日割り計算関数
        const perDay = (value?: number) => Math.round((value || 0) / Math.max(openDays, 1))

        // 日割り経費を計算
        const laborCost = perDay((data?.labor_cost_employee || 0) + (data?.labor_cost_part_time || 0))
        const utilities = perDay(data?.utilities)
        const rent = perDay(data?.rent)
        const consumables = perDay(data?.consumables)
        const promotion = perDay(data?.promotion)
        const cleaning = perDay(data?.cleaning)
        const misc = perDay(data?.misc)
        const communication = perDay(data?.communication)
        const others = perDay(data?.others)

        const sumOther = utilities + rent + consumables + promotion + cleaning + misc + communication + others
        const totalExpense = laborCost + sumOther

        setDaily({
          laborCost,
          utilities,
          rent,
          consumables,
          promotion,
          cleaning,
          misc,
          communication,
          others,
          sumOther,
          totalExpense
        })

        // 月次合計を計算
        const monthlyLaborCost = (data?.labor_cost_employee || 0) + (data?.labor_cost_part_time || 0)
        const monthlyUtilities = data?.utilities || 0
        const monthlyRent = data?.rent || 0
        const monthlyConsumables = data?.consumables || 0
        const monthlyPromotion = data?.promotion || 0
        const monthlyCleaning = data?.cleaning || 0
        const monthlyMisc = data?.misc || 0
        const monthlyCommunication = data?.communication || 0
        const monthlyOthers = data?.others || 0

        const monthlySumOther = monthlyUtilities + monthlyRent + monthlyConsumables +
                                monthlyPromotion + monthlyCleaning + monthlyMisc + monthlyCommunication + monthlyOthers

        setMonthlyTotal({
          laborCost: monthlyLaborCost,
          utilities: monthlyUtilities,
          rent: monthlyRent,
          consumables: monthlyConsumables,
          promotion: monthlyPromotion,
          cleaning: monthlyCleaning,
          misc: monthlyMisc,
          communication: monthlyCommunication,
          others: monthlyOthers,
          sumOther: monthlySumOther,
          totalExpense: monthlyLaborCost + monthlySumOther
        })
        setMonthly(data)
      } catch (err) {
        console.error('useExpenseBaseline: 予期しないエラー', err)
        setError(err instanceof Error ? err.message : '予期しないエラーが発生しました')
      } finally {
        setLoading(false)
      }
    }

    loadBaseline()
  }, [cacheKey, storeId, yyyymm, user, organizationId])

  return {
    expenseBaseline: daily,
    monthlyExpenseBaseline: monthlyTotal,
    monthly,
    loading,
    error
  }
}
