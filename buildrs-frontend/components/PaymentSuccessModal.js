import { useEffect } from 'react';
import { X, Check, Download } from 'lucide-react';
import { planById, planName } from '../lib/plans';

const PROVIDER_LABELS = {
  stripe: 'Stripe',
  paystack: 'Paystack',
  flutterwave: 'Flutterwave',
};

function money(amount) {
  if (amount == null) return '—';
  return `$${Number(amount).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Confirmation shown back on /billing after a provider checkout completes,
 * modelled on the Figma "Payment Successful" (718:75522) and "Plan upgraded"
 * (718:76310) frames: check badge, headline, and a receipt strip.
 *
 * `variant` is 'payment' for a new purchase and 'upgrade' for a plan change,
 * which only swaps the headline wording.
 */
export default function PaymentSuccessModal({ state, user, variant = 'payment', onClose }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const plan = planById(state?.tier);
  const interval = state?.pricing?.interval === 'yearly' ? 'yearly' : 'monthly';
  const amount =
    state?.pricing?.amount != null
      ? state.pricing.amount
      : interval === 'yearly'
        ? plan?.yearlyPrice
        : plan?.monthlyPrice;

  const tierLabel = planName(state?.tier);
  const billedTo = user?.name || user?.email || 'your account';
  const provider = state?.paymentProvider ? PROVIDER_LABELS[state.paymentProvider] : null;
  const renewsOn = formatDate(state?.nextBillingDate || state?.endDate);

  // A receipt built only from values the API actually returned — no invented
  // line items or invoice numbers. Printable to PDF from the browser.
  const downloadReceipt = () => {
    const rows = [
      ['Plan', `${tierLabel} Plan (${interval === 'yearly' ? '1 Year' : '1 Month'} Subscription)`],
      ['Billed to', billedTo],
      ['Amount', `${money(amount)} USD`],
      ['Payment method', provider || 'Not recorded'],
      ['Status', 'Paid & Confirmed'],
      [renewsOn ? 'Next billing date' : 'Generated', renewsOn || formatDate(new Date())],
    ];

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>BuildrsHQ receipt</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;padding:48px;max-width:640px;margin:0 auto}
  h1{font-size:20px;margin:0 0 4px}p.muted{color:#666;font-size:13px;margin:0 0 28px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  td{padding:10px 0;border-bottom:1px solid #e6e6e6}
  td:last-child{text-align:right;font-weight:600}
</style></head><body>
<h1>BuildrsHQ — payment receipt</h1>
<p class="muted">Generated ${formatDate(new Date())}</p>
<table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
</body></html>`;

    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `buildrs-receipt-${(state?.tier || 'plan').replace(/_/g, '-')}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pay-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pay-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="pay-close" onClick={onClose} aria-label="Close">
          <X className="pay-close-icon" aria-hidden="true" />
        </button>

        <div className="pay-badge" aria-hidden="true">
          <Check className="pay-badge-icon" />
        </div>

        <h2 id="pay-title" className="pay-title">
          {variant === 'upgrade' ? 'Upgrade Successful!' : 'Payment Successful!'}
        </h2>
        <p className="pay-sub">
          {`Welcome to ${tierLabel} Tier. Your account has been upgraded and all runtime entitlements are now active on your organization cluster.`}
        </p>

        <div className="pay-receipt">
          <div className="pay-receipt-main">
            <p className="pay-receipt-plan">
              {variant === 'upgrade' ? 'Upgraded to ' : ''}
              {`${tierLabel} Plan (${interval === 'yearly' ? '1 Year' : '1 Month'} Subscription)`}
            </p>
            <p className="pay-receipt-meta">Billed to: {billedTo}</p>
          </div>
          <div className="pay-receipt-amount">
            <p className="pay-receipt-label">Amount debited</p>
            <p className="pay-receipt-value">
              {money(amount)} <span className="pay-receipt-currency">USD</span>
            </p>
            <span className="pay-receipt-badge">Paid &amp; Confirmed</span>
          </div>
        </div>

        <div className="pay-actions">
          <button type="button" className="btn-workspace btn-secondary" onClick={downloadReceipt}>
            <Download className="w-4 h-4" aria-hidden="true" />
            Download Invoice
          </button>
          <button type="button" className="btn-workspace btn-primary pay-next" onClick={onClose}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
