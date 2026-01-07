import React, { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { AIReportNotification } from '@/components/Dashboard/AIReportNotification'
import { Footer } from '@/components/layout/Footer'
import { ReadOnlyBanner } from '@/components/ui/read-only-banner'
import { TrialExpiringAlert } from '@/components/Subscription/TrialExpiringAlert'
import { AiAvatar } from '@/components/Avatar/AiAvatar'
import { AvatarCustomizerModal } from '@/components/Avatar/AvatarCustomizerModal'
import { WelcomeModal } from '@/components/Onboarding/WelcomeModal'
import { OnboardingChecklist } from '@/components/Onboarding/OnboardingChecklist'
import { useAuth } from '@/contexts/AuthContext'
import { useAvatar } from '@/contexts/AvatarContext'
import { useOnboarding } from '@/hooks/useOnboarding'
import { registerAvatarCallback } from '@/lib/avatarToast'

export const MainLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showCustomizerModal, setShowCustomizerModal] = useState(false)
  const location = useLocation()
  const { isDemoMode, user } = useAuth()
  const { emotion, message, setEmotionWithMessage, equippedItems } = useAvatar()
  const { showWelcomeModal, closeWelcomeModal, isOnboardingActive, loading: onboardingLoading } = useOnboarding()

  useEffect(() => {
    if (showWelcomeModal) {
      console.log('🎉 WelcomeModal should be displayed!', {
        isDemoMode,
        showWelcomeModal,
        userId: user?.id
      });
    }
  }, [showWelcomeModal, isDemoMode, user?.id])

  useEffect(() => {
    registerAvatarCallback(setEmotionWithMessage)
  }, [setEmotionWithMessage])

  const showFooter = ['/admin', '/organization'].includes(location.pathname)
  const isAvatarPage = location.pathname === '/dashboard/avatar'
  const isChatPage = location.pathname === '/dashboard/chat'
  const hideGlobalAvatar = isChatPage || isAvatarPage

  return (
    <div className="min-h-screen bg-background">
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {!isDemoMode && <ReadOnlyBanner />}
      <div className="flex h-screen">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 overflow-auto flex flex-col">
            <div className="flex-1 container mx-auto px-2 sm:px-4 py-3 sm:py-6">
              <Outlet />
            </div>
            {showFooter && <Footer />}
          </main>
        </div>
      </div>
      <AIReportNotification />
      <TrialExpiringAlert />
      {!hideGlobalAvatar && !showCustomizerModal && (
        <AiAvatar
          emotion={emotion}
          message={message}
          helpChatPosition="right"
          enableCustomize={!!user && !isAvatarPage}
          onCustomize={() => setShowCustomizerModal(true)}
          equippedItems={equippedItems}
        />
      )}
      <AvatarCustomizerModal
        isOpen={showCustomizerModal}
        onClose={() => setShowCustomizerModal(false)}
      />
      {!isDemoMode && showWelcomeModal && (
        <WelcomeModal onClose={closeWelcomeModal} />
      )}
    </div>
  )
}