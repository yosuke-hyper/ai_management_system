import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ArrowRight,
  X,
  TrendingUp,
  BarChart3,
  DollarSign,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTourContextOptional } from '../../contexts/TourContext';
import {
  skipOnboarding,
  updateOnboardingStep,
} from '../../services/onboardingService';

interface WelcomeModalProps {
  onClose: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const tourContext = useTourContextOptional();

  const userName = profile?.display_name || profile?.email?.split('@')[0] || 'ユーザー';

  const handleStart = async () => {
    if (user?.id) {
      await updateOnboardingStep(user.id, 'step_dashboard_viewed');
    }
    onClose();
    navigate('/dashboard/report');
    setTimeout(() => {
      console.log('🚀 Starting first-time tour from WelcomeModal');
      if (tourContext) {
        console.log('✅ Tour context available, starting tour');
        tourContext.startFirstTimeTour();
      } else {
        console.error('❌ Tour context not available');
      }
    }, 2000);
  };

  const handleSkip = async () => {
    if (user?.id) {
      await skipOnboarding(user.id);
    }
    onClose();
  };

  const features = [
    {
      icon: TrendingUp,
      title: '売上トレンド',
      description: '日別・週別・月別の推移を自動グラフ化',
    },
    {
      icon: DollarSign,
      title: '原価・利益分析',
      description: '営業利益を即座に把握',
    },
    {
      icon: BarChart3,
      title: 'AI分析',
      description: '改善提案を自動生成',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 px-8 py-10 text-white overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                <Sparkles className="w-7 h-7" />
              </div>
              <div>
                <p className="text-blue-200 text-sm">FoodValue AI</p>
                <h1 className="text-2xl font-bold">ようこそ、{userName}さん!</h1>
              </div>
            </div>

            <p className="text-blue-100 text-lg leading-relaxed">
              売上・原価・利益を一目で把握できる
              <br />
              飲食店経営の強力なパートナーです
            </p>
          </div>
        </div>

        <div className="p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              今日から経営の見える化を始めましょう
            </h2>
            <p className="text-gray-600">
              日報を入力すると、自動で売上分析・利益計算・改善提案が行われます
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl p-4 border border-gray-200"
                >
                  <Icon className="w-8 h-8 text-blue-600 mb-2" />
                  <h3 className="font-medium text-gray-900 text-sm mb-1">{feature.title}</h3>
                  <p className="text-xs text-gray-600">{feature.description}</p>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleStart}
            className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all font-semibold text-lg shadow-lg hover:shadow-xl"
          >
            日報入力を始める
            <ArrowRight className="w-6 h-6" />
          </button>

          <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              後で設定する
            </button>
            <p className="text-xs text-gray-400">
              3分で1日分を入力できます
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
