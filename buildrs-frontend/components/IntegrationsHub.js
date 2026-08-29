import { useRouter } from 'next/router';
import BrandIcon from './BrandIcon';

export default function IntegrationsHub({ integrations }) {
  const router = useRouter();

  if (integrations === null) {
    return <p className="text-muted text-sm">Loading integrations...</p>;
  }

  if (integrations.length === 0) {
    return (
      <div className="col-span-4 text-center py-8">
        <p className="text-muted text-sm">No integrations connected yet</p>
        <button
          type="button"
          onClick={() => router.push('/settings#integrations')}
          className="text-sm text-blue-400 mt-2 inline-block bg-transparent border-none cursor-pointer"
        >
          Connect Integrations →
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {integrations.map((integration) => (
        <div
          key={integration.platform}
          className="integration-card p-4 rounded-lg cursor-pointer transition"
          onClick={() => router.push('/settings#integrations')}
        >
          <div
            className="w-12 h-12 mb-3"
            style={{ color: integration.connected ? '#3b82f6' : '#94a3b8' }}
          >
            <BrandIcon platform={integration.platform} className="w-12 h-12" />
          </div>
          <div className="font-semibold text-sm mb-1 text-white">{integration.name}</div>
          <span className={`badge ${integration.connected ? 'badge-green' : 'badge-gray'} px-2 py-0.5 rounded text-[11px]`}>
            {integration.connected ? 'Connected' : 'Not Connected'}
          </span>
        </div>
      ))}
    </div>
  );
}
