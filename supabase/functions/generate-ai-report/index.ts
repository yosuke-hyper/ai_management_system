import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

interface ReportRequest {
  reportType: 'weekly' | 'monthly';
  storeId?: string;
  periodStart?: string;
  periodEnd?: string;
  demo_session_id?: string;
}

interface DailyReportData {
  id: string;
  date: string;
  store_id: string;
  sales: number;
  purchase: number;
  labor_cost: number;
  utilities: number;
  rent: number;
  consumables: number;
  promotion: number;
  cleaning: number;
  misc: number;
  communication: number;
  others: number;
}

interface StoreData {
  id: string;
  name: string;
}

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');

    const { reportType, storeId, periodStart, periodEnd, demo_session_id }: ReportRequest = await req.json();

    if (!openaiApiKey && !demo_session_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (demo_session_id) {
      const { data: checkResult, error: checkError } = await supabase.rpc('check_demo_ai_usage', {
        p_demo_session_id: demo_session_id,
        p_feature_type: 'report'
      });

      if (checkError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'デモセッションの検証に失敗しました。'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!checkResult.allowed) {
        return new Response(
          JSON.stringify({
            success: false,
            error: checkResult.message,
            isDemo: true,
            remaining: checkResult.remaining
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      if (authHeader) {
        const usageProxyUrl = `${supabaseUrl}/functions/v1/ai-usage-proxy`;
        const usageResponse = await fetch(usageProxyUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
        });

        if (!usageResponse.ok) {
          const usageError = await usageResponse.json();
          console.error('AI usage check failed:', usageError);

          return new Response(
            JSON.stringify({
              success: false,
              error: usageError.error || 'AI使用制限のチェックに失敗しました。',
              message: usageError.message,
              usageInfo: usageError.usageInfo
            }),
            {
              status: usageResponse.status,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const usageResult = await usageResponse.json();
        console.log('Store-based usage check passed for report generation:', usageResult.usage);
      }
    }

    const logId = crypto.randomUUID();
    if (!demo_session_id) {
      await supabase.from('report_generation_logs').insert({
        id: logId,
        report_type: reportType,
        store_id: storeId || null,
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });
    }

    let startDate: string;
    let endDate: string;

    if (periodStart && periodEnd) {
      startDate = periodStart;
      endDate = periodEnd;
    } else {
      const now = new Date();
      if (reportType === 'weekly') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = weekAgo.toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
      } else {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        startDate = lastMonth.toISOString().split('T')[0];
        endDate = lastMonthEnd.toISOString().split('T')[0];
      }
    }

    const tableName = demo_session_id ? 'fixed_demo_reports' : 'daily_reports';
    console.log(`📊 Fetching from table: ${tableName}, demo_session_id: ${demo_session_id}`);

    let query = supabase
      .from(tableName)
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    const { data: reports, error: reportsError } = await query;
    console.log(`📊 Reports fetched: ${reports?.length || 0} records`);

    if (reportsError) {
      throw new Error(`Failed to fetch reports: ${reportsError.message}`);
    }

    if (!reports || reports.length === 0) {
      if (!demo_session_id) {
        await supabase
          .from('report_generation_logs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: 'No data available for the specified period',
          })
          .eq('id', logId);
      }

      return new Response(
        JSON.stringify({ success: false, error: 'No data available for the specified period' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const storeIds = [...new Set(reports.map((r: DailyReportData) => r.store_id))];

    const storesTable = demo_session_id ? 'fixed_demo_stores' : 'stores';
    const { data: stores } = await supabase
      .from(storesTable)
      .select('id, name')
      .in('id', storeIds);

    const storeMap = new Map((stores || []).map((s: StoreData) => [s.id, s.name]));

    const reportPeriodStart = new Date(startDate);
    const reportPeriodEnd = new Date(endDate);
    const daysInPeriod = Math.ceil((reportPeriodEnd.getTime() - reportPeriodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const monthsInPeriod = new Set<string>();
    for (let d = new Date(reportPeriodStart); d <= reportPeriodEnd; d.setDate(d.getDate() + 1)) {
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthsInPeriod.add(monthKey);
    }

    let expenseBaselines: any[] = [];
    if (!demo_session_id) {
      const { data } = await supabase
        .from('expense_baselines')
        .select('*')
        .in('store_id', storeIds)
        .in('month', Array.from(monthsInPeriod));
      expenseBaselines = data || [];
    }

    const expenseBaselineMap = new Map();
    expenseBaselines.forEach((baseline: any) => {
      const key = `${baseline.store_id}-${baseline.month}`;
      expenseBaselineMap.set(key, baseline);
    });

    const calculateProrationForStore = (storeId: string) => {
      const storeReports = reports.filter((r: DailyReportData) => r.store_id === storeId);
      const actualDaysWithReports = storeReports.length;

      if (actualDaysWithReports === 0) return 0;

      let totalProrated = 0;
      for (const monthKey of Array.from(monthsInPeriod)) {
        const baselineKey = `${storeId}-${monthKey}`;
        const baseline = expenseBaselineMap.get(baselineKey);
        if (!baseline) continue;

        const year = parseInt(monthKey.split('-')[0]);
        const month = parseInt(monthKey.split('-')[1]);
        const daysInMonth = new Date(year, month, 0).getDate();

        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0);

        const effectiveStart = monthStart > reportPeriodStart ? monthStart : reportPeriodStart;
        const effectiveEnd = monthEnd < reportPeriodEnd ? monthEnd : reportPeriodEnd;

        const daysInOverlap = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        const prorationFactor = daysInOverlap / daysInMonth;

        totalProrated += (baseline.rent || 0) * prorationFactor;
        totalProrated += (baseline.consumables || 0) * prorationFactor;
      }

      return totalProrated;
    };

    const totalSales = reports.reduce((sum: number, r: DailyReportData) => sum + (r.sales || 0), 0);
    const totalPurchase = reports.reduce((sum: number, r: DailyReportData) => sum + (r.purchase || 0), 0);
    const totalLaborCost = reports.reduce((sum: number, r: DailyReportData) => sum + (r.labor_cost || 0), 0);
    const totalUtilities = reports.reduce((sum: number, r: DailyReportData) => sum + (r.utilities || 0), 0);
    const totalPromotion = reports.reduce((sum: number, r: DailyReportData) => sum + (r.promotion || 0), 0);
    const totalCleaning = reports.reduce((sum: number, r: DailyReportData) => sum + (r.cleaning || 0), 0);
    const totalMisc = reports.reduce((sum: number, r: DailyReportData) => sum + (r.misc || 0), 0);
    const totalCommunication = reports.reduce((sum: number, r: DailyReportData) => sum + (r.communication || 0), 0);
    const totalOthers = reports.reduce((sum: number, r: DailyReportData) => sum + (r.others || 0), 0);

    let totalRentConsum = 0;
    for (const sid of storeIds) {
      totalRentConsum += calculateProrationForStore(sid);
    }

    const totalExpenses =
      totalPurchase +
      totalLaborCost +
      totalUtilities +
      totalPromotion +
      totalCleaning +
      totalMisc +
      totalCommunication +
      totalOthers +
      totalRentConsum;

    const grossProfit = totalSales - totalPurchase;
    const operatingProfit = totalSales - totalExpenses;
    const profitMargin = totalSales > 0 ? (operatingProfit / totalSales) * 100 : 0;
    const costRate = totalSales > 0 ? (totalPurchase / totalSales) * 100 : 0;
    const laborRate = totalSales > 0 ? (totalLaborCost / totalSales) * 100 : 0;

    const storeBreakdown = storeIds.map((sid) => {
      const storeReports = reports.filter((r: DailyReportData) => r.store_id === sid);
      const storeSales = storeReports.reduce((sum: number, r: DailyReportData) => sum + (r.sales || 0), 0);
      const storePurchase = storeReports.reduce((sum: number, r: DailyReportData) => sum + (r.purchase || 0), 0);
      const storeLaborCost = storeReports.reduce((sum: number, r: DailyReportData) => sum + (r.labor_cost || 0), 0);
      const storeUtilities = storeReports.reduce((sum: number, r: DailyReportData) => sum + (r.utilities || 0), 0);
      const storePromotion = storeReports.reduce((sum: number, r: DailyReportData) => sum + (r.promotion || 0), 0);
      const storeCleaning = storeReports.reduce((sum: number, r: DailyReportData) => sum + (r.cleaning || 0), 0);
      const storeMisc = storeReports.reduce((sum: number, r: DailyReportData) => sum + (r.misc || 0), 0);
      const storeCommunication = storeReports.reduce((sum: number, r: DailyReportData) => sum + (r.communication || 0), 0);
      const storeOthers = storeReports.reduce((sum: number, r: DailyReportData) => sum + (r.others || 0), 0);
      const storeRentConsum = calculateProrationForStore(sid);

      const storeExpenses =
        storePurchase +
        storeLaborCost +
        storeUtilities +
        storePromotion +
        storeCleaning +
        storeMisc +
        storeCommunication +
        storeOthers +
        storeRentConsum;

      const storeProfit = storeSales - storeExpenses;
      const storeProfitMargin = storeSales > 0 ? (storeProfit / storeSales) * 100 : 0;
      const storeCostRate = storeSales > 0 ? (storePurchase / storeSales) * 100 : 0;
      const storeLaborRate = storeSales > 0 ? (storeLaborCost / storeSales) * 100 : 0;

      return {
        storeId: sid,
        storeName: storeMap.get(sid) || sid,
        sales: storeSales,
        expenses: storeExpenses,
        profit: storeProfit,
        profitMargin: storeProfitMargin,
        costRate: storeCostRate,
        laborRate: storeLaborRate,
      };
    });

    let aiContent;

    if (demo_session_id) {
      console.log('🎭 Demo mode: Using mock AI response');
      aiContent = {
        title: `${reportType === 'weekly' ? '週次' : '月次'}業績分析レポート - デモ`,
        summary: `分析期間（${startDate}～${endDate}）の業績は${profitMargin > 10 ? '好調' : profitMargin > 5 ? '安定' : '改善の余地あり'}です。総売上¥${totalSales.toLocaleString()}に対し、営業利益¥${operatingProfit.toLocaleString()}（利益率${profitMargin.toFixed(1)}%）を達成しました。${storeBreakdown.length > 1 ? `店舗別では${storeBreakdown[0].storeName}が最も高い売上を記録しています。` : ''}`,
        analysis: {
          salesTrend: `期間中の総売上は¥${totalSales.toLocaleString()}となりました。${storeBreakdown.length > 1 ? `店舗別では、${storeBreakdown.sort((a, b) => b.sales - a.sales).map(s => `${s.storeName}（¥${s.sales.toLocaleString()}）`).join('、')}の順となっています。` : '安定した売上推移を示しています。'}`,
          profitability: `営業利益率${profitMargin.toFixed(1)}%は、飲食業界の平均的な水準${profitMargin > 8 ? 'を上回っており' : 'にあり'}、${profitMargin > 10 ? '非常に優れた' : profitMargin > 5 ? '良好な' : '改善の余地がある'}収益性を示しています。粗利益率は${((grossProfit / totalSales) * 100).toFixed(1)}%です。`,
          costStructure: `原価率${costRate.toFixed(1)}%、人件費率${laborRate.toFixed(1)}%となっています。${costRate > 35 ? '原価率がやや高めですので、仕入れの見直しや廃棄ロスの削減が効果的です。' : costRate > 30 ? '原価率は適正範囲内です。' : '原価率は良好に管理されています。'}${laborRate > 30 ? '人件費率が高めですので、シフト管理の最適化を検討してください。' : laborRate > 25 ? '人件費率は標準的な水準です。' : '人件費は効率的に管理されています。'}`,
          storeComparison: storeBreakdown.length > 1
            ? `店舗別の利益率を比較すると、${storeBreakdown.sort((a, b) => b.profitMargin - a.profitMargin)[0].storeName}が${storeBreakdown[0].profitMargin.toFixed(1)}%で最も高く、優れた運営効率を示しています。${storeBreakdown[storeBreakdown.length - 1].storeName}は${storeBreakdown[storeBreakdown.length - 1].profitMargin.toFixed(1)}%となっており、改善の余地があります。`
            : '単一店舗の運営として、安定した業績を維持しています。'
        },
        keyInsights: [
          profitMargin > 10
            ? '📈 優れた利益率を達成しており、効率的な運営が実現できています'
            : profitMargin > 5
            ? '📊 健全な利益率を維持していますが、さらなる改善の余地があります'
            : '⚠️ 利益率の改善が必要です。コスト削減と売上向上の両面から対策を検討してください',
          costRate < 30
            ? '✅ 原価管理が適切に行われており、良好な粗利益を確保しています'
            : costRate < 35
            ? '💡 原価率は標準的ですが、仕入れの最適化でさらなる改善が可能です'
            : '🔍 原価率が高めです。仕入先の見直しや廃棄ロス削減に取り組みましょう',
          storeBreakdown.length > 1
            ? `🏪 ${storeBreakdown[0].storeName}の成功事例を他店舗に横展開することで、全体の業績向上が期待できます`
            : '🎯 継続的な改善活動により、さらなる業績向上が見込めます'
        ],
        recommendations: [
          costRate > 33
            ? '💰 仕入先との価格交渉や複数店舗での共同仕入れにより、原価率を2-3%削減できる可能性があります'
            : '📦 在庫管理の最適化により、廃棄ロスをさらに削減し、利益率を向上させましょう',
          laborRate > 28
            ? '👥 ピークタイムの人員配置を最適化し、人件費率を1-2%削減することを推奨します'
            : '📱 POSデータを活用した需要予測により、より効率的なシフト管理が可能です',
          profitMargin < 8
            ? '🚀 メニュー単価の見直しや高利益率商品の販促強化により、利益率10%超を目指しましょう'
            : '📈 現在の好調な業績を維持しつつ、新メニュー開発やサービス向上により、さらなる成長を目指しましょう'
        ]
      };
    } else {
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'あなたは飲食店経営の専門家です。提供されたデータを分析し、詳細で実用的なレポートを日本語で作成してください。',
            },
            {
              role: 'user',
              content: `以下のデータから${reportType === 'weekly' ? '週次' : '月次'}レポートを作成してください：

期間: ${startDate} ～ ${endDate}
総売上: ¥${totalSales.toLocaleString()}
総経費: ¥${totalExpenses.toLocaleString()}
営業利益: ¥${operatingProfit.toLocaleString()}
利益率: ${profitMargin.toFixed(1)}%
原価率: ${costRate.toFixed(1)}%
人件費率: ${laborRate.toFixed(1)}%

店舗別内訳:
${storeBreakdown
  .map(
    (s) =>
      \`- \${s.storeName}: 売上¥\${s.sales.toLocaleString()}, 利益¥\${s.profit.toLocaleString()} (利益率\${s.profitMargin.toFixed(1)}%)\`
  )
  .join('\n')}

JSON形式で返してください：
{
  "title": "レポートのタイトル",
  "summary": "サマリー（3-5文）",
  "analysis": {
    "salesTrend": "売上トレンド分析",
    "profitability": "収益性分析",
    "costStructure": "コスト構造分析",
    "storeComparison": "店舗比較分析"
  },
  "keyInsights": ["洞察1", "洞察2", "洞察3"],
  "recommendations": ["推奨事項1", "推奨事項2", "推奨事項3"]
}`,
            },
          ],
          temperature: 0.7,
        }),
      });

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        throw new Error(`OpenAI API error: ${openaiResponse.statusText} - ${errorText}`);
      }

      const openaiData = await openaiResponse.json();
      const aiContentStr = openaiData.choices[0]?.message?.content || '{}';
      aiContent = JSON.parse(aiContentStr.replace(/```json\n?|```/g, '').trim());
    }

    let organizationId = null;
    if (!demo_session_id) {
      const authHeaderForOrg = req.headers.get('Authorization');
      console.log('🔐 Auth header present:', !!authHeaderForOrg);

      if (authHeaderForOrg) {
        const token = authHeaderForOrg.replace('Bearer ', '');
        const { data: userData, error: userError } = await supabase.auth.getUser(token);

        console.log('👤 User from token:', userData?.user?.id, 'Error:', userError?.message);

        if (userData?.user) {
          const { data: memberData, error: memberError } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', userData.user.id)
            .maybeSingle();

          console.log('🏢 Member data:', memberData, 'Error:', memberError?.message);

          if (memberData?.organization_id) {
            organizationId = memberData.organization_id;
          } else {
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .select('organization_id')
              .eq('id', userData.user.id)
              .maybeSingle();

            console.log('📋 Profile data:', profileData, 'Error:', profileError?.message);

            if (profileData?.organization_id) {
              organizationId = profileData.organization_id;
            }
          }
        }
      }

      if (!organizationId) {
        console.error('❌ Could not determine organization_id for authenticated user');
        return new Response(
          JSON.stringify({
            success: false,
            error: '組織情報を取得できませんでした。再度ログインしてください。'
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('✅ Organization ID determined:', organizationId);
    }

    const reportData = {
      store_id: storeId || null,
      report_type: reportType,
      period_start: startDate,
      period_end: endDate,
      title: aiContent.title || `${reportType === 'weekly' ? '週次' : '月次'}業績レポート`,
      summary: aiContent.summary || '',
      analysis_content: aiContent.analysis || {},
      key_insights: aiContent.keyInsights || [],
      recommendations: aiContent.recommendations || [],
      metrics: {
        totalSales,
        totalExpenses,
        grossProfit,
        operatingProfit,
        profitMargin,
        costRate,
        laborRate,
        storeBreakdown,
      },
      generated_by: 'gpt-4o-mini',
      generated_at: new Date().toISOString(),
      organization_id: organizationId,
    };

    let report;

    if (demo_session_id) {
      console.log('📊 Demo mode: Saving to demo_ai_reports table');

      const demoReportData = {
        ...reportData,
        demo_session_id: demo_session_id,
        generated_by: 'demo-user'
      };

      const { data: savedReport, error: insertError } = await supabase
        .from('demo_ai_reports')
        .insert(demoReportData)
        .select()
        .single();

      if (insertError) {
        console.error('Failed to insert demo report:', insertError);
        throw new Error(`Failed to insert demo report: ${insertError.message}`);
      }

      report = savedReport;
      console.log(`✅ Demo report saved with ID: ${report.id}`);

      await supabase.rpc('increment_demo_ai_usage', {
        p_demo_session_id: demo_session_id,
        p_feature_type: 'report'
      });
    } else {
      console.log('💾 Saving report with organization_id:', organizationId);
      const { data: savedReport, error: insertError } = await supabase
        .from('ai_generated_reports')
        .insert(reportData)
        .select()
        .single();

      if (insertError) {
        console.error('Failed to insert report:', insertError);
        throw new Error(`Failed to insert report: ${insertError.message}`);
      }

      report = savedReport;

      await supabase
        .from('report_generation_logs')
        .update({
          status: 'success',
          report_id: report.id,
          completed_at: new Date().toISOString(),
          data_summary: { reportCount: reports.length, storeCount: storeIds.length },
        })
        .eq('id', logId);

      try {
        const { data: reportWithOrg } = await supabase
          .from('ai_generated_reports')
          .select('organization_id')
          .eq('id', report.id)
          .single();

        if (reportWithOrg && reportWithOrg.organization_id) {
          const { data: members } = await supabase
            .from('organization_members')
            .select('user_id, profiles!inner(role)')
            .eq('organization_id', reportWithOrg.organization_id)
            .in('profiles.role', ['admin', 'manager']);

          if (members && members.length > 0) {
            const reportTypeLabels: Record<string, string> = {
              daily: '日次',
              weekly: '週次',
              monthly: '月次',
            };

            const storeName = storeId
              ? stores.find((s: any) => s.id === storeId)?.name || '不明な店舗'
              : '全店舗';

            const notifications = members.map((member) =>
              supabase.from('notifications').insert({
                user_id: member.user_id,
                organization_id: reportWithOrg.organization_id,
                type: 'success',
                title: 'AIレポート生成完了',
                message: `${storeName}の${reportTypeLabels[reportType] || reportType}レポートが生成されました。`,
                link: `/dashboard/ai-reports?id=${report.id}`,
                read: false,
              })
            );

            await Promise.all(notifications);
            console.log(`Report generated notifications sent to ${members.length} members`);
          }
        }
      } catch (notifError) {
        console.error('Failed to send report notification:', notifError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, report }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Report generation error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});