import { useState, useEffect, useCallback, useMemo } from 'react';
import useAuthStore from '../store/authStore';
import { subscriptionApi } from '../lib/api';
import { PLANS, FREE_PLAN, planById, planName, planDirection, yearlySavingsPercent } from '../lib/plans';
import {
  statusMeta,
  renewalCopy,
  cancelCopy,
  downgradeCopy,
  trialProgress,
  formatDate,
} from '../lib/billingCopy';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Check,
  CreditCard,
  Loader2,
  RotateCcw,
  XCircle,
  Zap,
} from 'lucide-react';

const FREE_TIER = 'developer';

const TIER_META = {
  trial: { label: 'Free trial', tone: 'trial' },
  active: { label: 'Active', tone: 'active' },
  canceling: { label: 'Cancels at period end', tone: 'warning' },
  changing: { label: 'Plan change scheduled', tone: 'warning' },
  past_due: { label: 'Payment failed', tone: 'danger' },
  expired: { label: 'Expired', tone: 'danger' },
  free: { label: 'Free', tone: 'neutral' },
};

const PROVIDER_LABELS = {
  stripe: 'Card (Stripe)',
  paystack: 'Card (Paystack)',
  flutterwave: 'Card (Flutterwave)',
  manual: 'Manual',
};

const INTERVAL_LABELS = {
  monthly: 'Monthly',
  yearly: 'Yearly',
  custom: 'Custom',
  trial: 'Trial',
};

const PLAN_TAGS = {
  developer: 'Free',
  pro: 'Popular',
  pro_plus: 'Power users',
  team_standard: 'Collaborate',
  team_premium: 'Best value',
  enterprise: 'Custom',
};

const DURATIONS = {
  monthly: '1 month',
  yearly: '1 year',
  custom: 'Custom',
  trial: 'Trial',
};

function providerLabel(id) {
  return PROVIDER_LABELS[id] || id || 'Unknown provider';
}

function intervalLabel(interval) {
  return INTERVAL_LABELS[interval] || 'Monthly';
}

function planTitle(id) {
  // The catalog calls the free tier "Free" for checkout, but the billing
  // page has always shown the workspace tier name.
  return id === FREE_TIER ? 'Developer' : planName(id);
}

/**
 * Confirmation dialog for anything destructive about money. Replaces the old
 * `window.confirm`, which could not state consequences: the tab used to promise
 * "you'll lose access at the end of the billing period" while /cancel revoked
 * access immediately.
 */
