import { useState, useEffect, useCallback } from 'react';
import useAuthStore from '../store/authStore';
import { subscriptionApi } from '../lib/api';
import { FREE_PLAN, planById, planName, planDirection, yearlySavingsPercent } from '../lib/plans';
import {
  statusMeta,
  renewalCopy,
  cancelCopy,
  downgradeCopy,
  trialProgress,
  formatDate,
} from '../lib/billingCopy';
import {
  CreditCard,
  Loader2,
  Zap,
  AlertTriangle,
  CalendarDays,
  RotateCcw,
  ArrowUpRight,
  XCircle,
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

function providerLabel(id) {
  return PROVIDER_LABELS[id] || id || 'Unknown provider';
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
  const [showPlans, setShowPlans] = useState(false);
  const [interval, setInterval] = useState('yearly');

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await subscriptionApi.getCurrent();
      if (data.subscription) setSubscription(data.subscription);
      // `state` is derived server-side so this tab never re-derives billing
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
      setShowPlans(false);
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

  const compute = subscription?.usage?.computeHours;
  const overageEnabled = compute?.overageEnabled === true;
  const overageCapMinor = compute?.overageCapMinor || 0;
  const overageRateMinor = compute?.overageRateMinorPerHour || 100;

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
          <Loader2 className="w-4 h-4" aria-hidden="true" />
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

  return (
    <div className="bill-wrap">
      <BillingConfirmDialog
        copy={dialog && dialog.copy}
        busy={isBusy('cancel') || isBusy('downgrade')}
        onCancel={() => setDialog(null)}
        onConfirm={dialog && dialog.kind === 'cancel' ? confirmCancel : confirmDowngrade}
      />

      {/* ------------------------------ current plan ----------------------------- */}
      <section className="bill-card" aria-labelledby="bill-current-plan">
        <header className="bill-card-head">
          <div>
            <h3 id="bill-current-plan" className="bill-card-title">Current plan</h3>
            <p className="bill-card-sub">{summary}</p>
          </div>
          <span className={`bill-pill bill-pill-${meta.tone}`}>{statusCopy.label}</span>
        </header>

        <div className="bill-plan-row">
          <div className="bill-plan-main">
            <span className="bill-plan-title">{plan.name}</span>
            {state.isFree ? (
              <span className="bill-plan-price">
                $0<span className="bill-plan-note">/mo</span>
              </span>
            ) : (
              plan.monthlyPrice != null && (
                <span className="bill-plan-price">
                  ${interval === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice}
                  <span className="bill-plan-note">
                    {plan.perSeat ? '/seat' : ''}/{interval === 'yearly' ? 'yr' : 'mo'}
                  </span>
                </span>
              )
            )}
          </div>

          {state.phase === 'trial' && (
            <div className="bill-trial">
              <div className="bill-trial-head">
                <Zap className="bill-trial-icon" aria-hidden="true" />
                <span>
                  <strong>{state.trialDaysLeft}</strong> day{state.trialDaysLeft === 1 ? '' : 's'} of {plan.name} left
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
                <span
                  className="bill-trial-fill"
                  style={{ width: `${Math.round(trialProgress(state) * 100)}%` }}
                />
              </div>
              <p className="bill-trial-note">
                On {formatDate(state.trialEndsAt)} your workspace drops to the Free plan unless you upgrade.
              </p>
            </div>
          )}

          {(state.phase === 'canceling' || state.phase === 'changing') && (
            <div className="bill-pending" role="status">
              <CalendarDays className="bill-pending-icon" aria-hidden="true" />
              <div>
                <p className="bill-pending-title">
                  {state.phase === 'canceling'
                    ? `Ends ${formatDate(state.changeEffectiveAt)}`
                    : `Switches to ${planName(state.pendingTier)} on ${formatDate(state.changeEffectiveAt)}`}
                </p>
                <p className="bill-pending-body">
                  You keep {plan.name} until then — nothing is lost early.
                </p>
              </div>
            </div>
          )}

          {state.phase === 'past_due' && (
            <div className="bill-pending bill-pending-danger" role="alert">
              <AlertTriangle className="bill-pending-icon" aria-hidden="true" />
              <div>
                <p className="bill-pending-title">We could not charge your payment method</p>
                <p className="bill-pending-body">Update it to keep your {plan.name} access.</p>
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
        </div>

        {subscription?.usage && (
          <div className="bill-usage" aria-label="Current period usage">
            <span className="bill-usage-item">
              AI credits: <strong>{subscription.usage.credits.used}{subscription.usage.credits.limit == null ? ' (unlimited)' : ` / ${subscription.usage.credits.limit}`}</strong>
            </span>
            <span className="bill-usage-item">
              Cloud hours: <strong>{subscription.usage.computeHours.used}{subscription.usage.computeHours.limit == null ? ' (unlimited)' : ` / ${subscription.usage.computeHours.limit}`}</strong>
            </span>
          </div>
        )}

        {compute && compute.limit > 0 && (
          <div className="bill-overage">
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
                  {overageEnabled
                    ? ` · $${(compute.overageAmountMinor / 100).toFixed(2)}`
                    : ' · not billed'}
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

        <div className="bill-actions">
          {state.canResume ? (
            <button
              type="button"
              className="btn-workspace btn-primary"
              onClick={resume}
              disabled={isBusy('resume')}
            >
              {isBusy('resume') ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
              )}
              Keep my {plan.name} plan
            </button>
          ) : (
            <>
              {state.phase === 'trial' && (
                <button
                  type="button"
                  className="btn-workspace btn-primary"
                  onClick={() => setShowPlans((v) => !v)}
                >
                  <Zap className="w-4 h-4" aria-hidden="true" />
                  {showPlans ? 'Hide plans' : 'Upgrade now'}
                </button>
              )}

              {state.phase === 'active' && (
                <button
                  type="button"
                  className="btn-workspace btn-secondary"
                  onClick={() => setShowPlans((v) => !v)}
                >
                  <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                  {showPlans ? 'Hide plans' : 'Change plan'}
                </button>
              )}

              {state.canCancel && (
                <button
                  type="button"
                  className="btn-workspace btn-secondary bill-btn-danger"
                  onClick={() => setDialog({ kind: 'cancel', copy: cancel })}
                  disabled={isBusy('cancel')}
                >
                  <XCircle className="w-4 h-4" aria-hidden="true" />
                  {state.phase === 'trial' ? 'End trial' : 'Cancel plan'}
                </button>
              )}
            </>
          )}

          {state.isFree && (
            <button
              type="button"
              className="btn-workspace btn-secondary"
              onClick={() => setShowPlans(true)}
            >
              <CreditCard className="w-4 h-4" aria-hidden="true" />
              Browse plans
            </button>
          )}
        </div>
      </section>

      {/* ----------------------------- plan picker ------------------------------ */}
      {showPlans && (
        <section className="bill-card" aria-labelledby="bill-change-plan">
          <header className="bill-card-head">
            <div>
              <h3 id="bill-change-plan" className="bill-card-title">
                {state.isFree ? 'Choose a plan' : 'Change your plan'}
              </h3>
              <p className="bill-card-sub">
                {state.isTrialing
                  ? 'Start a paid plan now and keep everything your trial unlocked.'
                  : 'Upgrades start today. Downgrades apply at your next renewal, so you never lose what you paid for.'}
              </p>
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

          <ul className="bill-plan-grid">
            {PLANS.map((option) => {
              const direction = planDirection(state.tier, option.id);
              const price = interval === 'yearly' ? option.yearlyPrice : option.monthlyPrice;
              const isCurrent = direction === 'current';
              return (
                <li
                  key={option.id}
                  className={`bill-plan-option ${isCurrent ? 'is-current' : ''}`}
                  aria-current={isCurrent ? 'true' : undefined}
                >
                  <div className="bill-plan-option-head">
                    <h4 className="bill-plan-option-name">{option.name}</h4>
                    {isCurrent && <span className="bill-tag bill-tag-current">Current</span>}
                    {direction === 'upgrade' && <span className="bill-tag bill-tag-up">Upgrade</span>}
                    {direction === 'downgrade' && <span className="bill-tag bill-tag-down">Downgrade</span>}
                  </div>

                  <p className="bill-plan-option-blurb">{option.blurb}</p>

                  {option.contactSales ? (
                    <p className="bill-plan-option-custom">Custom pricing</p>
                  ) : (
                    <p className="bill-plan-option-price">
                      ${price}
                      <span className="bill-plan-option-note">
                        {option.perSeat ? '/seat' : ''}/{interval === 'yearly' ? 'yr' : 'mo'}
                      </span>
                    </p>
                  )}

                  <ul className="bill-plan-option-features">
                    {option.features.map((feature) => (
                      <li key={feature}>
                        <Check className="bill-check" aria-hidden="true" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    className={`btn-workspace ${
                      direction === 'upgrade' ? 'btn-primary' : 'btn-secondary'
                    } bill-plan-option-cta`}
                    disabled={isCurrent || isBusy('downgrade')}
                    onClick={() => {
                      if (direction === 'upgrade') goToCheckout(option.id);
                      else
                        setDialog({
                          kind: 'downgrade',
                          tier: option.id,
                          copy: downgradeCopy(state, option.id),
                        });
                    }}
                  >
                    {isCurrent
                      ? 'Your current plan'
                      : direction === 'upgrade'
                      ? `Upgrade to ${option.name}`
                      : `Move to ${option.name}`}
                  </button>
                </li>
              );
            })}
          </ul>

          {state.isPaid && !state.isFree && (
            <button
              type="button"
              className="btn-workspace btn-secondary bill-btn-danger bill-to-free"
              onClick={() =>
                setDialog({ kind: 'downgrade', tier: FREE_TIER, copy: downgradeCopy(state, FREE_TIER) })
              }
              disabled={isBusy('downgrade')}
            >
              <XCircle className="w-4 h-4" aria-hidden="true" />
              Move to the Free plan
            </button>
          )}
        </section>
      )}

      {/* --------------------------- free upgrade pitch -------------------------- */}
      {state.isFree && !showPlans && (
        <section className="bill-card bill-upgrade-cta">
          <h3 className="bill-card-title">Unlock more of BuildrsHQ</h3>
          <p className="bill-card-sub">
            Free includes 1 project, 1 member and 5 tasks per project. Paid plans add AI pair programming, cloud
            hours, and team collaboration.
          </p>
          <button type="button" className="btn-workspace btn-primary" onClick={() => setShowPlans(true)}>
            See all plans
          </button>
        </section>
      )}

      {/* ------------------------------ payment --------------------------------- */}
      <section className="bill-card" aria-labelledby="bill-payment">
        <h3 id="bill-payment" className="bill-card-title">Payment method</h3>
        <div className="bill-payment-row">
          <div className="bill-payment-info">
            <CreditCard className="bill-payment-icon" aria-hidden="true" />
            <div>
              <p className="bill-payment-name">
                {state.paymentProvider ? providerLabel(state.paymentProvider) : 'No payment method'}
              </p>
              <p className="bill-payment-sub">
                {state.paymentProvider
                  ? state.phase === 'trial'
                    ? 'Verified for this trial'
                    : state.nextBillingDate
                    ? `Next charge ${formatDate(state.nextBillingDate)}`
                    : 'Charged automatically each period'
                  : 'Add a card to keep your plan after the trial ends.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-workspace btn-secondary"
            onClick={() => {
              if (state.tier === 'enterprise') router.push('/contact?topic=enterprise-billing');
              else goToCheckout(state.isFree ? 'pro' : state.tier);
            }}
            title={state.tier === 'enterprise' ? 'Enterprise plans are managed via custom contract — contact sales to change payment details' : undefined}
          >
            {state.tier === 'enterprise' ? 'Contact sales' : state.paymentProvider ? 'Update' : 'Add payment method'}
          </button>
        </div>
      </section>
    </div>
  );
}
