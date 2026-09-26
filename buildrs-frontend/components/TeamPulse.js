import { useRouter } from 'next/router';
import { Building2, Users, ChevronRight } from 'lucide-react';

export default function TeamPulse({ companies = [] }) {
  const router = useRouter();

  if (companies.length === 0) {
    return (
      <div className="dash-empty">
        <div className="dash-empty-ico">
          <Building2 className="w-5 h-5" />
        </div>
        <p className="dash-empty-title">No team workspace yet</p>
        <p className="dash-empty-sub">Create or join a company to see team pulse here.</p>
        <button
          type="button"
          onClick={() => router.push('/teams')}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm no-underline font-medium inline-flex items-center gap-1.5"
        >
          Go to Teams
        </button>
      </div>
    );
  }

  return (
    <div>
      {companies.map((company) => (
        <div
          key={company.id}
          className="co-row"
          onClick={() => router.push('/teams')}
        >
          <div className="co-ico">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="queue-title">{company.name}</p>
              {company.tier && <span className="tier-badge">{company.tier}</span>}
            </div>
            <div className="queue-meta">
              <span className="queue-due">
                <Users className="w-3 h-3 inline mr-1 align-text-top" style={{ color: '#565d6b' }} />
                {company.memberCount || 0} member{(company.memberCount || 0) !== 1 ? 's' : ''}
              </span>
              {company.memberLimit && (
                <span className="queue-due">/ {company.memberLimit} seat limit</span>
              )}
            </div>
          </div>
          <ChevronRight className="queue-chevron" />
        </div>
      ))}
    </div>
  );
}