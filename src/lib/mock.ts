// モックストアデータ（フォールバック用）
// 実際のデータはSupabaseまたはローカルストレージから取得します

import type { DailyReportData } from '@/types'
import { getMockCache, setMockCache } from './mockCache'

// シード値付き疑似乱数生成器（決定的な乱数のため）
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

export const mockStores = [
  {
    id: '1',
    name: '渋谷店',
    address: '東京都渋谷区',
    is_active: true
  },
  {
    id: '2',
    name: '新宿店',
    address: '東京都新宿区',
    is_active: true
  },
  {
    id: '3',
    name: '池袋店',
    address: '東京都豊島区',
    is_active: true
  },
  {
    id: '4',
    name: '横浜店',
    address: '神奈川県横浜市',
    is_active: true
  }
]

export const mockVendors = [
  {
    id: 'vendor-1',
    name: '豊洲市場青果卸',
    category: 'vegetable_meat' as const,
    contact_info: '03-1234-5678',
    is_active: true
  },
  {
    id: 'vendor-2',
    name: '築地海産物',
    category: 'seafood' as const,
    contact_info: '03-2345-6789',
    is_active: true
  },
  {
    id: 'vendor-3',
    name: '酒類販売フジワラ',
    category: 'alcohol' as const,
    contact_info: '03-3456-7890',
    is_active: true
  },
  {
    id: 'vendor-4',
    name: '米問屋田中',
    category: 'rice' as const,
    contact_info: '03-4567-8901',
    is_active: true
  },
  {
    id: 'vendor-5',
    name: '調味料専門店マルキン',
    category: 'seasoning' as const,
    contact_info: '03-5678-9012',
    is_active: true
  },
  {
    id: 'vendor-6',
    name: '冷凍食品マルヨシ',
    category: 'frozen' as const,
    contact_info: '03-6789-0123',
    is_active: true
  },
  {
    id: 'vendor-7',
    name: 'パティスリー洋菓子卸',
    category: 'dessert' as const,
    contact_info: '03-7890-1234',
    is_active: true
  }
]

/**
 * ✅ 店舗ごとの"90日ベース"を一度だけ生成（内部関数）
 * 30日や他の日数は、このベースからスライスして返す
 */
