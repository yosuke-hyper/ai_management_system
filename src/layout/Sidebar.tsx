import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChartBar as BarChart3, Calendar, Target, MessageSquare, X, TrendingUp, Settings, Users, FileText, Building, ChevronDown, Lock, Database, HelpCircle, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/contexts/OrganizationContext'
import { PermissionGuard } from '@/components/auth/PermissionGuard'
import { FeatureLockedModal } from '@/components/ui/feature-locked-modal'
import { useTourContextOptional } from '@/contexts/TourContext'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

const menuItems = [
  {
    id: 'dashboard',
    label: 'ホーム 🏠',
    icon: BarChart3,
    demoAccessible: true,
    children: [
      { id: 'daily', label: '今日の記録', path: '/dashboard/daily' },
      { id: 'weekly', label: '今週の振り返り', path: '/dashboard/weekly' },
      { id: 'monthly', label: '今月のまとめ', path: '/dashboard/monthly' }
    ]
  },
  {
    id: 'targets',
    label: '目標ノート 🎯',
    icon: Target,
    path: '/dashboard/targets',
    demoAccessible: true
  },
  {
    id: 'chat',
    label: 'AIパートナー 💬',
    icon: MessageSquare,
    path: '/dashboard/chat',
    badge: 'Beta',
    demoAccessible: true
  },
  {
    id: 'ai-reports',
    label: 'AI分析レポート',
    icon: FileText,
    path: '/dashboard/ai-reports',
    demoAccessible: true
  },
  {
    id: 'report',
    label: '日報入力',
    icon: Calendar,
    path: '/dashboard/report/new',
    demoAccessible: false,
    featureDescription: '日々の売上・経費データを入力して店舗の業績を記録できます',
    dataTour: 'sidebar-reports'
  },
  {
    id: 'monthly-expense',
    label: '月次固定費入力',
    icon: Calendar,
    path: '/dashboard/expenses/monthly',
    demoAccessible: true
  },
  {
    id: 'data-management',
    label: 'データ整理',
    icon: Database,
    path: '/dashboard/data-management',
    demoAccessible: false,
    featureDescription: 'CSVインポート、データエクスポート、一括編集などのデータ管理機能が使えます'
  },
  {
    id: 'organization',
    label: 'チーム管理 👥',
    icon: Building,
    path: '/dashboard/organization',
    demoAccessible: false,
    featureDescription: '組織情報の編集、メンバー管理、店舗割り当て、サブスクリプションの設定ができます'
  },
  {
    id: 'admin',
    label: '設定',
    icon: Settings,
    path: '/dashboard/admin',
    demoAccessible: false,
    featureDescription: 'システム全体の設定やAI機能の管理ができます'
  },
  {
    id: 'support',
    label: 'サポート',
    icon: HelpCircle,
    path: '/dashboard/support',
    demoAccessible: true
  }
]

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, isDemoMode } = useAuth()
  const { organizationRole } = useOrganization()
  const tourContext = useTourContextOptional()
  const [expandedMenus, setExpandedMenus] = React.useState<Set<string>>(new Set(['dashboard']))
  const [lockedFeatureModal, setLockedFeatureModal] = React.useState<{
    isOpen: boolean
    featureName: string
    featureDescription?: string
  }>({ isOpen: false, featureName: '', featureDescription: '' })

  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev => {
      const newSet = new Set(prev)
      if (newSet.has(menuId)) {
        newSet.delete(menuId)
      } else {
        newSet.add(menuId)
      }
      return newSet
    })
  }

  const handleNavigation = (path: string, item?: any) => {
    if (isDemoMode && item && item.demoAccessible === false) {
      setLockedFeatureModal({
        isOpen: true,
        featureName: item.label,
        featureDescription: item.featureDescription
      })
      return
    }

    console.log('🔗 Sidebar navigation:', path, 'isDemoMode:', isDemoMode)

    const currentParams = new URLSearchParams(location.search)
    const currentStoreId = currentParams.get('store')

    if (currentStoreId) {
      const newUrl = `${path}?store=${currentStoreId}`
      console.log('🔗 Navigating with store:', newUrl)
      navigate(newUrl)
    } else {
      console.log('🔗 Navigating without store:', path)
      navigate(path)
    }
    onClose()
  }

  const isActivePath = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path)
  }

  const getVisibleMenuItems = () => {
    let allItems = menuItems

    // デモモードの場合はすべての機能を表示（ロック付き）
    if (isDemoMode) {
      return allItems
    }

    // ユーザーがログインしていない場合は空
    if (!user) return []

    // スタッフの場合は基本機能のみ
    if (user.role === 'staff') {
      return allItems.filter(item =>
        ['dashboard', 'report', 'chat'].includes(item.id)
      )
    }

    // 店長の場合は一部管理機能のみ表示
    if (user.role === 'manager') {
      return allItems
    }

    // 統括は全機能アクセス可能
    return allItems
  }

  const visibleMenuItems = getVisibleMenuItems()

  const isFeatureLocked = (item: any) => {
    return isDemoMode && item.demoAccessible === false
  }

  return (
    <>
      {/* Desktop Sidebar - Always visible on large screens */}
      <aside
        className="hidden lg:flex lg:flex-col static w-64 bg-card border-r border-border flex-shrink-0 h-screen"
        style={{ width: '256px', minWidth: '256px' }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex h-14 sm:h-16 items-center justify-between px-4 border-b border-border">
            <div className="flex items-center gap-2">
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-2">
            {visibleMenuItems.map((item) => {
              const Icon = item.icon
              const hasChildren = !!item.children
              const isParentActive = hasChildren 
                ? item.children.some(child => isActivePath(child.path))
                : isActivePath(item.path || '')

              return (
                <div key={item.id}>
                  {/* Parent item */}
                  {(item.id === 'admin' || item.id === 'organization') && !isDemoMode ? (
                    <PermissionGuard requiredRole={item.id === 'admin' ? 'admin' : 'manager'} showError={false}>
                      <Button
                        variant="ghost"
                        className={cn(
                          "w-full justify-start h-auto py-3 px-3 text-sm min-h-[44px]",
                          isParentActive && "bg-accent text-accent-foreground",
                          isFeatureLocked(item) && "opacity-75"
                        )}
                        onClick={() => hasChildren ? toggleMenu(item.id) : handleNavigation(item.path!, item)}
                      >
                        <Icon className="h-4 w-4 mr-2 sm:mr-3 flex-shrink-0" />
                        <span className="flex-1 text-left truncate">{item.label}</span>
                        {isFeatureLocked(item) && (
                          <Lock className="h-3 w-3 mr-1 text-muted-foreground" />
                        )}
                        {item.badge && (
                          <Badge variant="secondary" className="text-xs">
                            {item.badge}
                          </Badge>
                        )}
                        {hasChildren && (
                          <ChevronDown className={cn(
                            "h-4 w-4 transition-transform",
                            expandedMenus.has(item.id) && "rotate-180"
                          )} />
                        )}
                      </Button>
                    </PermissionGuard>
                  ) : (
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start h-auto py-3 px-3 text-sm min-h-[44px]",
                        isParentActive && "bg-accent text-accent-foreground",
                        isFeatureLocked(item) && "opacity-75"
                      )}
                      onClick={() => hasChildren ? toggleMenu(item.id) : handleNavigation(item.path!, item)}
                      data-tour={(item as any).dataTour}
                    >
                      <Icon className="h-4 w-4 mr-2 sm:mr-3 flex-shrink-0" />
                      <span className="flex-1 text-left truncate">{item.label}</span>
                      {isFeatureLocked(item) && (
                        <Lock className="h-3 w-3 mr-1 text-muted-foreground" />
                      )}
                      {item.badge && (
                        <Badge variant="secondary" className="text-xs">
                          {item.badge}
                        </Badge>
                      )}
                      {hasChildren && (
                        <ChevronDown className={cn(
                          "h-4 w-4 transition-transform",
                          expandedMenus.has(item.id) && "rotate-180"
                        )} />
                      )}
                    </Button>
                  )}

                  {/* Children items */}
                  {hasChildren && expandedMenus.has(item.id) && (
                    <div className="ml-4 mt-1 space-y-1">
                      {item.children.map((child) => (
                        <Button
                          key={child.id}
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "w-full justify-start text-sm py-2.5 min-h-[40px]",
                            isActivePath(child.path) && "bg-primary text-primary-foreground"
                          )}
                          onClick={() => handleNavigation(child.path, item)}
                        >
                          {child.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-border space-y-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start text-blue-600 border-blue-200 hover:bg-blue-50"
              onClick={() => {
                if (!tourContext) return
                const currentPath = location.pathname
                if (currentPath.includes('/dashboard/daily') || currentPath.includes('/dashboard/weekly') || currentPath.includes('/dashboard/monthly')) {
                  tourContext.startTour('dashboard')
                } else if (currentPath.includes('/dashboard/report')) {
                  tourContext.startTour('report_form')
                } else if (currentPath.includes('/dashboard/admin') || currentPath.includes('/dashboard/organization')) {
                  tourContext.startTour('settings')
                } else if (currentPath.includes('/dashboard/chat')) {
                  tourContext.startTour('ai_chat')
                } else {
                  tourContext.startTour('dashboard')
                }
                onClose()
              }}
            >
              <Compass className="h-4 w-4 mr-2" />
              使い方ガイド
            </Button>
            {user && (
              <div className="p-2 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">ログイン中</div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    user.role === 'admin' ? 'bg-red-500' :
                    user.role === 'manager' ? 'bg-blue-500' :
                    'bg-green-500'
                  }`} />
                  <div className="text-xs font-medium truncate">{user.name}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {organizationRole === 'owner' ? 'オーナー' :
                   organizationRole === 'admin' ? '管理者' :
                   organizationRole === 'manager' ? 'マネージャー' :
                   'スタッフ'}
                </div>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Version 1.0.0
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          "lg:hidden fixed inset-y-0 left-0 z-50 w-64 max-w-[80vw] bg-card border-r border-border transform transition-transform duration-200 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex h-16 items-center justify-between px-4 border-b border-border">
            <div className="flex items-center gap-2">
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-2">
            {visibleMenuItems.map((item) => {
              const Icon = item.icon
              const hasChildren = !!item.children
              const isParentActive = hasChildren
                ? item.children.some(child => isActivePath(child.path))
                : isActivePath(item.path || '')

              return (
                <div key={item.id}>
                  {item.id === 'admin' || item.id === 'organization' ? (
                    <PermissionGuard requiredRole={item.id === 'admin' ? 'admin' : 'manager'} showError={false}>
                      <Button
                        variant="ghost"
                        className={cn(
                          "w-full justify-start min-h-[44px] py-3",
                          isParentActive && "bg-accent"
                        )}
                        onClick={() => hasChildren ? toggleMenu(item.id) : handleNavigation(item.path || '', item)}
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        {item.label}
                        {item.badge && (
                          <Badge variant="secondary" className="ml-auto text-xs">
                            {item.badge}
                          </Badge>
                        )}
                        {hasChildren && (
                          <ChevronDown className={cn(
                            "ml-auto h-4 w-4 transition-transform",
                            expandedMenus.has(item.id) && "transform rotate-180"
                          )} />
                        )}
                        {isFeatureLocked(item) && <Lock className="ml-2 h-3 w-3 text-muted-foreground" />}
                      </Button>
                    </PermissionGuard>
                  ) : (
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start min-h-[44px] py-3",
                        isParentActive && "bg-accent"
                      )}
                      onClick={() => hasChildren ? toggleMenu(item.id) : handleNavigation(item.path || '', item)}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {item.label}
                      {item.badge && (
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {item.badge}
                        </Badge>
                      )}
                      {hasChildren && (
                        <ChevronDown className={cn(
                          "ml-auto h-4 w-4 transition-transform",
                          expandedMenus.has(item.id) && "transform rotate-180"
                        )} />
                      )}
                      {isFeatureLocked(item) && <Lock className="ml-2 h-3 w-3 text-muted-foreground" />}
                    </Button>
                  )}

                  {hasChildren && expandedMenus.has(item.id) && (
                    <div className="ml-4 mt-1 space-y-1">
                      {item.children.map((child: any) => (
                        <Button
                          key={child.id}
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "w-full justify-start text-sm",
                            isActivePath(child.path) && "bg-accent"
                          )}
                          onClick={() => handleNavigation(child.path, item)}
                        >
                          {child.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-border space-y-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start text-blue-600 border-blue-200 hover:bg-blue-50"
              onClick={() => {
                if (!tourContext) return
                const currentPath = location.pathname
                if (currentPath.includes('/dashboard/daily') || currentPath.includes('/dashboard/weekly') || currentPath.includes('/dashboard/monthly')) {
                  tourContext.startTour('dashboard')
                } else if (currentPath.includes('/dashboard/report')) {
                  tourContext.startTour('report_form')
                } else if (currentPath.includes('/dashboard/admin') || currentPath.includes('/dashboard/organization')) {
                  tourContext.startTour('settings')
                } else if (currentPath.includes('/dashboard/chat')) {
                  tourContext.startTour('ai_chat')
                } else {
                  tourContext.startTour('dashboard')
                }
                onClose()
              }}
            >
              <Compass className="h-4 w-4 mr-2" />
              使い方ガイド
            </Button>
            {user && (
              <div className="p-2 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">ログイン中</div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    user.role === 'admin' ? 'bg-red-500' :
                    user.role === 'manager' ? 'bg-blue-500' :
                    'bg-green-500'
                  }`} />
                  <div className="text-xs font-medium truncate">{user.name}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {organizationRole === 'owner' ? 'オーナー' :
                   organizationRole === 'admin' ? '管理者' :
                   organizationRole === 'manager' ? 'マネージャー' :
                   'スタッフ'}
                </div>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Version 1.0.0
            </div>
          </div>
        </div>
      </aside>

      <FeatureLockedModal
        isOpen={lockedFeatureModal.isOpen}
        onClose={() => setLockedFeatureModal({ isOpen: false, featureName: '', featureDescription: '' })}
        featureName={lockedFeatureModal.featureName}
        featureDescription={lockedFeatureModal.featureDescription}
      />
    </>
  )
}