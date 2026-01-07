import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getBrands, createBrand, updateBrand, deleteBrand, type BrandDb, type StoreDb, getStores } from '@/services/supabase'
import { useOrganization } from '@/contexts/OrganizationContext'
import { useAuth } from '@/contexts/AuthContext'
import { Store, Edit2, Trash2, Save, X, Eye } from 'lucide-react'

export const BrandManagement: React.FC = () => {
  console.log('🏪 BrandManagement コンポーネントがマウントされました')

  const { organization } = useOrganization()
  const { isDemoMode } = useAuth()
  const [brands, setBrands] = useState<BrandDb[]>([])
  const [stores, setStores] = useState<StoreDb[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<string>('')
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null)

  const [brandForm, setBrandForm] = useState({
    name: '',
    type: 'restaurant'
  })

  useEffect(() => {
    console.log('🏪 BrandManagement useEffect実行', { organization })
    loadData()
  }, [organization])

  const loadData = async () => {
    if (!organization?.id) return

    setLoading(true)
    const [brandsResult, storesResult] = await Promise.all([
      getBrands({ organizationId: organization.id }),
      getStores()
    ])

    if (brandsResult.error) {
      console.error('業態取得エラー:', brandsResult.error)
      setError('業態の読み込みに失敗しました')
    } else {
      setBrands(brandsResult.data || [])
    }

    if (storesResult.error) {
      console.error('店舗取得エラー:', storesResult.error)
    } else {
      setStores(storesResult.data || [])
    }

    setLoading(false)
  }

  const showMessage = (type: 'success' | 'error', message: string) => {
    if (type === 'success') {
      setSuccess(message)
      setTimeout(() => setSuccess(''), 3000)
    } else {
      setError(message)
      setTimeout(() => setError(''), 3000)
    }
  }

  const resetForm = () => {
    setBrandForm({
      name: '',
      type: 'restaurant'
    })
    setEditingBrandId(null)
  }

  const startEditing = (brand: BrandDb) => {
    setBrandForm({
      name: brand.name,
      type: brand.type
    })
    setEditingBrandId(brand.id)
  }

  const handleSubmit = async () => {
    console.log('🔵 handleSubmit開始', { organization, brandForm })

    if (!organization?.id) {
      console.log('❌ organization.idが見つかりません')
      showMessage('error', '組織情報が見つかりません')
      return
    }

    if (!brandForm.name.trim()) {
      console.log('❌ 業態名が空です')
      showMessage('error', '業態名を入力してください')
      return
    }

    setLoading(true)

    if (editingBrandId) {
      console.log('🔵 業態更新モード', editingBrandId)
      const { error } = await updateBrand(editingBrandId, {
        name: brandForm.name,
        type: brandForm.type
      } as Partial<BrandDb>)

      console.log('🔵 updateBrand結果', { error })

      if (error) {
        console.error('❌ 更新エラー', error)
        showMessage('error', `業態の更新に失敗しました: ${error.message || ''}`)
      } else {
        console.log('✅ 業態更新成功')
        showMessage('success', '業態を更新しました')
        resetForm()
        await loadData()
      }
    } else {
      console.log('🔵 業態登録モード')
      const { error } = await createBrand({
        organizationId: organization.id,
        name: brandForm.name,
        displayName: brandForm.name,
        type: brandForm.type
      })

      console.log('🔵 createBrand結果', { error })

      if (error) {
        console.error('❌ 登録エラー', error)
        showMessage('error', `業態の登録に失敗しました: ${error.message || ''}`)
      } else {
        console.log('✅ 業態登録成功')
        showMessage('success', '業態を登録しました')
        resetForm()
        await loadData()
      }
    }

    setLoading(false)
    console.log('🔵 handleSubmit完了')
  }

  const handleDelete = async (brandId: string, brandName: string) => {
    const associatedStores = stores.filter(s => s.brand_id === brandId)

    if (associatedStores.length > 0) {
      if (!confirm(`業態「${brandName}」には${associatedStores.length}店舗が紐付けられています。\n削除すると、これらの店舗は業態未設定になります。\n本当に削除しますか？`)) {
        return
      }
    } else {
      if (!confirm(`業態「${brandName}」を削除しますか？`)) {
        return
      }
    }

    setLoading(true)
    const { error } = await deleteBrand(brandId)

    if (error) {
      showMessage('error', '業態の削除に失敗しました')
    } else {
      showMessage('success', '業態を削除しました')
      await loadData()
    }

    setLoading(false)
  }

  const brandTypeLabels: Record<string, string> = {
    restaurant: 'レストラン',
    izakaya: '居酒屋',
    cafe: 'カフェ',
    ramen: 'ラーメン',
    bar: 'バー',
    fastfood: 'ファストフード',
    bakery: 'ベーカリー',
    other: 'その他'
  }

  const getStoreCountByBrand = (brandId: string) => {
    return stores.filter(s => s.brand_id === brandId).length
  }

  console.log('🏪 BrandManagement レンダリング', { brands: brands.length, stores: stores.length, loading, editingBrandId })

  return (
    <div className="space-y-6">
      {isDemoMode && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2 text-amber-900 mb-2">
            <Eye className="w-5 h-5" />
            <p className="font-semibold">デモモード - 閲覧のみ</p>
          </div>
          <p className="text-sm text-amber-800">
            デモ環境では業態の登録・編集・削除はできません。
            3つの固定業態（居酒屋、ラーメン、イタリアン）がご覧いただけます。
          </p>
        </div>
      )}

      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">🏪 BrandManagement コンポーネント表示中</p>
        <p className="text-xs text-blue-600">業態数: {brands.length} / 店舗数: {stores.length} / Loading: {loading ? 'true' : 'false'}</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 登録/編集フォーム（デモモードでは非表示） */}
        {!isDemoMode && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="w-5 h-5" />
                {editingBrandId ? '業態の編集' : '業態の登録'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">業態名</label>
              <input
                type="text"
                className="w-full border border-input rounded-md px-3 py-2 bg-background"
                value={brandForm.name}
                onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
                placeholder="例: 居酒屋、カフェ、ラーメン"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">業態タイプ</label>
              <select
                className="w-full border border-input rounded-md px-3 py-2 bg-background"
                value={brandForm.type}
                onChange={(e) => setBrandForm({ ...brandForm, type: e.target.value })}
              >
                {Object.entries(brandTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-2 relative z-10">
              <button
                type="button"
                onClick={() => {
                  console.log('🔵 登録ボタンがクリックされました')
                  handleSubmit()
                }}
                disabled={loading}
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer relative z-10"
                style={{ pointerEvents: 'auto' }}
              >
                <Save className="w-4 h-4 mr-2" />
                {editingBrandId ? '更新' : '登録'}
              </button>
              {editingBrandId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer relative z-10"
                  style={{ pointerEvents: 'auto' }}
                >
                  <X className="w-4 h-4 mr-2" />
                  キャンセル
                </button>
              )}
            </div>
          </CardContent>
        </Card>
        )}

        {/* 登録済み業態一覧 */}
        <Card className={isDemoMode ? 'lg:col-span-2' : ''}>
          <CardHeader>
            <CardTitle>登録済み業態</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && brands.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <div className="animate-pulse">読み込み中...</div>
              </div>
            ) : brands.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Store className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-sm">業態が登録されていません</p>
                <p className="text-xs mt-1">左側のフォームから業態を追加してください</p>
              </div>
            ) : (
              brands.map((brand) => {
                const storeCount = getStoreCountByBrand(brand.id)
                return (
                  <div
                    key={brand.id}
                    className="flex items-center justify-between border border-border rounded-md px-4 py-3"
                  >
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-2">
                        {brand.name}
                        <Badge variant="outline" className="text-xs">
                          {brandTypeLabels[brand.type] || brand.type}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        紐付け店舗数: {storeCount}店舗
                      </div>
                    </div>
                    {!isDemoMode && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditing(brand)}
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(brand.id, brand.name)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