function getOrBuildBase90(storeId?: string, actualStores?: { id: string; name: string }[]): DailyReportData[] {
  // actualStoresがある場合、店舗IDのハッシュをキャッシュキーに含める
  const storesHash = actualStores ? actualStores.map(s => s.id).sort().join(',') : 'default'
  const baseKey = `base90-${storeId || 'all'}-${storesHash}-v3-lunch-dinner`
  const cached = getMockCache(baseKey)
  if (cached) {
    console.log('🎯 getOrBuildBase90: キャッシュヒット:', baseKey)
    return cached as DailyReportData[]
  }

  // ベース90日分を生成
  const today = new Date()
  const reports: DailyReportData[] = []

  // 実際の店舗データがある場合はそれを使用、なければデフォルトのmockStoresを使用
  let stores: { id: string; name: string; address?: string; is_active?: boolean }[]

  if (storeId) {
    // 特定の店舗IDが指定されている場合
    if (actualStores && actualStores.length > 0) {
      const foundStore = actualStores.find(s => s.id === storeId)
      stores = foundStore ? [foundStore] : [{ id: storeId, name: 'デモ店舗' }]
    } else {
      stores = [{ id: storeId, name: 'デモ店舗' }]
    }
  } else {
    // 全店舗の場合
    if (actualStores && actualStores.length > 0) {
      stores = actualStores
    } else {
      stores = mockStores
    }
  }

  if (stores.length === 0) {
    console.warn('getOrBuildBase90: 有効な店舗がありません')
    return []
  }

  console.log('🏪 getOrBuildBase90:', { storeId, storesCount: stores.length, storeIds: stores.map(s => s.id), storeNames: stores.map(s => s.name) })

  // 90日分を生成（各日付でランチとディナーの2レコード）
  for (let i = 0; i < 90; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().slice(0, 10)

    stores.forEach(store => {
      const baseSales = store.id === '1' ? 280000 :
                       store.id === '2' ? 250000 :
                       store.id === '3' ? 320000 :
                       200000

      // UUIDの場合はハッシュを使ってシードを生成
      const storeIdNum = parseInt(store.id) || Array.from(store.id).reduce((acc, char) => acc + char.charCodeAt(0), 0)
      const seed = storeIdNum * 10000 + i
      const variation = 0.7 + seededRandom(seed) * 0.6
      const totalSales = Math.round(baseSales * variation)

      // 店舗ごとのランチ比率を決定（15-25%の範囲、平均20%）
      const lunchRatioSeed = storeIdNum * 12345 // 店舗ごとに固定のシード
      const lunchRatio = 0.15 + seededRandom(lunchRatioSeed) * 0.10 // 15-25%
      const dinnerRatio = 1.0 - lunchRatio

      // ランチとディナーの売上を分割
      const lunchSales = Math.round(totalSales * lunchRatio)
      const dinnerSales = Math.round(totalSales * dinnerRatio)

      // 経費は1日分として計算（ディナーレコードにのみ設定）
      const purchase = Math.round(totalSales * 0.32)
      const laborCost = Math.round(totalSales * 0.25)
      const utilities = Math.round(totalSales * 0.03)
      const promotion = Math.round(totalSales * 0.02)
      const cleaning = Math.round(totalSales * 0.01)
      const misc = Math.round(totalSales * 0.02)
      const communication = Math.round(totalSales * 0.005)
      const others = Math.round(totalSales * 0.015)

      // 客数も時間帯別に分割
      const totalCustomers = Math.round(totalSales / 3500)
      const lunchCustomers = Math.round(totalCustomers * lunchRatio)
      const dinnerCustomers = Math.round(totalCustomers * dinnerRatio)

      // ランチレコード
      reports.push({
        id: `mock-${store.id}-${dateStr}-lunch`,
        date: dateStr,
        storeId: store.id,
        storeName: store.name,
        staffName: 'デモスタッフ',
        operationType: 'lunch' as const,
        sales: lunchSales,
        purchase: 0, // 経費はディナーレコードのみ
        laborCost: 0,
        utilities: 0,
        rent: 0,
        consumables: 0,
        promotion: 0,
        cleaning: 0,
        misc: 0,
        communication: 0,
        others: 0,
        customers: lunchCustomers,
        lunchCustomers: lunchCustomers,
        dinnerCustomers: 0,
        reportText: 'ランチ営業モックデータ',
        createdAt: new Date().toISOString()
      })

      // ディナーレコード（経費は1日分を全て含む）
      reports.push({
        id: `mock-${store.id}-${dateStr}-dinner`,
        date: dateStr,
        storeId: store.id,
        storeName: store.name,
        staffName: 'デモスタッフ',
        operationType: 'dinner' as const,
        sales: dinnerSales,
        purchase, // 1日分の経費
        laborCost,
        utilities,
        rent: 0,
        consumables: 0,
        promotion,
        cleaning,
        misc,
        communication,
        others,
        customers: dinnerCustomers,
        lunchCustomers: 0,
        dinnerCustomers: dinnerCustomers,
        reportText: 'ディナー営業モックデータ',
        createdAt: new Date().toISOString()
      })
    })
  }

  // ベースをキャッシュ
  setMockCache(baseKey, reports)
  return reports
}

/**
 * 指定日数分のモック日報データを生成（デモ／データ欠損時のフォールバック用）
 * ✅ 改善: 常に90日ベースから切り出すことで、重複生成を防止
 * @param days 生成する日数（デフォルト30日）
 * @param storeId 店舗ID（指定しない場合は全店舗）
 * @returns モック日報データの配列
 */
export function generateMockReports(
  days: number = 30,
  storeId?: string,
  actualStores?: { id: string; name: string }[]
): DailyReportData[] {
  // actualStoresがある場合、店舗IDのハッシュをキャッシュキーに含める
  const storesHash = actualStores ? actualStores.map(s => s.id).sort().join(',') : 'default'
  const cacheKey = `mock-${days}-${storeId || 'all'}-${storesHash}-v3-lunch-dinner`

  // キャッシュチェック
  const cached = getMockCache(cacheKey)
  if (cached) {
    console.log('🎯 generateMockReports: キャッシュヒット:', cacheKey)
    return cached as DailyReportData[]
  }

  // ベース90日を取得（初回のみ生成、以後はキャッシュから）
  const base90 = getOrBuildBase90(storeId, actualStores)

  // 必要な日数だけスライス
  const sliced = base90.slice(0, Math.min(days, base90.length))

  // スライス結果をキャッシュ
  setMockCache(cacheKey, sliced)

  return sliced
}

