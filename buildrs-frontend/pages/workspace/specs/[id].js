import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Sidebar from '../../../components/Sidebar';
import AuthGuard from '../../../components/AuthGuard';
import useAuthStore from '../../../store/authStore';
import { apiFetch } from '../../../lib/api';
import SpecEditor from '../../../components/SpecEditor';
import LiveExecutionDrawer from '../../../components/LiveExecutionDrawer';
import { FileCode, Terminal, GitBranch, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

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
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 p-6 bg-[#0f0f1a] overflow-auto">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <FileCode className="w-6 h-6 text-purple-400" />
              <h1 className="text-2xl font-bold text-[#e2e2ea]">{spec?.title}</h1>
              <span className="text-xs bg-purple-600/20 text-purple-400 px-2 py-0.5 rounded">
                {spec?.specId}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#565d6b]">
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
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-[#1e1e2e] rounded-lg border border-[#2e2e3e]">
              <div className="text-xs text-[#565d6b] mb-1">Target Modules</div>
              <div className="text-lg font-bold text-[#e2e2ea]">{spec?.targetModules?.length || 0}</div>
            </div>
            <div className="p-4 bg-[#1e1e2e] rounded-lg border border-[#2e2e3e]">
              <div className="text-xs text-[#565d6b] mb-1">Assertions</div>
              <div className="text-lg font-bold text-[#e2e2ea]">{spec?.assertions?.length || 0}</div>
            </div>
            <div className="p-4 bg-[#1e1e2e] rounded-lg border border-[#2e2e3e]">
              <div className="text-xs text-[#565d6b] mb-1">Verification</div>
              <div className={`text-lg font-bold ${verificationResult?.passed ? 'text-green-400' : 'text-yellow-400'}`}>
                {verificationResult ? (verificationResult.passed ? 'Passed' : 'Failed') : 'Pending'}
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
              className="flex items-center gap-2 px-4 py-2 bg-[#2e2e3e] hover:bg-[#3e3e4e] text-[#e2e2ea] text-sm font-semibold rounded-lg"
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
                  <div key={i} className="text-xs text-[#e2e2ea] bg-[#14141e] p-2 rounded">
                    <span className="text-red-400">⚠ {r.message}</span>
                    <span className="text-[#565d6b] ml-2">{r.file}</span>
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
            workspaceId={spec?.workspaceId}
            onDriftDetected={handleDriftDetected}
          />
        </div>
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
