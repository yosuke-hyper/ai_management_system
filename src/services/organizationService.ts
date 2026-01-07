import { supabase } from '@/lib/supabase'
import { createAuditLog } from './auditLog'
import {
  toAppError,
  DatabaseError,
  NotFoundError,
  AuthenticationError
} from '@/lib/errors'

/**
 * 組織サービス
 * データ作成時に organization_id を自動的に設定するヘルパー関数
 */

/**
 * 現在のユーザーの organization_id を取得
 * userIdを指定しない場合は、現在ログイン中のユーザーから取得
 */
export async function getCurrentUserOrganizationId(userId?: string): Promise<string | null> {
  try {
    // スーパー管理者が組織を切り替えている場合は、その組織IDを優先
    const savedOrgId = localStorage.getItem('superadmin_selected_org')
    if (savedOrgId) {
      console.log('🎯 getCurrentUserOrganizationId: Using super admin selected organization:', savedOrgId)
      return savedOrgId
    }

    let targetUserId = userId

    // userIdが指定されていない場合は、現在のユーザーを取得
    if (!targetUserId) {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) {
        throw new AuthenticationError('ユーザー情報の取得に失敗しました')
      }
      if (!user) {
        throw new AuthenticationError('ログインが必要です')
      }
      targetUserId = user.id
    }

    const { data, error } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', targetUserId)
      .maybeSingle()

    if (error) {
      throw new DatabaseError('組織IDの取得に失敗しました', { error: error.message })
    }

    if (!data?.organization_id) {
      throw new NotFoundError('組織', targetUserId, { userId: targetUserId })
    }

    return data.organization_id
  } catch (error) {
    const appError = toAppError(error)
    console.error('Error getting organization ID:', appError)
    throw appError
  }
}

/**
 * プロファイルから organization_id を取得
 */
export async function getOrganizationIdFromProfile(userId: string): Promise<string | null> {
  if (!userId) return null

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('Failed to get organization ID from profile:', error)
      return null
    }

    return data?.organization_id || null
  } catch (error) {
    console.error('Error getting organization ID from profile:', error)
    return null
  }
}

/**
 * データ作成時に organization_id を自動設定
 * RLSポリシーで自動的にフィルタリングされるため、SELECTには不要
 */
export async function withOrganizationId<T extends Record<string, any>>(
  userId: string,
  data: T
): Promise<T & { organization_id: string }> {
  const organizationId = await getCurrentUserOrganizationId(userId)

  if (!organizationId) {
    throw new Error('ユーザーが組織に所属していません')
  }

  return {
    ...data,
    organization_id: organizationId
  }
}

/**
 * 複数のデータに organization_id を一括設定
 */
export async function withOrganizationIdBatch<T extends Record<string, any>>(
  userId: string,
  dataArray: T[]
): Promise<Array<T & { organization_id: string }>> {
  const organizationId = await getCurrentUserOrganizationId(userId)

  if (!organizationId) {
    throw new Error('ユーザーが組織に所属していません')
  }

  return dataArray.map(data => ({
    ...data,
    organization_id: organizationId
  }))
}

/**
 * 組織情報を取得
 */
export async function getOrganization(organizationId: string) {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .single()

  return { data, error }
}

/**
 * 組織を更新
 */
export async function updateOrganization(organizationId: string, updates: any, userId?: string) {
  const { data, error } = await supabase
    .from('organizations')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', organizationId)
    .select()
    .single()

  if (!error && userId) {
    await createAuditLog(userId, 'organization.updated', 'organization', {
      resourceId: organizationId,
      details: { updates }
    })
  }

  return { data, error }
}

/**
 * 組織メンバー一覧を取得
 */
export async function getOrganizationMembers(organizationId: string) {
  const { data, error } = await supabase
    .from('organization_members')
    .select(`
      organization_id,
      user_id,
      role,
      joined_at,
      profiles!organization_members_user_id_fkey(id, name, email, role)
    `)
    .eq('organization_id', organizationId)
    .order('joined_at', { ascending: false })

  return { data, error }
}

/**
 * 組織にメンバーを追加
 */
