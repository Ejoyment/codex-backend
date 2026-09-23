import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Terminal, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { useXterm } from '../hooks/useXterm';

let io;
if (typeof window !== 'undefined') {
  io = require('socket.io-client').io;
}

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

export default function LiveExecutionDrawer({ taskId, isOpen, onClose, executionId }) {
  const [isOpen_state, setIsOpen] = useState(isOpen);
  const [logs, setLogs] = useState([]);
  const [diffs, setDiffs] = useState([]);
  const [validationStatus, setValidationStatus] = useState(null);
  const [activeTab, setActiveTab] = useState('terminal'); // terminal, diff, validation
  const [socket] = useState(null);

  const terminalContainerRef = useRef(null);
  const diffContainerRef = useRef(null);
  const { terminal, write, writeln, clear, resize } = useXterm('terminal-container');

  useEffect(() => {
    if (!isOpen || !executionId || typeof window === 'undefined' || !io) return;

    const socket = io(SOCKET_URL, {
      auth: { token: localStorage.getItem('authToken') },
      path: '/socket.io',
    });

    socket.on('connect', () => {
      socket.emit('agent:delegate', { executionId, taskId });
    });

    socket.on('agent:execution-complete', (data) => {
      setValidationStatus(data.result);
      setDiffs(data.result?.codeBlocks || []);
    });

    socket.on('agent:progress', (data) => {
      if (data.payload?.message) {
        writeln(`[${data.payload.phase}] ${data.payload.message}`);
        setLogs(prev => [...prev, { timestamp: new Date(), message: data.payload.message }]);
      }
    });

    socket.on('agent:cancelled', (data) => {
      writeln('Execution cancelled by user');
      setValidationStatus({ success: false, message: 'Cancelled' });
    });

    socket.on('agent:execution-error', (data) => {
      writeln(`Error: ${data.error}`);
      setValidationStatus({ success: false, error: data.error });
    });

    socket.on('agent:approved', (data) => {
      writeln('Changes approved and merged');
      setValidationStatus({ success: true, message: 'Merged' });
    });

    socket.on('agent:rejected', (data) => {
      writeln('Changes rejected and rolled back');
      setValidationStatus({ success: false, message: 'Rejected' });
    });

    socket.on('agent:spec-verification', (data) => {
      setValidationStatus(data);
      if (data.passed) {
        writeln('✅ All spec assertions passed');
      } else {
        writeln(`❌ ${data.failedAssertions} assertions failed`);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [isOpen, executionId, taskId]);

  const tabs = [
    { id: 'terminal', label: 'Terminal', icon: Terminal },
    { id: 'diff', label: 'Diff', icon: CodeDiff },
    { id: 'validation', label: 'Validation', icon: CheckCircle },
  ];

  return (
    <div className={`fixed right-0 top-0 h-full w-full max-w-lg bg-[#1e1e2e] border-l border-[#2e2e3e] shadow-2xl z-50 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="flex items-center justify-between p-4 border-b border-[#2e2e3e]">
        <div className="flex items-center gap-2">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          <h3 className="text-lg font-bold text-[#e2e2ea]">Live Execution</h3>
          <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded-full">
            {taskId}
          </span>
        </div>
        <button onClick={onClose} className="text-[#565d6b] hover:text-[#e2e2ea]">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex border-b border-[#2e2e3e]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-[#565d6b] hover:text-[#e2e2ea]'
            }`}
          >
            <tab.icon className="w-3 h-3" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden" style={{ height: 'calc(100% - 120px)' }}>
        {activeTab === 'terminal' && (
          <div ref={terminalContainerRef} className="w-full h-full bg-[#0d0d1a]">
            <div id="terminal-container" className="w-full h-full" />
          </div>
        )}

        {activeTab === 'diff' && (
          <div ref={diffContainerRef} className="w-full h-full bg-[#0d0d1a] p-4 overflow-auto">
            {diffs.length === 0 ? (
              <div className="text-[#565d6b] text-sm text-center py-8">No diffs yet. Agent is executing...</div>
            ) : (
              diffs.map((diff, i) => (
                <div key={i} className="mb-4">
                  <div className="text-xs text-[#9aa1ae] mb-2 font-mono">{diff.language}</div>
                  <pre className="text-xs text-[#e2e2ea] bg-[#14141e] p-3 rounded overflow-x-auto">
                    {diff.code}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'validation' && (
          <div className="w-full h-full bg-[#0d0d1a] p-4 overflow-auto">
            {validationStatus ? (
              <div>
                <div className={`flex items-center gap-2 mb-4 text-sm font-semibold ${
                  validationStatus.passed ? 'text-green-400' : 'text-yellow-400'
                }`}>
                  {validationStatus.passed ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5" />
                  )}
                  {validationStatus.summary || (validationStatus.passed ? 'All checks passed' : 'Issues found')}
                </div>
                {validationStatus.results?.map((r, i) => (
                  <div key={i} className={`text-xs mb-2 p-2 rounded ${r.passed ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                    {r.passed ? '✅' : '❌'} {r.rule || r.assertion?.rule}
                  </div>
                ))}
                {validationStatus.sddVerification && (
                  <div className="mt-4 p-3 bg-[#14141e] rounded text-xs text-[#9aa1ae]">
                    <div>Checked: {validationStatus.sddVerification.checkedAssertions} assertions</div>
                    <div>Passed: {validationStatus.sddVerification.passedAssertions}</div>
                    <div>Failed: {validationStatus.sddVerification.failedAssertions}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[#565d6b] text-sm text-center py-8">Running validation...</div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between p-3 border-t border-[#2e2e3e] bg-[#14141e]">
        <div className="flex items-center gap-2 text-xs text-[#565d6b]">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Streaming logs...</span>
          <span>{logs.length} events</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              clear();
              setLogs([]);
            }}
            className="px-2 py-1 text-xs bg-[#2e2e3e] hover:bg-[#3e3e4e] text-[#e2e2ea] rounded"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="px-2 py-1 text-xs bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
