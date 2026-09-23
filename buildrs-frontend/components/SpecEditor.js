import { useState, useEffect, useRef } from 'react';
import { FileCode as FileCodeIcon, GitBranch, Eye, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import dynamic from 'next/dynamic';
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false, loading: () => <div>Loading editor...</div> });
import { apiFetch } from '../lib/api';

export default function SpecEditor({ specId, workspaceId, onDriftDetected }) {
  const [spec, setSpec] = useState(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [driftWarnings, setDriftWarnings] = useState([]);
  const [activeTab, setActiveTab] = useState('spec');
  const [codeContent, setCodeContent] = useState('');
  const [codePath, setCodePath] = useState('');
  const [targetFile, setTargetFile] = useState('');
  const editorRef = useRef(null);

  useEffect(() => {
    if (specId) {
      loadSpec();
    }
  }, [specId]);

  const loadSpec = async () => {
    try {
      const result = await apiFetch(`/api/v1/specs/${specId}`);
      if (result.success && result.spec) {
        setSpec(result.spec);
        setContent(result.spec.content);
      }
    } catch (err) {
      console.error('Failed to load spec:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/v1/specs', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId,
          title: spec?.title || 'New Spec',
          content,
          targetFiles: spec?.targetFiles || [],
          targetModules: spec?.targetModules || [],
          assertions: spec?.assertions || [],
          specId,
        }),
      });
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleRunVerification = async () => {
    try {
      const result = await apiFetch('/api/v1/specs/verify', {
        method: 'POST',
        body: JSON.stringify({ specId, workspaceId }),
      });
      if (result.success) {
        setDriftWarnings(result.failedAssertions > 0 ? result.results.filter(r => !r.passed) : []);
        onDriftDetected?.(result);
      }
    } catch (err) {
      console.error('Verification error:', err);
    }
  };

  const handleTargetFileChange = async (filePath) => {
    setTargetFile(filePath);
    try {
      const result = await apiFetch('/api/code-editor', {
        method: 'POST',
        body: JSON.stringify({ path: filePath, workspaceId }),
      });
      if (result.file) {
        setCodeContent(result.file.content);
        setCodePath(filePath);
      }
    } catch (err) {
      console.error('Failed to load file:', err);
    }
  };

  const runASTDriftCheck = async () => {
    try {
      const report = await apiFetch('/api/v1/specs/drift-report', {
        method: 'POST',
        body: JSON.stringify({ workspaceId }),
      });
      if (report.success && report.report) {
        setDriftWarnings(report.report.reports || []);
        onDriftDetected?.(report.report);
      }
    } catch (err) {
      console.error('Drift report error:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-[#565d6b]">
        Loading spec...
      </div>
    );
  }

  const parseFrontmatter = (content) => {
    if (!content.startsWith('---')) return null;
    const endIdx = content.indexOf('---', 3);
    if (endIdx === -1) return null;
    const frontmatter = content.substring(3, endIdx).trim();
    const body = content.substring(endIdx + 3).trim();
    return { frontmatter, body };
  };

  const parsed = parseFrontmatter(content || '');

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] rounded-lg border border-[#2e2e3e] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#2e2e3e] bg-[#14141e]">
        <div className="flex items-center gap-2">
          <FileCodeIcon className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold text-[#e2e2ea]">
            {spec?.title || 'Spec Editor'}
          </span>
          {spec?.specId && (
            <span className="text-xs bg-purple-600/20 text-purple-400 px-2 py-0.5 rounded">
              {spec.specId}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunVerification}
            className="px-3 py-1 text-xs bg-green-600/20 hover:bg-green-600/40 text-green-400 rounded"
          >
            <CheckCircle className="w-3 h-3 inline mr-1" /> Verify
          </button>
          <button
            onClick={runASTDriftCheck}
            className="px-3 py-1 text-xs bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 rounded"
          >
            <AlertTriangle className="w-3 h-3 inline mr-1" /> Drift Check
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex border-b border-[#2e2e3e]">
        <button
          onClick={() => setActiveTab('spec')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'spec' ? 'border-purple-500 text-purple-400' : 'border-transparent text-[#565d6b]'
          }`}
        >
          .spec.md
        </button>
        {targetFile && (
          <button
            onClick={() => setActiveTab('code')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'code' ? 'border-blue-500 text-blue-400' : 'border-transparent text-[#565d6b]'
            }`}
          >
            {targetFile.split('/').pop()}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'spec' && (
          <div className="flex h-full">
            <div className="w-1/2 border-r border-[#2e2e3e]">
              <MonacoEditor
                height="100%"
                language="markdown"
                value={content}
                onChange={(value) => setContent(value || '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  padding: { top: 10 },
                }}
                onMount={(editor) => { editorRef.current = editor; }}
                style={{ background: '#0d0d1a' }}
              />
            </div>
            <div className="w-1/2 p-4 overflow-auto bg-[#0d0d1a]">
              {parsed && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-[#9aa1ae] mb-2">Frontmatter</h4>
                    <div className="text-xs text-[#e2e2ea] bg-[#14141e] p-3 rounded font-mono">
                      {parsed.frontmatter}
                    </div>
                  </div>
                  {spec?.assertions && spec.assertions.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-[#9aa1ae] mb-2">Assertions</h4>
                      <div className="space-y-1">
                        {spec.assertions.map((a, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            {a.passed !== false ? (
                              <CheckCircle className="w-3 h-3 text-green-400" />
                            ) : (
                              <XCircle className="w-3 h-3 text-red-400" />
                            )}
                            <span className="text-[#e2e2ea]">{a.rule}</span>
                            <span className="text-[#565d6b]">→ {a.target}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {spec?.targetModules && spec.targetModules.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-[#9aa1ae] mb-2">Target Modules</h4>
                      <div className="space-y-1">
                        {spec.targetModules.map((m, i) => (
                          <button
                            key={i}
                            onClick={() => handleTargetFileChange(m)}
                            className="w-full text-left text-xs text-blue-400 hover:text-blue-300 bg-[#14141e] p-2 rounded"
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'code' && targetFile && (
          <MonacoEditor
            height="100%"
            language={targetFile.endsWith('.ts') || targetFile.endsWith('.tsx') ? 'typescript' : 'javascript'}
            value={codeContent}
            onChange={(value) => setCodeContent(value || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 10 },
            }}
            style={{ background: '#0d0d1a' }}
          />
        )}
      </div>

      {driftWarnings.length > 0 && (
        <div className="border-t border-[#2e2e3e] p-3 bg-red-500/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            <span className="text-xs font-semibold text-yellow-400">AST Drift Warnings</span>
          </div>
          {driftWarnings.map((w, i) => (
            <div key={i} className="text-xs text-[#e2e2ea] bg-[#14141e] p-2 rounded mb-1 flex items-center gap-2">
              <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
              <span>{w.message}</span>
              <span className="text-[#565d6b] ml-auto">{w.file}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
