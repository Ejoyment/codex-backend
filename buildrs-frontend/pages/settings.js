import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, subscriptionApi, integrationApi } from '../lib/api';
import { rateLimit, validate, createSubmitGuard } from '../lib/security';
import { getAvatarUrl } from '../lib/utils';
import { normalizeTier } from '../lib/tier';
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
  User,
  Shield,
  CreditCard,
  Plug,
  Camera,
  Save,
  ExternalLink,
  Unplug,
  Loader2,
  Zap,
  AlertTriangle,
  Trash2,
  CalendarDays,
  RotateCcw,
  ArrowUpRight,
  XCircle,
  Check,
} from 'lucide-react';
import useToastStore from '../store/toastStore';

const submitGuard = createSubmitGuard();

const CROP_VIEW = 280;
const CROP_MAX_ZOOM = 4;
const CROP_EXPORT_MIN = 96;
const CROP_EXPORT_MAX = 512;

const PROVIDERS = [
  { id: 'github', label: 'GitHub', color: '#f0f6fc' },
  { id: 'discord', label: 'Discord', color: '#5865f2' },
  { id: 'slack', label: 'Slack', color: '#e01e5a' },
  { id: 'figma', label: 'Figma', color: '#a259ff' },
  { id: 'notion', label: 'Notion', color: '#fff' },
];

const PROVIDER_META = {
  github: { type: 'GitOps', desc: 'Repos, PRs, commit activity' },
  discord: { type: 'Chat', desc: 'Alerts and summaries' },
  slack: { type: 'Chat', desc: 'Alerts and summaries' },
  figma: { type: 'Design', desc: 'Design files and feedback' },
  notion: { type: 'Docs', desc: 'Standups and meeting notes' },
};

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'integrations', label: 'Integrations', icon: Plug },
];

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

