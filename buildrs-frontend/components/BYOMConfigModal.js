import { useState } from 'react';
import { X, Shield, Cloud, Server, Wifi, XCircle, Loader2 } from 'lucide-react';
import { apiFetch } from '../lib/api';

export default function BYOMConfigModal({ isOpen, onClose, onConfigChange }) {
  const [apiKeys, setApiKeys] = useState({
    anthropic: '',
    openai: '',
    groq: '',
    ollamaUrl: 'http://localhost:11434',
    lmStudioUrl: 'http://localhost:1234',
  });
  const [models, setModels] = useState({
    claude: 'claude-3-5-sonnet-20241022',
    gpt4o: 'gpt-4o',
    ollama: 'llama3',
    lmStudio: 'local-model',
  });
  const [localPrivacyMode, setLocalPrivacyMode] = useState(false);
  const [ollamaEnabled, setOllamaEnabled] = useState(false);
  const [lmStudioEnabled, setLmStudioEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState({});

  if (!isOpen) return null;

  const checkConnection = async (provider) => {
    setStatus(prev => ({ ...prev, [provider]: 'checking' }));
    try {
      const result = await apiFetch('/api/v1/agent/delegate', {
        method: 'POST',
        body: JSON.stringify({
          taskTitle: `Connection test for ${provider}`,
          provider,
          localPrivacyMode: provider === 'ollama' || provider === 'lm-studio',
        }),
      });
      setStatus(prev => ({ ...prev, [provider]: 'connected' }));
    } catch {
      setStatus(prev => ({ ...prev, [provider]: 'disconnected' }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await apiFetch('/api/v1/agent/delegate', {
        method: 'POST',
        body: JSON.stringify({
          taskTitle: 'Update BYOM config',
          metadata: {
            ...apiKeys,
            models,
            localPrivacyMode,
            ollamaEnabled,
            lmStudioEnabled,
          },
        }),
      });
      onConfigChange?.(result);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const connectionIcons = {
    checking: <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />,
    connected: <Wifi className="w-4 h-4 text-green-400" />,
    disconnected: <XCircle className="w-4 h-4 text-red-400" />,
  };

  const statusColors = {
    checking: 'border-yellow-500/30',
    connected: 'border-green-500/30',
    disconnected: 'border-red-500/30',
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div
        className="bg-[#1e1e2e] rounded-xl border border-[#2e2e3e] max-w-2xl w-full max-h-[90vh] overflow-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-[#2e2e3e]">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-purple-400" />
            <h2 className="text-xl font-bold text-[#e2e2ea]">Bring Your Own Model</h2>
          </div>
          <button onClick={onClose} className="text-[#565d6b] hover:text-[#e2e2ea]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg">{error}</div>
          )}

          {/* Local Privacy Mode Toggle */}
          <div className="flex items-center justify-between p-4 bg-[#14141e] rounded-lg border border-[#2e2e3e]">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-green-400" />
              <div>
                <h3 className="text-sm font-semibold text-[#e2e2ea]">Local Privacy Mode</h3>
                <p className="text-xs text-[#565d6b]">All AI processing runs locally via Ollama/LM Studio</p>
              </div>
            </div>
            <button
              onClick={() => setLocalPrivacyMode(!localPrivacyMode)}
              className={`w-12 h-6 rounded-full transition-colors ${localPrivacyMode ? 'bg-green-600' : 'bg-[#2e2e3e]'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full mt-0.5 transition-transform ${localPrivacyMode ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Cloud Providers */}
          <div>
            <h3 className="text-sm font-semibold text-[#e2e2ea] mb-3 flex items-center gap-2">
              <Cloud className="w-4 h-4" /> Cloud Providers
            </h3>
            <div className="space-y-3">
              <div className="p-4 bg-[#14141e] rounded-lg border border-[#2e2e3e]">
                <label className="text-xs text-[#9aa1ae] mb-1 block">Anthropic API Key</label>
                <input
                  type="password"
                  value={apiKeys.anthropic}
                  onChange={(e) => setApiKeys({ ...apiKeys, anthropic: e.target.value })}
                  placeholder="sk-ant-..."
                  className="w-full bg-[#1e1e2e] border border-[#2e2e3e] rounded px-3 py-2 text-sm text-[#e2e2ea] placeholder-[#565d6b] focus:outline-none focus:border-purple-500"
                />
                <label className="text-xs text-[#9aa1ae] mt-2 mb-1 block">Model</label>
                <select
                  value={models.claude}
                  onChange={(e) => setModels({ ...models, claude: e.target.value })}
                  className="w-full bg-[#1e1e2e] border border-[#2e2e3e] rounded px-3 py-2 text-sm text-[#e2e2ea]"
                >
                  <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                  <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                  <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
                </select>
              </div>

              <div className="p-4 bg-[#14141e] rounded-lg border border-[#2e2e3e]">
                <label className="text-xs text-[#9aa1ae] mb-1 block">OpenAI API Key</label>
                <input
                  type="password"
                  value={apiKeys.openai}
                  onChange={(e) => setApiKeys({ ...apiKeys, openai: e.target.value })}
                  placeholder="sk-..."
                  className="w-full bg-[#1e1e2e] border border-[#2e2e3e] rounded px-3 py-2 text-sm text-[#e2e2ea] placeholder-[#565d6b] focus:outline-none focus:border-blue-500"
                />
                <label className="text-xs text-[#9aa1ae] mt-2 mb-1 block">Model</label>
                <select
                  value={models.gpt4o}
                  onChange={(e) => setModels({ ...models, gpt4o: e.target.value })}
                  className="w-full bg-[#1e1e2e] border border-[#2e2e3e] rounded px-3 py-2 text-sm text-[#e2e2ea]"
                >
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                </select>
              </div>

              <div className="p-4 bg-[#14141e] rounded-lg border border-[#2e2e3e]">
                <label className="text-xs text-[#9aa1ae] mb-1 block">Groq API Key</label>
                <input
                  type="password"
                  value={apiKeys.groq}
                  onChange={(e) => setApiKeys({ ...apiKeys, groq: e.target.value })}
                  placeholder="gsk-..."
                  className="w-full bg-[#1e1e2e] border border-[#2e2e3e] rounded px-3 py-2 text-sm text-[#e2e2ea] placeholder-[#565d6b] focus:outline-none focus:border-green-500"
                />
              </div>
            </div>
          </div>

          {/* Local Providers */}
          <div>
            <h3 className="text-sm font-semibold text-[#e2e2ea] mb-3 flex items-center gap-2">
              <Server className="w-4 h-4" /> Local Privacy Engine
            </h3>
            <div className="space-y-3">
              <div className={`p-4 bg-[#14141e] rounded-lg border ${statusColors[status.ollama] || 'border-[#2e2e3e]'}`}>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-[#9aa1ae]">Ollama</label>
                  <button
                    onClick={() => checkConnection('ollama')}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {connectionIcons[status.ollama] || 'Test'}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ollamaEnabled}
                      onChange={(e) => setOllamaEnabled(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-xs text-[#e2e2ea]">Enable</span>
                  </label>
                  <input
                    type="text"
                    value={apiKeys.ollamaUrl}
                    onChange={(e) => setApiKeys({ ...apiKeys, ollamaUrl: e.target.value })}
                    className="flex-1 bg-[#1e1e2e] border border-[#2e2e3e] rounded px-3 py-1.5 text-xs text-[#e2e2ea]"
                  />
                  <input
                    type="text"
                    value={models.ollama}
                    onChange={(e) => setModels({ ...models, ollama: e.target.value })}
                    className="w-32 bg-[#1e1e2e] border border-[#2e2e3e] rounded px-3 py-1.5 text-xs text-[#e2e2ea]"
                  />
                </div>
              </div>

              <div className={`p-4 bg-[#14141e] rounded-lg border ${statusColors[status.lmStudio] || 'border-[#2e2e3e]'}`}>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-[#9aa1ae]">LM Studio</label>
                  <button
                    onClick={() => checkConnection('lm-studio')}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {connectionIcons[status.lmStudio] || 'Test'}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={lmStudioEnabled}
                      onChange={(e) => setLmStudioEnabled(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-xs text-[#e2e2ea]">Enable</span>
                  </label>
                  <input
                    type="text"
                    value={apiKeys.lmStudioUrl}
                    onChange={(e) => setApiKeys({ ...apiKeys, lmStudioUrl: e.target.value })}
                    className="flex-1 bg-[#1e1e2e] border border-[#2e2e3e] rounded px-3 py-1.5 text-xs text-[#e2e2ea]"
                  />
                  <input
                    type="text"
                    value={models.lmStudio}
                    onChange={(e) => setModels({ ...models, lmStudio: e.target.value })}
                    className="w-32 bg-[#1e1e2e] border border-[#2e2e3e] rounded px-3 py-1.5 text-xs text-[#e2e2ea]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <h4 className="text-sm font-semibold text-purple-400 mb-2">Privacy Note</h4>
            <p className="text-xs text-[#9aa1ae]">
              When Local Privacy Mode is enabled, all prompt construction, vector embeddings, and diff analysis execute strictly via local endpoints (Ollama/LM Studio) with zero external network leakage. Cloud API keys are still stored but not used for inference.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-[#2e2e3e]">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#2e2e3e] hover:bg-[#3e3e4e] text-[#e2e2ea] text-sm font-semibold rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}
