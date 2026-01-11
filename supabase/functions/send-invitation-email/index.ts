import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import nodemailer from 'npm:nodemailer@6.9.7';

interface InvitationEmailRequest {
  email: string;
  inviterName: string;
  organizationName: string;
  role: string;
  invitationToken: string;
}

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

async function sendEmail(to: string, subject: string, html: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const smtpHost = Deno.env.get('SMTP_HOST');
    const smtpPort = parseInt(Deno.env.get('SMTP_PORT') || '587');
    const smtpUser = Deno.env.get('SMTP_USER');
    const smtpPassword = Deno.env.get('SMTP_PASSWORD');
    const smtpFromEmail = Deno.env.get('SMTP_FROM_EMAIL');
    const smtpFromName = Deno.env.get('SMTP_FROM_NAME') || 'FoodValue AI';

    if (!smtpHost || !smtpUser || !smtpPassword || !smtpFromEmail) {
      throw new Error('SMTP configuration is incomplete. Please set all required environment variables.');
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: false,
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
      tls: {
        rejectUnauthorized: true,
      },
    });

    const mailOptions = {
      from: `${smtpFromName} <${smtpFromEmail}>`,
      to: to,
      subject: subject,
      html: html,
    };

    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error('SMTP送信エラー:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'メール送信中にエラーが発生しました',
    };
  }
}

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: '認証が必要です' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: '認証に失敗しました' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, organization_id')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, error: '権限がありません。管理者のみメンバーを招待できます' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { email, inviterName, organizationName, role, invitationToken }: InvitationEmailRequest = await req.json();

    const roleLabels: Record<string, string> = {
      admin: '管理者',
      manager: '店長',
      staff: 'スタッフ'
    };

    const invitationUrl = `${req.headers.get('origin') || 'https://yourdomain.com'}/invite/${invitationToken}`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .header p {
      margin: 10px 0 0 0;
      opacity: 0.9;
      font-size: 16px;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 18px;
      color: #111827;
      margin-bottom: 20px;
    }
    .message {
      color: #4b5563;
      line-height: 1.8;
      margin-bottom: 30px;
    }
    .info-box {
      background: #f9fafb;
      border-left: 4px solid #2563eb;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
    }
    .info-label {
      color: #6b7280;
      font-weight: 500;
    }
    .info-value {
      color: #111827;
      font-weight: 600;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
      color: white;
      text-decoration: none;
      padding: 16px 40px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      text-align: center;
      margin: 20px 0;
      box-shadow: 0 4px 6px rgba(37, 99, 235, 0.3);
      transition: transform 0.2s;
    }
    .cta-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 8px rgba(37, 99, 235, 0.4);
    }
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    .note {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 16px;
      margin: 20px 0;
      border-radius: 4px;
      font-size: 14px;
      color: #92400e;
    }
    .footer {
      text-align: center;
      padding: 30px;
      color: #6b7280;
      font-size: 14px;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      margin: 5px 0;
    }
    @media only screen and (max-width: 600px) {
      .container {
        margin: 0;
        border-radius: 0;
      }
      .header, .content {
        padding: 30px 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 組織への招待</h1>
      <p>FoodValue AI Management System</p>
    </div>

    <div class="content">
      <div class="greeting">
        こんにちは！
      </div>

      <div class="message">
        <strong>${inviterName}</strong>さんから、<strong>${organizationName}</strong> の
        FoodValue AI Management System への招待が届きました。
      </div>

      <div class="info-box">
        <div class="info-row">
          <span class="info-label">組織名</span>
          <span class="info-value">${organizationName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">招待元</span>
          <span class="info-value">${inviterName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">ロール</span>
          <span class="info-value">${roleLabels[role] || role}</span>
        </div>
      </div>

      <div class="message">
        下のボタンをクリックして、招待を承認し、アカウントを作成してください。
      </div>

      <div class="button-container">
        <a href="${invitationUrl}" class="cta-button">
          招待を承認する
        </a>
      </div>

      <div class="note">
        <strong>⚠️ 重要：</strong>この招待リンクは7日間有効です。期限が切れる前にアカウントを作成してください。
      </div>

      <div class="message" style="font-size: 14px; color: #6b7280; margin-top: 30px;">
        リンクが機能しない場合は、以下のURLをブラウザにコピー＆ペーストしてください：<br>
        <code style="background: #f3f4f6; padding: 8px; display: block; margin-top: 8px; word-break: break-all; border-radius: 4px;">
          ${invitationUrl}
        </code>
      </div>
    </div>

    <div class="footer">
      <p><strong>FoodValue AI Management System</strong></p>
      <p>飲食店経営を AI でサポート</p>
      <p style="margin-top: 15px; font-size: 12px;">
        このメールに心当たりがない場合は、無視してください。
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const result = await sendEmail(email, `【招待】${organizationName} への参加招待`, emailHtml);

    if (!result.success) {
      throw new Error(result.error || 'メール送信に失敗しました');
    }

    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'メール送信中にエラーが発生しました'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});