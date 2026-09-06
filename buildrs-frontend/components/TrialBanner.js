import { useRouter } from 'next/router';
import { CheckCircle2, AlertTriangle, Clock3 } from 'lucide-react';

export default function TrialBanner({ trial }) {
  const router = useRouter();

  if (!trial || !trial.isOnTrial) return null;

  const isUrgent = trial.isLastDay || trial.daysLeft <= 3;
  const isLastDay = trial.isLastDay;

  const theme = isLastDay
    ? { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.32)', tint: '#f87171', Icon: AlertTriangle }
    : isUrgent
    ? { bg: 'rgba(229,184,74,0.08)', border: 'rgba(229,184,74,0.32)', tint: '#e5b84a', Icon: Clock3 }
    : { bg: 'rgba(47,214,230,0.08)', border: 'rgba(47,214,230,0.3)', tint: '#2fd6e6', Icon: CheckCircle2 };

  const { Icon } = theme;

  let title;
  let text;
  if (isLastDay) {
    title = 'Trial ends today';
    text = 'Your free trial ends today. Add a payment method to avoid interruption.';
  } else if (isUrgent) {
    title = `Trial ends in ${trial.daysLeft} ` + (trial.daysLeft !== 1 ? 'days' : 'day');
    text = 'Add a payment method to continue uninterrupted.';
  } else {
    title = `Free trial · ${trial.daysLeft} ` + (trial.daysLeft !== 1 ? 'days' : 'day') + ' remaining';
    text = 'You are on the Starter plan with full features until your trial ends.';
  }

  return (
    <div
      className="mb-6 p-4 rounded-xl border"
      style={{ background: theme.bg, borderColor: theme.border }}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: theme.bg, border: `1px solid ${theme.border}` }}
          >
            <Icon className="w-5 h-5" style={{ color: theme.tint }} />
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: theme.tint }}>{title}</p>
            <p className="text-xs text-[#a8adba]">{text}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push('/settings?tab=billing')}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={{ background: '#2fd6e6', color: '#06141a' }}
        >
          Add Payment Method
        </button>
      </div>
    </div>
  );
}