import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOrganization } from '../contexts/OrganizationContext';
import {
  getOnboardingProgress,
  createOnboardingProgress,
  updateOnboardingStep,
  completeOnboarding,
  skipOnboarding,
  OnboardingProgress,
} from '../services/onboardingService';

const WELCOME_MODAL_DISMISSED_KEY = 'onboarding_welcome_dismissed';
const WELCOME_MODAL_MAX_AGE_DAYS = 7;

function isWithinDays(dateStr: string, days: number): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= days;
}

function wasModalDismissed(userId: string): boolean {
  try {
    const dismissed = localStorage.getItem(WELCOME_MODAL_DISMISSED_KEY);
    if (!dismissed) return false;
    const parsed = JSON.parse(dismissed);
    return parsed.userId === userId && parsed.dismissed === true;
  } catch {
    return false;
  }
}

function setModalDismissed(userId: string): void {
  try {
    localStorage.setItem(
      WELCOME_MODAL_DISMISSED_KEY,
      JSON.stringify({ userId, dismissed: true, timestamp: Date.now() })
    );
  } catch {
  }
}

export function useOnboarding() {
  const { user, isDemoMode } = useAuth();
  const { organization } = useOrganization();
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  const loadProgress = useCallback(async () => {
    if (!user?.id || isDemoMode) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let data = await getOnboardingProgress(user.id);

    if (!data && organization?.id) {
      data = await createOnboardingProgress(user.id, organization.id);
    }

    setProgress(data);
    setLoading(false);

    if (data && !data.onboarding_completed && !data.onboarding_skipped) {
      console.log('🎯 Checking onboarding conditions for user:', user.id);

      if (wasModalDismissed(user.id)) {
        console.log('❌ Welcome modal was dismissed by user');
        return;
      }

      const isNewUser = isWithinDays(data.created_at, WELCOME_MODAL_MAX_AGE_DAYS);
      console.log('📅 Is new user (within 7 days):', isNewUser, 'Created:', data.created_at);
      if (!isNewUser) {
        return;
      }

      const hasAnyProgress =
        data.step_store_created ||
        data.step_first_report ||
        data.step_csv_imported ||
        data.step_dashboard_viewed ||
        data.sample_data_loaded;

      console.log('📊 Has any progress:', hasAnyProgress, {
        store: data.step_store_created,
        report: data.step_first_report,
        csv: data.step_csv_imported,
        dashboard: data.step_dashboard_viewed,
        sample: data.sample_data_loaded
      });

      if (!hasAnyProgress) {
        console.log('✅ Showing welcome modal!');
        setShowWelcomeModal(true);
      } else {
        console.log('❌ User has progress, not showing modal');
      }
    } else if (data) {
      console.log('❌ Onboarding already completed or skipped');
    }
  }, [user?.id, organization?.id, isDemoMode]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  const markStepComplete = useCallback(
    async (
      step:
        | 'step_store_created'
        | 'step_first_report'
        | 'step_csv_imported'
        | 'step_dashboard_viewed'
        | 'step_ai_chat_used'
        | 'sample_data_loaded'
    ) => {
      if (!user?.id || isDemoMode) return false;

      const success = await updateOnboardingStep(user.id, step);
      if (success) {
        await loadProgress();
      }
      return success;
    },
    [user?.id, isDemoMode, loadProgress]
  );

  const complete = useCallback(async () => {
    if (!user?.id || isDemoMode) return false;

    const success = await completeOnboarding(user.id);
    if (success) {
      setProgress((prev) =>
        prev ? { ...prev, onboarding_completed: true } : null
      );
      setShowWelcomeModal(false);
    }
    return success;
  }, [user?.id, isDemoMode]);

  const skip = useCallback(async () => {
    if (!user?.id || isDemoMode) return false;

    const success = await skipOnboarding(user.id);
    if (success) {
      setProgress((prev) =>
        prev
          ? { ...prev, onboarding_skipped: true, onboarding_completed: true }
          : null
      );
      setShowWelcomeModal(false);
    }
    return success;
  }, [user?.id, isDemoMode]);

  const closeWelcomeModal = useCallback(() => {
    setShowWelcomeModal(false);
    if (user?.id) {
      setModalDismissed(user.id);
    }
  }, [user?.id]);

  const isOnboardingActive =
    progress !== null &&
    !progress.onboarding_completed &&
    !progress.onboarding_skipped;

  const completionPercentage = progress
    ? Math.round(
        (([
          progress.step_store_created,
          progress.step_first_report || progress.sample_data_loaded,
          progress.step_dashboard_viewed,
        ].filter(Boolean).length /
          3) *
          100)
      )
    : 0;

  return {
    progress,
    loading,
    isOnboardingActive,
    completionPercentage,
    showWelcomeModal,
    closeWelcomeModal,
    markStepComplete,
    complete,
    skip,
    refresh: loadProgress,
  };
}
