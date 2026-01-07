/**
 * リアルタイムエラーモニターコンポーネント
 *
 * エラーログをリアルタイムで表示するライブフィード
 */

import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useOrganization } from '@/contexts/OrganizationContext'
import {
  Activity,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Info,
  Pause,
  Play,
  Trash2,
  Filter
} from 'lucide-react'

interface ErrorLog {
  id: string
  error_type: string
  error_message: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  user_id?: string
  url?: string
  created_at: string
  user_email?: string
}

export const RealtimeErrorMonitor: React.FC = () => {
  const { organization } = useOrganization()
  const [errors, setErrors] = useState<ErrorLog[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const [filterSeverity, setFilterSeverity] = useState<string>('all')
  const [soundEnabled, setSoundEnabled] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (organization?.id) {
      loadRecentErrors()
      subscribeToErrors()
    }

    return () => {
      // Cleanup subscription
    }
  }, [organization?.id])

  const loadRecentErrors = async () => {
    if (!organization?.id) return

    try {
      const { data, error } = await supabase
        .from('error_logs')
        .select(`
          id,
          error_type,
          error_message,
          severity,
          user_id,
          url,
          created_at,
          profiles:user_id (
            email
          )
        `)
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error

      const errorsWithEmail = data?.map(log => ({
        ...log,
        user_email: log.profiles?.email
      })) || []

      setErrors(errorsWithEmail)
    } catch (error) {
      console.error('Failed to load recent errors:', error)
    }
  }

  const subscribeToErrors = () => {
    if (!organization?.id) return

    // Supabaseのリアルタイム機能を使用
    // 注: error_logsテーブルでrealtimeが有効になっている必要があります
    const channel = supabase
      .channel('error_logs_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'error_logs',
          filter: `organization_id=eq.${organization.id}`
        },
        (payload) => {
          if (!isPaused) {
            const newError = payload.new as ErrorLog
            setErrors(prev => [newError, ...prev].slice(0, 50))

            // 音声通知
            if (soundEnabled && (newError.severity === 'CRITICAL' || newError.severity === 'HIGH')) {
              playAlertSound()
            }

            // スクロールをトップに
            if (containerRef.current) {
              containerRef.current.scrollTop = 0
            }
          }
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }

  const playAlertSound = () => {
    // 簡易的なビープ音（実際にはAudioContextを使用するか、音声ファイルを読み込む）
    if (audioRef.current) {
      audioRef.current.play().catch(err => console.error('Audio play failed:', err))
    }
  }

  const clearErrors = () => {
    if (confirm('表示中のエラーをクリアしますか？（データベースからは削除されません）')) {
      setErrors([])
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
      case 'HIGH':
        return <XCircle className="w-4 h-4" />
      case 'MEDIUM':
        return <AlertTriangle className="w-4 h-4" />
      case 'LOW':
        return <AlertCircle className="w-4 h-4" />
      default:
        return <Info className="w-4 h-4" />
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-100 border-red-300 text-red-900'
      case 'HIGH':
        return 'bg-red-50 border-red-200 text-red-800'
      case 'MEDIUM':
        return 'bg-orange-50 border-orange-200 text-orange-800'
      case 'LOW':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800'
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800'
    }
  }

  const getTimeAgo = (timestamp: string) => {
    const now = new Date()
    const then = new Date(timestamp)
    const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)

    if (seconds < 60) return `${seconds}秒前`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分前`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}時間前`
    return `${Math.floor(seconds / 86400)}日前`
  }

  const filteredErrors = filterSeverity === 'all'
    ? errors
    : errors.filter(e => e.severity === filterSeverity)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className={`w-5 h-5 ${!isPaused ? 'animate-pulse text-green-600' : 'text-slate-400'}`} />
            リアルタイムエラーモニター
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* フィルター */}
            <div className="flex items-center gap-1 border border-slate-300 rounded-lg p-1">
              <button
                onClick={() => setFilterSeverity('all')}
                className={`px-2 py-1 text-xs rounded ${
                  filterSeverity === 'all'
                    ? 'bg-slate-200 text-slate-900'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                全て
              </button>
              <button
                onClick={() => setFilterSeverity('CRITICAL')}
                className={`px-2 py-1 text-xs rounded ${
                  filterSeverity === 'CRITICAL'
                    ? 'bg-red-200 text-red-900'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                CRITICAL
              </button>
              <button
                onClick={() => setFilterSeverity('HIGH')}
                className={`px-2 py-1 text-xs rounded ${
                  filterSeverity === 'HIGH'
                    ? 'bg-orange-200 text-orange-900'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                HIGH
              </button>
            </div>

            {/* 音声通知 */}
            <Button
              onClick={() => setSoundEnabled(!soundEnabled)}
              variant="outline"
              size="sm"
              className={soundEnabled ? 'bg-blue-50 border-blue-300' : ''}
            >
              🔔 {soundEnabled ? 'ON' : 'OFF'}
            </Button>

            {/* 一時停止/再開 */}
            <Button
              onClick={() => setIsPaused(!isPaused)}
              variant="outline"
              size="sm"
            >
              {isPaused ? (
                <>
                  <Play className="w-4 h-4 mr-1" />
                  再開
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 mr-1" />
                  一時停止
                </>
              )}
            </Button>

            {/* クリア */}
            <Button
              onClick={clearErrors}
              variant="outline"
              size="sm"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              クリア
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="space-y-2 max-h-[600px] overflow-y-auto pr-2"
        >
          {filteredErrors.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Activity className="w-12 h-12 mx-auto mb-3 text-slate-400" />
              <p>
                {isPaused
                  ? 'モニターが一時停止中です'
                  : 'エラーを監視中... エラーが発生すると表示されます'}
              </p>
            </div>
          ) : (
            filteredErrors.map((error, index) => (
              <div
                key={error.id}
                className={`p-3 rounded-lg border transition-all ${getSeverityColor(error.severity)} ${
                  index === 0 ? 'animate-slide-in' : ''
                }`}
                style={{
                  animation: index === 0 ? 'slideIn 0.3s ease-out' : 'none'
                }}
              >
                <div className="flex items-start gap-3">
                  {getSeverityIcon(error.severity)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold">
                        {error.error_type}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 bg-white/50 rounded">
                        {error.severity}
                      </span>
                      <span className="text-xs text-slate-600 ml-auto">
                        {getTimeAgo(error.created_at)}
                      </span>
                    </div>
                    <p className="text-sm mb-2">
                      {error.error_message}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-600">
                      {error.user_email && (
                        <span>👤 {error.user_email}</span>
                      )}
                      {error.url && (
                        <span className="truncate max-w-xs">
                          📍 {error.url}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* カウンター */}
        <div className="mt-4 pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">
              表示中: {filteredErrors.length}件
              {filterSeverity !== 'all' && ` (${filterSeverity}のみ)`}
            </span>
            <span className={`${isPaused ? 'text-orange-600' : 'text-green-600'} font-medium`}>
              {isPaused ? '⏸ 一時停止中' : '● LIVE'}
            </span>
          </div>
        </div>

        {/* 音声通知用のオーディオ要素（実際には音声ファイルを使用） */}
        <audio
          ref={audioRef}
          src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1fPTgjMGIXfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1fPTgjMGIXfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1fPTgjMGIXfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1fPTgjMGIXfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1fPTgjMGIXfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1fPTgjMGIXfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1fPTgjMGIXfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1fPTgjMGIXfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1fPTgjMGIXfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1fPTgjMGIXfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1fPTgjMGIXfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1fPTgjMGIXfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1fPTgjMGIXfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1fPTgjMGIXfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1fPTgjMGIXfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1fPTgjMGIXfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1fPTgjMG"
        />
      </CardContent>

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </Card>
  )
}
