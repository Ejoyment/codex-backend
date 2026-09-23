import { useState } from 'react';
import { CheckCircle, MessageSquare, XCircle, Loader2 } from 'lucide-react';
import { apiFetch } from '../lib/api';

export default function HITLActionBar({ execution, onAction }) {
  const [tweakPrompt, setTweakPrompt] = useState('');
  const [tweaking, setTweaking] = useState(false);
  const [activeAction, setActiveAction] = useState(null);

  const handleApprove = async () => {
    setActiveAction('approve');
    try {
      const result = await apiFetch('/api/v1/agent/approve', {
        method: 'POST',
        body: JSON.stringify({ executionId: execution._id, taskId: execution.metadata?.taskId }),
      });
      onAction?.('approve', result);
    } catch (err) {
      console.error('Approve error:', err);
    } finally {
      setActiveAction(null);
    }
  };

  const handleReject = async () => {
    setActiveAction('reject');
    try {
      const result = await apiFetch('/api/v1/agent/reject', {
        method: 'POST',
        body: JSON.stringify({ executionId: execution._id, taskId: execution.metadata?.taskId }),
      });
      onAction?.('reject', result);
    } catch (err) {
      console.error('Reject error:', err);
    } finally {
      setActiveAction(null);
    }
  };

  const handleTweak = async () => {
    if (!tweakPrompt.trim()) return;
    setTweaking(true);
    setActiveAction('tweak');
    try {
      const result = await apiFetch('/api/v1/agent/tweak', {
        method: 'POST',
        body: JSON.stringify({
          executionId: execution._id,
          taskId: execution.metadata?.taskId,
          feedback: tweakPrompt,
        }),
      });
      onAction?.('tweak', result);
      setTweakPrompt('');
    } catch (err) {
      console.error('Tweak error:', err);
    } finally {
      setTweaking(false);
      setActiveAction(null);
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
    <div className="fixed bottom-0 left-0 right-0 bg-[#1e1e2e] border-t border-[#2e2e3e] shadow-2xl z-50">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <div className={`w-3 h-3 rounded-full ${statusColors[execution?.status] || 'bg-gray-500'}`} />
          <div>
            <h4 className="text-sm font-semibold text-[#e2e2ea]">{execution?.taskTitle}</h4>
            <p className="text-xs text-[#565d6b]">
              Status: {execution?.status?.replace('_', ' ')} • Branch: {execution?.metadata?.agentBranch}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleApprove}
            disabled={execution?.status !== 'awaiting_approval' || activeAction === 'approve'}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {activeAction === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Approve & Merge
          </button>

          <button
            onClick={() => setActiveAction(activeAction === 'tweak' ? null : 'tweak')}
            disabled={execution?.status !== 'awaiting_approval'}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            Tweak Prompt
          </button>

          <button
            onClick={handleReject}
            disabled={execution?.status !== 'awaiting_approval' || activeAction === 'reject'}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {activeAction === 'reject' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Reject & Rollback
          </button>
        </div>
      </div>

      {activeAction === 'tweak' && (
        <div className="border-t border-[#2e2e3e] p-4 bg-[#14141e]">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-[#9aa1ae] mb-1 block">Feedback to Agent</label>
              <textarea
                value={tweakPrompt}
                onChange={(e) => setTweakPrompt(e.target.value)}
                placeholder="Describe what needs to be revised..."
                className="w-full bg-[#1e1e2e] border border-[#2e2e3e] rounded-lg px-3 py-2 text-sm text-[#e2e2ea] placeholder-[#565d6b] resize-none focus:outline-none focus:border-blue-500"
                rows={3}
              />
            </div>
            <button
              onClick={handleTweak}
              disabled={tweaking || !tweakPrompt.trim()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {tweaking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Feedback'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