export async function addOrganizationMember(
  organizationId: string,
  userId: string,
  role: 'owner' | 'admin' | 'manager' | 'staff' = 'staff'
) {
  const { data, error } = await supabase
    .from('organization_members')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      role,
      joined_at: new Date().toISOString()
    })
    .select()
    .single()

  return { data, error }
}

/**
 * 組織メンバーを削除
 */
export async function removeOrganizationMember(organizationId: string, userId: string, actorUserId?: string) {
  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('organization_id', organizationId)
    .eq('user_id', userId)

  if (!error && actorUserId) {
    await createAuditLog(actorUserId, 'user.deleted', 'user', {
      resourceId: userId,
      details: { organizationId, removedUserId: userId }
    })
  }

  return { error }
}

/**
 * 組織メンバーの役割を更新
 */
export async function updateOrganizationMemberRole(
  organizationId: string,
  userId: string,
  role: 'owner' | 'admin' | 'manager' | 'staff',
  actorUserId?: string
) {
  const { data: oldRole } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .single()

  const { data, error } = await supabase
    .from('organization_members')
    .update({ role })
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .select()
    .single()

  if (!error && actorUserId) {
    await createAuditLog(actorUserId, 'user.role_changed', 'user', {
      resourceId: userId,
      details: {
        organizationId,
        targetUserId: userId,
        oldRole: oldRole?.role,
        newRole: role
      }
    })
  }

  return { data, error }
}

/**
 * メンバーの店舗割り当てを取得
 */
export async function getMemberStoreAssignments(userId: string) {
  const { data, error } = await supabase
    .from('store_assignments')
    .select(`
      store_id,
      stores!store_assignments_store_id_fkey(id, name)
    `)
    .eq('user_id', userId)

  if (error) {
    return { data: null, error }
  }

  const stores = (data || [])
    .filter((assignment: any) => assignment.stores !== null)
    .map((assignment: any) => ({
      id: assignment.stores.id,
      name: assignment.stores.name
    }))

  return { data: stores, error: null }
}

/**
 * メンバーに店舗を割り当て
 */
export async function assignStoreToMember(userId: string, storeId: string, actorUserId?: string) {
  const { data, error } = await supabase
    .from('store_assignments')
    .insert({
      user_id: userId,
      store_id: storeId,
      created_at: new Date().toISOString()
    })
    .select()
    .single()

  if (!error && actorUserId) {
    await createAuditLog(actorUserId, 'store_assignment.created', 'store_assignment', {
      resourceId: data?.id,
      details: { userId, storeId }
    })
  }

  return { data, error }
}

/**
 * メンバーから店舗割り当てを解除
 */
export async function removeStoreFromMember(userId: string, storeId: string, actorUserId?: string) {
  const { error } = await supabase
    .from('store_assignments')
    .delete()
    .eq('user_id', userId)
    .eq('store_id', storeId)

  if (!error && actorUserId) {
    await createAuditLog(actorUserId, 'store_assignment.deleted', 'store_assignment', {
      resourceId: `${userId}-${storeId}`,
      details: { userId, storeId }
    })
  }

  return { error }
}

/**
 * 招待トークンを生成
 */
function generateInvitationToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * 組織への招待を作成
 */
