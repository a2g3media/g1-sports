// POOLVAULT Email Templates
// Professional, branded email templates for receipt delivery

interface ReceiptEmailData {
  receiptCode: string;
  leagueName: string;
  sportName: string;
  periodId: string;
  pickCount: number;
  submittedAt: string;
  payloadHash: string;
  picks: Array<{
    eventName: string;
    pickValue: string;
    confidenceRank?: number;
  }>;
  userName: string;
  verifyUrl: string;
}

interface DeadlineReminderData {
  userName: string;
  leagueName: string;
  sportName: string;
  periodId: string;
  deadline: string;
  picksUrl: string;
  eventsCount: number;
}

interface EliminationAlertData {
  userName: string;
  leagueName: string;
  sportName: string;
  periodId: string;
  eliminationGame: string;
  finalScore: string;
  dashboardUrl: string;
}

// Brand colors
const BRAND = {
  primary: "#6366f1", // indigo-500
  primaryDark: "#4f46e5", // indigo-600
  success: "#22c55e", // green-500
  warning: "#f59e0b", // amber-500
  danger: "#ef4444", // red-500
  dark: "#18181b", // zinc-900
  muted: "#71717a", // zinc-500
  light: "#fafafa", // zinc-50
  border: "#e4e4e7", // zinc-200
};

// Shared email wrapper
function emailWrapper(content: string, preheader: string = ""): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>POOLVAULT</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap');
    
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: ${BRAND.light};
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    
    .wrapper {
      width: 100%;
      background-color: ${BRAND.light};
      padding: 40px 20px;
    }
    
    .container {
      max-width: 560px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
    }
    
    .header {
      background: linear-gradient(135deg, ${BRAND.dark} 0%, #27272a 100%);
      padding: 32px;
      text-align: center;
    }
    
    .logo {
      display: inline-flex;
      align-items: center;
      gap: 12px;
    }
    
    .logo-icon {
      width: 40px;
      height: 40px;
    }
    
    .logo-text {
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 1px;
    }
    
    .content {
      padding: 32px;
    }
    
    .title {
      font-size: 24px;
      font-weight: 700;
      color: ${BRAND.dark};
      margin: 0 0 8px 0;
    }
    
    .subtitle {
      font-size: 14px;
      color: ${BRAND.muted};
      margin: 0 0 24px 0;
    }
    
    .receipt-card {
      background: linear-gradient(to bottom right, ${BRAND.light}, #f4f4f5);
      border: 1px solid ${BRAND.border};
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    
    .receipt-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
      border-bottom: 1px solid ${BRAND.border};
      padding-bottom: 16px;
    }
    
    .receipt-code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 18px;
      font-weight: 600;
      color: ${BRAND.dark};
      letter-spacing: 1px;
    }
    
    .verified-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: linear-gradient(135deg, ${BRAND.success}20, ${BRAND.success}10);
      border: 1px solid ${BRAND.success}40;
      color: ${BRAND.success};
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 20px;
    }
    
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid ${BRAND.border}80;
    }
    
    .detail-row:last-child {
      border-bottom: none;
    }
    
    .detail-label {
      font-size: 13px;
      color: ${BRAND.muted};
    }
    
    .detail-value {
      font-size: 13px;
      font-weight: 500;
      color: ${BRAND.dark};
    }
    
    .hash-section {
      background: ${BRAND.dark};
      border-radius: 8px;
      padding: 16px;
      margin-top: 20px;
    }
    
    .hash-label {
      font-size: 10px;
      font-weight: 600;
      color: ${BRAND.muted};
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    
    .hash-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: #4ade80;
      word-break: break-all;
      line-height: 1.6;
    }
    
    .picks-section {
      margin-top: 24px;
    }
    
    .picks-title {
      font-size: 14px;
      font-weight: 600;
      color: ${BRAND.dark};
      margin-bottom: 12px;
    }
    
    .pick-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #ffffff;
      border: 1px solid ${BRAND.border};
      border-radius: 8px;
      margin-bottom: 8px;
    }
    
    .pick-event {
      font-size: 13px;
      color: ${BRAND.muted};
    }
    
    .pick-value {
      font-size: 13px;
      font-weight: 600;
      color: ${BRAND.dark};
    }
    
    .confidence-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: linear-gradient(135deg, ${BRAND.primary}, ${BRAND.primaryDark});
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      border-radius: 6px;
      margin-left: 8px;
    }
    
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, ${BRAND.primary}, ${BRAND.primaryDark});
      color: #ffffff !important;
      font-size: 14px;
      font-weight: 600;
      padding: 14px 28px;
      border-radius: 10px;
      text-decoration: none;
      text-align: center;
      margin-top: 24px;
    }
    
    .cta-button-secondary {
      display: inline-block;
      background: #ffffff;
      border: 1px solid ${BRAND.border};
      color: ${BRAND.dark} !important;
      font-size: 14px;
      font-weight: 500;
      padding: 12px 24px;
      border-radius: 10px;
      text-decoration: none;
      text-align: center;
      margin-top: 12px;
    }
    
    .footer {
      background: ${BRAND.light};
      padding: 24px 32px;
      text-align: center;
      border-top: 1px solid ${BRAND.border};
    }
    
    .footer-text {
      font-size: 12px;
      color: ${BRAND.muted};
      margin: 0;
      line-height: 1.6;
    }
    
    .footer-links {
      margin-top: 16px;
    }
    
    .footer-link {
      font-size: 12px;
      color: ${BRAND.primary};
      text-decoration: none;
      margin: 0 8px;
    }
    
    .alert-banner {
      padding: 16px 24px;
      border-radius: 10px;
      margin-bottom: 24px;
    }
    
    .alert-warning {
      background: linear-gradient(135deg, ${BRAND.warning}15, ${BRAND.warning}08);
      border: 1px solid ${BRAND.warning}30;
    }
    
    .alert-danger {
      background: linear-gradient(135deg, ${BRAND.danger}15, ${BRAND.danger}08);
      border: 1px solid ${BRAND.danger}30;
    }
    
    .alert-success {
      background: linear-gradient(135deg, ${BRAND.success}15, ${BRAND.success}08);
      border: 1px solid ${BRAND.success}30;
    }
    
    .alert-icon {
      width: 20px;
      height: 20px;
      margin-right: 12px;
      vertical-align: middle;
    }
    
    .alert-text {
      font-size: 14px;
      font-weight: 500;
    }
    
    .preheader {
      display: none !important;
      visibility: hidden;
      opacity: 0;
      color: transparent;
      height: 0;
      width: 0;
      max-height: 0;
      max-width: 0;
      overflow: hidden;
      mso-hide: all;
    }
    
    @media only screen and (max-width: 600px) {
      .wrapper {
        padding: 20px 12px;
      }
      .content {
        padding: 24px 20px;
      }
      .header {
        padding: 24px 20px;
      }
      .receipt-card {
        padding: 20px 16px;
      }
    }
  </style>
