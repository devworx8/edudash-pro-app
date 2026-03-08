/**
 * Card PDF Generator
 * Generates HTML for printing ID cards
 */
import { CARD_TEMPLATES, CardTemplate, OrganizationMember, MemberIDCard } from '@/components/membership/types';

export function generateCardPrintHTML(
  member: OrganizationMember,
  card: MemberIDCard,
  template: CardTemplate
): string {
  const config = CARD_TEMPLATES[template];
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page { size: 85.6mm 53.98mm; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; }
        .card {
          width: 85.6mm;
          height: 53.98mm;
          border-radius: 3mm;
          overflow: hidden;
          background: ${config.backgroundColor};
          position: relative;
          page-break-after: always;
        }
        .header {
          background: linear-gradient(90deg, ${config.gradientColors[0]}, ${config.gradientColors[1]});
          padding: 3mm;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .org-name {
          color: white;
          font-size: 4mm;
          font-weight: bold;
          letter-spacing: 0.5mm;
        }
        .card-type {
          color: rgba(255,255,255,0.8);
          font-size: 2mm;
          letter-spacing: 0.5mm;
        }
        .status-badge {
          background: ${member.membership_status === 'active' ? '#10B981' : '#F59E0B'};
          color: white;
          padding: 1mm 2mm;
          border-radius: 2mm;
          font-size: 2mm;
          font-weight: bold;
        }
        .content {
          display: flex;
          padding: 3mm;
          height: calc(100% - 16mm);
        }
        .photo-section {
          width: 20mm;
          text-align: center;
        }
        .photo {
          width: 18mm;
          height: 24mm;
          border: 0.5mm solid ${config.primaryColor};
          border-radius: 1mm;
          background: ${config.primaryColor}15;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${config.primaryColor};
          font-size: 10mm;
        }
        .tier-badge {
          background: ${config.accentColor}30;
          color: ${config.primaryColor};
          font-size: 2mm;
          padding: 0.5mm 1.5mm;
          border-radius: 1.5mm;
          margin-top: 1mm;
          display: inline-block;
        }
        .info-section {
          flex: 1;
          padding-left: 3mm;
        }
        .member-name {
          font-size: 4mm;
          font-weight: bold;
          color: ${config.textColor};
        }
        .member-type {
          font-size: 2.5mm;
          color: ${config.primaryColor};
          font-weight: 600;
          margin-bottom: 2mm;
        }
        .info-row {
          margin-bottom: 1.5mm;
        }
        .info-label {
          font-size: 2mm;
          color: #9CA3AF;
          letter-spacing: 0.3mm;
        }
        .info-value {
          font-size: 2.5mm;
          color: ${config.textColor};
          font-weight: 600;
        }
        .qr-section {
          width: 18mm;
          text-align: center;
        }
        .qr-placeholder {
          width: 16mm;
          height: 16mm;
          background: white;
          border-radius: 1mm;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 8mm;
          box-shadow: 0 0.5mm 1mm rgba(0,0,0,0.1);
        }
        .qr-label {
          font-size: 1.5mm;
          color: #9CA3AF;
          margin-top: 1mm;
        }
        .bottom-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: ${config.primaryColor}10;
          padding: 1.5mm 3mm;
          display: flex;
          justify-content: space-between;
          font-size: 2mm;
        }
        .card-number {
          color: ${config.textColor};
          font-weight: 500;
        }
        .issue-date {
          color: ${config.textColor}80;
        }
        
        /* Back of card */
        .card-back {
          background: ${config.backgroundColor};
        }
        .magnetic-strip {
          height: 8mm;
          background: ${config.primaryColor};
          margin-top: 4mm;
        }
        .barcode-section {
          text-align: center;
          padding: 3mm;
        }
        .barcode {
          font-family: 'Libre Barcode 39', monospace;
          font-size: 10mm;
          letter-spacing: 2mm;
        }
        .barcode-text {
          font-size: 2mm;
          letter-spacing: 0.5mm;
          color: #374151;
        }
        .back-info {
          padding: 2mm 4mm;
          text-align: center;
        }
        .back-title {
          color: ${config.primaryColor};
          font-size: 2.5mm;
          font-weight: bold;
          margin-bottom: 1mm;
        }
        .back-text {
          color: #6B7280;
          font-size: 2mm;
          line-height: 1.4;
        }
        .terms {
          padding: 2mm 4mm;
          text-align: center;
        }
        .terms-text {
          color: #9CA3AF;
          font-size: 1.5mm;
          line-height: 1.4;
        }
        .signature-strip {
          margin: 2mm 4mm;
          height: 6mm;
          background: #F3F4F6;
          border-radius: 1mm;
          display: flex;
          align-items: flex-end;
          padding: 0.5mm 2mm;
        }
        .signature-label {
          font-size: 1.5mm;
          color: #9CA3AF;
        }
        .website {
          text-align: center;
          padding-bottom: 2mm;
        }
        .website-text {
          color: ${config.primaryColor};
          font-size: 2mm;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <!-- Front of Card -->
      <div class="card">
        <div class="header">
          <div>
            <div class="org-name">${member.organization?.name || 'SOIL OF AFRICA'}</div>
            <div class="card-type">MEMBERSHIP CARD</div>
          </div>
          <div class="status-badge">${member.membership_status.toUpperCase()}</div>
        </div>
        <div class="content">
          <div class="photo-section">
            <div class="photo">👤</div>
            <div class="tier-badge">${member.membership_tier.toUpperCase()}</div>
          </div>
          <div class="info-section">
            <div class="member-name">${member.first_name} ${member.last_name}</div>
            <div class="member-type">${member.member_type.charAt(0).toUpperCase() + member.member_type.slice(1)}</div>
            <div class="info-row">
              <div class="info-label">MEMBER NO.</div>
              <div class="info-value">${member.member_number}</div>
            </div>
            <div class="info-row">
              <div class="info-label">REGION</div>
              <div class="info-value">${member.region?.name || 'N/A'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">VALID UNTIL</div>
              <div class="info-value">${new Date(card.expiry_date).toLocaleDateString('en-ZA', { month: '2-digit', year: '2-digit' })}</div>
            </div>
          </div>
          <div class="qr-section">
            <div class="qr-placeholder">📱</div>
            <div class="qr-label">SCAN TO VERIFY</div>
          </div>
        </div>
        <div class="bottom-bar">
          <span class="card-number">Card: ${card.card_number}</span>
          <span class="issue-date">Issued: ${new Date(card.issue_date).toLocaleDateString('en-ZA')}</span>
        </div>
      </div>
      
      <!-- Back of Card -->
      <div class="card card-back">
        <div class="magnetic-strip"></div>
        <div class="barcode-section">
          <div class="barcode">||| |||| ||| | |||</div>
          <div class="barcode-text">${member.member_number}</div>
        </div>
        <div class="back-info">
          <div class="back-title">EMERGENCY CONTACT</div>
          <div class="back-text">
            Contact the nearest regional office<br>
            or call: 0800-SOA-HELP (0800-762-4357)
          </div>
        </div>
        <div class="terms">
          <div class="terms-text">
            This card remains the property of ${member.organization?.name || 'EduPro'}.<br>
            If found, please return to the nearest branch or mail to:<br>
            P.O. Box 12345, Johannesburg, 2000
          </div>
        </div>
        <div class="signature-strip">
          <span class="signature-label">AUTHORIZED SIGNATURE</span>
        </div>
        <div class="website">
          <span class="website-text">www.soilofafrica.org</span>
        </div>
      </div>
    </body>
    </html>
  `;
}
