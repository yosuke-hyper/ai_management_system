export interface TargetTemplate {
  name: string;
  description: string;
  targetProfitMargin: number;
  targetCostRate: number;
  targetLaborRate: number;
  recommendedFor: string;
}

export interface BrandTemplates {
  [key: string]: TargetTemplate[];
}

export const targetTemplates: BrandTemplates = {
  izakaya: [
    {
      name: '高利益型',
      description: '利益率を重視した高付加価値経営',
      targetProfitMargin: 18,
      targetCostRate: 30,
      targetLaborRate: 25,
      recommendedFor: '高級居酒屋・こだわりの個店向け'
    },
    {
      name: 'バランス型',
      description: '業界標準のバランス経営',
      targetProfitMargin: 14,
      targetCostRate: 33,
      targetLaborRate: 28,
      recommendedFor: '一般的な居酒屋経営向け'
    },
    {
      name: '回転効率型',
      description: '客数・回転率を重視した薄利多売',
      targetProfitMargin: 11,
      targetCostRate: 36,
      targetLaborRate: 30,
      recommendedFor: '大衆居酒屋・チェーン店向け'
    }
  ],
  cafe: [
    {
      name: '高利益型',
      description: '利益率を重視した高付加価値経営',
      targetProfitMargin: 22,
      targetCostRate: 28,
      targetLaborRate: 23,
      recommendedFor: 'スペシャルティコーヒー・高級カフェ向け'
    },
    {
      name: 'バランス型',
      description: '業界標準のバランス経営',
      targetProfitMargin: 17,
      targetCostRate: 32,
      targetLaborRate: 26,
      recommendedFor: '一般的なカフェ経営向け'
    },
    {
      name: '回転効率型',
      description: '客数・回転率を重視した薄利多売',
      targetProfitMargin: 13,
      targetCostRate: 36,
      targetLaborRate: 28,
      recommendedFor: 'セルフサービス・チェーンカフェ向け'
    }
  ],
  ramen: [
    {
      name: '高利益型',
      description: '利益率を重視した高付加価値経営',
      targetProfitMargin: 20,
      targetCostRate: 30,
      targetLaborRate: 24,
      recommendedFor: '高級ラーメン・こだわり店向け'
    },
    {
      name: 'バランス型',
      description: '業界標準のバランス経営',
      targetProfitMargin: 16,
      targetCostRate: 33,
      targetLaborRate: 27,
      recommendedFor: '一般的なラーメン店経営向け'
    },
    {
      name: '回転効率型',
      description: '客数・回転率を重視した薄利多売',
      targetProfitMargin: 13,
      targetCostRate: 36,
      targetLaborRate: 29,
      recommendedFor: '大衆ラーメン・チェーン店向け'
    }
  ],
  bar: [
    {
      name: '高利益型',
      description: '利益率を重視した高付加価値経営',
      targetProfitMargin: 25,
      targetCostRate: 25,
      targetLaborRate: 22,
      recommendedFor: 'オーセンティックバー・高級バー向け'
    },
    {
      name: 'バランス型',
      description: '業界標準のバランス経営',
      targetProfitMargin: 20,
      targetCostRate: 28,
      targetLaborRate: 25,
      recommendedFor: '一般的なバー経営向け'
    },
    {
      name: '回転効率型',
      description: '客数・回転率を重視した薄利多売',
      targetProfitMargin: 15,
      targetCostRate: 32,
      targetLaborRate: 28,
      recommendedFor: 'カジュアルバー・立ち飲み向け'
    }
  ],
  fastfood: [
    {
      name: '高利益型',
      description: '利益率を重視した高付加価値経営',
      targetProfitMargin: 15,
      targetCostRate: 32,
      targetLaborRate: 26,
      recommendedFor: 'プレミアム路線・グルメバーガー向け'
    },
    {
      name: 'バランス型',
      description: '業界標準のバランス経営',
      targetProfitMargin: 12,
      targetCostRate: 35,
      targetLaborRate: 28,
      recommendedFor: '一般的なファストフード経営向け'
    },
    {
      name: '回転効率型',
      description: '客数・回転率を重視した薄利多売',
      targetProfitMargin: 9,
      targetCostRate: 38,
      targetLaborRate: 30,
      recommendedFor: 'ボリューム重視・低価格路線向け'
    }
  ],
  bakery: [
    {
      name: '高利益型',
      description: '利益率を重視した高付加価値経営',
      targetProfitMargin: 23,
      targetCostRate: 28,
      targetLaborRate: 22,
      recommendedFor: '高級ベーカリー・職人系向け'
    },
    {
      name: 'バランス型',
      description: '業界標準のバランス経営',
      targetProfitMargin: 18,
      targetCostRate: 32,
      targetLaborRate: 25,
      recommendedFor: '一般的なベーカリー経営向け'
    },
    {
      name: '回転効率型',
      description: '客数・回転率を重視した薄利多売',
      targetProfitMargin: 14,
      targetCostRate: 35,
      targetLaborRate: 27,
      recommendedFor: 'チェーンベーカリー・量産型向け'
    }
  ],
  restaurant: [
    {
      name: '高利益型',
      description: '利益率を重視した高付加価値経営',
      targetProfitMargin: 20,
      targetCostRate: 30,
      targetLaborRate: 24,
      recommendedFor: '高級レストラン・フレンチイタリアン向け'
    },
    {
      name: 'バランス型',
      description: '業界標準のバランス経営',
      targetProfitMargin: 15,
      targetCostRate: 33,
      targetLaborRate: 27,
      recommendedFor: '一般的なレストラン経営向け'
    },
    {
      name: '回転効率型',
      description: '客数・回転率を重視した薄利多売',
      targetProfitMargin: 12,
      targetCostRate: 36,
      targetLaborRate: 29,
      recommendedFor: 'ファミリーレストラン・カジュアル向け'
    }
  ],
  other: [
    {
      name: '高利益型',
      description: '利益率を重視した高付加価値経営',
      targetProfitMargin: 20,
      targetCostRate: 30,
      targetLaborRate: 25,
      recommendedFor: '高付加価値業態向け'
    },
    {
      name: 'バランス型',
      description: '業界標準のバランス経営',
      targetProfitMargin: 15,
      targetCostRate: 33,
      targetLaborRate: 28,
      recommendedFor: '一般的な飲食業経営向け'
    },
    {
      name: '回転効率型',
      description: '客数・回転率を重視した薄利多売',
      targetProfitMargin: 12,
      targetCostRate: 36,
      targetLaborRate: 30,
      recommendedFor: '大衆向け業態向け'
    }
  ]
};

export const brandTypeLabels: Record<string, string> = {
  restaurant: 'レストラン',
  izakaya: '居酒屋',
  cafe: 'カフェ',
  ramen: 'ラーメン',
  bar: 'バー',
  fastfood: 'ファストフード',
  bakery: 'ベーカリー',
  other: 'その他'
};

export function getTemplatesForBrand(brandType: string | undefined): TargetTemplate[] {
  if (!brandType || !targetTemplates[brandType]) {
    return targetTemplates.other;
  }
  return targetTemplates[brandType];
}

export function getBrandLabel(brandType: string | undefined): string {
  if (!brandType) return 'その他';
  return brandTypeLabels[brandType] || 'その他';
}