</head>
<body>
  <span class="preheader">${preheader}</span>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo">
          <svg class="logo-icon" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="8" fill="url(#gradient)"/>
            <path d="M20 8L28 14V26L20 32L12 26V14L20 8Z" stroke="white" stroke-width="2" fill="none"/>
            <circle cx="20" cy="20" r="4" fill="white"/>
            <defs>
              <linearGradient id="gradient" x1="0" y1="0" x2="40" y2="40">
                <stop offset="0%" stop-color="${BRAND.primary}"/>
                <stop offset="100%" stop-color="${BRAND.primaryDark}"/>
              </linearGradient>
            </defs>
          </svg>
          <span class="logo-text">POOLVAULT</span>
        </div>
      </div>
      ${content}
      <div class="footer">
        <p class="footer-text">
          This is an official POOLVAULT receipt confirmation.<br/>
          Your picks are cryptographically secured and tamper-proof.
        </p>
        <div class="footer-links">
          <a href="#" class="footer-link">Dashboard</a>
          <a href="#" class="footer-link">Support</a>
          <a href="#" class="footer-link">Unsubscribe</a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// Receipt Confirmation Email
export function generateReceiptEmail(data: ReceiptEmailData): { subject: string; html: string; text: string } {
  const formattedDate = new Date(data.submittedAt).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const picksHtml = data.picks.slice(0, 10).map(pick => `
    <div class="pick-item">
      <span class="pick-event">${escapeHtml(pick.eventName)}</span>
      <span>
        <span class="pick-value">${escapeHtml(pick.pickValue)}</span>
        ${pick.confidenceRank ? `<span class="confidence-badge">${pick.confidenceRank}</span>` : ""}
      </span>
    </div>
  `).join("");

  const remainingPicks = data.picks.length > 10 ? data.picks.length - 10 : 0;

  const content = `
    <div class="content">
      <h1 class="title">Pick Receipt Confirmed ✓</h1>
      <p class="subtitle">Your picks have been locked and secured.</p>
      
      <div class="receipt-card">
        <div class="receipt-header">
          <div>
            <div style="font-size: 11px; color: ${BRAND.muted}; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Receipt Code</div>
            <div class="receipt-code">${escapeHtml(data.receiptCode)}</div>
          </div>
          <div class="verified-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
            Verified
          </div>
        </div>
        
        <div class="detail-row">
          <span class="detail-label">League</span>
          <span class="detail-value">${escapeHtml(data.leagueName)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Sport</span>
          <span class="detail-value">${escapeHtml(data.sportName)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Period</span>
          <span class="detail-value">${escapeHtml(data.periodId)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Picks Submitted</span>
          <span class="detail-value">${data.pickCount}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Submitted</span>
          <span class="detail-value">${formattedDate}</span>
        </div>
        
        <div class="hash-section">
          <div class="hash-label">SHA-256 Cryptographic Hash</div>
          <div class="hash-value">${escapeHtml(data.payloadHash)}</div>
        </div>
      </div>
      
      ${data.picks.length > 0 ? `
      <div class="picks-section">
        <div class="picks-title">Your Picks</div>
        ${picksHtml}
        ${remainingPicks > 0 ? `<p style="font-size: 12px; color: ${BRAND.muted}; text-align: center; margin-top: 12px;">+ ${remainingPicks} more picks</p>` : ""}
      </div>
      ` : ""}
      
      <div style="text-align: center;">
        <a href="${escapeHtml(data.verifyUrl)}" class="cta-button">View Full Receipt</a>
      </div>
    </div>
  `;

  const text = `
POOLVAULT - Pick Receipt Confirmed

Receipt Code: ${data.receiptCode}
League: ${data.leagueName}
Sport: ${data.sportName}
Period: ${data.periodId}
Picks: ${data.pickCount}
Submitted: ${formattedDate}

SHA-256 Hash:
${data.payloadHash}

${data.picks.length > 0 ? `Your Picks:\n${data.picks.map(p => `- ${p.eventName}: ${p.pickValue}${p.confidenceRank ? ` (Confidence: ${p.confidenceRank})` : ""}`).join("\n")}` : ""}

Verify your receipt: ${data.verifyUrl}

This is an official POOLVAULT receipt confirmation.
Your picks are cryptographically secured and tamper-proof.
  `.trim();

  return {
    subject: `✓ Pick Receipt ${data.receiptCode} - ${data.leagueName}`,
    html: emailWrapper(content, `Your ${data.pickCount} picks for ${data.leagueName} ${data.periodId} are locked and verified.`),
    text,
  };
}

