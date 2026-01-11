import React, { useMemo, useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { type DailyReportData, type OperationType } from '@/types'
import { formatCurrency, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CircleCheck as CheckCircle, Save, CloudUpload as UploadCloud, Trophy, ChevronDown, ChevronUp, Copy, Calendar } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useAdminData } from '@/contexts/AdminDataContext'
import { useAvatar } from '@/contexts/AvatarContext'
import { createDailyReport, updateDailyReport, isSupabaseReady, getDailyReports, getDailyTarget } from '@/services/supabase'
import { useExpenseBaseline } from '@/hooks/useExpenseBaseline'
import confetti from 'canvas-confetti'
import { avatarToast } from '@/lib/avatarToast'
import { supabase } from '@/lib/supabase'
import { detectAnomaly, type AnomalyResult } from '@/services/anomalyDetection'
import { AnomalyDetailModal } from '@/components/Reports/AnomalyDetailModal'
import { DailyReportSuccessModal } from '@/components/Reports/DailyReportSuccessModal'

const numberAttrs = {
  inputMode: 'numeric' as const,
  pattern: '[0-9]*',
}

type FormState = {
  date: string
  storeId: string
  operationType: OperationType
  salesCash10: number
  salesCash8: number
  salesCredit10: number
  salesCredit8: number
  sales: number
  // 業者別仕入（動的）
  vendorPurchases: Record<string, number>
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
  customers: number
  lunchCustomers: number
  dinnerCustomers: number
  reportText: string
}

const todayISO = () => new Date().toISOString().split('T')[0]