export async function createInvitation(
  organizationId: string,
  email: string,
  role: 'member' | 'admin',
  invitedBy: string
) {
  const token = generateInvitationToken()

  const { data, error } = await supabase
    .from('organization_invitations')
    .insert({
      organization_id: organizationId,
      email: email.toLowerCase(),
      role,
      token,
      invited_by: invitedBy,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    })
    .select()
    .single()

  if (!error && data) {
    await createAuditLog(invitedBy, 'user.invited', 'user', {
      resourceId: data.id,
      details: { email, role, organizationId }
    })

    // メール送信を試行（失敗しても招待作成は成功とする）
    try {
      const { sendInvitationEmail } = await import('./emailService')
      const { data: inviterProfile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', invitedBy)
        .single()

      const { data: organization } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .single()

      if (inviterProfile && organization) {
        await sendInvitationEmail({
          email: email.toLowerCase(),
          inviterName: inviterProfile.name,
          organizationName: organization.name,
          role,
          invitationToken: token
        })
      }
    } catch (emailError) {
      console.error('招待メール送信エラー（招待自体は成功）:', emailError)
    }
  }

  return { data, error }
}

/**
 * 組織の招待一覧を取得
 */
export async function getOrganizationInvitations(organizationId: string) {
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  return { data, error }
}

/**
 * トークンから招待情報を取得
 */
export async function getInvitationByToken(token: string) {
  const { data, error } = await supabase
    .from('organization_invitations')
    .select(`
      *,
      organization:organizations(id, name, slug)
    `)
    .eq('token', token)
    .eq('status', 'pending')
    .maybeSingle()

  return { data, error }
}

/**
 * 招待を承認してメンバーに追加
 */
export async function acceptInvitation(token: string, userId: string) {
  const { data: invitation, error: inviteError } = await getInvitationByToken(token)

  if (inviteError || !invitation) {
    return { data: null, error: inviteError || { message: '招待が見つかりません' } }
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return { data: null, error: { message: '招待の有効期限が切れています' } }
  }

  const { data: existingMember } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', invitation.organization_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (existingMember) {
    return { data: null, error: { message: '既にこの組織のメンバーです' } }
  }

  const { data: member, error: memberError } = await supabase
    .from('organization_members')
    .insert({
      organization_id: invitation.organization_id,
      user_id: userId,
      role: invitation.role,
      joined_at: new Date().toISOString()
    })
    .select()
    .single()

  if (memberError) {
    return { data: null, error: memberError }
  }

  const { error: updateError } = await supabase
    .from('organization_invitations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString()
    })
    .eq('id', invitation.id)

  if (updateError) {
    console.error('Failed to update invitation status:', updateError)
  }

  await supabase
    .from('profiles')
    .update({ organization_id: invitation.organization_id })
    .eq('id', userId)

  // 新メンバー追加の通知を送信
  try {
    const { notifyNewMemberAdded } = await import('./notificationTriggers')
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single()

    if (userProfile) {
      await notifyNewMemberAdded(
        invitation.organization_id,
        userId,
        userProfile.email,
        invitation.role
      )
    }
  } catch (error) {
    console.error('Failed to send new member notification:', error)
  }

  return { data: member, error: null }
}

/**
 * 招待をキャンセル
 */
export async function cancelInvitation(invitationId: string) {
  const { error } = await supabase
    .from('organization_invitations')
    .update({ status: 'cancelled' })
    .eq('id', invitationId)

  return { error }
}

/**
 * 招待を削除
 */
export async function deleteInvitation(invitationId: string) {
  const { error } = await supabase
    .from('organization_invitations')
    .delete()
    .eq('id', invitationId)

  return { error }
}

/**
 * 招待リンクを生成
 */
export function generateInvitationLink(token: string): string {
  const baseUrl = window.location.origin
  return `${baseUrl}/invite/${token}`
}

/**
 * スーパー管理者用: 組織コンテキストを設定
 * RLSポリシーがこの設定を使用して、選択した組織のデータにアクセスできるようにする
 */
export async function setSelectedOrganizationContext(organizationId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('set_selected_organization', {
      target_org_id: organizationId
    })

    if (error) {
      console.error('Failed to set organization context:', error)
      return false
    }

    console.log('✅ Organization context set:', organizationId)
    return data === true
  } catch (error) {
    console.error('Error setting organization context:', error)
    return false
  }
}

/**
 * スーパー管理者用: 組織コンテキストをクリア
 */
export async function clearSelectedOrganizationContext(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('clear_selected_organization')

    if (error) {
      console.error('Failed to clear organization context:', error)
      return false
    }

    console.log('✅ Organization context cleared')
    return data === true
  } catch (error) {
    console.error('Error clearing organization context:', error)
    return false
  }
}

/**
 * スーパー管理者用: 現在選択されている組織IDを取得
 */
export async function getSelectedOrganizationContext(): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('get_selected_organization')

    if (error) {
      console.error('Failed to get organization context:', error)
      return null
    }

    return data || null
  } catch (error) {
    console.error('Error getting organization context:', error)
    return null
  }
}