// Deadline Reminder Email
export function generateDeadlineReminderEmail(data: DeadlineReminderData): { subject: string; html: string; text: string } {
  const deadlineDate = new Date(data.deadline);
  const formattedDeadline = deadlineDate.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const content = `
    <div class="content">
      <div class="alert-banner alert-warning">
        <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="${BRAND.warning}" stroke-width="2" style="display: inline-block; vertical-align: middle;">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span class="alert-text" style="color: ${BRAND.warning};">Pick deadline approaching</span>
      </div>
      
      <h1 class="title">Don't Miss Your Picks!</h1>
      <p class="subtitle">Hi ${escapeHtml(data.userName)}, your picks are due soon.</p>
      
      <div class="receipt-card">
        <div class="detail-row">
          <span class="detail-label">League</span>
          <span class="detail-value">${escapeHtml(data.leagueName)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Sport</span>
          <span class="detail-value">${escapeHtml(data.sportName)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Period</span>
          <span class="detail-value">${escapeHtml(data.periodId)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Events</span>
          <span class="detail-value">${data.eventsCount} games</span>
        </div>
        <div class="detail-row" style="background: ${BRAND.warning}10; margin: 12px -24px -24px; padding: 16px 24px; border-radius: 0 0 12px 12px;">
          <span class="detail-label" style="font-weight: 600; color: ${BRAND.warning};">Deadline</span>
          <span class="detail-value" style="color: ${BRAND.warning};">${formattedDeadline}</span>
        </div>
      </div>
      
      <div style="text-align: center;">
        <a href="${escapeHtml(data.picksUrl)}" class="cta-button">Make Your Picks Now</a>
      </div>
    </div>
  `;

  const text = `
POOLVAULT - Pick Deadline Reminder

Hi ${data.userName},

Your picks for ${data.leagueName} are due soon!

League: ${data.leagueName}
Sport: ${data.sportName}
Period: ${data.periodId}
Events: ${data.eventsCount} games
Deadline: ${formattedDeadline}

Make your picks now: ${data.picksUrl}

Don't miss the deadline!
  `.trim();

  return {
    subject: `⏰ Picks Due Soon - ${data.leagueName} ${data.periodId}`,
    html: emailWrapper(content, `Deadline: ${formattedDeadline}. Make your picks for ${data.leagueName} before it's too late!`),
    text,
  };
}

