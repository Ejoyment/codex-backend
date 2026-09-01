import { useRouter } from 'next/router';
import { Users, Building2, Loader2 } from 'lucide-react';

export default function TeamPulse({ companies = [] }) {
  const router = useRouter();

  if (companies.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Building2 className="w-10 h-10 mx-auto mb-3 text-gray-600" />
        <p className="text-sm font-medium text-gray-400">No team workspace yet</p>
        <p className="text-xs text-gray-500">Create or join a company to see team pulse here.</p>
        <button
          type="button"
          onClick={() => router.push('/teams')}
          className="mt-3 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium"
        >
          Go to Teams
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {companies.map((company) => (
        <div
          key={company.id}
          className="flex items-center gap-4 p-4 rounded-lg border border-gray-700 hover:border-gray-500 transition cursor-pointer"
          onClick={() => router.push(`/teams`)}
        >
          <div className="w-10 h-10 rounded-lg bg-navy flex items-center justify-center text-white">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-semibold text-white truncate">{company.name}</p>
              <span className="text-[11px] text-gray-400 capitalize">{company.tier}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {company.memberCount || 0} member{(company.memberCount || 0) !== 1 ? 's' : ''}
              </span>
              {company.memberLimit && (
                <span className="text-gray-500">/ {company.memberLimit} limit</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
