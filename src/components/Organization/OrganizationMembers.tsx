import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UserPlus, Trash2, Shield, User, Mail, Calendar, AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/contexts/OrganizationContext'
import {
  getOrganizationMembers,
  removeOrganizationMember,
  updateOrganizationMemberRole
} from '@/services/organizationService'
import { InviteModal } from './InviteModal'

interface Member {
  organization_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  profiles: {
    id: string
    name: string
    email: string
    role: string
  }
}

interface Props {
  organizationId: string
}

export const OrganizationMembers: React.FC<Props> = ({ organizationId }) => {
  const { user } = useAuth()
  const { isAdmin, organizationRole } = useOrganization()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showInviteModal, setShowInviteModal] = useState(false)

  useEffect(() => {
    loadMembers()
  }, [organizationId])

  const loadMembers = async () => {
    try {
      setLoading(true)
      setError(null)

      console.log('🔍 メンバー一覧取得開始:', { organizationId, userId: user?.id })

      const { data, error: fetchError } = await getOrganizationMembers(organizationId)

      console.log('📊 メンバー一覧取得結果:', { data, error: fetchError })

      if (fetchError) {
        console.error('❌ メンバー取得エラー:', fetchError)
        setError(`メンバー一覧の取得に失敗しました: ${fetchError.message}`)
        return
      }

      if (!data || data.length === 0) {
        console.warn('⚠️ メンバーが0件です')
      }

      setMembers(data || [])
    } catch (err) {
      console.error('❌ 予期しないエラー:', err)
      setError('メンバー一覧の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('このメンバーを削除してもよろしいですか？')) {
      return
    }

    try {
      setActionLoading(userId)
      const { error: removeError } = await removeOrganizationMember(organizationId, userId)

      if (removeError) {
        alert('メンバーの削除に失敗しました')
        return
      }

      await loadMembers()
    } catch (err) {
      alert('メンバーの削除に失敗しました')
    } finally {
      setActionLoading(null)
    }
  }

  const handleChangeRole = async (userId: string, newRole: 'owner' | 'admin' | 'member') => {
    if (!confirm(`このメンバーの権限を「${getRoleLabel(newRole)}」に変更してもよろしいですか？`)) {
      return
    }

    try {
      setActionLoading(userId)
      const { error: updateError } = await updateOrganizationMemberRole(
        organizationId,
        userId,
        newRole
      )

      if (updateError) {
        alert('権限の変更に失敗しました')
        return
      }

      await loadMembers()
    } catch (err) {
      alert('権限の変更に失敗しました')
    } finally {
      setActionLoading(null)
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner':
        return 'オーナー'
      case 'admin':
        return '管理者'
      case 'member':
        return 'メンバー'
      default:
        return role
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'admin':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'member':
        return 'bg-slate-100 text-slate-800 border-slate-200'
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200'
    }
  }

  const currentUserMember = members.find(m => m.user_id === user?.id)
  const isOwnerOrAdmin = isAdmin || currentUserMember?.role === 'owner' || currentUserMember?.role === 'admin'

  console.log('🔐 権限チェック:', {
    isAdmin,
    organizationRole,
    currentUserMember,
    isOwnerOrAdmin,
    membersCount: members.length
  })

  if (loading) {
    return (
      <Card>
        <CardContent className="p-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600">読み込み中...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>メンバー管理</CardTitle>
          {isOwnerOrAdmin && (
            <Button
              onClick={() => setShowInviteModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              メンバーを招待
            </Button>
          )}
        </div>
        {!isOwnerOrAdmin && (
          <p className="text-xs text-slate-500 mt-2">
            権限: {organizationRole || 'メンバー'}
            {organizationRole === 'member' && ' (招待権限なし)'}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 mb-6">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-800 mb-2">{error}</p>
              <button
                onClick={loadMembers}
                className="text-xs text-red-700 hover:text-red-900 underline"
              >
                再試行
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {members.map((member) => {
            const isCurrentUser = member.user_id === user?.id
            const canManage = isOwnerOrAdmin && !isCurrentUser && member.role !== 'owner'

            return (
              <div
                key={member.user_id}
                className="p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                      <User className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-slate-900">
                          {member.profiles.name}
                          {isCurrentUser && (
                            <span className="ml-2 text-xs text-slate-500">(あなた)</span>
                          )}
                        </h3>
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full border ${getRoleBadgeColor(
                            member.role
                          )}`}
                        >
                          {getRoleLabel(member.role)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-600">
                        <div className="flex items-center gap-1">
                          <Mail className="w-4 h-4" />
                          {member.profiles.email}
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          参加日: {new Date(member.joined_at).toLocaleDateString('ja-JP')}
                        </div>
                      </div>
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-2">
                      <select
                        value={member.role}
                        onChange={(e) =>
                          handleChangeRole(
                            member.user_id,
                            e.target.value as 'owner' | 'admin' | 'member'
                          )
                        }
                        disabled={actionLoading === member.user_id}
                        className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="member">メンバー</option>
                        <option value="admin">管理者</option>
                      </select>

                      <Button
                        onClick={() => handleRemoveMember(member.user_id)}
                        disabled={actionLoading === member.user_id}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        {actionLoading === member.user_id ? (
                          <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {members.length === 0 && (
          <div className="text-center py-12">
            <User className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600">メンバーがいません</p>
          </div>
        )}

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            権限について
          </h4>
          <ul className="space-y-1 text-sm text-blue-800">
            <li>
              <strong>オーナー:</strong> 組織の全権限（組織削除含む）
            </li>
            <li>
              <strong>管理者:</strong> メンバー管理、設定変更、データ編集
            </li>
            <li>
              <strong>メンバー:</strong> データ閲覧・入力（担当店舗のみ）
            </li>
          </ul>
        </div>
      </CardContent>

      {showInviteModal && user?.id && (
        <InviteModal
          organizationId={organizationId}
          userId={user.id}
          onClose={() => setShowInviteModal(false)}
          onInvited={loadMembers}
        />
      )}
    </Card>
  )
}