// Elimination Alert Email (Survivor)
export function generateEliminationAlertEmail(data: EliminationAlertData): { subject: string; html: string; text: string } {
  const content = `
    <div class="content">
      <div class="alert-banner alert-danger">
        <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="${BRAND.danger}" stroke-width="2" style="display: inline-block; vertical-align: middle;">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <span class="alert-text" style="color: ${BRAND.danger};">Survivor Elimination</span>
      </div>
      
      <h1 class="title">You've Been Eliminated</h1>
      <p class="subtitle">Hi ${escapeHtml(data.userName)}, your survivor run has ended.</p>
      
      <div class="receipt-card">
        <div class="detail-row">
          <span class="detail-label">League</span>
          <span class="detail-value">${escapeHtml(data.leagueName)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Sport</span>
          <span class="detail-value">${escapeHtml(data.sportName)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Week</span>
          <span class="detail-value">${escapeHtml(data.periodId)}</span>
        </div>
        <div class="detail-row" style="background: ${BRAND.danger}08; margin: 12px -24px -24px; padding: 16px 24px; border-radius: 0 0 12px 12px;">
          <span class="detail-label" style="color: ${BRAND.danger};">Elimination Game</span>
          <span class="detail-value" style="color: ${BRAND.danger};">${escapeHtml(data.eliminationGame)}<br/><span style="font-size: 12px; font-weight: 400;">Final: ${escapeHtml(data.finalScore)}</span></span>
        </div>
      </div>
      
      <p style="font-size: 14px; color: ${BRAND.muted}; text-align: center; margin-top: 24px; line-height: 1.6;">
        Great run! You can still follow the action and see who survives.
        Better luck next season!
      </p>
      
      <div style="text-align: center;">
        <a href="${escapeHtml(data.dashboardUrl)}" class="cta-button-secondary">View Pool Standings</a>
      </div>
    </div>
  `;

  const text = `
POOLVAULT - Survivor Elimination

Hi ${data.userName},

Unfortunately, you've been eliminated from ${data.leagueName}.

League: ${data.leagueName}
Sport: ${data.sportName}
Week: ${data.periodId}
Elimination Game: ${data.eliminationGame}
Final Score: ${data.finalScore}

Great run! You can still follow the action and see who survives.

View standings: ${data.dashboardUrl}
  `.trim();

  return {
    subject: `💀 Eliminated - ${data.leagueName} Survivor`,
    html: emailWrapper(content, `Your survivor run in ${data.leagueName} has ended in ${data.periodId}.`),
    text,
  };
}

