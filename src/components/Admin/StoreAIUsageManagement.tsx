import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { useOrganization } from '@/contexts/OrganizationContext'
import { Brain, Save, AlertCircle, TrendingUp, Store, Plus, RotateCcw, History, Zap, ArrowRightLeft, BarChart3 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

interface StoreUsageSetting {
  store_id: string
  store_name: string
  monthly_allocation: number
  current_usage: number
  percentage: number
  enabled: boolean
}

interface OverrideLog {
  id: string
  store_name: string
  admin_name: string
  override_type: string
  previous_value: number
  new_value: number
  reason: string | null
  created_at: string
}

export const StoreAIUsageManagement: React.FC = () => {
  const { organization } = useOrganization()
  const [storeSettings, setStoreSettings] = useState<StoreUsageSetting[]>([])
  const [overrideLogs, setOverrideLogs] = useState<OverrideLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)
  const [showOverrideModal, setShowOverrideModal] = useState(false)
  const [selectedStore, setSelectedStore] = useState<StoreUsageSetting | null>(null)
  const [overrideAmount, setOverrideAmount] = useState(0)
  const [overrideReason, setOverrideReason] = useState('')
  const [isPermanent, setIsPermanent] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [contractedStores, setContractedStores] = useState<number>(0)
  const [aiUsageLimitPerStore, setAiUsageLimitPerStore] = useState<number>(100)

  const loadStoreSettings = async () => {
    if (!organization?.id) return

    try {
      // Get all active stores for this organization only
      const { data: stores, error: storesError } = await supabase
        .from('stores')
        .select('id, name, is_active')
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('name')

      if (storesError) throw storesError

      console.log('🏪 AI使用制限: 取得した店舗数:', stores?.length, '組織ID:', organization.id)
      console.log('🏪 AI使用制限: 店舗リスト:', stores?.map(s => s.name))

      if (!stores || stores.length === 0) {
        setStoreSettings([])
        return
      }

      // Get usage settings for each store
      const settingsPromises = stores.map(async (store) => {
        const { data: usageStatus } = await supabase.rpc('get_store_usage_status', {
          p_store_id: store.id,
          p_organization_id: organization.id
        })

        const { data: setting } = await supabase
          .from('ai_usage_settings')
          .select('monthly_allocation, enabled')
          .eq('store_id', store.id)
          .eq('organization_id', organization.id)
          .maybeSingle()

        return {
          store_id: store.id,
          store_name: store.name,
          monthly_allocation: setting?.monthly_allocation || 100,
          current_usage: usageStatus?.current_usage || 0,
          percentage: usageStatus?.percentage || 0,
          enabled: setting?.enabled !== false
        }
      })

      const settings = await Promise.all(settingsPromises)
      setStoreSettings(settings)
    } catch (err) {
      console.error('Failed to load store settings:', err)
      setMessage({ type: 'error', text: '設定の読み込みに失敗しました' })
    }
  }

  const loadOverrideLogs = async () => {
    if (!organization?.id) return

    try {
      const { data: logs, error } = await supabase
        .from('admin_override_logs')
        .select(`
          id,
          store_id,
          admin_user_id,
          override_type,
          previous_value,
          new_value,
          reason,
          created_at,
          stores(name),
          profiles:admin_user_id(full_name)
        `)
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error

      const formattedLogs: OverrideLog[] = (logs || []).map((log: any) => ({
        id: log.id,
        store_name: log.stores?.name || '不明な店舗',
        admin_name: log.profiles?.full_name || '管理者',
        override_type: log.override_type,
        previous_value: log.previous_value,
        new_value: log.new_value,
        reason: log.reason,
        created_at: log.created_at
      }))

      setOverrideLogs(formattedLogs)
    } catch (err) {
      console.error('Failed to load override logs:', err)
    }
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      // Get contracted stores count and plan info from subscription
      if (organization?.id) {
        try {
          const { data: subscription, error: subError } = await supabase
            .from('organization_subscriptions')
            .select(`
              contracted_stores,
              plan:subscription_plans(
                ai_usage_limit
              )
            `)
            .eq('organization_id', organization.id)
            .in('status', ['active', 'trial'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          console.log('📋 サブスクリプション取得結果:', {
            organization_id: organization.id,
            subscription,
            error: subError
          })

          if (subscription?.contracted_stores && subscription?.plan) {
            setContractedStores(subscription.contracted_stores)
            setAiUsageLimitPerStore(subscription.plan.ai_usage_limit)
            console.log('✅ 契約店舗数を設定:', subscription.contracted_stores)
            console.log('✅ 店舗あたりAI使用制限を設定:', subscription.plan.ai_usage_limit)
          } else {
            console.warn('⚠️ contracted_storesが取得できませんでした')
            // デフォルト値として登録店舗数を使用
            const { data: stores, count, error: storeError } = await supabase
              .from('stores')
              .select('id', { count: 'exact' })
              .eq('organization_id', organization.id)
              .eq('is_active', true)

            console.log('🏪 店舗数カウント:', { stores, count, error: storeError })

            if (count !== null && count > 0) {
              setContractedStores(count)
              console.log('📊 登録店舗数から設定:', count)
            } else if (stores && stores.length > 0) {
              setContractedStores(stores.length)
              console.log('📊 登録店舗数から設定(length):', stores.length)
            } else {
              // 最終手段：デフォルト4店舗
              setContractedStores(4)
              console.log('📊 デフォルト値を設定: 4店舗')
            }
          }
        } catch (err) {
          console.error('Failed to load subscription info:', err)
        }
      }

      await Promise.all([loadStoreSettings(), loadOverrideLogs()])
      setLoading(false)
    }
    load()
  }, [organization?.id])

  const handleSave = async () => {
    if (!organization?.id) return

    // Check for over-allocation
    const currentTotal = storeSettings.reduce((sum, s) => sum + s.monthly_allocation, 0)
    const maxAllowed = contractedStores > 0 ? contractedStores * aiUsageLimitPerStore : 0

    if (maxAllowed > 0 && currentTotal > maxAllowed) {
      const excess = currentTotal - maxAllowed
      const confirmed = confirm(
        `⚠️ 警告: 合計配分枠が契約上限を${excess}回超過しています。\n\n` +
        `合計配分: ${currentTotal.toLocaleString()}回\n` +
        `契約上限: ${maxAllowed.toLocaleString()}回\n\n` +
        `このまま保存しますか？`
      )

      if (!confirmed) {
        setMessage({
          type: 'warning',
          text: '保存がキャンセルされました。配分を調整してから再度保存してください。'
        })
        setTimeout(() => setMessage(null), 4000)
        return
      }
    }

    setSaving(true)
    setMessage(null)

    try {
      for (const setting of storeSettings) {
        const { error } = await supabase
          .from('ai_usage_settings')
          .upsert({
            organization_id: organization.id,
            store_id: setting.store_id,
            monthly_allocation: setting.monthly_allocation,
            enabled: setting.enabled,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'organization_id,store_id'
          })

        if (error) throw error
      }

      if (maxAllowed > 0 && currentTotal > maxAllowed) {
        setMessage({
          type: 'warning',
          text: '設定を保存しましたが、合計配分枠が契約上限を超過しています。配分の調整またはプランのアップグレードを検討してください。'
        })
      } else {
        setMessage({ type: 'success', text: '設定を保存しました' })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (err: any) {
      console.error('Failed to save settings:', err)
      setMessage({ type: 'error', text: `保存に失敗しました: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  const handleOverride = async () => {
    if (!selectedStore || !organization?.id) return

    try {
      const { data, error } = await supabase.rpc('admin_override_store_limit', {
        p_store_id: selectedStore.store_id,
        p_organization_id: organization.id,
        p_increase_amount: overrideAmount,
        p_reason: overrideReason || null,
        p_is_permanent: isPermanent
      })

      if (error) throw error

      setMessage({ type: 'success', text: data.message || '上限を増やしました' })
      setShowOverrideModal(false)
      setOverrideAmount(0)
      setOverrideReason('')
      setIsPermanent(false)
      await loadStoreSettings()
      await loadOverrideLogs()
    } catch (err: any) {
      console.error('Failed to override limit:', err)
      setMessage({ type: 'error', text: `オーバーライドに失敗しました: ${err.message}` })
    }
  }

  const handleReset = async (store: StoreUsageSetting) => {
    if (!organization?.id) return
    if (!confirm(`${store.store_name}の使用回数をリセットしてもよろしいですか？`)) return

    try {
      const { data, error } = await supabase.rpc('reset_store_monthly_usage', {
        p_store_id: store.store_id,
        p_organization_id: organization.id,
        p_reason: '管理者による手動リセット'
      })

      if (error) throw error

      setMessage({ type: 'success', text: data.message || '使用回数をリセットしました' })
      await loadStoreSettings()
      await loadOverrideLogs()
    } catch (err: any) {
      console.error('Failed to reset usage:', err)
      setMessage({ type: 'error', text: `リセットに失敗しました: ${err.message}` })
    }
  }

  const updateStoreSetting = (storeId: string, field: keyof StoreUsageSetting, value: any) => {
    setStoreSettings(prev =>
      prev.map(s => (s.store_id === storeId ? { ...s, [field]: value } : s))
    )
  }

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-600'
    if (percentage >= 80) return 'text-orange-600'
    return 'text-green-600'
  }

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-600'
    if (percentage >= 80) return 'bg-orange-600'
    return 'bg-blue-600'
  }

  const getOverrideTypeLabel = (type: string) => {
    switch (type) {
      case 'increase_limit':
        return '上限増加'
      case 'permanent_increase':
        return '恒久的増加'
      case 'reset_usage':
        return '使用回数リセット'
      default:
        return type
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <Brain className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-600" />
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    )
  }

  const totalAllocated = storeSettings.reduce((sum, s) => sum + s.monthly_allocation, 0)
  const totalUsage = storeSettings.reduce((sum, s) => sum + s.current_usage, 0)
  const averageUsagePercent = storeSettings.length > 0
    ? storeSettings.reduce((sum, s) => sum + s.percentage, 0) / storeSettings.length
    : 0
  const highUsageStores = storeSettings.filter(s => s.percentage >= 80).length

  // Calculate max allowed allocation based on contracted stores and plan limit
  const maxAllowedAllocation = contractedStores > 0 ? contractedStores * aiUsageLimitPerStore : 0
  const isOverAllocated = maxAllowedAllocation > 0 && totalAllocated > maxAllowedAllocation
  const allocationExcess = isOverAllocated ? totalAllocated - maxAllowedAllocation : 0

  // Debug logging
  console.log('📊 配分状況チェック:', {
    contractedStores,
    maxAllowedAllocation,
    totalAllocated,
    isOverAllocated,
    allocationExcess,
    storeCount: storeSettings.length
  })

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`p-4 rounded-lg border ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : message.type === 'warning'
              ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-medium">{message.text}</span>
          </div>
        </div>
      )}

      <Card className="bg-gradient-to-br from-blue-50 to-slate-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            組織全体の利用状況（今月）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {contractedStores > 0 && storeSettings.length > contractedStores && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                <strong>警告:</strong> 登録店舗数（{storeSettings.length}店舗）が契約上限（{contractedStores}店舗）を超えています。
                組織設定から契約を確認してください。
              </div>
            </div>
          )}
          {isOverAllocated && (
            <div className="p-4 bg-red-50 border-2 border-red-300 rounded-lg flex items-start gap-3 shadow-md">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5 animate-pulse" />
              <div className="flex-1">
                <div className="text-sm font-bold text-red-900 mb-1">
                  ⚠️ AI配分枠が契約上限を超過しています
                </div>
                <div className="text-sm text-red-800 space-y-1">
                  <div>合計配分枠: <span className="font-bold">{totalAllocated.toLocaleString()}回</span></div>
                  <div>契約上限: <span className="font-bold">{maxAllowedAllocation.toLocaleString()}回</span></div>
                  <div className="text-red-900 font-semibold">
                    超過: <span className="text-lg">+{allocationExcess.toLocaleString()}回</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-red-700 bg-red-100 p-2 rounded">
                  💡 各店舗の配分を調整して、合計が{maxAllowedAllocation.toLocaleString()}回以下になるようにしてください。
                  または、組織設定から契約プランをアップグレードしてください。
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-lg border border-blue-200 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Store className="w-4 h-4 text-blue-600" />
                <div className="text-xs text-blue-600 font-medium">登録店舗数</div>
              </div>
              <div className="text-3xl font-bold text-blue-900">
                {storeSettings.length}
                {contractedStores > 0 && (
                  <span className="text-lg text-muted-foreground">/{contractedStores}</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {contractedStores > 0 ? `契約上限${contractedStores}店舗` : 'アクティブな店舗'}
              </div>
            </div>
            <div className="p-4 bg-white rounded-lg border border-green-200 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-green-600" />
                <div className="text-xs text-green-600 font-medium">合計使用回数</div>
              </div>
              <div className="text-3xl font-bold text-green-900">{totalUsage.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">今月の利用実績</div>
            </div>
            <div className={`p-4 bg-white rounded-lg border shadow-sm ${
              isOverAllocated ? 'border-red-300 bg-red-50' : 'border-orange-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {isOverAllocated ? (
                  <AlertCircle className="w-4 h-4 text-red-600" />
                ) : (
                  <TrendingUp className="w-4 h-4 text-orange-600" />
                )}
                <div className={`text-xs font-medium ${isOverAllocated ? 'text-red-700' : 'text-orange-600'}`}>
                  合計配分枠
                </div>
              </div>
              <div className={`text-3xl font-bold ${isOverAllocated ? 'text-red-900' : 'text-orange-900'}`}>
                {totalAllocated.toLocaleString()}
                {isOverAllocated && <span className="text-red-600 ml-1">⚠️</span>}
              </div>
              <div className="text-xs mt-1">
                {contractedStores > 0 ? (
                  <div className={isOverAllocated ? 'text-red-700 font-semibold' : 'text-muted-foreground'}>
                    契約上限: {maxAllowedAllocation.toLocaleString()}回
                    {isOverAllocated && (
                      <div className="text-red-600 font-bold mt-0.5">
                        超過 +{allocationExcess}回
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">月間利用可能数</span>
                )}
              </div>
            </div>
            <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-slate-600" />
                <div className="text-xs text-slate-600 font-medium">平均使用率</div>
              </div>
              <div className="text-3xl font-bold text-slate-900">{averageUsagePercent.toFixed(0)}%</div>
              <div className="text-xs text-muted-foreground mt-1">
                {highUsageStores > 0 && (
                  <span className="text-orange-600 font-medium">{highUsageStores}店舗が80%超</span>
                )}
                {highUsageStores === 0 && <span className="text-green-600">すべて良好</span>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Store className="w-5 h-5 text-blue-600" />
              店舗別AI使用枠の配分設定
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLogs(!showLogs)}
              className="gap-2"
            >
              <History className="w-4 h-4" />
              {showLogs ? 'ログを非表示' : 'オーバーライド履歴'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {storeSettings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              登録されている店舗がありません。
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {storeSettings.map(store => (
                  <div key={store.store_id} className="p-5 border-2 rounded-xl space-y-4 bg-gradient-to-br from-white to-slate-50 hover:shadow-lg transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-lg ${
                          store.percentage >= 90 ? 'bg-red-100' :
                          store.percentage >= 80 ? 'bg-orange-100' :
                          'bg-blue-100'
                        }`}>
                          <Store className={`w-5 h-5 ${
                            store.percentage >= 90 ? 'text-red-600' :
                            store.percentage >= 80 ? 'text-orange-600' :
                            'text-blue-600'
                          }`} />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-foreground">{store.store_name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge
                              className={
                                store.percentage >= 90
                                  ? 'bg-red-100 text-red-700 border-red-300'
                                  : store.percentage >= 80
                                  ? 'bg-orange-100 text-orange-700 border-orange-300'
                                  : 'bg-green-100 text-green-700 border-green-300'
                              }
                            >
                              {store.percentage.toFixed(0)}% 使用中
                            </Badge>
                            {store.percentage >= 90 && (
                              <Badge variant="destructive">上限接近</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg p-4">
                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">使用回数</div>
                          <div className="text-2xl font-bold text-foreground">{store.current_usage}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">月間配分</div>
                          <div className="text-2xl font-bold text-foreground">{store.monthly_allocation}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">残り</div>
                          <div className={`text-2xl font-bold ${
                            Math.max(0, store.monthly_allocation - store.current_usage) < 10
                              ? 'text-red-600'
                              : 'text-green-600'
                          }`}>
                            {Math.max(0, store.monthly_allocation - store.current_usage)}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                          <div
                            className={`h-full transition-all ${getProgressColor(store.percentage)}`}
                            style={{ width: `${Math.min(100, store.percentage)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{store.current_usage}回使用済み</span>
                          <span>{Math.max(0, store.monthly_allocation - store.current_usage)}回残り</span>
                        </div>
                      </div>
                    </div>

                    <div className={`flex items-center gap-3 p-3 rounded-lg ${
                      isOverAllocated ? 'bg-red-50 border border-red-200' : 'bg-slate-50'
                    }`}>
                      <label className={`text-sm font-medium ${isOverAllocated ? 'text-red-700' : 'text-muted-foreground'}`}>
                        月間配分を変更:
                      </label>
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="number"
                          min="1"
                          max="10000"
                          value={store.monthly_allocation}
                          onChange={e =>
                            updateStoreSetting(store.store_id, 'monthly_allocation', parseInt(e.target.value) || 1)
                          }
                          className={`px-3 py-2 border rounded-md w-24 font-mono font-semibold ${
                            isOverAllocated ? 'border-red-300 bg-white' : ''
                          }`}
                        />
                        <span className="text-sm text-muted-foreground">回 / 月</span>
                        {isOverAllocated && (
                          <AlertCircle className="w-4 h-4 text-red-600" />
                        )}
                      </div>
                    </div>

                    {store.percentage >= 80 && (
                      <div className={`p-3 rounded-lg border flex items-start gap-2 ${
                        store.percentage >= 90
                          ? 'bg-red-50 border-red-200'
                          : 'bg-yellow-50 border-yellow-200'
                      }`}>
                        <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                          store.percentage >= 90 ? 'text-red-600' : 'text-yellow-600'
                        }`} />
                        <div className={`text-xs ${
                          store.percentage >= 90 ? 'text-red-800' : 'text-yellow-800'
                        }`}>
                          {store.percentage >= 90
                            ? 'この店舗は使用率が90%を超えています。上限を増やすかリセットを検討してください。'
                            : 'この店舗は使用率が80%を超えています。残り回数にご注意ください。'}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedStore(store)
                          setShowOverrideModal(true)
                        }}
                        className="gap-2 flex-1"
                      >
                        <Plus className="w-4 h-4" />
                        上限を増やす
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReset(store)}
                        className="gap-2 flex-1"
                      >
                        <RotateCcw className="w-4 h-4" />
                        リセット
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t">
            <Button onClick={handleSave} disabled={saving} className="gap-2 flex-1">
              <Save className="w-4 h-4" />
              {saving ? '保存中...' : '設定を保存'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const equalAllocation = Math.floor(totalAllocated / storeSettings.length)
                storeSettings.forEach(store => {
                  updateStoreSetting(store.store_id, 'monthly_allocation', equalAllocation)
                })
              }}
              disabled={storeSettings.length === 0}
              className="gap-2 flex-1"
            >
              <ArrowRightLeft className="w-4 h-4" />
              均等に配分
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                storeSettings.forEach(store => {
                  updateStoreSetting(store.store_id, 'monthly_allocation', 100)
                })
              }}
              disabled={storeSettings.length === 0}
              className="gap-2 flex-1"
            >
              <RotateCcw className="w-4 h-4" />
              全店100回にリセット
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Usage Analytics Card */}
      {storeSettings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              店舗別使用率比較
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {storeSettings
                .sort((a, b) => b.percentage - a.percentage)
                .map((store, index) => (
                  <div key={store.store_id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="w-8 h-8 flex items-center justify-center">
                          {index + 1}
                        </Badge>
                        <span className="font-medium">{store.store_name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">
                          {store.current_usage} / {store.monthly_allocation}回
                        </span>
                        <Badge
                          className={
                            store.percentage >= 90
                              ? 'bg-red-100 text-red-700'
                              : store.percentage >= 80
                              ? 'bg-orange-100 text-orange-700'
                              : store.percentage >= 50
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }
                        >
                          {store.percentage.toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                    <div className="relative">
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full transition-all ${getProgressColor(store.percentage)}`}
                          style={{ width: `${Math.min(100, store.percentage)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            {/* Quick Insights */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-xs text-blue-600 font-medium mb-1">最も使用している店舗</div>
                <div className="text-lg font-bold text-blue-900">
                  {storeSettings.reduce((max, store) => store.current_usage > max.current_usage ? store : max).store_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {storeSettings.reduce((max, store) => store.current_usage > max.current_usage ? store : max).current_usage}回使用
                </div>
              </div>
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="text-xs text-green-600 font-medium mb-1">余裕がある店舗</div>
                <div className="text-lg font-bold text-green-900">
                  {storeSettings.reduce((min, store) => store.percentage < min.percentage ? store : min).store_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  使用率 {storeSettings.reduce((min, store) => store.percentage < min.percentage ? store : min).percentage.toFixed(0)}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showLogs && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" />
              オーバーライド履歴
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overrideLogs.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                オーバーライド履歴はありません
              </div>
            ) : (
              <div className="space-y-2">
                {overrideLogs.map(log => (
                  <div key={log.id} className="p-3 border rounded-lg text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{getOverrideTypeLabel(log.override_type)}</Badge>
                        <span className="font-medium">{log.store_name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString('ja-JP')}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {log.override_type === 'reset_usage' ? (
                        <span>{log.previous_value}回 → 0回</span>
                      ) : (
                        <span>{log.previous_value}回 → {log.new_value}回</span>
                      )}
                      {' by '}
                      <span className="font-medium">{log.admin_name}</span>
                    </div>
                    {log.reason && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        理由: {log.reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showOverrideModal && selectedStore && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>上限を増やす: {selectedStore.store_name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">増加回数</label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={overrideAmount}
                  onChange={e => setOverrideAmount(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="例: 50"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  現在: {selectedStore.monthly_allocation}回 → 変更後: {selectedStore.monthly_allocation + overrideAmount}回
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">理由（任意）</label>
                <textarea
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  rows={3}
                  placeholder="例: 繁忙期のため一時的に増加"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="permanent"
                  checked={isPermanent}
                  onChange={e => setIsPermanent(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <label htmlFor="permanent" className="text-sm">
                  恒久的に増加（月次リセットされません）
                </label>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowOverrideModal(false)
                    setOverrideAmount(0)
                    setOverrideReason('')
                    setIsPermanent(false)
                  }}
                >
                  キャンセル
                </Button>
                <Button onClick={handleOverride} disabled={overrideAmount <= 0}>
                  適用
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