function BillingConfirmDialog({ copy, busy, onCancel, onConfirm }) {
  if (!copy) return null;
  return (
    <div className="bill-modal-backdrop" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        className="bill-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bill-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="bill-modal-title" className="bill-modal-title">{copy.title}</h3>
        <p className="bill-modal-body">{copy.body}</p>

        {copy.losses && copy.losses.length > 0 && (
          <ul className="bill-loss-list">
            {copy.losses.map((loss) => (
              <li key={loss.label} className="bill-loss-item">
                <AlertTriangle className="bill-loss-icon" aria-hidden="true" />
                <span className="bill-loss-label">{loss.label}</span>
                <span className="bill-loss-delta">
                  {loss.from} <span aria-hidden="true">&rarr;</span> {loss.to}
                </span>
              </li>
            ))}
          </ul>
        )}

        {copy.effectiveLine && (
          <p className="bill-effective">
            <CalendarDays className="bill-effective-icon" aria-hidden="true" />
            {copy.effectiveLine}
          </p>
        )}

        <div className="bill-modal-actions">
          <button type="button" className="btn-workspace btn-secondary" onClick={onCancel} disabled={busy}>
            Keep my plan
          </button>
          <button
            type="button"
            className={`btn-workspace ${copy.destructive === false ? 'btn-primary' : 'btn-danger'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {busy ? 'Working…' : copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BillingPanel({ router, toast }) {
  const subscription = useAuthStore((s) => s.subscription);
  const setSubscription = useAuthStore((s) => s.setSubscription);

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [interval, setInterval] = useState('monthly');

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await subscriptionApi.getCurrent();
      if (data.subscription) setSubscription(data.subscription);
      // `state` is derived server-side so this view never re-derives billing
      // rules, and can never disagree with them the way the old tab did.
      setState(data.state || null);
    } catch (err) {
      setLoadError(err.message || 'Could not load your billing details');
    } finally {
      setLoading(false);
    }
  }, [setSubscription]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (key, fn, successMessage) => {
    setBusy(key);
    try {
      const result = await fn();
      setDialog(null);
      if (result && result.state) setState(result.state);
      else await load();
      toast.success((result && result.message) || successMessage);
    } catch (err) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const confirmCancel = () => runAction('cancel', () => subscriptionApi.cancel(), 'Subscription cancelled');
  const confirmDowngrade = () =>
    runAction('downgrade', () => subscriptionApi.changePlan(dialog.tier), 'Plan change scheduled');
  const resume = () => runAction('resume', () => subscriptionApi.resume(), 'Your plan will continue');

  const goToCheckout = (tier) => router.push(`/checkout?plan=${tier}&interval=${interval}`);
  const toggleOverage = (enabled) =>
    runAction(
      'overage',
      () => subscriptionApi.setOverage(enabled),
      enabled ? 'Overage enabled' : 'Overage disabled'
    );

  const compute = subscription?.usage?.computeHours || null;
  const overageEnabled = compute?.overageEnabled === true;
  const overageCapMinor = compute?.overageCapMinor || 0;
  const overageRateMinor = compute?.overageRateMinorPerHour || 100;

  /**
   * One real transaction per paid period. The API exposes the current period
   * only (no invoice archive), so this is deliberately a single row plus an
   * empty state — never a fabricated history.
   */
  const transactions = useMemo(() => {
    if (!state || state.isFree || state.isTrialing) return [];
    const pricing = state.pricing;
    if (!pricing || !pricing.amount) return [];
    const start = state.startDate || state.cancelledAt;
    const end = state.endDate;
    if (!start) return [];
    const started = new Date(start);
    return [
      {
        key: `${state.tier}-${started.getTime()}`,
        invoice: `INV-${started.getFullYear()}${String(started.getMonth() + 1).padStart(2, '0')}`,
        plan: planTitle(state.tier),
        duration: DURATIONS[pricing.interval] || 'Custom',
        amount: `$${pricing.amount}`,
        amountNote: pricing.interval === 'yearly' ? '/yr' : pricing.interval === 'monthly' ? '/mo' : '',
        start,
        end,
        method: providerLabel(state.paymentProvider),
      },
    ];
  }, [state]);

  if (loading) {
    return (
      <div className="bill-loading" role="status" aria-live="polite">
        <Loader2 className="bill-spinner" aria-hidden="true" />
        <span>Loading your billing details…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bill-error" role="alert">
        <AlertTriangle className="bill-error-icon" aria-hidden="true" />
        <div className="bill-error-text">
          <p className="bill-error-title">Billing details unavailable</p>
          <p className="bill-error-body">{loadError}</p>
        </div>
        <button
          type="button"
          className="btn-workspace btn-secondary"
          onClick={() => {
            setLoading(true);
            load();
          }}
        >
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  if (!state) return null;

  const meta = TIER_META[state.phase] || TIER_META.free;
  const plan = planById(state.tier) || FREE_PLAN;
  const statusCopy = statusMeta(state);
  const summary = renewalCopy(state);
  const cancel = cancelCopy(state);
  const isBusy = (key) => busy === key;

  const amountLabel = state.isFree
    ? '$0'
    : state.pricing && state.pricing.amount != null
    ? `$${state.pricing.amount}`
    : plan.monthlyPrice != null
    ? `$${plan.monthlyPrice}`
    : 'Custom';
  const amountNote = state.isFree
    ? '/month'
    : state.pricing?.interval === 'yearly'
    ? '/year'
    : plan.perSeat
    ? '/seat/mo'
    : '/month';
  const nextBillingDate = state.nextBillingDate || state.endDate || state.trialEndsAt || null;
  const plans = [FREE_PLAN, ...PLANS];

  return (
    <div className="blp">
      <BillingConfirmDialog
        copy={dialog && dialog.copy}
        busy={isBusy('cancel') || isBusy('downgrade')}
        onCancel={() => setDialog(null)}
        onConfirm={dialog && dialog.kind === 'cancel' ? confirmCancel : confirmDowngrade}
      />

      {/* Current plan */}
      <section className="blp-current" aria-label="Current plan">
        <div className="blp-current-main">
          <p className="blp-eyebrow">Current plan</p>
          <div className="blp-current-title-row">
            <h2 className="blp-current-title">{planTitle(state.tier)}</h2>
            <span className={`bill-pill bill-pill-${meta.tone}`}>{statusCopy.label}</span>
          </div>
          <p className="blp-muted">
            {state.isFree
              ? 'Free forever · no renewal scheduled'
              : nextBillingDate
              ? `Next billing: ${formatDate(nextBillingDate)}`
              : summary}
          </p>
        </div>

        <div className="blp-current-side">
          <p className="blp-current-price">
            {amountLabel}
            <span>{amountNote}</span>
          </p>
          <p className="blp-muted">
            {state.paymentProvider ? `Paid via ${providerLabel(state.paymentProvider)}` : 'No payment method on file'}
          </p>
          <button
            type="button"
            className="btn-workspace btn-secondary blp-current-cta"
            onClick={() => {
              if (state.tier === 'enterprise') router.push('/contact?topic=enterprise-billing');
              else goToCheckout(state.isFree ? 'pro' : state.tier);
            }}
            title={
              state.tier === 'enterprise'
                ? 'Enterprise plans are managed via custom contract — contact sales to change payment details'
                : undefined
            }
          >
            <CreditCard className="w-4 h-4" aria-hidden="true" />
            {state.tier === 'enterprise' ? 'Contact sales' : state.paymentProvider ? 'Update payment' : 'Add payment method'}
          </button>
        </div>
      </section>

      {state.phase === 'trial' && (
        <div className="bill-trial blp-notice">
          <div className="bill-trial-head">
            <Zap className="bill-trial-icon" aria-hidden="true" />
            <span>
              <strong>{state.trialDaysLeft}</strong> day{state.trialDaysLeft === 1 ? '' : 's'} of {planTitle(state.tier)} left
            </span>
          </div>
          <div
            className="bill-trial-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(trialProgress(state) * 100)}
            aria-label="Trial used"
          >
            <span className="bill-trial-fill" style={{ width: `${Math.round(trialProgress(state) * 100)}%` }} />
          </div>
          <p className="bill-trial-note">
            On {formatDate(state.trialEndsAt)} your workspace drops to the Free plan unless you upgrade.
          </p>
        </div>
      )}

      {(state.phase === 'canceling' || state.phase === 'changing') && (
        <div className="bill-pending blp-notice" role="status">
          <CalendarDays className="bill-pending-icon" aria-hidden="true" />
          <div>
            <p className="bill-pending-title">
              {state.phase === 'canceling'
                ? `Ends ${formatDate(state.changeEffectiveAt)}`
                : `Switches to ${planTitle(state.pendingTier)} on ${formatDate(state.changeEffectiveAt)}`}
            </p>
            <p className="bill-pending-body">You keep {planTitle(state.tier)} until then — nothing is lost early.</p>
          </div>
          {state.canResume && (
            <button type="button" className="btn-workspace btn-primary bill-pending-cta" onClick={resume} disabled={isBusy('resume')}>
              {isBusy('resume') && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              Keep my plan
            </button>
          )}
        </div>
      )}

      {state.phase === 'past_due' && (
        <div className="bill-pending bill-pending-danger blp-notice" role="alert">
          <AlertTriangle className="bill-pending-icon" aria-hidden="true" />
          <div>
            <p className="bill-pending-title">We could not charge your payment method</p>
            <p className="bill-pending-body">Update it to keep your {planTitle(state.tier)} access.</p>
          </div>
          <button
            type="button"
            className="btn-workspace btn-primary bill-pending-cta"
            onClick={() => goToCheckout(state.tier)}
          >
            Update payment
          </button>
        </div>
      )}

      {/* Platform plans */}
      <section aria-labelledby="blp-plans-title">
        <header className="blp-section-head">
          <div>
            <h2 id="blp-plans-title" className="blp-section-title">Platform Plans</h2>
            <p className="blp-muted">All accessible subscription options</p>
          </div>
          <div className="bill-interval" role="group" aria-label="Billing interval">
            <button
              type="button"
              className={`bill-interval-btn ${interval === 'monthly' ? 'is-active' : ''}`}
              onClick={() => setInterval('monthly')}
              aria-pressed={interval === 'monthly'}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`bill-interval-btn ${interval === 'yearly' ? 'is-active' : ''}`}
              onClick={() => setInterval('yearly')}
              aria-pressed={interval === 'yearly'}
            >
              Yearly
              <span className="bill-interval-save">-{yearlySavingsPercent('pro')}%</span>
            </button>
          </div>
        </header>

        <ul className="blp-plans">
          {plans.map((option) => {
            const direction = planDirection(state.tier, option.id);
            const isCurrent = direction === 'current';
            const price = option.contactSales
              ? null
              : interval === 'yearly'
              ? option.yearlyPrice
              : option.monthlyPrice;
            const tag = isCurrent ? 'Current' : PLAN_TAGS[option.id];

            let ctaLabel;
            if (isCurrent) ctaLabel = 'Your current plan';
            else if (option.contactSales) ctaLabel = 'Talk to Sales';
            else if (direction === 'upgrade') ctaLabel = `Upgrade to ${planTitle(option.id)}`;
            else ctaLabel = 'Choose Plan';

            return (
              <li
                key={option.id}
                className={`blp-plan ${isCurrent ? 'is-current' : ''} ${option.featured ? 'is-featured' : ''}`}
                aria-current={isCurrent ? 'true' : undefined}
              >
                <div className="blp-plan-head">
                  <h3 className="blp-plan-name">{planTitle(option.id)}</h3>
                  {tag && <span className={`blp-tag ${isCurrent ? 'blp-tag-current' : ''}`}>{tag}</span>}
                </div>

                <p className="blp-plan-blurb">{option.blurb}</p>

                {option.contactSales ? (
                  <p className="blp-plan-price">Custom</p>
                ) : (
                  <p className="blp-plan-price">
                    ${price}
                    <span>
                      {option.perSeat ? '/seat' : ''}/{interval === 'yearly' ? 'year' : 'month'}
                    </span>
                  </p>
                )}

                <ul className="blp-features">
                  {option.features.map((feature) => (
                    <li key={feature}>
                      <Check className="blp-check" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className={`btn-workspace ${
                    !isCurrent && !option.contactSales && option.featured ? 'btn-primary' : 'btn-secondary'
                  } blp-plan-cta`}
                  disabled={isCurrent || isBusy('downgrade')}
                  onClick={() => {
                    if (isCurrent) return;
                    if (option.contactSales) router.push('/contact?topic=enterprise-billing');
                    else if (direction === 'upgrade') goToCheckout(option.id);
                    else setDialog({ kind: 'downgrade', tier: option.id, copy: downgradeCopy(state, option.id) });
                  }}
                >
                  {ctaLabel}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Transaction history */}
      <section aria-labelledby="blp-history-title">
        <header className="blp-section-head">
          <div>
            <h2 id="blp-history-title" className="blp-section-title">Transaction History</h2>
            <p className="blp-muted">All subscription transactions made</p>
          </div>
        </header>

        {transactions.length > 0 ? (
          <div className="blp-table" role="table" aria-label="Transaction history">
            <div className="blp-table-head" role="row">
              <span role="columnheader">Invoice</span>
              <span role="columnheader">Plan</span>
              <span role="columnheader">Duration</span>
              <span role="columnheader">Amount</span>
              <span role="columnheader">Subscription date</span>
              <span role="columnheader">Expires on</span>
              <span role="columnheader" className="blp-table-method">Payment method</span>
            </div>
            {transactions.map((tx) => (
              <div className="blp-table-row" role="row" key={tx.key}>
                <span className="blp-table-invoice" role="cell">{tx.invoice}</span>
                <span role="cell">{tx.plan}</span>
                <span role="cell">{tx.duration}</span>
                <span role="cell">
                  {tx.amount}
                  <span className="blp-muted">{tx.amountNote}</span>
                </span>
                <span role="cell">{formatDate(tx.start)}</span>
                <span role="cell">{tx.end ? formatDate(tx.end) : '—'}</span>
                <span className="blp-table-method" role="cell">{tx.method}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="blp-empty">
            <CreditCard className="blp-empty-icon" aria-hidden="true" />
            <p className="blp-empty-title">No transactions yet</p>
            <p className="blp-muted">
              {state.isTrialing
                ? 'Your first invoice is issued when the trial converts to a paid plan.'
                : 'Invoices appear here after your first successful payment.'}
            </p>
          </div>
        )}
      </section>

      {/* Subscription controls that the plan cards don't cover. */}
      <section className="blp-manage" aria-labelledby="blp-manage-title">
        <header className="blp-section-head">
          <div>
            <h2 id="blp-manage-title" className="blp-section-title">Subscription settings</h2>
            <p className="blp-muted">Billing cycle, overage and cancellation</p>
          </div>
          <span className={`bill-pill bill-pill-${meta.tone}`}>{meta.label}</span>
        </header>

        <dl className="blp-details">
          <div>
            <dt>Billing cycle</dt>
            <dd>{state.isFree ? 'Free forever' : intervalLabel(state.pricing?.interval)}</dd>
          </div>
          <div>
            <dt>Next billing</dt>
            <dd>{nextBillingDate ? formatDate(nextBillingDate) : '—'}</dd>
          </div>
          <div>
            <dt>Payment method</dt>
            <dd>{state.paymentProvider ? providerLabel(state.paymentProvider) : 'Not set'}</dd>
          </div>
        </dl>

        {compute && compute.limit > 0 && (
          <div className="bill-overage blp-overage">
            <div className="bill-overage-copy">
              <p className="bill-overage-title">
                <Zap className="bill-overage-icon" aria-hidden="true" />
                Compute overage
              </p>
              <p className="bill-overage-body">
                {overageEnabled
                  ? `Jobs can run past your ${compute.limit}h allowance at $${(overageRateMinor / 100).toFixed(2)}/hour, up to $${(overageCapMinor / 100).toFixed(2)} per month.`
                  : `Jobs stop at your ${compute.limit}h allowance. Enable overage to keep long jobs running.`}
              </p>
              {compute.overageHours > 0 && (
                <p className="bill-overage-usage">
                  This month: {compute.overageHours.toFixed(2)}h overage
                  {overageEnabled ? ` · $${(compute.overageAmountMinor / 100).toFixed(2)}` : ' · not billed'}
                </p>
              )}
            </div>
            <button
              type="button"
              className={`btn-workspace ${overageEnabled ? 'btn-secondary' : 'btn-primary'}`}
              onClick={() => toggleOverage(!overageEnabled)}
              disabled={isBusy('overage')}
            >
              {isBusy('overage') ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Zap className="w-4 h-4" aria-hidden="true" />
              )}
              {overageEnabled ? 'Disable overage' : 'Enable overage'}
            </button>
          </div>
        )}

        <div className="blp-manage-actions">
          {state.canResume ? (
            <button type="button" className="btn-workspace btn-primary" onClick={resume} disabled={isBusy('resume')}>
              {isBusy('resume') ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
              )}
              Keep my {planTitle(state.tier)} plan
            </button>
          ) : (
            <>
              {state.canCancel && (
                <button
                  type="button"
                  className="btn-workspace btn-secondary btn-danger"
                  onClick={() => setDialog({ kind: 'cancel', copy: cancel })}
                  disabled={isBusy('cancel')}
                >
                  <XCircle className="w-4 h-4" aria-hidden="true" />
                  {state.phase === 'trial' ? 'End trial' : 'Cancel plan'}
                </button>
              )}
              {state.tier === 'enterprise' && (
                <button
                  type="button"
                  className="btn-workspace btn-secondary"
                  onClick={() => router.push('/contact?topic=enterprise-billing')}
                >
                  <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                  Contact sales
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