// Weekly Results Email
export function generateWeeklyResultsEmail(data: {
  userName: string;
  leagueName: string;
  sportName: string;
  periodId: string;
  correctPicks: number;
  totalPicks: number;
  pointsEarned: number;
  currentRank: number;
  totalPlayers: number;
  topPicks: Array<{ event: string; pick: string; result: "win" | "loss" }>;
  dashboardUrl: string;
}): { subject: string; html: string; text: string } {
  const winRate = data.totalPicks > 0 ? Math.round((data.correctPicks / data.totalPicks) * 100) : 0;
  
  const topPicksHtml = data.topPicks.slice(0, 5).map(pick => `
    <div class="pick-item">
      <span class="pick-event">${escapeHtml(pick.event)}</span>
      <span style="display: flex; align-items: center; gap: 8px;">
        <span class="pick-value">${escapeHtml(pick.pick)}</span>
        <span style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: ${pick.result === "win" ? BRAND.success : BRAND.danger}20; color: ${pick.result === "win" ? BRAND.success : BRAND.danger};">
          ${pick.result === "win" ? "✓" : "✗"}
        </span>
      </span>
    </div>
  `).join("");

  const content = `
    <div class="content">
      <div class="alert-banner alert-success">
        <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="${BRAND.success}" stroke-width="2" style="display: inline-block; vertical-align: middle;">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span class="alert-text" style="color: ${BRAND.success};">${data.periodId} Results Are In</span>
      </div>
      
      <h1 class="title">Your Weekly Results</h1>
      <p class="subtitle">Hi ${escapeHtml(data.userName)}, here's how you did in ${escapeHtml(data.leagueName)}.</p>
      
      <!-- Stats Grid -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px;">
        <div style="background: ${BRAND.light}; border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 16px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: ${BRAND.primary};">${data.correctPicks}/${data.totalPicks}</div>
          <div style="font-size: 11px; color: ${BRAND.muted}; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">Correct</div>
        </div>
        <div style="background: ${BRAND.light}; border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 16px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: ${BRAND.success};">${winRate}%</div>
          <div style="font-size: 11px; color: ${BRAND.muted}; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">Win Rate</div>
        </div>
        <div style="background: ${BRAND.light}; border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 16px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: ${BRAND.dark};">#${data.currentRank}</div>
          <div style="font-size: 11px; color: ${BRAND.muted}; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">of ${data.totalPlayers}</div>
        </div>
      </div>
      
      <div style="background: linear-gradient(135deg, ${BRAND.primary}10, ${BRAND.primaryDark}05); border: 1px solid ${BRAND.primary}20; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <div style="font-size: 12px; color: ${BRAND.muted}; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Points Earned</div>
        <div style="font-size: 32px; font-weight: 700; color: ${BRAND.primary};">+${data.pointsEarned}</div>
      </div>
      
      ${data.topPicks.length > 0 ? `
      <div class="picks-section">
        <div class="picks-title">Pick Results</div>
        ${topPicksHtml}
      </div>
      ` : ""}
      
      <div style="text-align: center;">
        <a href="${escapeHtml(data.dashboardUrl)}" class="cta-button">View Full Standings</a>
      </div>
    </div>
  `;

  const text = `
POOLVAULT - ${data.periodId} Results

Hi ${data.userName},

Here's how you did in ${data.leagueName}:

Correct Picks: ${data.correctPicks}/${data.totalPicks} (${winRate}%)
Points Earned: +${data.pointsEarned}
Current Rank: #${data.currentRank} of ${data.totalPlayers}

${data.topPicks.length > 0 ? `Pick Results:\n${data.topPicks.map(p => `- ${p.event}: ${p.pick} ${p.result === "win" ? "✓" : "✗"}`).join("\n")}` : ""}

View full standings: ${data.dashboardUrl}
  `.trim();

  return {
    subject: `📊 ${data.periodId} Results: ${data.correctPicks}/${data.totalPicks} - ${data.leagueName}`,
    html: emailWrapper(content, `You went ${data.correctPicks}/${data.totalPicks} in ${data.leagueName} ${data.periodId}. You're ranked #${data.currentRank}.`),
    text,
  };
}

// Utility function to escape HTML
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// GZ Sports Weekly Recap Email
interface WeeklyRecapEmailData {
  userName: string;
  weekStart: string;
  weekEnd: string;
  totalPools: number;
  totalCorrectPicks: number;
  totalPicks: number;
  overallWinRate: number;
  totalPointsEarned: number;
  poolsImproved: number;
  poolsDeclined: number;
  poolRecaps: Array<{
    leagueName: string;
    sportKey: string;
    correctPicks: number;
    totalPicks: number;
    winPercentage: number;
    currentRank: number;
    totalMembers: number;
    rankChange: number;
    isEliminated?: boolean;
  }>;
  upcomingDeadlines: Array<{
    leagueName: string;
    deadline: string;
    eventsCount: number;
    hasMadePicks: boolean;
  }>;
  coachGInsight?: string;
  dashboardUrl: string;
}

// GZ Sports brand colors
const GZ_BRAND = {
  primary: "#3B82F6", // blue-500
  primaryDark: "#2563EB", // blue-600
  success: "#10B981", // emerald-500
  warning: "#F59E0B", // amber-500
  danger: "#EF4444", // red-500
  dark: "#0F172A", // slate-900
  darkCard: "#1E293B", // slate-800
  muted: "#94A3B8", // slate-400
  light: "#F8FAFC", // slate-50
  border: "#334155", // slate-700
};

