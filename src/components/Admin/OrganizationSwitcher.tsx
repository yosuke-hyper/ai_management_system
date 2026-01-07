/**
 * 組織切り替えコンポーネント（スーパー管理者専用）
 *
 * スーパー管理者が異なる組織のデータにアクセスするための
 * 組織切り替え機能を提供します。
 */

import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/contexts/OrganizationContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Search, Building2, Users, CheckCircle } from 'lucide-react'

interface Organization {
  id: string
  name: string
  slug: string
  email: string
  subscription_status: string
  subscription_plan: string
  created_at: string
  member_count?: number
  store_count?: number
}

export const OrganizationSwitcher: React.FC = () => {
  const { user } = useAuth()
  const { organization, setOrganization } = useOrganization()
  const location = useLocation()
  const navigate = useNavigate()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    if (user?.isSuperAdmin) {
      fetchAllOrganizations()
    }
  }, [user])

  const fetchAllOrganizations = async () => {
    try {
      setLoading(true)

      // スーパー管理者は全組織を取得可能
      const { data: orgs, error } = await supabase
        .from('organizations')
        .select(`
          *,
          organization_members(count),
          stores(count)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      const organizationsWithCounts = (orgs || []).map((org: any) => ({
        ...org,
        member_count: org.organization_members?.[0]?.count || 0,
        store_count: org.stores?.[0]?.count || 0
      }))

      setOrganizations(organizationsWithCounts)
    } catch (error) {
      console.error('Failed to fetch organizations:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSwitchOrganization = async (org: Organization) => {
    if (!user?.isSuperAdmin) {
      console.error('Not a super admin')
      return
    }

    try {
      setSwitching(true)
      console.log('🔄 Switching to organization:', org.name, org.id)

      // localStorageに選択した組織を保存
      localStorage.setItem('superadmin_selected_org', org.id)
      console.log('💾 Saved organization to localStorage:', org.id)

      // データベースのセッション変数を設定（RLSポリシー用）
      try {
        const { setSelectedOrganizationContext } = await import('@/services/organizationService')
        const success = await setSelectedOrganizationContext(org.id)
        if (success) {
          console.log('✅ Database session context set:', org.id)
        } else {
          console.warn('⚠️ Failed to set database session context')
        }
      } catch (error) {
        console.error('❌ Error setting database session context:', error)
      }

      // 組織を切り替え
      setOrganization({
        id: org.id,
        name: org.name,
        slug: org.slug,
        email: org.email,
        subscriptionStatus: org.subscription_status as any,
        subscriptionPlan: org.subscription_plan as any,
        maxStores: 999,
        maxUsers: 999,
        maxAiRequestsPerMonth: 999999,
        createdAt: org.created_at,
        updatedAt: org.created_at
      })

      console.log('✅ Organization context updated')

      // 店舗一覧を更新
      try {
        const { data: stores } = await supabase
          .from('stores')
          .select('id, name, brand_id')
          .eq('organization_id', org.id)
          .eq('is_active', true)
          .order('name')

        console.log('🏪 Stores loaded for new organization:', stores?.length || 0)
      } catch (error) {
        console.error('Failed to load stores:', error)
      }

      // 監査ログに記録（エラーが出ても切り替えは完了している）
      try {
        const { error: logError } = await supabase.rpc('log_organization_switch', {
          target_org_id: org.id
        })
        if (logError) {
          console.warn('Failed to log organization switch:', logError)
        }
      } catch (logErr) {
        console.warn('Failed to log organization switch:', logErr)
      }

      // ページをリロードして新しい組織のデータを読み込む
      const currentPath = location.pathname + location.search
      console.log('🔄 Reloading page at:', currentPath)

      // 一度ダッシュボードのデフォルトページに移動してから元のページに戻る
      // これによりReact Routerがページを再マウントし、新しいデータを読み込む
      navigate('/dashboard', { replace: true })
      setTimeout(() => {
        navigate(currentPath, { replace: true })
      }, 100)
    } catch (error) {
      console.error('❌ Failed to switch organization:', error)
      alert('組織の切り替えに失敗しました: ' + (error as Error).message)
    } finally {
      setSwitching(false)
    }
  }

  const filteredOrganizations = organizations.filter(org =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    org.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    org.slug.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (!user?.isSuperAdmin) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            この機能はスーパー管理者のみ利用できます。
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          組織を切り替え
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* 検索バー */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="組織名、メール、スラッグで検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* 組織一覧 */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            読み込み中...
          </div>
        ) : filteredOrganizations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            組織が見つかりませんでした
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredOrganizations.map((org) => (
              <div
                key={org.id}
                className={`p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer ${
                  organization?.id === org.id ? 'border-primary bg-primary/5' : ''
                }`}
                onClick={() => handleSwitchOrganization(org)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{org.name}</h3>
                      {organization?.id === org.id && (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {org.email}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {org.member_count} メンバー
                      </span>
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {org.store_count} 店舗
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        org.subscription_status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {org.subscription_plan}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 pt-4 border-t space-y-3">
          <div className="text-sm text-muted-foreground">
            <p>全 {organizations.length} 組織</p>
            {searchTerm && (
              <p className="mt-1">検索結果: {filteredOrganizations.length} 組織</p>
            )}
          </div>

          {localStorage.getItem('superadmin_selected_org') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                localStorage.removeItem('superadmin_selected_org')
                window.location.reload()
              }}
              className="w-full"
            >
              デフォルト組織に戻る
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