function BillingTab({ router, toast }) {
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
            onClick={() => goToCheckout(state.isFree ? 'pro' : state.tier)}
            disabled={state.tier === 'enterprise'}
          >
            {state.paymentProvider ? 'Update' : 'Add payment method'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function Settings() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const setAuth = useAuthStore((s) => s.setAuth);
  const setSubscription = useAuthStore((s) => s.setSubscription);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const [activeTab, setActiveTab] = useState('profile');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [integrations, setIntegrations] = useState([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [clock, setClock] = useState('');
  const [crop, setCrop] = useState(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropPan, setCropPan] = useState({ x: 0, y: 0 });
  const [cropReady, setCropReady] = useState(false);
  const cropImgRef = useRef(null);
  const previewRef = useRef(null);
  const dragRef = useRef(null);
  const toast = useToastStore();
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (deleteText !== 'DELETE' || deleting) return;
    const confirmed = window.confirm(
      'Delete your account permanently? Your profile, projects, files, AI sessions, messages and deployments will be removed. This cannot be undone.'
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      const data = await apiFetch('/api/auth/delete-account', {
        method: 'DELETE',
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      if (data.success) {
        clearAuth();
        router.replace('/sign_in');
      } else {
        toast.error(data.message || 'Failed to delete account');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    const tick = () => {
      setClock(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (user) {
      setName(user.fullName || '');
      setRole(user.role || '');
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === 'billing' && !subscription) {
      subscriptionApi.getCurrent().then((data) => {
        if (data.subscription) setSubscription(data.subscription);
      }).catch(() => {});
    }
    if (activeTab === 'integrations') {
      setLoadingIntegrations(true);
      integrationApi.list()
        .then((data) => setIntegrations(data.integrations || []))
        .catch(() => setIntegrations([]))
        .finally(() => setLoadingIntegrations(false));
    }
  }, [activeTab, subscription, setSubscription]);

  const validateField = useCallback((value) => {
    const result = validate(value, ['required', 'fullName', 'noScript']);
    setFieldErrors((prev) => {
      if (result.valid) { const n = { ...prev }; delete n.fullName; return n; }
      return { ...prev, fullName: result.errors[0] };
    });
    return result.valid;
  }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!submitGuard.acquire()) return;
    if (!validateField(name)) { submitGuard.release(); return; }

    const rl = rateLimit('settings-save', { maxAttempts: 5, windowMs: 60000 });
    if (!rl.allowed) {
      toast.error(`Too many requests. Wait ${rl.retryAfter}s`);
      submitGuard.release();
      return;
    }

    setSaving(true);
    try {
      const data = await apiFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({ fullName: name, email: user.email }),
      });
      if (data.user) {
        const token = localStorage.getItem('authToken');
        setAuth(token, { ...user, ...data.user });
      }
      toast.success('Profile updated successfully');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
      submitGuard.release();
    }
  };

  const uploadPicture = async (file) => {
    const form = new FormData();
    form.append('profilePicture', file);
    const data = await apiFetch('/api/profile/picture', {
      method: 'POST',
      body: form,
    });
    if (data.profilePicture) {
      const token = localStorage.getItem('authToken');
      const updated = { ...user, profilePicture: data.profilePicture };
      setAuth(token, updated);
      toast.success('Profile picture updated');
    } else {
      throw new Error(data.message || 'Upload failed');
    }
  };

  const onPickPicture = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large — max 5MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed');
      return;
    }
    if (crop?.src) URL.revokeObjectURL(crop.src);
    setCrop({ src: URL.createObjectURL(file), w: 0, h: 0 });
    setCropZoom(1);
    setCropPan({ x: 0, y: 0 });
    setCropReady(false);
  };

  const clampPan = (pos, drawW, drawH) => ({
    x: Math.min(0, Math.max(CROP_VIEW - drawW, pos.x)),
    y: Math.min(0, Math.max(CROP_VIEW - drawH, pos.y)),
  });

  const baseScale = (w, h) => Math.max(CROP_VIEW / w, CROP_VIEW / h);
  const drawSize = (w, h, zoom) => ({ w: w * baseScale(w, h) * zoom, h: h * baseScale(w, h) * zoom });

  const onCropLoad = (e) => {
    if (!crop) return;
    const w = e.currentTarget.naturalWidth;
    const h = e.currentTarget.naturalHeight;
    const d = drawSize(w, h, 1);
    setCrop((prev) => (prev ? { ...prev, w, h } : prev));
    setCropPan(clampPan({ x: (CROP_VIEW - d.w) / 2, y: (CROP_VIEW - d.h) / 2 }, d.w, d.h));
    setCropReady(true);
  };

  const onCropPointerDown = (e) => {
    if (!cropReady) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, start: { ...cropPan } };
  };

  const onCropPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId || !crop) return;
    const dims = drawSize(crop.w, crop.h, cropZoom);
    setCropPan(clampPan({ x: d.start.x + (e.clientX - d.sx), y: d.start.y + (e.clientY - d.sy) }, dims.w, dims.h));
  };

  const onCropPointerUp = () => {
    dragRef.current = null;
  };

  const applyZoom = (nextZoom) => {
    if (!crop || crop.w <= 0) return;
    const zoom = Math.min(CROP_MAX_ZOOM, Math.max(1, nextZoom));
    const dims = drawSize(crop.w, crop.h, zoom);
    const prev = drawSize(crop.w, crop.h, cropZoom);
    const cx = CROP_VIEW / 2 - cropPan.x;
    const cy = CROP_VIEW / 2 - cropPan.y;
    const pan = {
      x: CROP_VIEW / 2 - (cx * dims.w) / prev.w,
      y: CROP_VIEW / 2 - (cy * dims.h) / prev.h,
    };
    setCropZoom(zoom);
    setCropPan(clampPan(pan, dims.w, dims.h));
  };

  const onCropWheel = (e) => {
    e.preventDefault();
    applyZoom(cropZoom * Math.exp(-e.deltaY * 0.0012));
  };

  const resetCrop = (e) => {
    e.stopPropagation();
    if (!crop || crop.w <= 0) return;
    const d = drawSize(crop.w, crop.h, 1);
    setCropZoom(1);
    setCropPan(clampPan({ x: (CROP_VIEW - d.w) / 2, y: (CROP_VIEW - d.h) / 2 }, d.w, d.h));
  };

  const closeCrop = () => {
    if (uploading) return;
    if (crop?.src) URL.revokeObjectURL(crop.src);
    setCrop(null);
    setCropReady(false);
    setCropZoom(1);
    setCropPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    const canvas = previewRef.current;
    const img = cropImgRef.current;
    if (!canvas || !img || !crop || crop.w <= 0 || !cropReady) return;
    const scale = baseScale(crop.w, crop.h) * cropZoom;
    const srcSize = CROP_VIEW / scale;
    const srcX = -cropPan.x / scale;
    const srcY = -cropPan.y / scale;
    const size = Math.max(CROP_EXPORT_MIN, Math.min(CROP_EXPORT_MAX, Math.round(srcSize)));
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, size, size);
  }, [crop, cropReady, cropZoom, cropPan]);

  const applyCrop = async () => {
    const canvas = previewRef.current;
    const img = cropImgRef.current;
    if (!canvas || !img || !crop || !cropReady) return;
    setUploading(true);
    try {
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to process image'))), 'image/png');
      });
      const file = new File([blob], 'avatar.png', { type: 'image/png' });
      await uploadPicture(file);
      closeCrop();
    } catch (err) {
      toast.error(err.message || 'Failed to upload picture');
    } finally {
      setUploading(false);
    }
  };

  const connectProvider = async (provider) => {
    try {
      const data = await apiFetch(`/api/integrations/${provider}/auth`);
      if (data.authUrl || data.url) window.location.href = data.authUrl || data.url;
    } catch (err) {
      toast.error(err.message || 'Failed to start OAuth flow');
    }
  };

  const disconnectProvider = async (provider) => {
    try {
      await apiFetch(`/api/integrations/${provider}/disconnect`, { method: 'DELETE' });
      setIntegrations((prev) => prev.filter((i) => i.provider !== provider));
      toast.success(`${provider} disconnected`);
    } catch (err) {
      toast.error(err.message || 'Disconnect failed');
    }
  };

  const getIntegration = (providerId) =>
    integrations.find((i) => i.provider === providerId);

  const profilePictureUrl = getAvatarUrl(user, user?.fullName || user?.name || 'User');

  return (
    <AuthGuard>
      <Head>
        <title>Settings - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header dash-header">
            <div>
              <p className="dash-crumb">
                BuildrsHQ <span className="sep">/</span> Settings
              </p>
              <h1 className="dash-title">Settings</h1>
              <div className="dash-statusline">
                <span className="status-indicator status-online" />
                <span>Account &amp; workspace preferences</span>
                <span className="dash-clock">· {clock || '—:——:——'}</span>
              </div>
            </div>
          </header>

          <div className="workspace-content">
            <div className="set-shell">
              <nav className="set-tabs">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`set-tab ${activeTab === id ? 'is-active' : ''}`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </nav>

              <div className="set-body">
                {activeTab === 'profile' && (
                  <form onSubmit={saveProfile} className="space-y-6 max-w-xl">
                    <div className="flex items-center gap-4">
                      <img
                        src={profilePictureUrl}
                        alt={user?.fullName || 'User'}
                        className="set-av"
                        onError={(e) => {
                          if (e.currentTarget.src !== profilePictureUrl) return;
                          const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || user?.name || 'User')}&background=3b82f6&color=fff&size=128`;
                          e.currentTarget.src = fallback;
                        }}
                      />
                      <div>
                        <label className="btn-workspace btn-secondary cursor-pointer inline-flex items-center gap-2">
                          <Camera className="w-4 h-4" />
                          {uploading ? 'Uploading...' : 'Change Photo'}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={onPickPicture}
                            className="hidden"
                            disabled={uploading}
                          />
                        </label>
                        <p className="set-note">JPG, PNG. Max 5MB.</p>
                      </div>
                    </div>

                    <div>
                      <label className="ws-label">Full Name</label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => validateField(name)}
                        className={`ws-input ${fieldErrors.fullName ? 'field-error' : ''}`}
                        autoComplete="name"
                        maxLength={100}
                      />
                      {fieldErrors.fullName && <p className="std-field-error">{fieldErrors.fullName}</p>}
                    </div>

                    <div>
                      <label className="ws-label">Email</label>
                      <input
                        value={user?.email || ''}
                        disabled
                        className="ws-input opacity-60 cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="ws-label">Role</label>
                      <input
                        value={role}
                        disabled
                        className="ws-input opacity-60 cursor-not-allowed capitalize"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <button
                        type="submit"
                        disabled={saving}
                        className="btn-workspace btn-primary"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                      <span className="set-hint">Changes apply across your workspace</span>
                    </div>
                  </form>
                )}

                {activeTab === 'security' && (
                  <div className="max-w-xl space-y-6">
                    <div className="set-gate">
                      <div className="set-gate-ico">
                        <Shield className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="mem-rule" style={{ marginBottom: '0.15rem' }}>Security Settings</h3>
                        <p className="set-hint">Password change and 2FA are coming soon.</p>
                      </div>
                    </div>

                    <div className="set-gate" style={{ borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.04)' }}>
                      <div className="set-gate-ico" style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <h3 className="mem-rule" style={{ marginBottom: '0.15rem', color: '#f87171' }}>Delete Account</h3>
                        <p className="set-hint" style={{ marginBottom: '0.75rem' }}>
                          Permanently deletes your profile, projects, files, AI sessions, messages, deployments
                          and usage data. Your integration connections (GitHub, Figma, Slack, Notion, Discord)
                          and synced data such as GitHub repos are kept. This cannot be undone.
                        </p>
                        <input
                          type="text"
                          value={deleteText}
                          onChange={(e) => setDeleteText(e.target.value)}
                          placeholder="Type DELETE to confirm"
                          className="ws-input w-full"
                          style={{ marginBottom: '0.5rem' }}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          onClick={handleDeleteAccount}
                          disabled={deleteText !== 'DELETE' || deleting}
                          className="btn-workspace btn-secondary text-[#f87171] border-[rgba(248,113,113,0.3)] hover:bg-[rgba(248,113,113,0.08)] opacity-60 cursor-not-allowed"
                          style={
                            deleteText === 'DELETE' && !deleting
                              ? { opacity: 1, cursor: 'pointer' }
                              : undefined
                          }
                        >
                          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          {deleting ? 'Deleting...' : 'Delete my account'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'billing' && <BillingTab router={router} toast={toast} />}

                {activeTab === 'integrations' && (
                  <div className="space-y-3 max-w-2xl">
                    {loadingIntegrations && (
                      <div className="flex items-center gap-2 set-hint py-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading integrations...
                      </div>
                    )}
                    {!loadingIntegrations &&
                      PROVIDERS.map(({ id, label, color }) => {
                        const integration = getIntegration(id);
                        const connected = integration?.isActive;
                        const meta = PROVIDER_META[id] || { type: 'Integration', desc: '' };
                        return (
                          <div key={id} className="set-int-row">
                            <div className="set-int-brand">
                              <div
                                className="int-ico"
                                style={{ backgroundColor: color + '18', color }}
                              >
                                {label.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="set-int-name">{label}</p>
                                <p className="set-int-sub">
                                  {connected
                                    ? `Connected as ${integration.providerUsername || 'user'}`
                                    : `${meta.type} · ${meta.desc}`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              {connected && (
                                <span className="pill" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
                                  Connected
                                </span>
                              )}
                              {connected ? (
                                <button
                                  type="button"
                                  onClick={() => disconnectProvider(id)}
                                  className="btn-workspace btn-secondary text-xs inline-flex items-center gap-1"
                                >
                                  <Unplug className="w-3 h-3" />
                                  Disconnect
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => connectProvider(id)}
                                  className="btn-workspace btn-primary text-xs inline-flex items-center gap-1"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Connect
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {crop && (
        <div className="pfp-overlay" role="dialog" aria-modal="true" aria-label="Crop profile photo">
          <div className="pfp-modal">
            <div className="pfp-head">
              <div className="ws-modal-title">Crop your photo</div>
              <button type="button" className="pfp-close" onClick={closeCrop} aria-label="Cancel crop" tabIndex={-1}>
                ✕
              </button>
            </div>

            <div className="pfp-body">
              <div
                className="pfp-crop"
                onPointerDown={onCropPointerDown}
                onPointerMove={onCropPointerMove}
                onPointerUp={onCropPointerUp}
                onPointerCancel={onCropPointerUp}
                onWheel={onCropWheel}
                onDoubleClick={resetCrop}
              >
                <img
                  ref={cropImgRef}
                  src={crop.src}
                  alt="Crop preview"
                  draggable={false}
                  onLoad={onCropLoad}
                  style={
                    crop.w > 0
                      ? {
                          width: drawSize(crop.w, crop.h, cropZoom).w,
                          height: drawSize(crop.w, crop.h, cropZoom).h,
                          left: cropPan.x,
                          top: cropPan.y,
                        }
                      : undefined
                  }
                />
                <div className="pfp-ring" />
              </div>

              <div className="pfp-side">
                <canvas ref={previewRef} className="pfp-preview" />
                <span className="pfp-side-label">preview</span>
              </div>
            </div>

            <div className="pfp-controls">
              <label htmlFor="pfp-zoom">Zoom</label>
              <input
                id="pfp-zoom"
                type="range"
                className="pfp-slider"
                min="1"
                max={CROP_MAX_ZOOM}
                step="0.01"
                value={cropZoom}
                onChange={(e) => applyZoom(Number(e.target.value))}
              />
              <button type="button" onClick={resetCrop} className="btn-workspace btn-secondary text-xs">
                Reset
              </button>
            </div>

            <div className="pfp-actions">
              <button type="button" onClick={closeCrop} className="btn-workspace btn-secondary" disabled={uploading}>
                Cancel
              </button>
              <button
                type="button"
                onClick={applyCrop}
                className="btn-workspace btn-primary inline-flex items-center gap-2"
                disabled={!cropReady || uploading}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {uploading ? 'Uploading...' : 'Apply & upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}