export const ReportForm: React.FC = () => {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user, getAccessibleStores, refreshUser } = useAuth()
  const { getStoreVendors, vendors, storeVendorAssignments, stores: adminStores } = useAdminData()
  const { setEmotionWithMessage, setEmotion } = useAvatar()

  // 編集モード：URLパラメータでidを受け取る
  const editingReportId = params.get('id')
  const isEditMode = !!editingReportId

  // URLパラメータまたはアクセス可能な最初の店舗を初期値にする
  const getInitialStoreId = () => {
    const paramStore = params.get('store')
    if (paramStore && paramStore !== 'all') {
      const accessibleStores = getAccessibleStores()
      const storeExists = accessibleStores.find(s => s.id === paramStore)
      if (storeExists) return paramStore
    }
    // パラメータが無効な場合は、アクセス可能な最初の店舗を使う
    const accessibleStores = getAccessibleStores()
    return accessibleStores.length > 0 ? accessibleStores[0].id : 'all'
  }

  const [form, setForm] = useState<FormState>({
    date: todayISO(),
    storeId: '',
    operationType: 'dinner', // デフォルトはディナー
    salesCash10: 0, salesCash8: 0, salesCredit10: 0, salesCredit8: 0,
    sales: 0,
    vendorPurchases: {},
    purchase: 0, laborCost: 0, utilities: 0, rent: 0, consumables: 0,
    promotion: 0, cleaning: 0, misc: 0, communication: 0, others: 0,
    customers: 0,
    lunchCustomers: 0,
    dinnerCustomers: 0,
    reportText: ''
  })
  const [tempLunchData, setTempLunchData] = useState<Partial<FormState> | null>(null)
  const [tempDinnerData, setTempDinnerData] = useState<Partial<FormState> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<null | 'local' | 'sent'>(null)
  const [laborManagedMonthly, setLaborManagedMonthly] = useState(true)
  const [loading, setLoading] = useState(false)
  const [targetAchieved, setTargetAchieved] = useState(false)
  const [hasUnsavedData, setHasUnsavedData] = useState(false)
  const [existingReportsToday, setExistingReportsToday] = useState<{ lunch: boolean; dinner: boolean }>({ lunch: false, dinner: false })
  const [showDetailedInputs, setShowDetailedInputs] = useState(false)
  const [dailyTargetSales, setDailyTargetSales] = useState<number>(0)
  const [hasReactedToTarget, setHasReactedToTarget] = useState(false)
  const [anomalyResult, setAnomalyResult] = useState<{ result: AnomalyResult; metricType: string } | null>(null)
  const [checkingAnomaly, setCheckingAnomaly] = useState(false)
  const [feedbackModal, setFeedbackModal] = useState<{ isOpen: boolean; message: string; emotion: 'happy' | 'surprised' | 'love' | 'sparkle' }>({
    isOpen: false,
    message: '',
    emotion: 'happy'
  })
  const [analyzingReport, setAnalyzingReport] = useState(false)

  useEffect(() => {
    if (!form.storeId && user) {
      const initialStoreId = getInitialStoreId()
      setForm(f => ({ ...f, storeId: initialStoreId }))
    }
  }, [user])

  // 既存の日報をチェック（新規作成時のみ）
  useEffect(() => {
    const checkExistingReports = async () => {
      if (!isEditMode && form.storeId && form.storeId !== 'all' && form.date && isSupabaseReady()) {
        try {
          const { data } = await getDailyReports({
            storeId: form.storeId,
            dateFrom: form.date,
            dateTo: form.date
          })

          if (data) {
            const hasLunch = data.some(r => r.operationType === 'lunch')
            const hasDinner = data.some(r => r.operationType === 'dinner')
            setExistingReportsToday({ lunch: hasLunch, dinner: hasDinner })
          }
        } catch (e) {
          console.log('既存日報チェックエラー:', e)
        }
      } else {
        setExistingReportsToday({ lunch: false, dinner: false })
      }
    }

    checkExistingReports()
  }, [form.date, form.storeId, isEditMode])

  // 目標売上を取得
  useEffect(() => {
    const fetchDailyTarget = async () => {
      if (form.storeId && form.storeId !== 'all' && form.date && isSupabaseReady()) {
        try {
          const { data: targetData } = await getDailyTarget(form.storeId, form.date)
          if (targetData && targetData.target_sales > 0) {
            setDailyTargetSales(targetData.target_sales)
          } else {
            setDailyTargetSales(0)
          }
        } catch (e) {
          console.log('目標取得エラー:', e)
          setDailyTargetSales(0)
        }
      } else {
        setDailyTargetSales(0)
      }
    }

    fetchDailyTarget()
    setHasReactedToTarget(false)
  }, [form.date, form.storeId])

  // 売上入力時のリアルタイム反応
  useEffect(() => {
    if (dailyTargetSales > 0 && form.sales > 0 && !hasReactedToTarget) {
      if (form.sales >= dailyTargetSales) {
        setEmotionWithMessage('happy', 'おぉっ！目標達成だワン！✨', 4000)
        setHasReactedToTarget(true)
      } else if (form.sales >= dailyTargetSales * 0.9) {
        setEmotionWithMessage('thinking', 'もう少しで目標だワン...！', 3000)
      } else if (form.sales >= dailyTargetSales * 0.5) {
        setEmotion('thinking')
      } else if (form.sales < dailyTargetSales * 0.5) {
        setEmotionWithMessage('sad', '今日は厳しかったワン...？', 3000)
      }
    }
  }, [form.sales, dailyTargetSales, hasReactedToTarget, setEmotionWithMessage, setEmotion])

  // 店舗に割り当てられた業者をAdminDataContextから取得（useMemoで自動更新）
  const storeVendors = useMemo(() => {
    if (!form.storeId || form.storeId === 'all') {
      console.log('📋 ReportForm: storeId が "all" または空のため業者リストは空です')
      return []
    }
    const result = getStoreVendors(form.storeId)
    console.log('📋 ReportForm: 店舗業者取得:', { storeId: form.storeId, count: result.length, result })
    return result
  }, [form.storeId, getStoreVendors])

  // 編集モード：既存データを読み込む
  useEffect(() => {
    if (isEditMode && editingReportId) {
      const loadReport = async () => {
        setLoading(true)
        let existingReport: DailyReportData | undefined

        // ローカルIDの場合はローカルストレージから
        if (editingReportId.startsWith('local-')) {
          const localReports: DailyReportData[] = JSON.parse(localStorage.getItem('userReports') || '[]')
          existingReport = localReports.find(r => r.id === editingReportId)
        } else if (isSupabaseReady()) {
          // Supabaseから取得
          const { data } = await getDailyReports({ userId: user?.id })
          if (data) {
            existingReport = data.find(r => r.id === editingReportId)
          }
        }

        if (existingReport) {
          console.log('📝 編集モード：データ読み込み', existingReport)
          setForm({
            date: existingReport.date,
            storeId: existingReport.storeId,
            operationType: existingReport.operationType || 'dinner',
            salesCash10: existingReport.salesCash10 || 0,
            salesCash8: existingReport.salesCash8 || 0,
            salesCredit10: existingReport.salesCredit10 || 0,
            salesCredit8: existingReport.salesCredit8 || 0,
            sales: existingReport.sales,
            vendorPurchases: existingReport.vendorPurchases || {},
            purchase: existingReport.purchase,
            laborCost: existingReport.laborCost,
            utilities: existingReport.utilities || 0,
            rent: (existingReport as any).rent || 0,
            consumables: (existingReport as any).consumables || 0,
            promotion: existingReport.promotion || 0,
            cleaning: existingReport.cleaning || 0,
            misc: existingReport.misc || 0,
            communication: existingReport.communication || 0,
            others: existingReport.others || 0,
            customers: existingReport.customers || 0,
            lunchCustomers: (existingReport as any).lunchCustomers || 0,
            dinnerCustomers: (existingReport as any).dinnerCustomers || 0,
            reportText: existingReport.reportText || ''
          })
          // 月次管理フラグも判定
          if (existingReport.laborCost > 0) {
            setLaborManagedMonthly(false)
          }
        } else {
          alert('指定された日報が見つかりませんでした')
          navigate('/dashboard/daily')
        }
        setLoading(false)
      }

      loadReport()
    }
  }, [isEditMode, editingReportId, navigate, user])

  // 前回入力の呼び出し（店舗・営業時間帯単位で記憶） - 新規作成時のみ
  useEffect(() => {
    if (!isEditMode && form.storeId) {
      const last = localStorage.getItem(`lastReport_${form.storeId}_${form.operationType}`)
      if (last) {
        const v = JSON.parse(last)
        setForm((f) => ({ ...f, ...v, date: todayISO() }))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.storeId, form.operationType, isEditMode])

  // 営業時間帯切り替え時にデータを一時保存して切り替え
  const handleOperationTypeChange = (newOperationType: OperationType) => {
    if (isEditMode) {
      return
    }

    // 現在の営業時間帯のデータを一時保存
    const currentData = {
      salesCash10: form.salesCash10,
      salesCash8: form.salesCash8,
      salesCredit10: form.salesCredit10,
      salesCredit8: form.salesCredit8,
      sales: form.sales,
      vendorPurchases: form.vendorPurchases,
      purchase: form.purchase,
      laborCost: form.laborCost,
      customers: form.customers,
      lunchCustomers: form.lunchCustomers,
      dinnerCustomers: form.dinnerCustomers,
      reportText: form.reportText
    }

    // 現在の営業時間帯に応じて一時保存
    if (form.operationType === 'lunch') {
      setTempLunchData(currentData)
    } else if (form.operationType === 'dinner') {
      setTempDinnerData(currentData)
    }

    // 切り替え先のデータを復元
    let restoredData: Partial<FormState> = {
      salesCash10: 0,
      salesCash8: 0,
      salesCredit10: 0,
      salesCredit8: 0,
      sales: 0,
      vendorPurchases: {},
      purchase: 0,
      laborCost: 0,
      customers: 0,
      lunchCustomers: 0,
      dinnerCustomers: 0,
      reportText: ''
    }

    if (newOperationType === 'lunch' && tempLunchData) {
      restoredData = tempLunchData
    } else if (newOperationType === 'dinner' && tempDinnerData) {
      restoredData = tempDinnerData
    }

    // 営業時間帯を切り替えてデータを復元
    setForm(f => ({
      ...f,
      operationType: newOperationType,
      ...restoredData
    }))

    // 保存済みフラグをクリア
    setSaved(null)
  }

  // 入力データの変更を検知
  useEffect(() => {
    const hasData =
      form.salesCash10 > 0 || form.salesCash8 > 0 ||
      form.salesCredit10 > 0 || form.salesCredit8 > 0 ||
      Object.values(form.vendorPurchases).some(v => v > 0) ||
      form.laborCost > 0 ||
      form.customers > 0 || form.reportText.trim() !== ''

    setHasUnsavedData(hasData)
  }, [form])

  // 業者別仕入の合計を自動計算（編集モードでは手動入力を許可）
  const calculatedPurchase = Object.values(form.vendorPurchases).reduce((sum, val) => sum + (val || 0), 0)

  // purchaseをformに反映（詳細モード時のみ自動計算）
  React.useEffect(() => {
    // 詳細モードが開いていて、内訳が入力されている場合のみ自動計算
    if (showDetailedInputs && calculatedPurchase > 0) {
      setForm(f => ({ ...f, purchase: calculatedPurchase }))
    }
  }, [calculatedPurchase, showDetailedInputs])

  // 売上合計を自動計算（編集モードでは手動入力を許可）
  const calculatedSales = (form.salesCash10 || 0) + (form.salesCash8 || 0) + (form.salesCredit10 || 0) + (form.salesCredit8 || 0)
  // salesをformに反映（詳細モード時のみ自動計算）
  React.useEffect(() => {
    // 詳細モードが開いていて、内訳が入力されている場合のみ自動計算
    if (showDetailedInputs && calculatedSales > 0) {
      setForm(f => ({ ...f, sales: calculatedSales }))
    }
  }, [calculatedSales, showDetailedInputs])

  // 実績KPI（入力された値のみ - 売上、仕入、人件費のみ）
  const totalExpenses = form.purchase + form.laborCost
  const grossProfit   = form.sales - form.purchase
  const operatingProfit = form.sales - totalExpenses
  const profitMargin  = form.sales > 0 ? (operatingProfit / form.sales) * 100 : 0

  const purchaseRate  = form.sales > 0 ? (form.purchase / form.sales) * 100 : 0
  const laborRate     = form.sales > 0 ? (form.laborCost / form.sales) * 100 : 0
  const primeRate     = form.sales > 0 ? ((form.purchase + form.laborCost) / form.sales) * 100 : 0

  // 営業時間帯に応じた客数を使用
  const effectiveCustomers = form.operationType === 'lunch' ? form.lunchCustomers :
                             form.operationType === 'dinner' ? form.dinnerCustomers :
                             form.customers
  const averageTicket = effectiveCustomers > 0 ? Math.round(form.sales / effectiveCustomers) : 0

  const setN = (key: keyof FormState, val: number) => setForm((f) => ({ ...f, [key]: Math.max(0, Math.round(val)) }))
  const setVendorPurchase = (vendorId: string, val: number) => setForm(f => ({
    ...f,
    vendorPurchases: { ...f.vendorPurchases, [vendorId]: Math.max(0, Math.round(val)) }
  }))
  const bump = (key: keyof FormState, step: number) => setN(key, Number((form as any)[key] || 0) + step)
  const bumpVendor = (vendorId: string, step: number) => setVendorPurchase(vendorId, (form.vendorPurchases[vendorId] || 0) + step)

  // 前日のデータをコピー
  const copyPreviousDay = async () => {
    if (!form.storeId || form.storeId === 'all' || !isSupabaseReady()) {
      avatarToast.error('店舗を選択してください')
      return
    }

    setLoading(true)
    try {
      // 前日の日付を計算
      const currentDate = new Date(form.date)
      const yesterday = new Date(currentDate)
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toISOString().split('T')[0]

      // 前日の同じ営業時間帯のデータを取得
      const { data: reports } = await getDailyReports({
        storeId: form.storeId,
        dateFrom: yesterdayStr,
        dateTo: yesterdayStr
      })

      if (!reports || reports.length === 0) {
        avatarToast.info('前日のデータが見つからなかったワン...', { duration: 3000 })
        return
      }

      // 同じ営業時間帯のレポートを探す
      const matchingReport = reports.find(r => r.operationType === form.operationType)
      const reportToCopy = matchingReport || reports[0]

      // データをコピー（日付と店舗は変更しない）
      setForm(prev => ({
        ...prev,
        sales: reportToCopy.sales || 0,
        salesCash10: reportToCopy.salesCash10 || 0,
        salesCash8: reportToCopy.salesCash8 || 0,
        salesCredit10: reportToCopy.salesCredit10 || 0,
        salesCredit8: reportToCopy.salesCredit8 || 0,
        purchase: reportToCopy.purchase || 0,
        laborCost: reportToCopy.laborCost || 0,
        customers: reportToCopy.customers || 0,
        lunchCustomers: reportToCopy.lunchCustomers || 0,
        dinnerCustomers: reportToCopy.dinnerCustomers || 0,
        vendorPurchases: reportToCopy.vendorPurchases || {},
        reportText: reportToCopy.reportText || ''
      }))

      setEmotionWithMessage('happy', '前日のデータをコピーしたワン！✨', 3000)
    } catch (error) {
      console.error('前日コピーエラー:', error)
      avatarToast.error('前日のデータ取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  // 日報分析を実行（AIフィードバック）
  const analyzeReport = async (reportData: { date: string; sales: number; customer_count: number; note?: string; weather?: string }) => {
    setAnalyzingReport(true)
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-daily-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(reportData)
      })

      if (!response.ok) {
        throw new Error('分析APIの呼び出しに失敗しました')
      }

      const result = await response.json()

      // フィードバックモーダルを表示
      setFeedbackModal({
        isOpen: true,
        message: result.message || '今日もお疲れさまだワン！',
        emotion: result.emotion || 'happy'
      })
    } catch (error) {
      console.error('日報分析エラー:', error)
      // エラーが発生してもデフォルトのフィードバックを表示
      setFeedbackModal({
        isOpen: true,
        message: '今日もお疲れさまだワン！明日も一緒に頑張るワン！',
        emotion: 'happy'
      })
    } finally {
      setAnalyzingReport(false)
    }
  }

  // 異常検知を実行（バックグラウンド処理）
  const runAnomalyDetection = async (storeId: string, date: string, sales: number, purchase: number, laborCost: number) => {
    setCheckingAnomaly(true)

    try {
      // 原価率をチェック（最優先）
      const costRatio = sales > 0 ? ((purchase / sales) * 100) : 0

      if (costRatio > 0 && costRatio < 100) {
        const costRatioResult = await detectAnomaly({
          store_id: storeId,
          target_date: date,
          metric_type: 'cost_ratio'
        })

        if (costRatioResult.success && costRatioResult.result) {
          const { is_anomaly, severity, message } = costRatioResult.result

          if (is_anomaly) {
            // 詳細を表示するためのデータを保存
            const anomalyData = {
              result: costRatioResult.result,
              metricType: 'cost_ratio'
            }

            // トーストをクリックしたときに詳細モーダルを開く
            const handleToastClick = () => {
              setAnomalyResult(anomalyData)
            }

            if (severity === 'high') {
              avatarToast.error(message, { duration: 8000, onClick: handleToastClick })
            } else if (severity === 'medium') {
              avatarToast.info(message, { duration: 6000, onClick: handleToastClick })
            }

            return
          }
        }
      }

      // 人件費率をチェック（人件費が入力されている場合のみ）
      if (laborCost > 0) {
        const laborRatio = sales > 0 ? ((laborCost / sales) * 100) : 0

        if (laborRatio > 0 && laborRatio < 100) {
          const laborRatioResult = await detectAnomaly({
            store_id: storeId,
            target_date: date,
            metric_type: 'labor_ratio'
          })

          if (laborRatioResult.success && laborRatioResult.result) {
            const { is_anomaly, severity, message } = laborRatioResult.result

            if (is_anomaly && severity !== 'low') {
              // 詳細を表示するためのデータを保存
              const anomalyData = {
                result: laborRatioResult.result,
                metricType: 'labor_ratio'
              }

              // トーストをクリックしたときに詳細モーダルを開く
              const handleToastClick = () => {
                setAnomalyResult(anomalyData)
              }

              if (severity === 'high') {
                avatarToast.error(message, { duration: 7000, onClick: handleToastClick })
              } else {
                avatarToast.info(message, { duration: 5000, onClick: handleToastClick })
              }

              return
            }
          }
        }
      }

      // 異常が検出されなかった場合
      console.log('✅ 異常検知: 問題なし')
    } catch (error) {
      console.error('異常検知エラー:', error)
      // エラーは silent に処理（ユーザーに通知しない）
    } finally {
      setCheckingAnomaly(false)
    }
  }

  const submit = async () => {
    if (!user) {
      alert('ログインが必要です')
      return
    }

    setSaving(true); setSaved(null)

    const selectedStore = getAccessibleStores().find(s => s.id === form.storeId)
    if (!selectedStore) {
      alert('選択された店舗にアクセス権限がありません')
      setSaving(false)
      return
    }

    const reportData = {
      date: form.date,
      storeId: form.storeId,
      storeName: selectedStore.name,
      staffName: user.name,
      operationType: form.operationType,
      sales: form.sales,
      salesCash10: form.salesCash10,
      salesCash8: form.salesCash8,
      salesCredit10: form.salesCredit10,
      salesCredit8: form.salesCredit8,
      purchase: form.purchase,
      laborCost: laborManagedMonthly ? 0 : form.laborCost,
      utilities: 0, // 月次管理のみ
      rent: 0, // 月次管理のみ
      consumables: 0, // 月次管理のみ
      promotion: 0, // 月次管理のみ
      cleaning: 0, // 月次管理のみ
      misc: 0, // 月次管理のみ
      communication: 0, // 月次管理のみ
      others: 0, // 月次管理のみ
      reportText: form.reportText,
      customers: effectiveCustomers, // 営業時間帯に応じた客数
      lunchCustomers: form.lunchCustomers,
      dinnerCustomers: form.dinnerCustomers,
      userId: user.id,
      vendorPurchases: form.vendorPurchases
    } as any

    // ローカル保存関数（フォールバック用）
    const saveToLocal = () => {
      const key = 'userReports'
      const current = JSON.parse(localStorage.getItem(key) || '[]')

      if (isEditMode && editingReportId) {
        // 編集モード：既存データを更新
        const index = current.findIndex((r: any) => r.id === editingReportId)
        if (index !== -1) {
          current[index] = {
            ...current[index],
            ...reportData,
            updated_at: new Date().toISOString()
          }
          localStorage.setItem(key, JSON.stringify(current))
          setSaved('local')
          console.log('📦 ローカルストレージで更新:', current[index])
        }
      } else {
        // 新規作成
        const localReport = {
          id: `local-${Date.now()}`,
          ...reportData,
          createdAt: new Date().toISOString()
        }
        localStorage.setItem(key, JSON.stringify([localReport, ...current]))
        setSaved('local')
        console.log('📦 ローカルストレージに保存:', localReport)
      }
    }

    try {
      // Supabase未設定の場合は即ローカル保存
      if (!isSupabaseReady()) {
        console.log('🔧 Supabase未設定、ローカル保存します')
        saveToLocal()

        // 入力値をリセットして次の入力に備える（新規作成時のみ）
        if (!isEditMode) {
          setForm(f => ({
            ...f,
            salesCash10: 0,
            salesCash8: 0,
            salesCredit10: 0,
            salesCredit8: 0,
            sales: 0,
            vendorPurchases: {},
            purchase: 0,
            laborCost: 0,
            customers: 0,
            reportText: ''
          }))
          // lastReportもクリア（営業時間帯別）
          localStorage.removeItem(`lastReport_${form.storeId}_${form.operationType}`)
        }

        // 編集モードの場合のみダッシュボードに戻る
        if (isEditMode) {
          setTimeout(() => {
            navigate('/dashboard/daily')
          }, 800)
        }
        return
      }

      // Supabaseに保存または更新
      let data, error
      if (isEditMode && editingReportId) {
        // 編集モード：更新
        const updates = {
          date: reportData.date,
          store_id: reportData.storeId,
          user_id: reportData.userId,
          sales: reportData.sales,
          sales_cash_10: reportData.salesCash10 || 0,
          sales_cash_8: reportData.salesCash8 || 0,
          sales_credit_10: reportData.salesCredit10 || 0,
          sales_credit_8: reportData.salesCredit8 || 0,
          purchase: reportData.purchase,
          labor_cost: reportData.laborCost,
          utilities: reportData.utilities,
          rent: reportData.rent,
          consumables: reportData.consumables,
          promotion: reportData.promotion,
          cleaning: reportData.cleaning,
          misc: reportData.misc,
          communication: reportData.communication,
          others: reportData.others,
          customers: reportData.customers,
          report_text: reportData.reportText,
          vendorPurchases: reportData.vendorPurchases
        }
        const result = await updateDailyReport(editingReportId, updates)
        data = result.data
        error = result.error
      } else {
        // 新規作成
        const result = await createDailyReport(reportData)
        data = result.data
        error = result.error
      }

      if (error) {
        // RLS等の失敗もローカル保存にフォールバック
        console.error('⚠️ 日報保存失敗、ローカル保存にフォールバック:', error)
        alert(`保存エラー: ${error.message || '不明なエラー'}\nローカルストレージに保存します。`)
        saveToLocal()
      } else {
        console.log('✅ Supabaseに保存成功:', data)

        // 同じ日付・店舗の他のレポートにも仕入れを反映
        if (isEditMode) {
          try {
            const { data: samedayReports, error: fetchError } = await getDailyReports(
              form.storeId,
              form.date.substring(0, 7) // YYYY-MM
            )

            if (!fetchError && samedayReports) {
              const reportsToUpdate = samedayReports.filter(
                r => r.date === form.date &&
                     r.storeId === form.storeId &&
                     r.id !== editingReportId
              )

              for (const report of reportsToUpdate) {
                await updateDailyReport(report.id, { purchase: form.purchase })
                console.log(`✅ 仕入れを同期: ${report.id} -> ${form.purchase}`)
              }
            }
          } catch (syncError) {
            console.error('仕入れ同期エラー:', syncError)
          }
        }

        setSaved('sent')

        // 保存成功後に一時保存データをクリア（新規作成時のみ）
        if (!isEditMode) {
          if (form.operationType === 'lunch') {
            setTempLunchData(null)
          } else if (form.operationType === 'dinner') {
            setTempDinnerData(null)
          }
        }

        // 異常検知を実行（新規作成時のみ、バックグラウンドで非同期実行）
        if (!isEditMode) {
          // 非同期で実行（ユーザーを待たせない）
          setTimeout(() => {
            runAnomalyDetection(
              form.storeId,
              form.date,
              form.sales,
              form.purchase,
              laborManagedMonthly ? 0 : form.laborCost
            )
          }, 1000) // 1秒後に実行（保存完了メッセージを先に表示）
        }

        // ゲーミフィケーション要素: ポイント加算とAIフィードバック（新規作成時のみ）
        if (!isEditMode) {
          // ポイントを加算
          try {
            const { data: pointsData, error: pointsError } = await supabase.rpc('increment_points', {
              user_id: user.id,
              amount: 10
            })

            if (pointsError) {
              console.error('ポイント加算エラー:', pointsError)
            } else if (pointsData && pointsData.length > 0) {
              console.log('✅ ポイント加算成功:', pointsData[0])
              // ユーザー情報を更新してヘッダーのポイント表示を更新
              await refreshUser()
              // トースト通知を表示
              avatarToast.success('ナイス入力！10ptゲット！🎉')
            }
          } catch (pointsErr) {
            console.error('ポイント加算処理エラー:', pointsErr)
          }

          // AIフィードバックを取得して表示
          await analyzeReport({
            date: form.date,
            sales: form.sales,
            customer_count: effectiveCustomers,
            note: form.reportText
          })
        }

        // 既存の日報状態を更新（新規作成時のみ）
        if (!isEditMode) {
          setExistingReportsToday(prev => ({
            ...prev,
            [form.operationType]: true
          }))
        }

        // 目標達成判定（新規作成時のみ）
        if (!isEditMode) {
          try {
            const { data: targetData } = await getDailyTarget(form.storeId, form.date)
            if (targetData && targetData.target_sales > 0) {
              const achieved = form.sales >= targetData.target_sales
              setTargetAchieved(achieved)
              if (achieved) {
                console.log('🎉 目標達成！', {
                  target: targetData.target_sales,
                  actual: form.sales
                })
              }
            }
          } catch (e) {
            console.log('目標達成判定エラー:', e)
          }
        }
      }

      // 入力値をリセットして次の入力に備える（新規作成時のみ）
      if (!isEditMode) {
        setForm(f => ({
          ...f,
          salesCash10: 0,
          salesCash8: 0,
          salesCredit10: 0,
          salesCredit8: 0,
          sales: 0,
          vendorPurchases: {},
          purchase: 0,
          laborCost: 0,
          customers: 0,
          reportText: ''
        }))
        // lastReportもクリア（営業時間帯別）
        localStorage.removeItem(`lastReport_${form.storeId}_${form.operationType}`)
      }

      // 編集モードの場合のみダッシュボードに戻る
      // 新規作成の場合は続けて入力できるように画面に留まる
      if (isEditMode) {
        setTimeout(() => {
          navigate('/dashboard/daily')
        }, 800)
      }

    } catch (e) {
      console.error('❌ 報告作成エラー:', e)
      // 予期せぬ例外もローカルへ
      saveToLocal()
      alert('報告の保存に失敗しました（ローカルに退避しました）')
    } finally {
      setSaving(false)
    }
  }

  const storeOptions = useMemo(() => {
    let accessibleStores = getAccessibleStores()

    // もし accessibleStores が空で、AdminDataContext に stores がある場合はそれを使う
    // owner/admin は全店舗にアクセス可能なので、adminStoresからフォールバック
    if (accessibleStores.length === 0 && (user?.role === 'admin' || user?.role === 'owner') && adminStores.length > 0) {
      accessibleStores = adminStores.filter(s => s.isActive !== false).map(s => ({ id: s.id, name: s.name }))
    }

    return accessibleStores.map(store => ({
      id: store.id,
      name: store.name,
      disabled: false
    }))
  }, [getAccessibleStores, user?.role, adminStores])

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-4 px-2 sm:px-4 lg:px-6 pb-24 lg:pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold">{isEditMode ? '日報編集' : '日報入力'}</h1>
          <Badge>Mobile Friendly</Badge>
        </div>

      <fieldset>
      <Card>
        <CardHeader><CardTitle>基本情報</CardTitle></CardHeader>
        <CardContent className="space-y-3 sm:space-y-4">
          <div className="space-y-2">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 mb-2">
                💡 <strong>水道光熱費、賃料、消耗品費、販促費、清掃費、通信費、雑費、その他の経費</strong>は月次経費入力画面で管理します
              </p>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <input id="laborManagedMonthly" type="checkbox" checked={laborManagedMonthly} onChange={e=>setLaborManagedMonthly(e.target.checked)} />
              <label htmlFor="laborManagedMonthly" className="text-sm">
                人件費は<strong>月次入力で管理</strong>する（日次入力しない場合）
              </label>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">日付</label>
              <input type="date" value={form.date} onChange={(e)=>setForm(f=>({...f, date: e.target.value}))}
                className="w-full px-3 py-3 rounded border border-input bg-background text-base min-h-[44px]" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">店舗</label>
              <select value={form.storeId} onChange={(e)=>setForm(f=>({...f, storeId: e.target.value}))}
                className="w-full px-3 py-3 rounded border border-input bg-background text-base min-h-[44px]">
                {storeOptions.map(s=>(
                  <option key={s.id} value={s.id} disabled={(s as any).disabled}>{'name' in s ? (s as any).name : s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {!isEditMode && (
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={copyPreviousDay}
                disabled={loading || !form.storeId || form.storeId === 'all'}
                variant="outline"
                className="flex-1 min-h-[44px]"
              >
                <Copy className="w-4 h-4 mr-2" />
                前日をコピー
              </Button>
            </div>
          )}

          <div className="border-t border-gray-200 pt-4">
            <label className="block text-xs text-muted-foreground mb-2">営業時間帯</label>

            {/* 既存日報の状況表示 */}
            {!isEditMode && (existingReportsToday.lunch || existingReportsToday.dinner || tempLunchData || tempDinnerData) && (
              <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-medium text-blue-800 mb-1">本日の入力状況</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {existingReportsToday.lunch && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-800 rounded">
                      ✅ ランチ保存済み
                    </span>
                  )}
                  {!existingReportsToday.lunch && tempLunchData && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 rounded border border-amber-300">
                      📝 ランチ入力中
                    </span>
                  )}
                  {existingReportsToday.dinner && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-800 rounded">
                      ✅ ディナー保存済み
                    </span>
                  )}
                  {!existingReportsToday.dinner && tempDinnerData && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded border border-indigo-300">
                      📝 ディナー入力中
                    </span>
                  )}
                </div>
                {(tempLunchData || tempDinnerData) && (
                  <p className="text-xs text-blue-700 mt-2">
                    💡 入力データは一時保存されています。保存ボタンを押してデータベースに保存してください。
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleOperationTypeChange('lunch')}
                disabled={isEditMode}
                className={cn(
                  'px-4 py-3 rounded-lg border-2 text-base font-medium transition-all min-h-[44px] relative',
                  form.operationType === 'lunch'
                    ? 'bg-amber-100 border-amber-500 text-amber-900'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-amber-300',
                  isEditMode && 'opacity-50 cursor-not-allowed'
                )}
              >
                🌤️ ランチ営業
                {!isEditMode && existingReportsToday.lunch && (
                  <span className="absolute top-1 right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                )}
                {!isEditMode && !existingReportsToday.lunch && tempLunchData && (
                  <span className="absolute top-1 right-1 flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleOperationTypeChange('dinner')}
                disabled={isEditMode}
                className={cn(
                  'px-4 py-3 rounded-lg border-2 text-base font-medium transition-all min-h-[44px] relative',
                  form.operationType === 'dinner'
                    ? 'bg-indigo-100 border-indigo-500 text-indigo-900'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-indigo-300',
                  isEditMode && 'opacity-50 cursor-not-allowed'
                )}
              >
                🌙 ディナー営業
                {!isEditMode && existingReportsToday.dinner && (
                  <span className="absolute top-1 right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                )}
                {!isEditMode && !existingReportsToday.dinner && tempDinnerData && (
                  <span className="absolute top-1 right-1 flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                  </span>
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {form.operationType === 'lunch' && 'ランチ営業時間帯の売上・経費を入力してください'}
              {form.operationType === 'dinner' && 'ディナー営業時間帯の売上・経費を入力してください'}
              {isEditMode && ' (編集モードでは営業時間帯は変更できません)'}
              {!isEditMode && (
                <span className="block mt-1 text-blue-600">
                  💡 ランチとディナーを切り替えても入力データは保持されます。それぞれ保存ボタンで保存してください。
                </span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>数値入力</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4">
        {/* シンプル入力モード：売上合計と客数のみ */}
        {!showDetailedInputs && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-800 mb-3 flex items-center gap-2">
                💰 売上合計
              </h3>
              <div>
                <input {...numberAttrs} inputMode="numeric"
                  value={form.sales || ''}
                  onChange={(e)=>setN('sales', Number(e.target.value.replace(/[^0-9]/g,''))||0)}
                  onFocus={() => setEmotion('thinking')}
                  onBlur={() => setEmotion('normal')}
                  placeholder="例: 150000"
                  className="w-full px-4 py-3 rounded border border-input bg-background text-right text-2xl font-mono min-h-[56px]" />
                <p className="text-xs text-blue-700 mt-2">
                  💡 レジ締めの合計金額を入力してください
                </p>
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-green-800 mb-3 flex items-center gap-2">
                👥 客数
              </h3>

              {form.operationType === 'lunch' && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                  <div className="flex-1 w-full">
                    <input {...numberAttrs}
                      value={form.lunchCustomers || ''} onChange={(e)=>setN('lunchCustomers', Number(e.target.value.replace(/[^0-9]/g,''))||0)}
                      placeholder="例: 45"
                      className="w-full px-4 py-3 rounded border border-input bg-background text-right text-2xl font-mono min-h-[56px]" />
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button variant="outline" size="lg" onClick={()=>bump('lunchCustomers', -1)}
                      className="flex-1 sm:flex-none min-h-[56px] text-lg">-1</Button>
                    <Button variant="outline" size="lg" onClick={()=>bump('lunchCustomers', +1)}
                      className="flex-1 sm:flex-none min-h-[56px] text-lg">+1</Button>
                  </div>
                </div>
              )}

              {form.operationType === 'dinner' && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                  <div className="flex-1 w-full">
                    <input {...numberAttrs}
                      value={form.dinnerCustomers || ''} onChange={(e)=>setN('dinnerCustomers', Number(e.target.value.replace(/[^0-9]/g,''))||0)}
                      placeholder="例: 65"
                      className="w-full px-4 py-3 rounded border border-input bg-background text-right text-2xl font-mono min-h-[56px]" />
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button variant="outline" size="lg" onClick={()=>bump('dinnerCustomers', -1)}
                      className="flex-1 sm:flex-none min-h-[56px] text-lg">-1</Button>
                    <Button variant="outline" size="lg" onClick={()=>bump('dinnerCustomers', +1)}
                      className="flex-1 sm:flex-none min-h-[56px] text-lg">+1</Button>
                  </div>
                </div>
              )}

              {effectiveCustomers > 0 && form.sales > 0 && (
                <div className="mt-3 p-3 bg-white rounded border border-green-200">
                  <div className="flex items-center justify-between">
                    <span className="text-green-800 font-medium text-sm">客単価：</span>
                    <span className="font-mono text-green-900 text-lg">{formatCurrency(averageTicket || 0)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 詳細入力モード：売上内訳・仕入内訳・人件費 */}
        <Collapsible open={showDetailedInputs} onOpenChange={setShowDetailedInputs}>
          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              className={`w-full justify-between min-h-[52px] mb-4 transition-all ${
                showDetailedInputs
                  ? 'bg-orange-100 border-orange-400 hover:bg-orange-200'
                  : 'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-300 hover:bg-orange-100 hover:border-orange-400 animate-subtle-pulse'
              }`}
            >
              <span className="flex items-center gap-2 font-semibold text-orange-900">
                {showDetailedInputs ? '▲' : '▼'}
                <span className="text-base">📝 詳細な内訳を入力する</span>
                <Badge variant="outline" className="ml-2 bg-white text-xs border-orange-200 text-orange-700">任意</Badge>
              </span>
              {showDetailedInputs ? <ChevronUp className="h-5 w-5 text-orange-700" /> : <ChevronDown className="h-5 w-5 text-orange-700" />}
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-4">
        {/* 売上の内訳入力 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-3 flex items-center gap-2">
            💰 売上内訳（決済方法・税率別）
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">💵 現金・10%飲食</label>
              <input {...numberAttrs} inputMode="numeric"
                value={form.salesCash10 || ''}
                onChange={(e)=>setN('salesCash10', Number(e.target.value.replace(/[^0-9]/g,''))||0)}
                onFocus={() => setEmotion('thinking')}
                onBlur={() => setEmotion('normal')}
                placeholder="0"
                className="w-full px-4 py-3 rounded border border-input bg-background text-right text-lg sm:text-base font-mono min-h-[44px]" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">💵 現金・8%軽減</label>
              <input {...numberAttrs} inputMode="numeric"
                value={form.salesCash8 || ''}
                onChange={(e)=>setN('salesCash8', Number(e.target.value.replace(/[^0-9]/g,''))||0)}
                onFocus={() => setEmotion('thinking')}
                onBlur={() => setEmotion('normal')}
                placeholder="0"
                className="w-full px-4 py-3 rounded border border-input bg-background text-right text-lg sm:text-base font-mono min-h-[44px]" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">💳 クレジット・10%飲食</label>
              <input {...numberAttrs} inputMode="numeric"
                value={form.salesCredit10 || ''}
                onChange={(e)=>setN('salesCredit10', Number(e.target.value.replace(/[^0-9]/g,''))||0)}
                onFocus={() => setEmotion('thinking')}
                onBlur={() => setEmotion('normal')}
                placeholder="0"
                className="w-full px-4 py-3 rounded border border-input bg-background text-right text-lg sm:text-base font-mono min-h-[44px]" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">💳 クレジット・8%軽減</label>
              <input {...numberAttrs} inputMode="numeric"
                value={form.salesCredit8 || ''}
                onChange={(e)=>setN('salesCredit8', Number(e.target.value.replace(/[^0-9]/g,''))||0)}
                onFocus={() => setEmotion('thinking')}
                onBlur={() => setEmotion('normal')}
                placeholder="0"
                className="w-full px-4 py-3 rounded border border-input bg-background text-right text-lg sm:text-base font-mono min-h-[44px]" />
            </div>
          </div>
          <div className="mt-3 p-3 bg-white rounded border border-blue-200">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">現金計：</span>
                <span className="font-mono">{formatCurrency((form.salesCash10 || 0) + (form.salesCash8 || 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">クレジット計：</span>
                <span className="font-mono">{formatCurrency((form.salesCredit10 || 0) + (form.salesCredit8 || 0))}</span>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-blue-200">
              <div className="flex items-center justify-between gap-2">
                <span className="text-blue-800 font-medium text-sm">売上合計：</span>
                {isEditMode ? (
                  <div className="flex-1 max-w-[200px]">
                    <input {...numberAttrs} inputMode="numeric"
                      value={form.sales || ''}
                      onChange={(e)=>{
                        const newSales = Number(e.target.value.replace(/[^0-9]/g,''))||0
                        setN('sales', newSales)
                        // 売上を手動編集した場合、内訳をクリア（自動計算との競合を防ぐ）
                        if (calculatedSales === 0) {
                          setForm(f => ({...f, sales: newSales}))
                        }
                      }}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded border border-blue-300 bg-yellow-50 text-right text-base font-mono min-h-[40px]" />
                    <p className="text-xs text-amber-600 mt-1">✏️ 編集可能</p>
                  </div>
                ) : (
                  <span className="font-mono text-blue-900 text-lg">{formatCurrency(form.sales)}</span>
                )}
              </div>
              {isEditMode && (
                <p className="text-xs text-muted-foreground mt-2">
                  {calculatedSales > 0
                    ? '💡 売上内訳を入力すると合計が自動計算されます。直接編集も可能です。'
                    : '💡 売上合計を直接入力できます。または上記の内訳を入力してください。'
                  }
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 客数入力セクション */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-green-800 mb-3 flex items-center gap-2">
            👥 客数入力
          </h3>

          {/* 営業時間帯に応じた客数入力 */}
          {form.operationType === 'lunch' && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
              <div className="w-full sm:w-32 text-sm font-medium text-foreground sm:text-muted-foreground flex items-center gap-1">
                <span>🌤️</span>
                <span>ランチ客数</span>
              </div>
              <div className="flex-1 w-full">
                <input {...numberAttrs}
                  value={form.lunchCustomers || ''} onChange={(e)=>setN('lunchCustomers', Number(e.target.value.replace(/[^0-9]/g,''))||0)}
                  placeholder="0"
                  className="w-full px-4 py-3 rounded border border-input bg-background text-right text-lg sm:text-base font-mono min-h-[44px]" />
              </div>
              <div className="flex gap-1 sm:gap-2 w-full sm:w-auto">
                <Button variant="outline" size="sm" onClick={()=>bump('lunchCustomers', -1)}
                  className="flex-1 sm:flex-none min-h-[44px] sm:h-8 text-xs sm:text-sm">-1</Button>
                <Button variant="outline" size="sm" onClick={()=>bump('lunchCustomers', +1)}
                  className="flex-1 sm:flex-none min-h-[44px] sm:h-8 text-xs sm:text-sm">+1</Button>
              </div>
            </div>
          )}

          {form.operationType === 'dinner' && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
              <div className="w-full sm:w-32 text-sm font-medium text-foreground sm:text-muted-foreground flex items-center gap-1">
                <span>🌙</span>
                <span>ディナー客数</span>
              </div>
              <div className="flex-1 w-full">
                <input {...numberAttrs}
                  value={form.dinnerCustomers || ''} onChange={(e)=>setN('dinnerCustomers', Number(e.target.value.replace(/[^0-9]/g,''))||0)}
                  placeholder="0"
                  className="w-full px-4 py-3 rounded border border-input bg-background text-right text-lg sm:text-base font-mono min-h-[44px]" />
              </div>
              <div className="flex gap-1 sm:gap-2 w-full sm:w-auto">
                <Button variant="outline" size="sm" onClick={()=>bump('dinnerCustomers', -1)}
                  className="flex-1 sm:flex-none min-h-[44px] sm:h-8 text-xs sm:text-sm">-1</Button>
                <Button variant="outline" size="sm" onClick={()=>bump('dinnerCustomers', +1)}
                  className="flex-1 sm:flex-none min-h-[44px] sm:h-8 text-xs sm:text-sm">+1</Button>
              </div>
            </div>
          )}

          {form.operationType === 'full_day' && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
              <div className="w-full sm:w-32 text-sm font-medium text-foreground sm:text-muted-foreground flex items-center gap-1">
                <span>👥</span>
                <span>客数</span>
              </div>
              <div className="flex-1 w-full">
                <input {...numberAttrs}
                  value={form.customers || ''} onChange={(e)=>setN('customers', Number(e.target.value.replace(/[^0-9]/g,''))||0)}
                  placeholder="0"
                  className="w-full px-4 py-3 rounded border border-input bg-background text-right text-lg sm:text-base font-mono min-h-[44px]" />
              </div>
              <div className="flex gap-1 sm:gap-2 w-full sm:w-auto">
                <Button variant="outline" size="sm" onClick={()=>bump('customers', -1)}
                  className="flex-1 sm:flex-none min-h-[44px] sm:h-8 text-xs sm:text-sm">-1</Button>
                <Button variant="outline" size="sm" onClick={()=>bump('customers', +1)}
                  className="flex-1 sm:flex-none min-h-[44px] sm:h-8 text-xs sm:text-sm">+1</Button>
              </div>
            </div>
          )}

          {effectiveCustomers > 0 && form.sales > 0 && (
            <div className="mt-3 p-3 bg-white rounded border border-green-200">
              <div className="flex items-center justify-between">
                <span className="text-green-800 font-medium text-sm">客単価：</span>
                <span className="font-mono text-green-900 text-lg">{formatCurrency(averageTicket || 0)}</span>
              </div>
              <p className="text-xs text-green-700 mt-1">
                💡 売上 ÷ 客数 = 客単価が自動計算されます
              </p>
            </div>
          )}
        </div>

        {/* 業者別仕入入力 */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-red-800 mb-3 flex items-center gap-2">
            🛒 仕入内訳（店舗登録業者別）
          </h3>
          {(!form.storeId || form.storeId === 'all') ? (
            <div className="text-center py-6 text-muted-foreground">
              <p className="text-sm">
                仕入内訳を入力するには、先に店舗を選択してください。
              </p>
            </div>
          ) : storeVendors.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <p className="text-sm">
                この店舗に業者が割り当てられていません。
              </p>
              <p className="text-xs mt-1">設定画面で業者を追加してください。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {storeVendors.map(vendor => (
                <div key={vendor.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                  <div className="w-full sm:w-32 text-xs text-muted-foreground">
                    {vendor.name}
                  </div>
                  <div className="flex-1 w-full">
                    <input {...numberAttrs} inputMode="numeric"
                      value={form.vendorPurchases[vendor.id] || ''} 
                      onChange={(e)=>setVendorPurchase(vendor.id, Number(e.target.value.replace(/[^0-9]/g,''))||0)}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded border border-input bg-background text-right text-sm font-mono min-h-[36px]" />
                  </div>
                  <div className="flex gap-1 w-full sm:w-auto">
                    <Button variant="outline" size="sm" onClick={()=>bumpVendor(vendor.id, -1000)}
                      className="flex-1 sm:flex-none min-h-[36px] sm:h-7 text-xs">-1k</Button>
                    <Button variant="outline" size="sm" onClick={()=>bumpVendor(vendor.id, +1000)}
                      className="flex-1 sm:flex-none min-h-[36px] sm:h-7 text-xs">+1k</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 p-3 bg-white rounded border border-red-200">
            <div className="flex items-center justify-between gap-2">
              <span className="text-red-800 font-medium text-sm">仕入合計：</span>
              {isEditMode ? (
                <div className="flex-1 max-w-[200px]">
                  <input {...numberAttrs} inputMode="numeric"
                    value={form.purchase || ''}
                    onChange={(e)=>{
                      const newPurchase = Number(e.target.value.replace(/[^0-9]/g,''))||0
                      setN('purchase', newPurchase)
                      // 仕入を手動編集した場合、内訳をクリア（自動計算との競合を防ぐ）
                      if (calculatedPurchase === 0) {
                        setForm(f => ({...f, purchase: newPurchase}))
                      }
                    }}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded border border-red-300 bg-yellow-50 text-right text-base font-mono min-h-[40px]" />
                  <p className="text-xs text-amber-600 mt-1">✏️ 編集可能</p>
                </div>
              ) : (
                <span className="font-mono text-red-900 text-lg">{formatCurrency(form.purchase)}</span>
              )}
            </div>
            {isEditMode && (
              <p className="text-xs text-muted-foreground mt-2">
                {calculatedPurchase > 0
                  ? '💡 業者別仕入を入力すると合計が自動計算されます。直接編集も可能です。'
                  : '💡 仕入合計を直接入力できます。または上記の業者別仕入を入力してください。'
                }
              </p>
            )}
          </div>
        </div>

          {/* 人件費のみ入力可能（月次管理選択時は無効化） */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            <div className="w-full sm:w-20 text-sm font-medium text-foreground sm:text-muted-foreground">
              人件費
              {laborManagedMonthly && <span className="text-xs text-blue-600 ml-1">(月次)</span>}
            </div>
            <div className="flex-1 w-full">
              <input {...numberAttrs} inputMode="numeric"
                value={form.laborCost || ''}
                onChange={(e)=>setN('laborCost', Number(e.target.value.replace(/[^0-9]/g,''))||0)}
                disabled={laborManagedMonthly}
                placeholder="0"
                className="w-full px-4 py-3 rounded border border-input bg-background text-right text-lg sm:text-base font-mono min-h-[44px] disabled:bg-muted disabled:text-muted-foreground" />
            </div>
            <div className="flex gap-1 sm:gap-2 w-full sm:w-auto">
              <Button variant="outline" size="sm" onClick={()=>bump('laborCost', -1000)}
                disabled={laborManagedMonthly}
                className="flex-1 sm:flex-none min-h-[44px] sm:h-8 text-xs sm:text-sm">-1,000</Button>
              <Button variant="outline" size="sm" onClick={()=>bump('laborCost', +1000)}
                disabled={laborManagedMonthly}
                className="flex-1 sm:flex-none min-h-[44px] sm:h-8 text-xs sm:text-sm">+1,000</Button>
            </div>
          </div>
          </CollapsibleContent>
        </Collapsible>
        </CardContent>
      </Card>

      {/* 自動計算（実績）- 詳細モード時のみ表示 */}
      {showDetailedInputs && (

      <Card>
        <CardHeader><CardTitle>自動計算（実績）</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
          <Stat label="経費合計" value={formatCurrency(totalExpenses)} />
          <Stat label="粗利益" value={formatCurrency(grossProfit)} pos={grossProfit>=0} />
          <Stat label="営業利益" value={formatCurrency(operatingProfit)} pos={operatingProfit>=0} />
          <Stat label="利益率" value={formatPercent(profitMargin)} pos={profitMargin>=0} />
          <Stat label="原価率" value={formatPercent(purchaseRate)} pos={purchaseRate<=32} />
          <Stat label="人件費率" value={formatPercent(laborRate)} pos={laborRate<=27} />
          <Stat label="プライムコスト率" value={formatPercent(primeRate)} pos={primeRate<=58} />
          <Stat label="客単価" value={averageTicket ? formatCurrency(averageTicket) : '-'} />
        </CardContent>
      </Card>
      )}

      {/* クイック状況タグ */}
      <Card>
        <CardHeader><CardTitle>今日の状況（タップでメモに追加）</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* 天気 */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">🌤 天気</label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '晴れ', tag: '【天気:晴れ】' },
                { label: '曇り', tag: '【天気:曇り】' },
                { label: '雨', tag: '【天気:雨】' },
                { label: '雪', tag: '【天気:雪】' },
                { label: '強風', tag: '【天気:強風】' }
              ].map(({ label, tag }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    const currentText = form.reportText
                    if (currentText.includes(tag)) {
                      // 既に含まれている場合は削除
                      setForm(f => ({ ...f, reportText: currentText.replace(tag, '').trim() }))
                    } else {
                      // 含まれていない場合は追加
                      setForm(f => ({ ...f, reportText: currentText ? `${currentText} ${tag}` : tag }))
                    }
                  }}
                  className={cn(
                    'px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all min-h-[44px]',
                    form.reportText.includes(tag)
                      ? 'bg-orange-100 border-orange-500 text-orange-900'
                      : 'bg-gray-50 border-gray-300 text-gray-700 hover:border-orange-300 hover:bg-orange-50'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 気温 */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">🌡 気温</label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '超寒い', tag: '【気温:超寒い】' },
                { label: '寒い', tag: '【気温:寒い】' },
                { label: '普通', tag: '【気温:普通】' },
                { label: '暖かい', tag: '【気温:暖かい】' },
                { label: '暑い', tag: '【気温:暑い】' }
              ].map(({ label, tag }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    const currentText = form.reportText
                    if (currentText.includes(tag)) {
                      setForm(f => ({ ...f, reportText: currentText.replace(tag, '').trim() }))
                    } else {
                      setForm(f => ({ ...f, reportText: currentText ? `${currentText} ${tag}` : tag }))
                    }
                  }}
                  className={cn(
                    'px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all min-h-[44px]',
                    form.reportText.includes(tag)
                      ? 'bg-blue-100 border-blue-500 text-blue-900'
                      : 'bg-gray-50 border-gray-300 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 忙しさ */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">🔥 忙しさ</label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '暇すぎ', tag: '【忙しさ:暇すぎ】' },
                { label: '普通', tag: '【忙しさ:普通】' },
                { label: '忙しい', tag: '【忙しさ:忙しい】' },
                { label: '戦場', tag: '【忙しさ:戦場】' }
              ].map(({ label, tag }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    const currentText = form.reportText
                    if (currentText.includes(tag)) {
                      setForm(f => ({ ...f, reportText: currentText.replace(tag, '').trim() }))
                    } else {
                      setForm(f => ({ ...f, reportText: currentText ? `${currentText} ${tag}` : tag }))
                    }
                  }}
                  className={cn(
                    'px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all min-h-[44px]',
                    form.reportText.includes(tag)
                      ? 'bg-orange-100 border-orange-500 text-orange-900'
                      : 'bg-gray-50 border-gray-300 text-gray-700 hover:border-orange-300 hover:bg-orange-50'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* イベント */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">🎉 イベント</label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '祭り', tag: '【イベント:祭り】' },
                { label: '会社イベント', tag: '【イベント:会社イベント】' },
                { label: '学生イベント', tag: '【イベント:学生イベント】' },
                { label: 'その他イベント', tag: '【イベント:その他イベント】' }
              ].map(({ label, tag }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    const currentText = form.reportText
                    if (currentText.includes(tag)) {
                      setForm(f => ({ ...f, reportText: currentText.replace(tag, '').trim() }))
                    } else {
                      setForm(f => ({ ...f, reportText: currentText ? `${currentText} ${tag}` : tag }))
                    }
                  }}
                  className={cn(
                    'px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all min-h-[44px]',
                    form.reportText.includes(tag)
                      ? 'bg-purple-100 border-purple-500 text-purple-900'
                      : 'bg-gray-50 border-gray-300 text-gray-700 hover:border-purple-300 hover:bg-purple-50'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 客層 */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">👥 客層</label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'ファミリー', tag: '【客層:ファミリー】' },
                { label: 'カップル', tag: '【客層:カップル】' },
                { label: '学生', tag: '【客層:学生】' },
                { label: '会社員', tag: '【客層:会社員】' },
                { label: '外国人', tag: '【客層:外国人】' },
                { label: '団体', tag: '【客層:団体】' }
              ].map(({ label, tag }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    const currentText = form.reportText
                    if (currentText.includes(tag)) {
                      setForm(f => ({ ...f, reportText: currentText.replace(tag, '').trim() }))
                    } else {
                      setForm(f => ({ ...f, reportText: currentText ? `${currentText} ${tag}` : tag }))
                    }
                  }}
                  className={cn(
                    'px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all min-h-[44px]',
                    form.reportText.includes(tag)
                      ? 'bg-orange-100 border-orange-500 text-orange-900'
                      : 'bg-gray-50 border-gray-300 text-gray-700 hover:border-orange-300 hover:bg-orange-50'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 特記 */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">🚨 特記</label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '欠員あり', tag: '【特記:欠員あり】' },
                { label: '設備トラブル', tag: '【特記:設備トラブル】' },
                { label: 'クレーム', tag: '【特記:クレーム】' },
                { label: '大盛況', tag: '【特記:大盛況】' }
              ].map(({ label, tag }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    const currentText = form.reportText
                    if (currentText.includes(tag)) {
                      setForm(f => ({ ...f, reportText: currentText.replace(tag, '').trim() }))
                    } else {
                      setForm(f => ({ ...f, reportText: currentText ? `${currentText} ${tag}` : tag }))
                    }
                  }}
                  className={cn(
                    'px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all min-h-[44px]',
                    form.reportText.includes(tag)
                      ? 'bg-orange-100 border-orange-500 text-orange-900'
                      : 'bg-gray-50 border-gray-300 text-gray-700 hover:border-orange-300 hover:bg-orange-50'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>メモ</CardTitle></CardHeader>
        <CardContent>
          <textarea
            value={form.reportText}
            onChange={(e)=>setForm(f=>({...f, reportText: e.target.value}))}
            placeholder="例：雨で来客減。テイクアウト強化で客単価維持。"
            className="w-full px-4 py-3 rounded border border-input bg-background min-h-24 text-base resize-none min-h-[44px]"
          />
          <p className="text-xs text-muted-foreground mt-2">💬 音声入力も可（スマホのマイク機能）</p>
        </CardContent>
      </Card>

      <div className="lg:relative fixed lg:bottom-auto bottom-0 left-0 right-0 z-30 flex flex-col sm:flex-row gap-3 lg:sticky lg:bottom-4 bg-background p-4 -mx-2 sm:mx-0 lg:p-0 lg:bg-transparent rounded-t-lg lg:rounded-lg border-t lg:border-none shadow-lg lg:shadow-none">
        <Button className="flex-1 min-h-[52px] sm:min-h-[44px] sm:h-10 text-base sm:text-sm" onClick={submit} disabled={saving || analyzingReport || form.storeId==='all' || loading}>
          {saving ? (
            <UploadCloud className="h-5 w-5 sm:h-4 sm:w-4 mr-2 animate-pulse" />
          ) : analyzingReport ? (
            <span className="mr-2 animate-spin">🔍</span>
          ) : (
            <Save className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />
          )}
          {analyzingReport ? '分析中だワン...' : isEditMode ? '更新' : '保存'}
        </Button>
        <Button variant="outline" className="w-full sm:w-36 min-h-[52px] sm:min-h-[44px] sm:h-10 text-base sm:text-sm" onClick={()=>navigate('/dashboard/daily')}>
          ダッシュボードへ
        </Button>
      </div>

      {saved && (
        <div className={cn('flex flex-col gap-2 text-sm p-4 rounded-lg border',
          saved==='local' ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-green-700 bg-green-50 border-green-200')}>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
            <div className="font-medium">
              {saved==='sent' ? (
                <span>{form.operationType === 'lunch' ? '🌤️ ランチ' : '🌙 ディナー'}の日報を保存しました</span>
              ) : (
                <span>ローカルに保存しました</span>
              )}
            </div>
          </div>

          {saved==='sent' && !isEditMode && (
            <div className="space-y-2 mt-1">
              {form.operationType === 'lunch' && !existingReportsToday.dinner && (
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-md">
                  <div className="font-medium text-indigo-900 mb-1">次のステップ</div>
                  <div className="text-xs text-indigo-800">
                    上部の「🌙 ディナー営業」ボタンをクリックして、ディナーの売上を入力してください。
                    <br />入力画面がクリアされ、ディナーの売上を入力できます。
                  </div>
                </div>
              )}
              {form.operationType === 'dinner' && !existingReportsToday.lunch && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <div className="font-medium text-amber-900 mb-1">ランチ営業の入力</div>
                  <div className="text-xs text-amber-800">
                    ランチ営業がある場合は、上部の「🌤️ ランチ営業」ボタンをクリックして
                    <br />ランチの売上を入力してください。
                  </div>
                </div>
              )}
              {((form.operationType === 'lunch' && existingReportsToday.dinner) ||
                (form.operationType === 'dinner' && existingReportsToday.lunch)) && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="font-medium text-blue-900 mb-1">✅ 本日の入力完了</div>
                  <div className="text-xs text-blue-800">
                    ランチとディナーの両方の日報が入力されました。
                    <br />ダッシュボードで合計売上を確認できます。
                  </div>
                </div>
              )}

              {laborManagedMonthly && (
                <div className="text-xs text-green-700 mt-2 pt-2 border-t border-green-200">
                  💡 人件費は別途「月次経費入力」画面で管理してください
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {targetAchieved && (
        <div className="flex items-center gap-3 text-lg p-4 rounded-lg border bg-green-50 border-green-200 animate-pulse">
          <Trophy className="h-6 w-6 text-green-600" />
          <div className="font-bold text-green-700">
            本日の売上目標を達成しました！おめでとうございます！
          </div>
        </div>
      )}
      </fieldset>
      </div>

      {/* 異常検知詳細モーダル */}
      {anomalyResult && (
        <AnomalyDetailModal
          result={anomalyResult.result}
          metricType={anomalyResult.metricType}
          onClose={() => setAnomalyResult(null)}
        />
      )}

      {/* AIフィードバック成功モーダル */}
      <DailyReportSuccessModal
        isOpen={feedbackModal.isOpen}
        message={feedbackModal.message}
        emotion={feedbackModal.emotion}
        onClose={() => {
          setFeedbackModal({ isOpen: false, message: '', emotion: 'happy' })
          // 編集モード以外で、既に両方の営業時間の日報が入力済みの場合はダッシュボードへ
          if (!isEditMode) {
            const bothReportsExist =
              (form.operationType === 'lunch' && existingReportsToday.dinner) ||
              (form.operationType === 'dinner' && existingReportsToday.lunch)

            if (bothReportsExist) {
              setTimeout(() => {
                navigate('/dashboard/daily')
              }, 300)
            }
          }
        }}
      />
    </>
  )
}

const Stat: React.FC<{label:string; value:string; pos?: boolean}> = ({label, value, pos}) => (
  <div className="p-3 sm:p-4 rounded border border-border">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={cn('text-sm sm:text-base font-semibold leading-tight', pos==null ? '' : pos ? 'text-green-600' : 'text-red-600')}>
      {value}
    </div>
  </div>
)