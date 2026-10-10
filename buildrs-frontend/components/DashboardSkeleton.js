import { Terminal, Layers, Activity, Users, Server } from 'lucide-react';

function Bar({ className = '' }) {
  return <div className={`bg-white/[0.06] rounded animate-pulse ${className}`} />;
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-[#111622] border border-white/10 rounded-2xl p-6 shadow-xl ${className}`}>
      {children}
    </div>
  );
}

export default function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      {/* Project overview card */}
      <Card>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/10">
          <div className="flex items-center gap-4">
            <Bar className="w-12 h-12 rounded-xl" />
            <div className="space-y-2">
              <Bar className="h-4 w-40" />
              <Bar className="h-3 w-56" />
            </div>
          </div>
          <Bar className="h-10 w-40 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Bar className="h-6 w-16" />
              <Bar className="h-3 w-24" />
            </div>
          ))}
        </div>
      </Card>

      {/* Needs attention */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bar className="w-2.5 h-2.5 rounded-full" />
            <Bar className="h-4 w-40" />
          </div>
          <Bar className="h-3 w-16" />
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-[#161b26] border border-white/5 rounded-xl p-4 flex items-center gap-3.5">
              <Bar className="w-8 h-8 rounded-lg shrink-0" />
              <div className="space-y-2 flex-1">
                <Bar className="h-3 w-32" />
                <Bar className="h-3 w-64 max-w-full" />
                <Bar className="h-3 w-48 max-w-full" />
              </div>
              <Bar className="h-8 w-28 rounded-lg shrink-0" />
            </div>
          ))}
        </div>
      </Card>

      {/* Active development */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-cyan-400/40" />
            <Bar className="h-4 w-40" />
          </div>
          <Bar className="h-6 w-16 rounded-full" />
        </div>
        <div className="bg-[#161b26] border border-white/10 rounded-xl p-5 mb-4 space-y-3">
          <Bar className="h-4 w-32" />
          <Bar className="h-5 w-48" />
          <Bar className="h-2 w-full rounded-full" />
          <Bar className="h-3 w-56" />
        </div>
        <Bar className="h-32 w-full rounded-xl" />
      </Card>

      {/* Sprint + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <Bar className="h-4 w-32" />
            <Bar className="h-3 w-28" />
          </div>
          <div className="flex items-center gap-3 mb-6">
            <Bar className="h-9 w-32 rounded-xl" />
            <Bar className="h-9 w-28 rounded-xl" />
            <Bar className="h-9 w-32 rounded-xl" />
          </div>
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Bar key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-6">
            <Bar className="h-4 w-28" />
            <Bar className="h-3 w-12" />
          </div>
          <div className="space-y-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Bar className="w-7 h-7 rounded-lg shrink-0" />
                <div className="space-y-2 flex-1">
                  <Bar className="h-3 w-40" />
                  <Bar className="h-2.5 w-28" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Ship readiness + debug room */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[Layers, Activity].map((Icon, i) => (
          <Card key={i}>
            <div className="flex items-center justify-between mb-4">
              <Bar className="h-4 w-32" />
              <Bar className="h-4 w-12" />
            </div>
            <Bar className="h-2 w-full rounded-full mb-6" />
            <div className="space-y-4">
              {[0, 1, 2, 3].map((j) => (
                <Bar key={j} className="h-3 w-full" />
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Recent code + connections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[Users, Server].map((Icon, i) => (
          <Card key={i}>
            <div className="flex items-center justify-between mb-6">
              <Bar className="h-4 w-40" />
              <Bar className="h-3 w-16" />
            </div>
            <div className="space-y-4">
              {[0, 1, 2].map((j) => (
                <div key={j} className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Bar className="w-7 h-7 rounded-lg shrink-0" />
                    <div className="space-y-2">
                      <Bar className="h-3 w-48" />
                      <Bar className="h-2.5 w-36" />
                    </div>
                  </div>
                  <Bar className="h-2.5 w-8" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
