import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Sidebar from '../../../components/Sidebar';
import AuthGuard from '../../../components/AuthGuard';
import useAuthStore from '../../../store/authStore';
import { apiFetch } from '../../../lib/api';
import PageHeader from '../../../components/PageHeader';
import { FileCode as FileCodeIcon, Terminal, GitBranch, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

const SpecEditor = dynamic(() => import('../../../components/SpecEditor'), { ssr: false });
const LiveExecutionDrawer = dynamic(() => import('../../../components/LiveExecutionDrawer'), { ssr: false });

export default function SpecWorkspace() {
  const router = useRouter();
  const { id: specId } = router.query;
  const user = useAuthStore((s) => s.user);
  const [spec, setSpec] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [executionId, setExecutionId] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [driftReport, setDriftReport] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);

  useEffect(() => {
    if (specId) loadSpec();
  }, [specId]);

  const loadSpec = async () => {
    try {
      const result = await apiFetch(`/api/v1/specs/${specId}`);
      if (result.success) {
        setSpec(result.spec);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelegate = (result) => {
    setExecutionId(result.execution?._id);
    setTaskId(result.taskId);
    setShowDrawer(true);
  };

  const handleDriftDetected = (report) => {
    setDriftReport(report);
  };

  const handleVerify = (result) => {
    setVerificationResult(result);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
        {error}
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Spec: {spec?.title} - BuildrsHQ</title>
      </Head>
      <div className="workspace-container min-h-screen">
        <Sidebar />
        <main className="workspace-main flex-1 p-6 bg-[#121821] overflow-auto">
          <div className="mb-6">
            <PageHeader
              breadcrumbs={[{ label: 'Specifications', href: '/specs' }, { label: spec?.title || 'Specification' }]}
              title={(
                <span className="flex items-center gap-3">
                  <FileCodeIcon className="w-6 h-6 text-purple-400" />
                  {spec?.title}
                  <span className="text-xs bg-purple-600/20 text-purple-400 px-2 py-0.5 rounded">
                    {spec?.specId}
                  </span>
                </span>
              )}
              meta={(
                <>
                  <span>Updated: {spec?.updatedAt ? new Date(spec.updatedAt).toLocaleDateString() : 'Never'}</span>
                  {spec?.targetModules?.length > 0 && (
                    <span className="flex items-center gap-1">
                      <GitBranch className="w-3 h-3" /> {spec.targetModules.length} modules
                    </span>
                  )}
                  {spec?.assertions?.length > 0 && (
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {spec.assertions.length} assertions
                    </span>
                  )}
                </>
              )}
            />
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-[#1d263b] rounded-lg border border-figma-border-strong">
              <div className="text-xs text-figma-text-faint mb-1">Target Modules</div>
              <div className="text-lg font-bold text-[#dee2f6]">{spec?.targetModules?.length || 0}</div>
            </div>
            <div className="p-4 bg-[#1d263b] rounded-lg border border-figma-border-strong">
              <div className="text-xs text-figma-text-faint mb-1">Assertions</div>
              <div className="text-lg font-bold text-[#dee2f6]">{spec?.assertions?.length || 0}</div>
            </div>
            <div className="p-4 bg-[#1d263b] rounded-lg border border-figma-border-strong">
              <div className="text-xs text-figma-text-faint mb-1">Verification</div>
              <div className={`text-lg font-bold ${verificationResult?.verdict === 'pass' ? 'text-green-400' : verificationResult?.verdict === 'fail' ? 'text-red-400' : 'text-yellow-400'}`}>
                {verificationResult
                  ? verificationResult.verdict === 'pass'
                    ? 'Passed'
                    : verificationResult.verdict === 'fail'
                      ? 'Failed'
                      : 'Not evaluated'
                  : 'Pending'}
              </div>
            </div>
          </div>

          <div className="mb-4 flex gap-3">
            <button
              onClick={() => setShowDrawer(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg"
            >
              <Terminal className="w-4 h-4" />
              Delegate to Agent
            </button>
            <button
              onClick={() => {
                setDriftReport(null);
                setVerificationResult(null);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-figma-border-strong hover:bg-figma-border-strong text-[#dee2f6] text-sm font-semibold rounded-lg"
            >
              <AlertTriangle className="w-4 h-4" />
              Check Drift
            </button>
          </div>

          {driftReport && driftReport.totalWarnings > 0 && (
            <div className="mb-4 p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-semibold text-yellow-400">{driftReport.totalWarnings} Drift Warning(s)</span>
              </div>
              <div className="space-y-1">
                {driftReport.reports?.map((r, i) => (
                  <div key={i} className="text-xs text-[#dee2f6] bg-[#161d29] p-2 rounded">
                    <span className="text-red-400">⚠ {r.message}</span>
                    <span className="text-figma-text-faint ml-2">{r.file}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {driftReport && driftReport.totalWarnings === 0 && (
            <div className="mb-4 p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm font-semibold text-green-400">No drift detected</span>
              </div>
            </div>
          )}

          <SpecEditor
            specId={specId}
            projectId={spec?.projectId}
            workspaceId={spec?.workspaceId}
            onDriftDetected={handleDriftDetected}
          />
        </main>
      </div>

      {showDrawer && (
        <LiveExecutionDrawer
          taskId={taskId}
          executionId={executionId}
          isOpen={showDrawer}
          onClose={() => setShowDrawer(false)}
        />
      )}
    </>
  );
}

export async function getServerSideProps(context) {
  return { props: {} };
}