/**
 * 指定期間のモック日報を生成
 * @param params.storeId 店舗ID
 * @param params.start 開始日（YYYY-MM-DD）
 * @param params.end 終了日（YYYY-MM-DD）
 * @returns モック日報データの配列
 */
export function generateMockReportsForPeriod(params: {
  storeId: string
  start: string
  end: string
}): DailyReportData[] {
  const { storeId, start, end } = params
  const startDate = new Date(start)
  const endDate = new Date(end)

  if (startDate > endDate) {
    console.warn('generateMockReportsForPeriod: 開始日が終了日より後です')
    return []
  }

  const reports: DailyReportData[] = []
  const store = mockStores.find(s => s.id === storeId)

  if (!store) {
    console.warn('generateMockReportsForPeriod: 店舗が見つかりません', storeId)
    return []
  }

  const currentDate = new Date(startDate)

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().slice(0, 10)

    // 基本売上
    const baseSales = store.id === '1' ? 280000 :  // 渋谷店
                     store.id === '2' ? 250000 :  // 新宿店
                     store.id === '3' ? 320000 :  // 池袋店
                     200000                        // 横浜店

    const variation = 0.7 + Math.random() * 0.6
    const sales = Math.round(baseSales * variation)
    const purchase = Math.round(sales * 0.32)
    const laborCost = Math.round(sales * 0.25)
    const utilities = Math.round(sales * 0.03)
    const promotion = Math.round(sales * 0.02)
    const cleaning = Math.round(sales * 0.01)
    const misc = Math.round(sales * 0.02)
    const communication = Math.round(sales * 0.005)
    const others = Math.round(sales * 0.015)

    const salesCash10 = Math.round(sales * 0.50)
    const salesCash8 = Math.round(sales * 0.15)
    const salesCredit10 = Math.round(sales * 0.25)
    const salesCredit8 = Math.round(sales * 0.10)
    const customers = Math.round(sales / 3500)

    reports.push({
      id: `mock-${store.id}-${dateStr}`,
      date: dateStr,
      storeId: store.id,
      storeName: store.name,
      sales,
      purchase,
      laborCost,
      utilities,
      promotion,
      cleaning,
      misc,
      communication,
      others,
      salesCash10,
      salesCash8,
      salesCredit10,
      salesCredit8,
      customers,
      reportText: 'モックデータ',
      createdAt: new Date().toISOString()
    })

    currentDate.setDate(currentDate.getDate() + 1)
  }

  return reports
}

export type MonthlyRollup = {
  storeId: string
  storeName: string
  ym: string
  days: number
  sales: number
  purchase: number
  laborCost: number
  utilities: number
  promotion: number
  cleaning: number
  misc: number
  communication: number
  others: number
  customers: number
  rent: number
  consumables: number
}

const ymOf = (isoDate: string) => isoDate.slice(0, 7)

function buildMonthlyRollup(rows: DailyReportData[]): MonthlyRollup[] {
  const acc = new Map<string, MonthlyRollup>()
  for (const r of rows) {
    const key = `${r.storeId}|${ymOf(r.date)}`
    const cur = acc.get(key) ?? {
      storeId: r.storeId,
      storeName: r.storeName,
      ym: ymOf(r.date),
      days: 0,
      sales: 0,
      purchase: 0,
      laborCost: 0,
      utilities: 0,
      promotion: 0,
      cleaning: 0,
      misc: 0,
      communication: 0,
      others: 0,
      customers: 0,
      rent: 0,
      consumables: 0,
    }
    cur.days++
    cur.sales += r.sales
    cur.purchase += r.purchase
    cur.laborCost += r.laborCost
    cur.utilities += r.utilities
    cur.promotion += r.promotion
    cur.cleaning += r.cleaning
    cur.misc += r.misc
    cur.communication += r.communication
    cur.others += r.others
    cur.customers += r.customers
    cur.rent += r.rent || 0
    cur.consumables += r.consumables || 0
    acc.set(key, cur)
  }
  return Array.from(acc.values())
}

export function generateMockMonthlyRollup(days = 90, storeId?: string): MonthlyRollup[] {
  const key = `mock-monthly-${days}-${storeId || 'all'}-v1`
  const cached = getMockCache(key)
  if (cached) return cached as MonthlyRollup[]

  const daily = generateMockReports(days, storeId)
  const monthly = buildMonthlyRollup(daily)

  setMockCache(key, monthly)
  return monthly
}

// 型定義は @/types からimportしてください
export type { DailyReportData, TargetData, Store } from '@/types'
