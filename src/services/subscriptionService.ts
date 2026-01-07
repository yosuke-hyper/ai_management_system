import { supabase } from '../lib/supabase';

export interface SubscriptionPlan {
  id: string;
  name: string;
  display_name: string;
  billing_cycle: 'monthly' | 'annual';
  price: number;
  monthly_equivalent_price: number;
  campaign_price?: number;
  campaign_discount_rate?: number;
  campaign_start_date?: string;
  campaign_end_date?: string;
  max_stores: number;
  max_users: number;
  ai_usage_limit: number;
  features: string[];
  is_active: boolean;
}

export interface OrganizationSubscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: 'active' | 'cancelled' | 'expired' | 'trial';
  started_at: string;
  current_period_end: string;
  trial_end?: string;
  cancelled_at?: string;
  plan?: SubscriptionPlan;
}

export interface SubscriptionLimits {
  maxStores: number;
  maxUsers: number;
  aiUsageLimit: number;
  contractedStores: number;
  currentStores: number;
  currentUsers: number;
  currentAiUsage: number;
  isTrialing: boolean;
  daysUntilExpiry: number;
  pricePerStore: number;
  totalMonthlyPrice: number;
  totalAnnualPrice: number;
  billingCycle: 'monthly' | 'annual';
  isCampaignPrice?: boolean;
  originalPricePerStore?: number;
  discountRate?: number;
}

// ========================================
// 料金体系: プラン単価 × 登録店舗数
// ========================================
// 例: Standard（￥7,980/店舗/月）× 3店舗 = ￥23,940/月

// ========================================
// 新プラン定義（機能ベース3プラン制）
// ========================================
type PlanName = 'starter' | 'standard' | 'premium';
type BillingCycle = 'monthly' | 'annual';

interface PlanConfig {
  id: PlanName;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  campaignMonthlyPrice?: number;
  campaignAnnualPrice?: number;
  campaignDiscountRate?: number;
  campaignStartDate?: string;
  campaignEndDate?: string;
  aiUsageLimit: number;
  recommendedMaxStores: number;
  maxUsers: number;
  description: string;
}

const PLAN_CONFIGS: Record<PlanName, PlanConfig> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 5980,
    annualPrice: 63158,
    campaignMonthlyPrice: 3588,
    campaignAnnualPrice: 37895,
    campaignDiscountRate: 40,
    campaignStartDate: '2025-12-01',
    campaignEndDate: '2026-05-31',
    aiUsageLimit: 50,
    recommendedMaxStores: 1,
    maxUsers: 5,
    description: '個人店・小規模店向けの基本プラン'
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    monthlyPrice: 9980,
    annualPrice: 109780,
    campaignMonthlyPrice: 6986,
    campaignAnnualPrice: 76846,
    campaignDiscountRate: 30,
    campaignStartDate: '2025-12-01',
    campaignEndDate: '2026-05-31',
    aiUsageLimit: 300,
    recommendedMaxStores: 5,
    maxUsers: 25,
    description: '1〜5店舗の小規模チェーン向けプラン'
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    monthlyPrice: 14800,
    annualPrice: 159840,
    campaignMonthlyPrice: 11840,
    campaignAnnualPrice: 127872,
    campaignDiscountRate: 20,
    campaignStartDate: '2025-12-01',
    campaignEndDate: '2026-05-31',
    aiUsageLimit: 2000,
    recommendedMaxStores: 20,
    maxUsers: 100,
    description: '5〜20店舗の中規模チェーン向けプラン'
  }
};