// GZ Sports email wrapper
function gzEmailWrapper(content: string, preheader: string = ""): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>GZ Sports</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: ${GZ_BRAND.dark};
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: ${GZ_BRAND.dark};
      padding: 40px 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: ${GZ_BRAND.darkCard};
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid ${GZ_BRAND.border};
    }
    .header {
      background: linear-gradient(135deg, ${GZ_BRAND.dark} 0%, ${GZ_BRAND.darkCard} 100%);
      padding: 32px;
      text-align: center;
      border-bottom: 1px solid ${GZ_BRAND.border};
    }
    .logo-text {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .logo-gz {
      color: ${GZ_BRAND.primary};
    }
    .logo-sports {
      color: #ffffff;
    }
    .content {
      padding: 32px;
    }
    .title {
      font-size: 24px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 8px 0;
    }
    .subtitle {
      font-size: 14px;
      color: ${GZ_BRAND.muted};
      margin: 0 0 24px 0;
    }
    .stats-grid {
      display: table;
      width: 100%;
      margin-bottom: 24px;
    }
    .stats-row {
      display: table-row;
    }
    .stat-box {
      display: table-cell;
      background: ${GZ_BRAND.dark};
      border: 1px solid ${GZ_BRAND.border};
      border-radius: 10px;
      padding: 16px;
      text-align: center;
      width: 33%;
    }
    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: ${GZ_BRAND.primary};
    }
    .stat-label {
      font-size: 11px;
      color: ${GZ_BRAND.muted};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 4px;
    }
    .pool-card {
      background: ${GZ_BRAND.dark};
      border: 1px solid ${GZ_BRAND.border};
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .pool-header {
      display: table;
      width: 100%;
      margin-bottom: 12px;
    }
    .pool-name {
      font-size: 14px;
      font-weight: 600;
      color: #ffffff;
    }
    .pool-sport {
      font-size: 12px;
      color: ${GZ_BRAND.muted};
      text-transform: uppercase;
    }
    .pool-stats {
      display: table;
      width: 100%;
    }
    .pool-stat {
      display: table-cell;
      text-align: center;
    }
    .pool-stat-value {
      font-size: 16px;
      font-weight: 600;
      color: #ffffff;
    }
    .pool-stat-label {
      font-size: 10px;
      color: ${GZ_BRAND.muted};
      text-transform: uppercase;
    }
    .rank-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    .rank-up {
      background: ${GZ_BRAND.success}20;
      color: ${GZ_BRAND.success};
    }
    .rank-down {
      background: ${GZ_BRAND.danger}20;
      color: ${GZ_BRAND.danger};
    }
    .rank-same {
      background: ${GZ_BRAND.muted}20;
      color: ${GZ_BRAND.muted};
    }
    .deadline-item {
      display: table;
      width: 100%;
      padding: 12px 16px;
      background: ${GZ_BRAND.dark};
      border: 1px solid ${GZ_BRAND.border};
      border-radius: 8px;
      margin-bottom: 8px;
    }
    .deadline-league {
      font-size: 13px;
      font-weight: 500;
      color: #ffffff;
    }
    .deadline-time {
      font-size: 12px;
      color: ${GZ_BRAND.warning};
    }
    .coach-card {
      background: linear-gradient(135deg, ${GZ_BRAND.primary}15, ${GZ_BRAND.primary}05);
      border: 1px solid ${GZ_BRAND.primary}30;
      border-radius: 12px;
      padding: 20px;
      margin: 24px 0;
    }
    .coach-header {
      display: table;
      width: 100%;
      margin-bottom: 12px;
    }
    .coach-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      margin-right: 12px;
      vertical-align: middle;
    }
    .coach-name {
      font-size: 14px;
      font-weight: 600;
      color: ${GZ_BRAND.primary};
      vertical-align: middle;
    }
    .coach-text {
      font-size: 14px;
      color: #ffffff;
      line-height: 1.6;
      font-style: italic;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, ${GZ_BRAND.primary}, ${GZ_BRAND.primaryDark});
      color: #ffffff !important;
      font-size: 14px;
      font-weight: 600;
      padding: 14px 28px;
      border-radius: 10px;
      text-decoration: none;
      text-align: center;
    }
    .footer {
      background: ${GZ_BRAND.dark};
      padding: 24px 32px;
      text-align: center;
      border-top: 1px solid ${GZ_BRAND.border};
    }
    .footer-text {
      font-size: 12px;
      color: ${GZ_BRAND.muted};
      margin: 0;
      line-height: 1.6;
    }
    .footer-link {
      font-size: 12px;
      color: ${GZ_BRAND.primary};
      text-decoration: none;
      margin: 0 8px;
    }
    .preheader {
      display: none !important;
      visibility: hidden;
      opacity: 0;
      color: transparent;
      height: 0;
      width: 0;
      max-height: 0;
      max-width: 0;
      overflow: hidden;
    }
    @media only screen and (max-width: 600px) {
      .wrapper { padding: 20px 12px; }
      .content { padding: 24px 20px; }
      .header { padding: 24px 20px; }
    }
  </style>
