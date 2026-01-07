import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { DailyReport } from '../../types';
import { formatCurrency } from '../../utils/calculations';
import { subscriptionService } from '../../services/subscriptionService';
import { useOrganization } from '../../contexts/OrganizationContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAvatar } from '../../contexts/AvatarContext';
import { demoAIService } from '../../services/demoAI';
import { AiAvatar } from '../Avatar/AiAvatar';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

interface AIChatProps {
  reports: DailyReport[];
}

const SUGGESTED_QUESTIONS = [
  '今月の売上はどうでしたか？',
  '原価率を改善する方法は？',
  'スタッフの定着率を上げたい',
  '客単価を上げるには？',
  '人件費率を最適化したい',
  '店舗別の実績を教えて',
  '繁忙期の対策を知りたい',
  'メニューの改善案は？'
];

export const AIChat: React.FC<AIChatProps> = ({ reports }) => {
  const { organization } = useOrganization();
  const { isDemoMode, session } = useAuth();
  const { emotion: avatarEmotion, setEmotionWithTimeout, equippedItems } = useAvatar();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'ai',
      content: isDemoMode
        ? 'こんにちは！デモモードでAIアシスタントをお試しいただけます。店舗の業績についてお気軽にご質問ください。'
        : 'こんにちは！業務データについてご質問をどうぞ。',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [isReadyToSend, setIsReadyToSend] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 回答内容から表情を判定する関数
  const analyzeEmotion = (text: string): 'happy' | 'sad' | 'thinking' | 'normal' => {
    // Don't analyze emotion - always return normal for natural conversation
    return 'normal';
  };

  const handleSuggestionClick = (question: string) => {
    setInputMessage(question);
    setShowSuggestions(false);
    setIsReadyToSend(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value);
    setIsReadyToSend(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
      e.preventDefault();
      if (!inputMessage.trim()) return;

      if (isReadyToSend) {
        handleSendMessage();
        setIsReadyToSend(false);
      } else {
        setIsReadyToSend(true);
      }
    }
  };

  const getRandomSuggestions = () => {
    const shuffled = [...SUGGESTED_QUESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    setShowSuggestions(false);

    if (organization) {
      const limitCheck = await subscriptionService.canUseAI(organization.id);
      if (!limitCheck.allowed) {
        const errorMessage: Message = {
          id: Date.now().toString(),
          type: 'ai',
          content: limitCheck.reason || 'AI利用回数の上限に達しました',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
        return;
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    // ローディング中は考え中の表情に
    setEmotionWithTimeout('thinking', 30000);

    if (isDemoMode) {
      try {
        const response = await demoAIService.generateResponse(inputMessage);
        const aiResponse: Message = {
          id: (Date.now() + 1).toString(),
          type: 'ai',
          content: response.message,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiResponse]);

        // 回答内容から表情を判定して設定
        const emotion = analyzeEmotion(response.message);
        setEmotionWithTimeout(emotion);

        setShowSuggestions(true);
      } catch (error) {
        console.error('Demo AI error:', error);
        const errorResponse: Message = {
          id: (Date.now() + 1).toString(),
          type: 'ai',
          content: 'デモAI応答の生成に失敗しました。もう一度お試しください。',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorResponse]);
        setEmotionWithTimeout('sad');
        setShowSuggestions(true);
      } finally {
        setIsLoading(false);
      }
    } else {
      try {
        if (!organization) {
          throw new Error('組織情報が見つかりません');
        }

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error('Supabase設定が見つかりません');
        }

        const now = new Date();
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();
        const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
        const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

        const thisMonthReports = reports.filter(r => {
          const d = new Date(r.date);
          return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
        });

        const lastMonthReports = reports.filter(r => {
          const d = new Date(r.date);
          return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
        });

        const calcMetrics = (reps: DailyReport[]) => {
          if (reps.length === 0) return null;
          const sales = reps.reduce((s, r) => s + r.sales, 0);
          const purchase = reps.reduce((s, r) => s + r.purchase, 0);
          const labor = reps.reduce((s, r) => s + r.laborCost, 0);
          const otherExp = reps.reduce((s, r) =>
            s + r.utilities + r.promotion + r.cleaning + r.misc + r.communication + r.others, 0);
          const totalExp = purchase + labor + otherExp;
          const profit = sales - totalExp;
          return {
            sales,
            purchase,
            labor,
            totalExp,
            profit,
            costRate: sales > 0 ? (purchase / sales) * 100 : 0,
            laborRate: sales > 0 ? (labor / sales) * 100 : 0,
            profitRate: sales > 0 ? (profit / sales) * 100 : 0,
            count: reps.length
          };
        };

        const thisMonthMetrics = calcMetrics(thisMonthReports);
        const lastMonthMetrics = calcMetrics(lastMonthReports);
        const allMetrics = calcMetrics(reports);

        const storeNames = [...new Set(reports.map(r => r.storeName))];

        const recentReports = reports
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 10)
          .map(r => ({
            date: r.date,
            storeName: r.storeName,
            sales: r.sales,
            costRate: r.sales > 0 ? (r.purchase / r.sales) * 100 : 0,
            laborCostRate: r.sales > 0 ? (r.laborCost / r.sales) * 100 : 0,
            profit: r.sales - r.purchase - r.laborCost - r.utilities - r.promotion - r.cleaning - r.misc - r.communication - r.others,
            customers: r.customers || 0
          }));

        const businessData = {
          storeName: storeNames.length === 1 ? storeNames[0] : `${storeNames.length}店舗`,
          reportCount: reports.length,
          allStoresCount: storeNames.length,
          totalSales: allMetrics?.sales || 0,
          avgCostRate: allMetrics?.costRate || 0,
          avgLaborCostRate: allMetrics?.laborRate || 0,
          avgProfit: allMetrics ? allMetrics.profit / allMetrics.count : 0,
          avgProfitRate: allMetrics?.profitRate || 0,
          thisMonthSales: thisMonthMetrics?.sales || 0,
          thisMonthAvgCostRate: thisMonthMetrics?.costRate || 0,
          thisMonthAvgLaborCostRate: thisMonthMetrics?.laborRate || 0,
          thisMonthAvgProfit: thisMonthMetrics ? thisMonthMetrics.profit / thisMonthMetrics.count : 0,
          thisMonthAvgProfitRate: thisMonthMetrics?.profitRate || 0,
          thisMonthReportCount: thisMonthMetrics?.count || 0,
          lastMonthSales: lastMonthMetrics?.sales || 0,
          lastMonthAvgCostRate: lastMonthMetrics?.costRate || 0,
          lastMonthAvgLaborCostRate: lastMonthMetrics?.laborRate || 0,
          lastMonthAvgProfit: lastMonthMetrics ? lastMonthMetrics.profit / lastMonthMetrics.count : 0,
          lastMonthAvgProfitRate: lastMonthMetrics?.profitRate || 0,
          lastMonthReportCount: lastMonthMetrics?.count || 0,
          recentReports,
          stores: storeNames
        };

        const chatMessages = messages
          .filter(m => m.type === 'user' || m.type === 'ai')
          .map(m => ({
            role: m.type === 'user' ? 'user' as const : 'assistant' as const,
            content: m.content
          }));

        chatMessages.push({
          role: 'user',
          content: inputMessage
        });

        const authToken = session?.access_token || supabaseAnonKey;

        const response = await fetch(`${supabaseUrl}/functions/v1/chat-gpt`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: chatMessages,
            businessData
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'AI応答の取得に失敗しました');
        }

        const result = await response.json();

        if (result.success && result.response) {
          const aiResponse: Message = {
            id: (Date.now() + 1).toString(),
            type: 'ai',
            content: result.response,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, aiResponse]);

          const emotion = analyzeEmotion(result.response);
          setEmotionWithTimeout(emotion);

          setShowSuggestions(true);
        } else {
          let errorMsg = result.error || 'AI応答が空です';
          if (result.debug) {
            console.error('AI Debug info:', result.debug);
            errorMsg += `\n\n[Debug: ${result.debug}]`;
          }
          throw new Error(errorMsg);
        }
      } catch (error) {
        console.error('Production AI error:', error);
        const errorResponse: Message = {
          id: (Date.now() + 1).toString(),
          type: 'ai',
          content: error instanceof Error
            ? `エラーが発生しました: ${error.message}`
            : 'AI応答の取得に失敗しました。もう一度お試しください。',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorResponse]);
        setEmotionWithTimeout('sad');
        setShowSuggestions(true);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const getAIResponse = (question: string, reports: DailyReport[]): string => {
    const q = question.toLowerCase();
    
    if (reports.length === 0) {
      return '申し訳ございませんが、まだ報告データがありません。日次報告を作成してから再度お試しください。';
    }

    // 集計データを計算
    const totalSales = reports.reduce((sum, report) => sum + report.sales, 0);
    const totalExpenses = reports.reduce((sum, report) => 
      sum + report.purchase + report.laborCost + report.utilities + 
      report.promotion + report.cleaning + report.misc + 
      report.communication + report.others, 0);
    const operatingProfit = totalSales - totalExpenses;
    const profitMargin = totalSales > 0 ? (operatingProfit / totalSales) * 100 : 0;
    
    if (q.includes('売上') && q.includes('合計')) {
      return `現在の売上合計は${formatCurrency(totalSales)}です。報告件数は${reports.length}件です。`;
    } else if (q.includes('経費') && (q.includes('内訳') || q.includes('比率'))) {
      const avgPurchase = reports.reduce((sum, r) => sum + r.purchase, 0);
      const avgLabor = reports.reduce((sum, r) => sum + r.laborCost, 0);
      const purchaseRatio = totalExpenses > 0 ? (avgPurchase / totalExpenses * 100).toFixed(1) : 0;
      const laborRatio = totalExpenses > 0 ? (avgLabor / totalExpenses * 100).toFixed(1) : 0;
      return `経費合計：${formatCurrency(totalExpenses)}\n主な内訳：\n• 仕入: ${purchaseRatio}%\n• 人件費: ${laborRatio}%`;
    } else if (q.includes('利益') || q.includes('営業利益')) {
      return `営業利益は${formatCurrency(operatingProfit)}で、利益率は${profitMargin.toFixed(1)}%です。`;
    } else if (q.includes('店舗') && (q.includes('比較') || q.includes('パフォーマンス'))) {
      const storeData = reports.reduce((acc, report) => {
        if (!acc[report.storeName]) {
          acc[report.storeName] = { sales: 0, count: 0 };
        }
        acc[report.storeName].sales += report.sales;
        acc[report.storeName].count += 1;
        return acc;
      }, {} as Record<string, { sales: number; count: number }>);
      
      const storeList = Object.entries(storeData).map(([name, data]) => 
        `• ${name}：売上${formatCurrency(data.sales)}（${data.count}件）`
      ).join('\n');
      
      return `店舗別パフォーマンス：\n${storeList}`;
    } else {
      return '申し訳ございませんが、その質問については十分なデータがありません。「売上合計」「経費内訳」「利益率」「店舗比較」などについてお答えできます。';
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 flex flex-col h-[600px] relative overflow-hidden" style={{ backgroundColor: '#fdfbf7' }}>
      <style>
        {`
          .ai-bubble {
            position: relative;
            background: white;
            padding: 16px 20px;
            border-radius: 24px;
            box-shadow: 0 2px 8px rgba(251, 146, 60, 0.15);
          }
          .ai-bubble::after {
            content: '';
            position: absolute;
            bottom: 10px;
            left: -8px;
            width: 0;
            height: 0;
            border-top: 10px solid transparent;
            border-bottom: 10px solid transparent;
            border-right: 10px solid white;
            filter: drop-shadow(-2px 2px 3px rgba(251, 146, 60, 0.1));
          }
          .user-bubble {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            padding: 12px 18px;
            border-radius: 18px;
            box-shadow: 0 2px 6px rgba(16, 185, 129, 0.2);
          }
          @keyframes bounce-talk {
            0%, 100% { transform: translateY(0); }
            25% { transform: translateY(-8px); }
            50% { transform: translateY(0); }
            75% { transform: translateY(-4px); }
          }
          .avatar-talking {
            animation: bounce-talk 0.6s ease-in-out infinite;
          }
        `}
      </style>

      {/* ヘッダー */}
      <div className="px-6 py-4 border-b border-orange-100" style={{ backgroundColor: '#fff9f5' }}>
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <span className="text-2xl">💬</span>
          AIアシスタント
          {isDemoMode && (
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              デモ
            </span>
          )}
        </h3>
      </div>

      {/* メッセージエリア */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.type === 'ai' ? (
              <div className="ai-bubble max-w-[85%] lg:max-w-[70%]">
                <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
                  {message.content}
                </p>
              </div>
            ) : (
              <div className="user-bubble max-w-[75%] lg:max-w-[60%]">
                <p className="text-sm text-white whitespace-pre-line leading-relaxed">
                  {message.content}
                </p>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="ai-bubble">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 bg-orange-400 rounded-full animate-bounce"></div>
                <div className="w-2.5 h-2.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                <div className="w-2.5 h-2.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 下部エリア：入力フィールド + Avatar */}
      <div className="px-6 py-4 border-t border-orange-100 bg-white">
        {showSuggestions && (
          <div className="mb-3">
            <p className="text-xs text-gray-500 mb-2 font-medium">💡 おすすめの質問:</p>
            <div className="flex flex-wrap gap-2">
              {getRandomSuggestions().map((question, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(question)}
                  className="text-xs px-3 py-1.5 bg-orange-50 text-orange-700 rounded-full hover:bg-orange-100 transition-colors border border-orange-200 font-medium"
                  disabled={isLoading}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-end gap-4">
          {/* Avatar - 左側に配置 */}
          <div className={`flex-shrink-0 ${isLoading ? 'avatar-talking' : ''}`}>
            <AiAvatar
              emotion={isLoading ? 'thinking' : avatarEmotion}
              size={150}
              fixed={false}
              className=""
              helpChatPosition="right"
              equippedItems={equippedItems}
            />
          </div>

          {/* 入力エリア */}
          <div className="flex-1 flex flex-col gap-1">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="しばちゃんに質問してみよう..."
                  className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none text-gray-800 placeholder-gray-400 transition-all ${
                    isReadyToSend
                      ? 'border-orange-500 bg-orange-100/50'
                      : 'border-orange-200 bg-orange-50/30'
                  }`}
                  disabled={isLoading}
                />
                {isReadyToSend && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-orange-600 font-medium">
                    Enterで送信
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  handleSendMessage();
                  setIsReadyToSend(false);
                }}
                disabled={isLoading || !inputMessage.trim()}
                className="px-5 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg disabled:shadow-none"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 ml-1">
              {isReadyToSend ? 'もう一度Enterで送信、または内容を編集' : 'Enterキーで確定'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};