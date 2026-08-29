import { useRouter } from 'next/router';
import { CheckCircle2 } from 'lucide-react';

export default function TrialBanner({ trial }) {
  const router = useRouter();

  if (!trial || !trial.isOnTrial) return null;

  const isUrgent = trial.isLastDay || trial.daysLeft <= 3;
  const bg = trial.isLastDay
    ? 'rgba(239, 68, 68, 0.1)'
    : isUrgent
    ? 'rgba(251, 146, 4, 0.1)'
    : 'rgba(59, 130, 246, 0.1)';
  const border = trial.isLastDay
    ? 'rgba(239, 68, 68, 0.3)'
    : isUrgent
    ? 'rgba(251, 146, 4, 0.3)'
    : 'rgba(59, 130, 246, 0.3)';

  let text;
  if (trial.isLastDay) {
    text = 'Your free trial ends today! Add a payment method to avoid interruption.';
  } else if (trial.daysLeft <= 3) {
    text = `Your free trial ends in ${trial.daysLeft} day${trial.daysLeft !== 1 ? 's' : ''}. Add a payment method to continue.`;
  } else {
    text = `You have ${trial.daysLeft} days left on your free trial. Add a payment method to continue uninterrupted.`;
  }

  return (
    <div
      className="mb-6 p-4 rounded-xl border transition-all duration-300"
      style={{ background: bg, borderColor: border }}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-blue-400">Free Trial Active</p>
            <p className="text-sm text-gray-300">{text}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push('/settings?tab=billing')}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition"
        >
          Add Payment Method
        </button>
      </div>
    </div>
  );
}
