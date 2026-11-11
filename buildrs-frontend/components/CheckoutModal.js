import { useState, useEffect } from 'react';
import { X, CreditCard, Loader2, Zap, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { PLANS, planById } from '../lib/plans';

const PAYMENT_PROVIDERS = [
  {
    id: 'stripe',
    name: 'Card',
    desc: 'Secure payment powered by Stripe',
    icon: CreditCard,
  },
  {
    id: 'paystack',
    name: 'Paystack',
    desc: 'Card, bank transfer, mobile money',
    icon: Zap,
  },
  {
    id: 'flutterwave',
    name: 'Flutterwave',
    desc: 'Card, bank, USSD, mobile money',
    icon: Zap,
  },
];

const PROVIDER_LABELS = {
  stripe: 'Card (Stripe)',
  paystack: 'Paystack',
  flutterwave: 'Flutterwave',
};

const PROVIDER_NAMES = {
  stripe: 'Stripe',
  paystack: 'Paystack',
  flutterwave: 'Flutterwave',
};

function money(amount) {
  if (amount == null) return 'Custom';
  return `$${Number(amount).toFixed(2)}`;
}

/**
 * In-page checkout, modelled on the Figma "Upgrade plan" frame (718:75860):
 * current plan strip, plan + duration pickers, payment gateway choice and an
 * order summary. Reuses the same providers and endpoints as /checkout, but the
 * billing page never navigates away from itself to start a purchase.
 */
export default function CheckoutModal({ planId, interval: initialInterval, state, user, onClose, toast }) {
  const [selectedPlan, setSelectedPlan] = useState(planId || 'pro');
  const [interval, setInterval] = useState(initialInterval === 'yearly' ? 'yearly' : 'monthly');
  const [provider, setProvider] = useState('stripe');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelectedPlan(planId || 'pro');
  }, [planId]);

  useEffect(() => {
    if (initialInterval) setInterval(initialInterval === 'yearly' ? 'yearly' : 'monthly');
  }, [initialInterval]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [busy, onClose]);

  const plan = planById(selectedPlan) || PLANS[0];
  const isEnterprise = selectedPlan === 'enterprise';
  const perSeat = Boolean(plan.perSeat);

  const monthlyEquivalent = isEnterprise
    ? null
    : interval === 'yearly'
    ? Math.round(plan.yearlyPrice / 12)
    : plan.monthlyPrice;
  const total = isEnterprise
    ? null
    : interval === 'yearly'
    ? plan.yearlyPrice
    : plan.monthlyPrice;

  const startCheckout = async () => {
    if (isEnterprise) {
      window.location.href = '/contact?topic=enterprise-billing';
      return;
    }

    setBusy(true);
    try {
      if (provider === 'stripe') {
        const data = await apiFetch('/api/v1/billing/subscription/create-checkout', {
          method: 'POST',
          body: JSON.stringify({ tier: selectedPlan, interval }),
        });
        if (data.url) {
          window.location.href = data.url;
          return;
        }
        if (data.contactSales) {
          window.location.href = '/contact?topic=enterprise-billing';
          return;
        }
        toast.error(data.message || 'Could not start secure checkout');
      } else if (provider === 'paystack') {
        const data = await apiFetch('/api/v1/billing/paystack/initialize', {
          method: 'POST',
          body: JSON.stringify({
            email: user?.email,
            amount: Math.round(total * 100),
            plan: selectedPlan,
          }),
        });
        const url = data.authorization_url || data.authorizationUrl || data.data?.authorization_url;
        if (url) {
          window.location.href = url;
          return;
        }
        toast.error('Could not start Paystack checkout');
      } else {
        const data = await apiFetch('/api/v1/billing/flutterwave/initialize', {
          method: 'POST',
          body: JSON.stringify({ email: user?.email, amount: total, plan: selectedPlan }),
        });
        if (data?.data?.link) {
          window.location.href = data.data.link;
          return;
        }
        toast.error('Could not start Flutterwave checkout');
      }
    } catch (err) {
      toast.error(err.message || 'Checkout failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chk-backdrop" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="chk-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chk-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="chk-head">
          <div>
            <h2 id="chk-title" className="chk-title">Upgrade Plan</h2>
            <p className="chk-sub">Select a membership</p>
          </div>
          <button
            type="button"
            className="chk-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close checkout"
          >
            <X className="chk-close-icon" aria-hidden="true" />
          </button>
        </header>

        {/* Current plan */}
        <div className="chk-current">
          <p className="chk-eyebrow">Current plan</p>
          <div className="chk-current-row">
            <span className="chk-current-name">{planById(state?.tier)?.name || 'Free'}</span>
            <span className="chk-current-price">
              $
              {state?.pricing?.amount != null
                ? state.pricing.amount
                : planById(state?.tier)?.monthlyPrice ?? 0}
              <span className="chk-muted">
                {state?.pricing?.interval === 'yearly' ? '/yr' : '/mo'}
              </span>
            </span>
          </div>
          <div className="chk-current-row chk-muted">
            <span>
              {state?.nextBillingDate || state?.endDate
                ? `Next billing: ${new Date(state.nextBillingDate || state.endDate).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}`
                : state?.isFree
                ? 'Free forever'
                : 'No renewal scheduled'}
            </span>
            <span>
              {state?.paymentProvider
                ? `Paid via ${PROVIDER_LABELS[state.paymentProvider] || state.paymentProvider}`
                : 'No card on file'}
            </span>
          </div>
        </div>

        {/* Plan + duration */}
        <section className="chk-section">
          <h3 className="chk-section-title">Choose Plan</h3>
          <p className="chk-sub">Choose your preferred plan</p>

          <div className="chk-field">
            <label className="chk-label" htmlFor="chk-plan">Choose Plan</label>
            <select
              id="chk-plan"
              className="chk-select"
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value)}
              disabled={busy}
            >
              {PLANS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.contactSales
                    ? ' — Custom'
                    : ` — $${interval === 'yearly' ? option.yearlyPrice : option.monthlyPrice}${
                        option.perSeat ? '/seat' : ''
                      }/${interval === 'yearly' ? 'yr' : 'mo'}`}
                </option>
              ))}
            </select>
          </div>

          <div className="chk-field">
            <label className="chk-label" htmlFor="chk-duration">Duration</label>
            <select
              id="chk-duration"
              className="chk-select"
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              disabled={busy}
            >
              <option value="monthly">1 month</option>
              <option value="yearly">1 year</option>
            </select>
          </div>
        </section>

        {/* Payment method */}
        <section className="chk-section">
          <h3 className="chk-section-title">Payment Methods &amp; Checkout</h3>
          <p className="chk-sub">Choose a preferred payment gateway and proceed</p>

          <div className="chk-providers" role="radiogroup" aria-label="Payment method">
            {PAYMENT_PROVIDERS.map(({ id, name, desc, icon: Icon }) => {
              const active = provider === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`chk-provider ${active ? 'is-active' : ''}`}
                  onClick={() => setProvider(id)}
                  disabled={busy}
                >
                  <span className="chk-provider-icon">
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span className="chk-provider-copy">
                    <span className="chk-provider-name">{name}</span>
                    <span className="chk-provider-desc">{desc}</span>
                  </span>
                  <span className={`chk-radio ${active ? 'is-active' : ''}`} aria-hidden="true">
                    {active && <span className="chk-radio-dot" />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Summary */}
        <section className="chk-section chk-section-last">
          <h3 className="chk-section-title">Confirm and Checkout</h3>
          <p className="chk-sub">Review your subscription details before confirming your purchase</p>

          <dl className="chk-summary">
            <div>
              <dt>Plan type</dt>
              <dd>{plan.name}</dd>
            </div>
            <div>
              <dt>Amount per month</dt>
              <dd>
                {isEnterprise ? 'Custom' : `$${monthlyEquivalent}${perSeat ? '/seat' : ''}`}
              </dd>
            </div>
            <div>
              <dt>Payment duration</dt>
              <dd>
                {isEnterprise
                  ? '—'
                  : interval === 'yearly'
                  ? `1 year · ${money(total)} total`
                  : `1 month · ${money(total)} total`}
              </dd>
            </div>
            <div>
              <dt>Regional tax / VAT</dt>
              <dd>$0.00</dd>
            </div>
            <div>
              <dt>Payment method</dt>
              <dd>{PROVIDER_LABELS[provider]}</dd>
            </div>
            <div className="chk-summary-total">
              <dt>Total amount</dt>
              <dd>{isEnterprise ? 'Custom' : money(total)}</dd>
            </div>
          </dl>

          <p className="chk-note">
            <ShieldCheck className="chk-note-icon" aria-hidden="true" />
            {isEnterprise
              ? 'Enterprise plans are quoted by our sales team.'
              : `You'll be redirected to ${PROVIDER_NAMES[provider]} to complete payment securely.`}
          </p>

          <div className="chk-actions">
            <button type="button" className="btn-workspace btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-workspace btn-primary chk-proceed"
              onClick={startCheckout}
              disabled={busy}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {isEnterprise ? 'Talk to Sales' : busy ? 'Starting checkout…' : `Proceed ${money(total)}`}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