</head>
<body>
  <span class="preheader">${preheader}</span>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <span class="logo-text">
          <span class="logo-gz">GZ</span>
          <span class="logo-sports"> Sports</span>
        </span>
      </div>
      ${content}
      <div class="footer">
        <p class="footer-text">
          You're receiving this because you're subscribed to weekly recaps.<br/>
          <a href="#" class="footer-link">Unsubscribe</a> | <a href="#" class="footer-link">Manage Preferences</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function generateWeeklyRecapEmail(data: WeeklyRecapEmailData): { subject: string; html: string; text: string } {
  const weekRange = `${new Date(data.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${new Date(data.weekEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  
  // Build pool cards HTML
  const poolCardsHtml = data.poolRecaps.slice(0, 5).map(pool => {
    const rankBadgeClass = pool.rankChange > 0 ? "rank-up" : pool.rankChange < 0 ? "rank-down" : "rank-same";
    const rankChangeText = pool.rankChange > 0 ? `↑${pool.rankChange}` : pool.rankChange < 0 ? `↓${Math.abs(pool.rankChange)}` : "—";
    
    return `
    <div class="pool-card">
      <div class="pool-header">
        <span class="pool-name">${escapeHtml(pool.leagueName)}</span>
        <span class="pool-sport">${escapeHtml(pool.sportKey.toUpperCase())}</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="flex: 1;">
          <div style="font-size: 20px; font-weight: 700; color: ${pool.winPercentage >= 60 ? GZ_BRAND.success : pool.winPercentage >= 40 ? "#ffffff" : GZ_BRAND.danger};">${pool.correctPicks}/${pool.totalPicks}</div>
          <div style="font-size: 10px; color: ${GZ_BRAND.muted}; text-transform: uppercase;">CORRECT</div>
        </div>
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 20px; font-weight: 700; color: #ffffff;">#${pool.currentRank}</div>
          <div style="font-size: 10px; color: ${GZ_BRAND.muted}; text-transform: uppercase;">OF ${pool.totalMembers}</div>
        </div>
        <div style="flex: 1; text-align: right;">
          <span class="rank-badge ${rankBadgeClass}">${rankChangeText}</span>
        </div>
      </div>
      ${pool.isEliminated ? `<div style="margin-top: 8px; padding: 8px; background: ${GZ_BRAND.danger}20; border-radius: 6px; text-align: center; font-size: 12px; color: ${GZ_BRAND.danger};">💀 Eliminated</div>` : ""}
    </div>
  `;
  }).join("");
  
  // Build deadlines HTML
  const deadlinesHtml = data.upcomingDeadlines.length > 0 ? `
    <div style="margin-top: 24px;">
      <div style="font-size: 14px; font-weight: 600; color: #ffffff; margin-bottom: 12px;">📅 Upcoming Deadlines</div>
      ${data.upcomingDeadlines.map(d => {
        const deadlineDate = new Date(d.deadline);
        return `
        <div class="deadline-item">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span class="deadline-league">${escapeHtml(d.leagueName)}</span>
            <span class="deadline-time">${deadlineDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
          </div>
          <div style="font-size: 11px; color: ${GZ_BRAND.muted}; margin-top: 4px;">${d.eventsCount} games • ${d.hasMadePicks ? "✓ Picks made" : "⚠️ No picks yet"}</div>
        </div>
      `;
      }).join("")}
    </div>
  ` : "";
  
  // Coach G insight card
  const coachGHtml = data.coachGInsight ? `
    <div class="coach-card">
      <div style="margin-bottom: 12px;">
        <span style="font-size: 14px; font-weight: 600; color: ${GZ_BRAND.primary};">🎯 Coach G's Take</span>
      </div>
      <div class="coach-text">"${escapeHtml(data.coachGInsight)}"</div>
    </div>
  ` : "";
  
  const content = `
    <div class="content">
      <h1 class="title">Your Week in Review</h1>
      <p class="subtitle">${weekRange} • ${data.totalPools} active pool${data.totalPools !== 1 ? "s" : ""}</p>
      
      <!-- Stats Summary -->
      <div style="display: flex; gap: 12px; margin-bottom: 24px;">
        <div style="flex: 1; background: ${GZ_BRAND.dark}; border: 1px solid ${GZ_BRAND.border}; border-radius: 10px; padding: 16px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: ${GZ_BRAND.primary};">${data.totalCorrectPicks}/${data.totalPicks}</div>
          <div style="font-size: 11px; color: ${GZ_BRAND.muted}; text-transform: uppercase; margin-top: 4px;">Total Record</div>
        </div>
        <div style="flex: 1; background: ${GZ_BRAND.dark}; border: 1px solid ${GZ_BRAND.border}; border-radius: 10px; padding: 16px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: ${data.overallWinRate >= 50 ? GZ_BRAND.success : GZ_BRAND.danger};">${data.overallWinRate}%</div>
          <div style="font-size: 11px; color: ${GZ_BRAND.muted}; text-transform: uppercase; margin-top: 4px;">Win Rate</div>
        </div>
        <div style="flex: 1; background: ${GZ_BRAND.dark}; border: 1px solid ${GZ_BRAND.border}; border-radius: 10px; padding: 16px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #ffffff;">+${data.totalPointsEarned}</div>
          <div style="font-size: 11px; color: ${GZ_BRAND.muted}; text-transform: uppercase; margin-top: 4px;">Points</div>
        </div>
      </div>
      
      ${data.poolsImproved > 0 || data.poolsDeclined > 0 ? `
      <div style="display: flex; gap: 12px; margin-bottom: 24px;">
        ${data.poolsImproved > 0 ? `<div style="flex: 1; background: ${GZ_BRAND.success}15; border: 1px solid ${GZ_BRAND.success}30; border-radius: 8px; padding: 12px; text-align: center;">
          <span style="font-size: 14px; color: ${GZ_BRAND.success};">↑ ${data.poolsImproved} pool${data.poolsImproved !== 1 ? "s" : ""} improved</span>
        </div>` : ""}
        ${data.poolsDeclined > 0 ? `<div style="flex: 1; background: ${GZ_BRAND.danger}15; border: 1px solid ${GZ_BRAND.danger}30; border-radius: 8px; padding: 12px; text-align: center;">
          <span style="font-size: 14px; color: ${GZ_BRAND.danger};">↓ ${data.poolsDeclined} pool${data.poolsDeclined !== 1 ? "s" : ""} dropped</span>
        </div>` : ""}
      </div>
      ` : ""}
      
      ${data.poolRecaps.length > 0 ? `
      <div style="margin-bottom: 24px;">
        <div style="font-size: 14px; font-weight: 600; color: #ffffff; margin-bottom: 12px;">🏆 Pool Breakdown</div>
        ${poolCardsHtml}
      </div>
      ` : ""}
      
      ${coachGHtml}
      ${deadlinesHtml}
      
      <div style="text-align: center; margin-top: 32px;">
        <a href="${escapeHtml(data.dashboardUrl)}" class="cta-button">View Full Dashboard</a>
      </div>
    </div>
  `;
  
  // Plain text version
  const text = `
GZ SPORTS - Weekly Recap
${weekRange}

Hi ${data.userName},

YOUR WEEK AT A GLANCE
---------------------
Total Record: ${data.totalCorrectPicks}/${data.totalPicks} (${data.overallWinRate}%)
Points Earned: +${data.totalPointsEarned}
Active Pools: ${data.totalPools}

${data.poolRecaps.length > 0 ? `POOL BREAKDOWN
--------------
${data.poolRecaps.map(p => `${p.leagueName} (${p.sportKey.toUpperCase()}): ${p.correctPicks}/${p.totalPicks} • Rank #${p.currentRank}/${p.totalMembers}${p.rankChange !== 0 ? ` (${p.rankChange > 0 ? "↑" : "↓"}${Math.abs(p.rankChange)})` : ""}`).join("\n")}` : ""}

${data.upcomingDeadlines.length > 0 ? `UPCOMING DEADLINES
------------------
${data.upcomingDeadlines.map(d => `${d.leagueName}: ${new Date(d.deadline).toLocaleDateString()} (${d.eventsCount} games)`).join("\n")}` : ""}

${data.coachGInsight ? `COACH G SAYS
------------
"${data.coachGInsight}"` : ""}

View your dashboard: ${data.dashboardUrl}

---
You're receiving this because you're subscribed to weekly recaps.
  `.trim();
  
  return {
    subject: `📊 Your Week: ${data.totalCorrectPicks}/${data.totalPicks} (${data.overallWinRate}%) - GZ Sports`,
    html: gzEmailWrapper(content, `You went ${data.totalCorrectPicks}/${data.totalPicks} this week across ${data.totalPools} pools.`),
    text,
  };
}

// Export types for use in worker
export type { ReceiptEmailData, DeadlineReminderData, EliminationAlertData, WeeklyRecapEmailData };
