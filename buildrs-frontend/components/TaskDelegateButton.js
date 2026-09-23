import { useState } from 'react';
import { Bot, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../lib/api';

export default function TaskDelegateButton({ task, onDelegateComplete, onStatusChange }) {
  const [delegating, setDelegating] = useState(false);
  const [execution, setExecution] = useState(null);
  const [error, setError] = useState(null);
  const [specId, setSpecId] = useState('');
  const [provider, setProvider] = useState('gemini');
  const [localPrivacyMode, setLocalPrivacyMode] = useState(false);

  const handleDelegate = async (e) => {
    e.preventDefault();
    setDelegating(true);
    setError(null);
    try {
      const result = await apiFetch('/api/v1/agent/delegate', {
        method: 'POST',
        body: JSON.stringify({
          taskId: task._id || task.id,
          taskTitle: task.title,
          workspaceId: task.workspaceId || task.companyId,
          summary: task.description,
          specId: specId || null,
          provider,
          localPrivacyMode,
        }),
      });

      if (result.success !== false) {
        setExecution(result.execution);
        onDelegateComplete?.(result);
        onStatusChange?.(result.execution);
      } else {
        setError(result.message || 'Delegation failed');
      }
    } catch (err) {
      setError(err.message || 'Delegation failed');
    } finally {
      setDelegating(false);
    }
  };

  const statusColors = {
    idle: 'bg-gray-500',
    running: 'bg-blue-500 animate-pulse',
    awaiting_approval: 'bg-yellow-500',
    completed: 'bg-green-500',
    failed: 'bg-red-500',
  };

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-[#1e1e2e] border border-[#2e2e3e]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-semibold text-[#e2e2ea]">Delegate to Agent</span>
        </div>
        {execution && (
          <div className={`w-2 h-2 rounded-full ${statusColors[execution.status] || 'bg-gray-500'}`} />
        )}
      </div>

      {task.agentExecution?.status && task.agentExecution.status !== 'idle' && (
        <div className="flex items-center gap-2 text-xs">
          <div className={`w-2 h-2 rounded-full ${statusColors[task.agentExecution.status] || 'bg-gray-500'}`} />
          <span className="text-[#9aa1ae]">{task.agentExecution.status.replace('_', ' ')}</span>
          {task.agentExecution.agentBranch && (
            <span className="text-[#565d6b] text-[10px]">{task.agentExecution.agentBranch}</span>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Spec ID (optional)"
          value={specId}
          onChange={(e) => setSpecId(e.target.value)}
          className="flex-1 text-xs bg-[#14141e] border border-[#2e2e3e] rounded px-2 py-1 text-[#e2e2ea] placeholder-[#565d6b]"
        />
      </div>

      <div className="flex gap-2 items-center">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="text-xs bg-[#14141e] border border-[#2e2e3e] rounded px-2 py-1 text-[#e2e2ea]"
        >
          <option value="gemini">Gemini</option>
          <option value="claude-sonnet">Claude 3.5 Sonnet</option>
          <option value="gpt-4o">GPT-4o</option>
          <option value="groq">Groq</option>
          <option value="ollama">Ollama (Local)</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-[#9aa1ae]">
          <input
            type="checkbox"
            checked={localPrivacyMode}
            onChange={(e) => setLocalPrivacyMode(e.target.checked)}
            className="rounded"
          />
          Local Privacy
        </label>
      </div>

      <button
        onClick={handleDelegate}
        disabled={delegating || task.agentExecution?.status === 'running'}
        className="flex items-center justify-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
      >
        {delegating ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            Delegating...
          </>
        ) : (
          <>
            <Bot className="w-3 h-3" />
            {task.agentExecution?.status === 'awaiting_approval' ? 'View Execution' : 'Delegate to Agent'}
          </>
        )}
      </button>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
          {error}
        </div>
      )}

      {execution?.status === 'awaiting_approval' && (
        <div className="flex gap-2">
          <button
            onClick={() => handleAction('approve', execution._id)}
            className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded"
          >
            <CheckCircle className="w-3 h-3" /> Approve & Merge
          </button>
          <button
            onClick={() => handleAction('reject', execution._id)}
            className="flex items-center gap-1 px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
          >
            <XCircle className="w-3 h-3" /> Reject & Rollback
          </button>
        </div>
      )}
    </div>
  );
}

async function handleAction(action, executionId) {
  try {
    await apiFetch(`/api/v1/agent/${action}`, {
      method: 'POST',
      body: JSON.stringify({ executionId }),
    });
    window.location.reload();
  } catch (err) {
    console.error(`${action} error:`, err);
  }
}