export const subscriptionService = {
  /**
   * キャンペーン期間中かチェック
   */
  isCampaignActive(): boolean {
    const now = new Date();
    const campaignStart = new Date('2025-12-01');
    const campaignEnd = new Date('2026-05-31');
    campaignEnd.setHours(23, 59, 59, 999);
    return now >= campaignStart && now <= campaignEnd;
  },

  /**
   * プラン設定を取得
   */
  getPlanConfig(planId: PlanName): PlanConfig {
    return PLAN_CONFIGS[planId];
  },

  /**
   * 全プラン設定を取得
   */
  getAllPlanConfigs(): PlanConfig[] {
    return Object.values(PLAN_CONFIGS);
  },

  /**
   * 店舗数に基づく料金を計算（プラン単価 × 店舗数）
   * キャンペーン期間中はキャンペーン価格を使用
   */
  calculatePriceForStores(
    planName: PlanName,
    storeCount: number,
    billingCycle: BillingCycle = 'monthly'
  ): { monthlyPrice: number; annualPrice: number; pricePerStore: number; isCampaign: boolean; originalPricePerStore?: number; discountRate?: number } {
    const config = PLAN_CONFIGS[planName];
    if (!config || storeCount < 1) {
      return { monthlyPrice: 0, annualPrice: 0, pricePerStore: 0, isCampaign: false };
    }

    const isCampaign = this.isCampaignActive();

    let monthlyPricePerStore = config.monthlyPrice;
    let annualPricePerStore = config.annualPrice;
    let discountRate: number | undefined;

    if (isCampaign && config.campaignMonthlyPrice && config.campaignAnnualPrice) {
      monthlyPricePerStore = config.campaignMonthlyPrice;
      annualPricePerStore = config.campaignAnnualPrice;
      discountRate = config.campaignDiscountRate;
    }

    const pricePerStore = billingCycle === 'monthly' ? monthlyPricePerStore : annualPricePerStore;
    const monthlyPrice = monthlyPricePerStore * storeCount;
    const annualPrice = annualPricePerStore * storeCount;
    const originalPricePerStore = isCampaign ? (billingCycle === 'monthly' ? config.monthlyPrice : config.annualPrice) : undefined;

    return {
      monthlyPrice,
      annualPrice,
      pricePerStore,
      isCampaign,
      originalPricePerStore,
      discountRate
    };
  },

  async getAvailablePlans(): Promise<SubscriptionPlan[]> {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getCurrentSubscription(organizationId: string): Promise<OrganizationSubscription | null> {
    const { data, error } = await supabase
      .from('organization_subscriptions')
      .select(`
        *,
        plan:subscription_plans(*)
      `)
      .eq('organization_id', organizationId)
      .in('status', ['active', 'trial'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getSubscriptionLimits(organizationId: string): Promise<SubscriptionLimits | null> {
    const subscription = await this.getCurrentSubscription(organizationId);
    if (!subscription || !subscription.plan) return null;

    const { data: orgSubscription } = await supabase
      .from('organization_subscriptions')
      .select('contracted_stores')
      .eq('organization_id', organizationId)
      .in('status', ['active', 'trial'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: storeCount } = await supabase
      .from('stores')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    const { count: memberCount } = await supabase
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const { data: aiUsage } = await supabase
      .from('ai_usage_limits')
      .select('monthly_usage')
      .eq('organization_id', organizationId)
      .gte('month', currentMonth.toISOString())
      .maybeSingle();

    const currentPeriodEnd = new Date(subscription.current_period_end);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const contractedStores = orgSubscription?.contracted_stores || subscription.plan.max_stores;
    const currentStores = storeCount || 0;

    // Calculate max users dynamically: 1 store = 5 users
    const calculatedMaxUsers = currentStores * 5;

    // Calculate pricing based on actual store count
    const planName = subscription.plan.name as PlanName;
    const billingCycle = subscription.plan.billing_cycle;
    const pricing = this.calculatePriceForStores(planName, currentStores, billingCycle);

    return {
      maxStores: subscription.plan.max_stores,
      maxUsers: calculatedMaxUsers,
      aiUsageLimit: subscription.plan.ai_usage_limit,
      contractedStores,
      currentStores,
      currentUsers: memberCount || 0,
      currentAiUsage: aiUsage?.monthly_usage || 0,
      isTrialing: subscription.status === 'trial',
      daysUntilExpiry,
      pricePerStore: pricing.pricePerStore,
      totalMonthlyPrice: pricing.monthlyPrice,
      totalAnnualPrice: pricing.annualPrice,
      billingCycle,
      isCampaignPrice: pricing.isCampaign,
      originalPricePerStore: pricing.originalPricePerStore,
      discountRate: pricing.discountRate,
    };
  },

  /**
   * 店舗追加可否の判定（店舗数課金方式）
   * 注: 料金体系は「プラン単価 × 登録店舗数」です。
   * 店舗を追加すると、その分料金が増加します。
   */
  async canAddStore(organizationId: string): Promise<{
    allowed: boolean;
    reason?: string;
    warning?: string;
    priceImpact?: { currentPrice: number; newPrice: number; increase: number };
  }> {
    const limits = await this.getSubscriptionLimits(organizationId);
    if (!limits) {
      return { allowed: false, reason: 'サブスクリプション情報が見つかりません' };
    }

    const subscription = await this.getCurrentSubscription(organizationId);
    if (!subscription || !subscription.plan) {
      return { allowed: false, reason: 'サブスクリプション情報が見つかりません' };
    }

    const planName = subscription.plan.name as PlanName;
    const planConfig = PLAN_CONFIGS[planName];

    if (!planConfig) {
      return { allowed: true };
    }

    // Calculate price impact using campaign prices if active
    const currentPrice = limits.totalMonthlyPrice;
    const newStoreCount = limits.currentStores + 1;
    const newPricing = this.calculatePriceForStores(planName, newStoreCount, limits.billingCycle);
    const newPrice = limits.billingCycle === 'monthly' ? newPricing.monthlyPrice : newPricing.annualPrice;

    const isCampaign = this.isCampaignActive();
    const increase = limits.billingCycle === 'monthly'
      ? (isCampaign && planConfig.campaignMonthlyPrice ? planConfig.campaignMonthlyPrice : planConfig.monthlyPrice)
      : (isCampaign && planConfig.campaignAnnualPrice ? planConfig.campaignAnnualPrice : planConfig.annualPrice);

    const priceImpact = {
      currentPrice,
      newPrice,
      increase
    };

    // Check if exceeding recommended max stores
    if (limits.currentStores >= planConfig.recommendedMaxStores) {
      const nextPlan = planName === 'starter' ? 'Standard' : planName === 'standard' ? 'Premium' : null;
      const warning = nextPlan
        ? `現在のプラン（${planConfig.name}）の推奨店舗数（${planConfig.recommendedMaxStores}店舗）を超えています。より多くの機能が必要な場合は、${nextPlan}プランへのアップグレードをご検討ください。店舗を追加すると月額料金が¥${currentPrice.toLocaleString()}から¥${newPrice.toLocaleString()}に増加します（+¥${increase.toLocaleString()}）。`
        : `店舗を追加すると月額料金が¥${currentPrice.toLocaleString()}から¥${newPrice.toLocaleString()}に増加します（+¥${increase.toLocaleString()}）。`;

      return {
        allowed: true,
        warning,
        priceImpact
      };
    }

    return {
      allowed: true,
      priceImpact
    };
  },

  async canAddUser(organizationId: string): Promise<{ allowed: boolean; reason?: string }> {
    const limits = await this.getSubscriptionLimits(organizationId);
    if (!limits) {
      return { allowed: false, reason: 'サブスクリプション情報が見つかりません' };
    }

    if (limits.currentUsers >= limits.maxUsers) {
      return {
        allowed: false,
        reason: `現在のプランでは最大${limits.maxUsers}ユーザーまで登録可能です。プランをアップグレードしてください。`
      };
    }

    return { allowed: true };
  },

  async canUseAI(organizationId: string): Promise<{ allowed: boolean; reason?: string }> {
    const limits = await this.getSubscriptionLimits(organizationId);
    if (!limits) {
      return { allowed: false, reason: 'サブスクリプション情報が見つかりません' };
    }

    if (limits.currentAiUsage >= limits.aiUsageLimit) {
      return {
        allowed: false,
        reason: `今月のAI利用回数の上限（${limits.aiUsageLimit}回）に達しました。プランをアップグレードするか、来月までお待ちください。`
      };
    }

    return { allowed: true };
  },

  /**
   * プラン変更（新料金体系対応版）
   * @param organizationId 組織ID
   * @param planName プラン名（'starter' | 'standard' | 'premium'）
   * @param billingCycle 支払いサイクル（'monthly' | 'annual'）
   * @param contractedStores 契約店舗数（オプション。指定しない場合は1）
   */
  async changePlan(
    organizationId: string,
    planName: 'starter' | 'standard' | 'premium',
    billingCycle: 'monthly' | 'annual' = 'monthly',
    contractedStores: number = 1
  ): Promise<void> {
    console.log('🔧 changePlan開始:', { organizationId, planName, billingCycle, contractedStores });

    // 契約店舗数のバリデーション
    if (contractedStores < 1) {
      throw new Error('契約店舗数は1以上を指定してください');
    }

    if (contractedStores > 100) {
      throw new Error('契約店舗数は100以下を指定してください。それ以上の店舗数が必要な場合はお問い合わせください');
    }

    // プラン別の推奨店舗数チェック（警告のみ）
    const recommendedStores = {
      starter: 1,
      standard: 3,
      premium: 10
    };

    if (contractedStores > recommendedStores[planName]) {
      console.warn(`⚠️ ${planName}プランの推奨店舗数（${recommendedStores[planName]}店舗）を超えています: ${contractedStores}店舗`);
    }

    // プラン名とbilling_cycleからplan_idを取得
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('name', planName)
      .eq('billing_cycle', billingCycle)
      .eq('is_active', true)
      .maybeSingle();

    if (planError || !plan) {
      console.error('❌ プラン取得失敗:', planError);
      throw new Error(`指定されたプラン（${planName} - ${billingCycle}）が見つかりません`);
    }

    console.log('📋 選択されたプラン:', plan);

    // 現在のサブスクリプションを取得
    const currentSubscription = await this.getCurrentSubscription(organizationId);
    console.log('📊 現在のサブスクリプション:', currentSubscription);

    // 同じプランへの変更をチェック
    if (currentSubscription?.plan_id === plan.id) {
      throw new Error('既に選択されているプランです');
    }

    // 現在のサブスクリプションをキャンセル
    if (currentSubscription) {
      const { error: cancelError } = await supabase
        .from('organization_subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString()
        })
        .eq('id', currentSubscription.id);

      if (cancelError) {
        console.error('❌ 現在のサブスクリプションのキャンセル失敗:', cancelError);
        throw new Error(`現在のサブスクリプションのキャンセルに失敗しました: ${cancelError.message}`);
      }
      console.log('✅ 現在のサブスクリプションをキャンセルしました');
    }

    // 新しいサブスクリプション期間を計算
    const currentPeriodEnd = new Date();
    if (billingCycle === 'annual') {
      currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
    } else {
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    }

    const insertData = {
      organization_id: organizationId,
      plan_id: plan.id,
      status: 'active' as const,
      started_at: new Date().toISOString(),
      current_period_end: currentPeriodEnd.toISOString(),
      contracted_stores: contractedStores,
      billing_cycle: billingCycle
    };

    console.log('📝 新しいサブスクリプションを作成:', insertData);

    const { data, error } = await supabase
      .from('organization_subscriptions')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('❌ サブスクリプション作成失敗:', error);
      throw new Error(`サブスクリプションの作成に失敗しました: ${error.message}`);
    }

    console.log('✅ 新しいサブスクリプション作成成功:', data);
  },

  async cancelSubscription(organizationId: string): Promise<void> {
    const currentSubscription = await this.getCurrentSubscription(organizationId);
    if (!currentSubscription) {
      throw new Error('アクティブなサブスクリプションが見つかりません');
    }

    const { error } = await supabase
      .from('organization_subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString()
      })
      .eq('id', currentSubscription.id);

    if (error) throw error;
  },

  async extendTrial(organizationId: string, days: number): Promise<void> {
    const currentSubscription = await this.getCurrentSubscription(organizationId);
    if (!currentSubscription || currentSubscription.status !== 'trial') {
      throw new Error('トライアル中のサブスクリプションが見つかりません');
    }

    const newTrialEnd = new Date(currentSubscription.trial_end || currentSubscription.current_period_end);
    newTrialEnd.setDate(newTrialEnd.getDate() + days);

    const { error } = await supabase
      .from('organization_subscriptions')
      .update({
        trial_end: newTrialEnd.toISOString(),
        current_period_end: newTrialEnd.toISOString()
      })
      .eq('id', currentSubscription.id);

    if (error) throw error;
  },

  async isSubscriptionExpired(organizationId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('organization_subscriptions')
      .select('status, current_period_end')
      .eq('organization_id', organizationId)
      .in('status', ['expired'])
      .maybeSingle();

    if (error || !data) return false;
    return true;
  },

  async isReadOnlyMode(organizationId: string): Promise<boolean> {
    const subscription = await this.getCurrentSubscription(organizationId);

    if (!subscription) {
      const isExpired = await this.isSubscriptionExpired(organizationId);
      return isExpired;
    }

    if (subscription.status === 'expired' || subscription.status === 'cancelled') {
      return true;
    }

    if (subscription.status === 'trial') {
      const currentPeriodEnd = new Date(subscription.current_period_end);
      const now = new Date();
      return currentPeriodEnd < now;
    }

    return false;
  },

  async shouldShowTrialAlert(organizationId: string): Promise<{ show: boolean; daysLeft: number }> {
    const subscription = await this.getCurrentSubscription(organizationId);

    if (!subscription || subscription.status !== 'trial') {
      return { show: false, daysLeft: 0 };
    }

    const currentPeriodEnd = new Date(subscription.current_period_end);
    const now = new Date();
    const daysLeft = Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      show: daysLeft <= 3 && daysLeft > 0,
      daysLeft,
    };
  },

  async getSubscriptionStatus(organizationId: string, isDemo: boolean = false): Promise<{
    status: 'active' | 'trial' | 'expired' | 'none';
    isTrialing: boolean;
    isExpired: boolean;
    isReadOnly: boolean;
    daysLeft: number;
    shouldAlert: boolean;
  }> {
    // 本番環境の場合は、サブスクリプション制限を無効化
    // 環境変数またはURLで本番環境を判定
    const appEnv = import.meta.env.VITE_APP_ENV || 'development';
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const isProductionDomain = hostname.includes('bolt.new') ||
                               hostname.includes('vercel.app') ||
                               hostname.includes('netlify.app') ||
                               hostname.includes('foodvalue') ||
                               (hostname !== 'localhost' && !hostname.includes('127.0.0.1'));

    if (appEnv === 'production' || isProductionDomain) {
      console.log('📊 Production environment detected - subscription checks disabled');
      return {
        status: 'active',
        isTrialing: false,
        isExpired: false,
        isReadOnly: false,
        daysLeft: 999,
        shouldAlert: false,
      };
    }

    // デモ組織の場合は、demo_sessionsテーブルから期限を取得
    if (isDemo) {
      const { data: demoSession } = await supabase
        .from('demo_sessions')
        .select('expires_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!demoSession) {
        return {
          status: 'none',
          isTrialing: false,
          isExpired: true,
          isReadOnly: true,
          daysLeft: 0,
          shouldAlert: false,
        };
      }

      const expiresAt = new Date(demoSession.expires_at);
      const now = new Date();
      const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isExpired = daysLeft <= 0;

      return {
        status: isExpired ? 'expired' : 'trial',
        isTrialing: !isExpired,
        isExpired,
        isReadOnly: isExpired,
        daysLeft: Math.max(0, daysLeft),
        shouldAlert: daysLeft <= 3 && daysLeft > 0,
      };
    }

    // 本番組織の場合は、organization_subscriptionsテーブルから取得
    const subscription = await this.getCurrentSubscription(organizationId);

    if (!subscription) {
      const isExpired = await this.isSubscriptionExpired(organizationId);
      return {
        status: isExpired ? 'expired' : 'none',
        isTrialing: false,
        isExpired,
        isReadOnly: isExpired,
        daysLeft: 0,
        shouldAlert: false,
      };
    }

    const currentPeriodEnd = new Date(subscription.current_period_end);
    const now = new Date();
    const daysLeft = Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isTrialing = subscription.status === 'trial';
    const isExpired = daysLeft <= 0 || subscription.status === 'expired';
    const isReadOnly = isExpired || subscription.status === 'cancelled';
    const shouldAlert = isTrialing && daysLeft <= 3 && daysLeft > 0;

    return {
      status: subscription.status,
      isTrialing,
      isExpired,
      isReadOnly,
      daysLeft: Math.max(0, daysLeft),
      shouldAlert,
    };
  },
};
