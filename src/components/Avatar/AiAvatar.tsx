import { useMemo, useState, useEffect, useRef } from 'react';
import { getRandomAvatarMessage, playClickSound } from '@/lib/avatarInteractions';
import { AvatarHelpChat } from './AvatarHelpChat';
import { HelpCircle, Home } from 'lucide-react';

type Emotion = 'normal' | 'happy' | 'sad' | 'thinking';

interface EquippedItems {
  head: string | null
  outfit: string | null
  hand: string | null
}

interface AiAvatarProps {
  mood?: Emotion;
  emotion?: Emotion;
  size?: number;
  className?: string;
  fixed?: boolean;
  message?: string;
  clickable?: boolean;
  enableHelpChat?: boolean;
  enableCustomize?: boolean;
  helpChatPosition?: 'left' | 'right';
  onHelpChatToggle?: (isOpen: boolean) => void;
  onCustomize?: () => void;
  equippedItems?: EquippedItems;
}

const emotionToImage: Record<Emotion, string> = {
  normal: '/images/avatar/normal.png',
  happy: '/images/avatar/happy.png',
  sad: '/images/avatar/sad.png',
  thinking: '/images/avatar/thinking.png',
};

export function AiAvatar({ mood, emotion, size = 120, className = '', fixed = true, message, clickable = true, enableHelpChat = true, enableCustomize = false, helpChatPosition = 'right', onHelpChatToggle, onCustomize, equippedItems }: AiAvatarProps) {
  const actualEmotion = mood || emotion || 'normal';
  const [displayEmotion, setDisplayEmotion] = useState<Emotion>(actualEmotion);
  const [displayMessage, setDisplayMessage] = useState<string | undefined>(message);
  const imageSrc = useMemo(() => emotionToImage[displayEmotion], [displayEmotion]);
  const [shouldBounce, setShouldBounce] = useState(false);
  const [prevEmotion, setPrevEmotion] = useState(actualEmotion);
  const [isInteracting, setIsInteracting] = useState(false);
  const [showHelpChat, setShowHelpChat] = useState(false);
  const [lastClickTime, setLastClickTime] = useState(0);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const [isLongPress, setIsLongPress] = useState(false);
  const autoMessageTimer = useRef<NodeJS.Timeout | null>(null);
  const messageDisplayTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isInteracting) {
      setDisplayEmotion(actualEmotion);
      setDisplayMessage(message);
    }
  }, [actualEmotion, message, isInteracting]);

  useEffect(() => {
    if (actualEmotion !== prevEmotion && actualEmotion !== 'normal') {
      setShouldBounce(true);
      const timer = setTimeout(() => setShouldBounce(false), 600);
      setPrevEmotion(actualEmotion);
      return () => clearTimeout(timer);
    }
    setPrevEmotion(actualEmotion);
  }, [actualEmotion, prevEmotion]);

  useEffect(() => {
    if (!clickable) return;

    const showAutoMessage = () => {
      if (isInteracting || showHelpChat) return;

      const randomMessage = getRandomAvatarMessage();
      setDisplayEmotion(randomMessage.emotion);
      setDisplayMessage(randomMessage.text);
      setShouldBounce(true);

      const bounceTimer = setTimeout(() => setShouldBounce(false), 600);

      messageDisplayTimer.current = setTimeout(() => {
        if (!isInteracting && !showHelpChat) {
          setDisplayMessage(message);
          setDisplayEmotion(actualEmotion);
        }
        clearTimeout(bounceTimer);
      }, 5000);
    };

    autoMessageTimer.current = setInterval(showAutoMessage, 180000);

    return () => {
      if (autoMessageTimer.current) {
        clearInterval(autoMessageTimer.current);
      }
      if (messageDisplayTimer.current) {
        clearTimeout(messageDisplayTimer.current);
      }
    };
  }, [clickable, isInteracting, showHelpChat, message, actualEmotion]);

  const handleMouseDown = () => {
    if (!clickable || !enableHelpChat) return;

    if (messageDisplayTimer.current) {
      clearTimeout(messageDisplayTimer.current);
    }

    setIsLongPress(false);
    longPressTimer.current = setTimeout(() => {
      setIsLongPress(true);
      setShowHelpChat(true);
      onHelpChatToggle?.(true);
      setDisplayEmotion('thinking');
      setDisplayMessage('何か困ったことがあるワン？');
    }, 800);
  };

  const handleMouseUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const handleClick = () => {
    if (!clickable || isInteracting || isLongPress) {
      setIsLongPress(false);
      return;
    }

    if (messageDisplayTimer.current) {
      clearTimeout(messageDisplayTimer.current);
    }

    const now = Date.now();
    const timeSinceLastClick = now - lastClickTime;

    if (enableHelpChat && timeSinceLastClick < 400) {
      setShowHelpChat(true);
      onHelpChatToggle?.(true);
      setDisplayEmotion('happy');
      setDisplayMessage('ヘルプチャットを開いたワン！何でも聞いてワン！');
      setLastClickTime(0);
      return;
    }

    setLastClickTime(now);
    setIsInteracting(true);

    try {
      playClickSound();
    } catch (error) {
      console.log('効果音の再生に失敗しました:', error);
    }

    const randomMessage = getRandomAvatarMessage();

    setDisplayEmotion(randomMessage.emotion);
    setDisplayMessage(randomMessage.text);
    setShouldBounce(true);

    setTimeout(() => {
      setShouldBounce(false);
      setTimeout(() => {
        setDisplayMessage(message);
        setDisplayEmotion(actualEmotion);
        setIsInteracting(false);
      }, 2500);
    }, 600);
  };

  return (
    <>
      <style>
        {`
          @keyframes float {
            0%, 100% {
              transform: translateY(0px);
            }
            50% {
              transform: translateY(-10px);
            }
          }
          @keyframes bounce {
            0%, 100% {
              transform: translateY(0) scale(1);
            }
            25% {
              transform: translateY(-15px) scale(1.05);
            }
            50% {
              transform: translateY(-5px) scale(1.02);
            }
            75% {
              transform: translateY(-10px) scale(1.03);
            }
          }
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .ai-avatar-float {
            animation: float 3s ease-in-out infinite;
          }
          .ai-avatar-bounce {
            animation: bounce 0.6s ease-out;
          }
          .speech-bubble {
            animation: fadeIn 0.3s ease-out;
          }
        `}
      </style>
      <div className={`${fixed ? 'fixed bottom-6 right-6 z-50' : ''} ${className}`}>
        {displayMessage && !showHelpChat && (
          <div className="speech-bubble absolute bottom-full right-0 mb-2 max-w-[200px] bg-white border-2 border-blue-500 rounded-lg px-3 py-2 shadow-lg">
            <div className="text-sm font-medium text-blue-900">{displayMessage}</div>
            <div className="absolute bottom-0 right-6 transform translate-y-1/2 rotate-45 w-3 h-3 bg-white border-r-2 border-b-2 border-blue-500"></div>
          </div>
        )}

        {enableHelpChat && !showHelpChat && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (messageDisplayTimer.current) {
                clearTimeout(messageDisplayTimer.current);
              }
              setShowHelpChat(true);
              onHelpChatToggle?.(true);
            }}
            className="absolute -top-3 -left-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full p-2 shadow-lg transition-all hover:scale-110 z-10"
            aria-label="ヘルプチャットを開く"
            title="ダブルクリックまたは長押しでもヘルプを開けます"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        )}

        {enableCustomize && onCustomize && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCustomize();
            }}
            className="absolute -top-3 -right-3 bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-500 hover:to-orange-500 text-white rounded-full p-2 shadow-lg transition-all hover:scale-110 z-10"
            aria-label="アバターをカスタマイズ"
            title="着せ替え"
          >
            <Home className="w-4 h-4" />
          </button>
        )}

        <div
          className={`${shouldBounce ? 'ai-avatar-bounce' : 'ai-avatar-float'} ${clickable ? 'cursor-pointer hover:scale-105 transition-transform' : ''} relative`}
          style={{
            width: size,
            height: size,
            aspectRatio: '1/1'
          }}
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchEnd={handleMouseUp}
          role={clickable ? 'button' : undefined}
          aria-label={clickable ? 'AIアバターをクリックして話しかける（ダブルクリックまたは長押しでヘルプチャット）' : undefined}
          tabIndex={clickable ? 0 : undefined}
          onKeyPress={(e) => {
            if (clickable && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              handleClick();
            }
          }}
        >
          {/* Layer 1: 表情（emotion）- 黒柴アバター */}
          <img
            src={imageSrc}
            alt={`AI Avatar - ${displayEmotion}`}
            className="absolute w-full h-full object-contain drop-shadow-lg"
            style={{
              top: 0,
              left: 0,
              pointerEvents: 'none',
              filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15))',
              zIndex: 1
            }}
          />

          {/* Layer 2: 服（outfit） */}
          {equippedItems?.outfit && (
            <img
              src={`/images/avatar/${equippedItems.outfit}.png`}
              alt="Outfit"
              className="absolute w-full h-full object-contain"
              style={{
                top: 0,
                left: 0,
                pointerEvents: 'none',
                zIndex: 2
              }}
              onError={(e) => {
                console.error('Failed to load outfit:', equippedItems.outfit);
                e.currentTarget.style.display = 'none';
              }}
            />
          )}

          {/* Layer 3: 頭アクセサリ（head） */}
          {equippedItems?.head && (
            <img
              src={`/images/avatar/${equippedItems.head}.png`}
              alt="Head Item"
              className="absolute w-full h-full object-contain"
              style={{
                top: 0,
                left: 0,
                pointerEvents: 'none',
                zIndex: 3
              }}
              onError={(e) => {
                console.error('Failed to load head item:', equippedItems.head);
                e.currentTarget.style.display = 'none';
              }}
            />
          )}

          {/* Layer 4: 手持ちアイテム（hand） */}
          {equippedItems?.hand && (
            <img
              src={`/images/avatar/${equippedItems.hand}.png`}
              alt="Hand Item"
              className="absolute w-full h-full object-contain"
              style={{
                top: 0,
                left: 0,
                pointerEvents: 'none',
                zIndex: 4
              }}
              onError={(e) => {
                console.error('Failed to load hand item:', equippedItems.hand);
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
        </div>
      </div>

      {showHelpChat && <AvatarHelpChat onClose={() => {
        setShowHelpChat(false);
        onHelpChatToggle?.(false);
      }} position={helpChatPosition} />}
    </>
  );
}
