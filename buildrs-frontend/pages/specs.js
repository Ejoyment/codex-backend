import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { AlertTriangle, Check, CheckCircle2, CircleHelp, FileCode2, FolderGit2, Loader2, Plus, Play, ShieldAlert, X } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, projectApi } from '../lib/api';

const CHECK_TYPES = ['code_pattern', 'test_name', 'file_exists', 'ai_review', 'manual'];
const RULE_CATEGORIES = ['Security', 'Architecture', 'Policy', 'Performance', 'Reliability', 'Other'];
const EMPTY_REQUIREMENT = { id: 'SECURITY-001', category: 'Security', text: '', checkType: 'manual', checkValue: '', severity: 'blocking' };
const EMPTY_FORM = {
  title: '', description: '', targetModules: '', architecturalRules: '', requirements: [{ ...EMPTY_REQUIREMENT }],
  forbiddenImports: '', constraints: '', verificationCommand: '', coverageThreshold: '',
};

const STATUS_STYLE = {
  unvalidated: { color: '#9aaeba', Icon: CircleHelp },
  healthy: { color: '#03ba03', Icon: CheckCircle2 },
  warning: { color: '#e5b84a', Icon: AlertTriangle },
  failing: { color: '#ec1414', Icon: ShieldAlert },
  drifted: { color: '#ec1414', Icon: AlertTriangle },
};

function lines(value) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

function modules(value) {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function nextRuleId(requirements, category = 'Security') {
  const existingIds = new Set(requirements.map((requirement) => requirement.id));
  let number = 1;
  let id;
  do {
    id = `${category.toUpperCase()}-${String(number).padStart(3, '0')}`;
    number += 1;
  } while (existingIds.has(id));
  return id;
}

function formatValidationTime(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Unknown';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(timestamp).toLocaleDateString();
}

function toForm(spec) {
  return {
    title: spec.title || '',
    description: spec.description || '',
    targetModules: (spec.targetModules || []).join(', '),
    architecturalRules: (spec.architecturalRules || []).join('\n'),
    requirements: spec.requirements?.length ? spec.requirements.map((requirement) => ({
      id: requirement.id || '',
      category: requirement.category || 'Security',
      text: requirement.text || '',
      checkType: requirement.checkType || 'manual',
      checkValue: requirement.checkConfig?.pattern || requirement.checkConfig?.path || requirement.checkConfig?.testName || '',
      severity: requirement.severity || 'blocking',
    })) : [{ ...EMPTY_REQUIREMENT }],
    forbiddenImports: (spec.forbiddenImports || []).join('\n'),
    constraints: (spec.constraints || []).map((item) => `${item.key}=${item.value}`).join('\n'),
    verificationCommand: spec.verificationCommand || '',
    coverageThreshold: spec.coverageThreshold ?? '',
  };
}

export default function SpecsPage() {
  const user = useAuthStore((state) => state.user);
  const subscription = useAuthStore((state) => state.subscription);
  const router = useRouter();
  // Specs belong to a project. A workspace is optional collaboration context,
  // so a solo project gets the full spec workflow with no workspace at all.
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [specs, setSpecs] = useState([]);
  const [selectedSpecId, setSelectedSpecId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [verifyingId, setVerifyingId] = useState('');
  const [editing, setEditing] = useState(null);
  const [successSpec, setSuccessSpec] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const selectedSpec = specs.find((spec) => spec._id === selectedSpecId) || specs[0] || null;

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingProjects(true);
      try {
        const result = await projectApi.list();
        if (!active) return;
        const list = result.projects || [];
        setProjects(list);
        setProjectId((current) => current || list[0]?.id || list[0]?._id || '');
      } catch (error) {
        if (active) setLoadError(error.message || 'Could not load projects');
      } finally {
        if (active) setLoadingProjects(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const loadSpecs = useCallback(async () => {
    if (!projectId) { setSpecs([]); setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      const result = await apiFetch(`/api/v1/specs/project/${projectId}`);
      setSpecs(result.specs || []);
    } catch (error) {
      setLoadError(error.message || 'Could not load specs');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadSpecs(); }, [loadSpecs]);

  const closeEditor = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setNotice('');
  };

  const openEditor = (spec = null) => {
    setEditing(spec || {});
    setForm(spec ? toForm(spec) : EMPTY_FORM);
    setNotice('');
  };

  const updateRequirement = (index, key, value) => {
    setForm((current) => ({
      ...current,
      requirements: current.requirements.map((requirement, itemIndex) => itemIndex === index ? { ...requirement, [key]: value } : requirement),
    }));
  };

  const addRequirement = () => {
    setForm((current) => ({
      ...current,
      requirements: [...current.requirements, {
        ...EMPTY_REQUIREMENT,
        id: nextRuleId(current.requirements),
        category: 'Security',
      }],
    }));
  };

  const saveSpec = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !projectId) return;
    setSaving(true);
    setNotice('');
    try {
      const existingRequirements = editing?._id ? editing.requirements || [] : [];
      const usedRuleIds = new Set();
      const requirements = form.requirements.filter((requirement) => requirement.text.trim()).map((requirement, index) => {
        const checkConfig = requirement.checkType === 'code_pattern' ? { pattern: requirement.checkValue } :
          requirement.checkType === 'file_exists' ? { path: requirement.checkValue } :
            requirement.checkType === 'test_name' ? { testName: requirement.checkValue } : {};
        let id = requirement.id.trim() || existingRequirements[index]?.id || '';
        if (!id || usedRuleIds.has(id)) {
          id = nextRuleId([...form.requirements, ...Array.from(usedRuleIds, (usedId) => ({ id: usedId }))], requirement.category);
        }
        usedRuleIds.add(id);
        return {
          id,
          category: requirement.category,
          text: requirement.text.trim(),
          checkType: requirement.checkType,
          checkConfig,
          severity: requirement.severity,
        };
      });
      const constraints = lines(form.constraints).map((line) => {
        const separator = line.indexOf('=');
        return separator < 0 ? { key: line, value: '' } : { key: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() };
      });
      const result = await apiFetch('/api/v1/specs', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          title: form.title.trim(),
          description: form.description.trim(),
          content: form.description.trim() || form.title.trim(),
          targetModules: modules(form.targetModules),
          architecturalRules: lines(form.architecturalRules),
          requirements,
          forbiddenImports: lines(form.forbiddenImports),
          constraints,
          verificationCommand: form.verificationCommand.trim(),
          coverageThreshold: form.coverageThreshold === '' ? null : Number(form.coverageThreshold),
          specId: editing?._id ? editing.specId : undefined,
        }),
      });
      if (!result.success || !result.spec) throw new Error(result.message || 'Could not save this spec');
      setSpecs((current) => [result.spec, ...current.filter((item) => item._id !== result.spec?._id)]);
      if (editing?._id) {
        setSelectedSpecId(result.spec?._id || '');
      } else {
        setSuccessSpec(result.spec);
      }
      closeEditor();
    } catch (error) {
      setNotice(error.message || 'Could not save this spec');
    } finally {
      setSaving(false);
    }
  };

  const runValidation = async (spec) => {
    setVerifyingId(spec._id);
    setNotice('');
    try {
      const result = await apiFetch('/api/v1/specs/verify', {
        method: 'POST',
        body: JSON.stringify({ specId: spec._id, projectId }),
      });
      const validation = result.verification || result;
      setSpecs((current) => current.map((item) => item._id === spec._id ? {
        ...item,
        status: validation.status || (validation.passed ? 'healthy' : 'failing'),
        lastValidatedAt: validation.checkedAt || new Date().toISOString(),
        lastValidationResult: validation,
      } : item));
    } catch (error) {
      setNotice(error.message || 'Validation failed');
    } finally {
      setVerifyingId('');
    }
  };

  const deleteSpec = async (spec) => {
    if (!window.confirm(`Delete "${spec.title}"? Tasks attached to it will need a replacement spec.`)) return;
    try {
      await apiFetch(`/api/v1/specs/${spec._id}`, { method: 'DELETE' });
      setSpecs((current) => current.filter((item) => item._id !== spec._id));
      if (selectedSpecId === spec._id) setSelectedSpecId('');
    } catch (error) {
      setNotice(error.message || 'Could not delete this spec');
    }
  };

  return (
    <AuthGuard>
      <Head><title>Specs - BuildrsHQ</title><link rel="icon" href="/buildrs.png" /></Head>
      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />
        <main className="workspace-main specs-page">
          {editing ? (
            <section className="specs-editor-page">
              <div className="specs-editor-titlebar">
                <button type="button" className="specs-editor-back" onClick={closeEditor} aria-label="Back to specifications"><span aria-hidden="true">←</span></button>
                <h1>{editing._id ? 'Edit Specification' : 'Create Specification'}</h1>
              </div>
              <form className="specs-editor-form" onSubmit={saveSpec}>
                <div className="specs-editor-banner">
                  <h2>{editing._id ? 'Edit Specification' : 'New Specification'}</h2>
                  <p>Define executable rules that keep architecture, security, and implementation decisions aligned.</p>
                </div>
                {notice && <div className="std-alert std-alert-error specs-editor-alert">{notice}</div>}

                <div className="specs-editor-details">
                  <section className="specs-editor-card">
                    <div className="specs-editor-card-heading">
                      <h2>Specification Details</h2>
                      <p>Name the contract and define which code it governs.</p>
                    </div>
                    <label className="specs-editor-field">
                      <span>Specification Name</span>
                      <input className="ws-input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. NOTIFICATION-SPEC" required />
                    </label>
                    <p className="specs-editor-hint">File: .Md</p>
                    <label className="specs-editor-field">
                      <span>Applies to</span>
                      <input className="ws-input" value={form.targetModules} onChange={(event) => setForm({ ...form, targetModules: event.target.value })} placeholder="e.g. src/api/auth.ts" />
                    </label>
                    <p className="specs-editor-hint">Separate multiple paths with commas.</p>
                    <label className="specs-editor-field">
                      <span>Purpose and Scope</span>
                      <textarea className="ws-input" rows={4} maxLength={200} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Explain the architectural intent and the outcomes this specification protects." />
                    </label>
                    <p className="specs-editor-counter">{form.description.length}/200</p>
                  </section>

                  <section className="specs-editor-card specs-rules-card">
                    <div className="specs-editor-card-heading specs-rules-heading">
                      <div>
                        <h2>Expected Rules</h2>
                        <p>Each rule should describe one clear requirement that can be verified.</p>
                      </div>
                      <button type="button" className="btn-workspace btn-secondary" onClick={addRequirement}><Plus /> Add Rule</button>
                    </div>
                    <div className="specs-editor-rules">
                      {form.requirements.map((requirement, index) => (
                        <article className="specs-editor-rule" key={index}>
                          <span className="specs-editor-rule-number">{index + 1}</span>
                          <div className="specs-editor-rule-fields">
                            <label className="specs-editor-field">
                              <span>Rule ID</span>
                              <div className="specs-rule-id-row">
                                <input className="ws-input" value={requirement.id} onChange={(event) => updateRequirement(index, 'id', event.target.value)} placeholder="SECURITY-001" />
                                {form.requirements.length > 1 && <button type="button" className="specs-remove-rule" onClick={() => setForm({ ...form, requirements: form.requirements.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remove rule ${index + 1}`}><X /></button>}
                              </div>
                            </label>
                            <label className="specs-editor-field">
                              <span>Category</span>
                              <select className="ws-select" value={requirement.category} onChange={(event) => updateRequirement(index, 'category', event.target.value)}>
                                {RULE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                              </select>
                            </label>
                            <label className="specs-editor-field">
                              <span>Requirements</span>
                              <textarea className="ws-input" rows={3} maxLength={150} value={requirement.text} onChange={(event) => updateRequirement(index, 'text', event.target.value)} placeholder="State what the code must or must not do..." />
                              <span className="specs-editor-counter">{requirement.text.length}/150</span>
                            </label>
                            <details className="specs-rule-options">
                              <summary>Verification settings</summary>
                              <div className="specs-rule-options-fields">
                                <label className="specs-editor-field">
                                  <span>Check type</span>
                                  <select className="ws-select" value={requirement.checkType} onChange={(event) => updateRequirement(index, 'checkType', event.target.value)}>
                                    {CHECK_TYPES.map((type) => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}
                                  </select>
                                </label>
                                {['code_pattern', 'file_exists', 'test_name'].includes(requirement.checkType) && <label className="specs-editor-field">
                                  <span>Check value</span>
                                  <input className="ws-input" value={requirement.checkValue} onChange={(event) => updateRequirement(index, 'checkValue', event.target.value)} placeholder={requirement.checkType === 'code_pattern' ? 'Regex pattern' : requirement.checkType === 'file_exists' ? 'path/to/file' : 'Test name'} />
                                </label>}
                                <label className="specs-editor-field">
                                  <span>Severity</span>
                                  <select className="ws-select" value={requirement.severity} onChange={(event) => updateRequirement(index, 'severity', event.target.value)}>
                                    <option value="blocking">Blocking</option>
                                    <option value="warning">Warning</option>
                                  </select>
                                </label>
                              </div>
                            </details>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <details className="specs-editor-card specs-advanced">
                    <summary>Advanced specification settings</summary>
                    <div className="specs-advanced-fields">
                      <label className="specs-editor-field"><span>Architectural rules <small>one rule per line</small></span><textarea className="ws-input" rows={3} value={form.architecturalRules} onChange={(event) => setForm({ ...form, architecturalRules: event.target.value })} placeholder="Auth logic stays in the auth service" /></label>
                      <label className="specs-editor-field"><span>Forbidden imports <small>one module name per line</small></span><textarea className="ws-input" rows={2} value={form.forbiddenImports} onChange={(event) => setForm({ ...form, forbiddenImports: event.target.value })} placeholder="jsonwebtoken" /></label>
                      <label className="specs-editor-field"><span>Constraints <small>key=value per line</small></span><textarea className="ws-input" rows={2} value={form.constraints} onChange={(event) => setForm({ ...form, constraints: event.target.value })} placeholder="tokenTtlSeconds=900" /></label>
                      <label className="specs-editor-field"><span>Verification command</span><input className="ws-input" value={form.verificationCommand} onChange={(event) => setForm({ ...form, verificationCommand: event.target.value })} placeholder="npm test -- --testPathPattern=auth" /></label>
                      <label className="specs-editor-field"><span>Coverage threshold</span><input className="ws-input" type="number" min="0" max="100" value={form.coverageThreshold} onChange={(event) => setForm({ ...form, coverageThreshold: event.target.value })} placeholder="80" /></label>
                    </div>
                  </details>
                </div>

                <aside className="specs-editor-preview-column">
                  <section className="specs-editor-preview">
                    <div className="specs-preview-heading"><h2><span />Live Preview</h2><span>{form.title || 'AUTH Spec'}</span></div>
                    <div className="specs-preview-content">
                      <p className="specs-preview-title"># {form.title || 'Untitled Specification'}</p>
                      <p>{form.description || 'Describe the purpose and scope of this specification.'}</p>
                      <p className="specs-preview-section">## Applies to</p>
                      {(modules(form.targetModules).length ? modules(form.targetModules) : ['src/path/to/module.ts']).map((path, index) => <p key={`${path}-${index}`}>- `{path}`</p>)}
                      <p className="specs-preview-section">## Rules</p>
                      {form.requirements.filter((rule) => rule.text.trim() || rule.id.trim()).map((rule, index) => (
                        <div className="specs-preview-rule" key={`${rule.id}-${index}`}>
                          <p>### {rule.id || `RULE-${String(index + 1).padStart(3, '0')}`}</p>
                          <p>- **Category:** {rule.category}</p>
                          <p>- **Requirement:** {rule.text || 'Describe the enforceable requirement.'}</p>
                        </div>
                      ))}
                      {!form.requirements.some((rule) => rule.text.trim() || rule.id.trim()) && <p>### RULE-001<br />- **Category:** Security<br />- **Requirement:** Describe the enforceable requirement.</p>}
                    </div>
                    <div className={`specs-preview-validation ${form.title.trim() && form.requirements.some((rule) => rule.text.trim()) ? 'is-ready' : ''}`}>
                      <span>{form.title.trim() && form.requirements.some((rule) => rule.text.trim()) ? <Check /> : <CircleHelp />}</span>
                      <div><strong>{form.title.trim() && form.requirements.some((rule) => rule.text.trim()) ? 'Ready to Create' : 'Incomplete Setup'}</strong><small>{form.requirements.filter((rule) => rule.text.trim()).length} valid rule{form.requirements.filter((rule) => rule.text.trim()).length === 1 ? '' : 's'} configured</small></div>
                    </div>
                  </section>
                  <div className="specs-editor-actions">
                    <button type="button" className="btn-workspace btn-secondary" onClick={closeEditor} disabled={saving}>Cancel</button>
                    <button type="submit" className="btn-workspace btn-primary" disabled={saving || !form.title.trim()}>
                      {saving ? <Loader2 className="animate-spin" /> : <Check />}
                      {saving ? 'Saving...' : editing._id ? 'Save Changes' : 'Create Specification'}
                    </button>
                  </div>
                </aside>
              </form>
            </section>
          ) : (
            <>
          <div className="specs-page-heading">
            <div>
              <p className="specs-eyebrow">Build / Specifications</p>
              <h1>Specifications</h1>
              <p>Define and validate executable contracts for project architecture, dependencies, and verification.</p>
            </div>
            <div className="specs-project-select">
              {projects.length > 0 && (
                <select className="ws-select" value={projectId} onChange={(event) => setProjectId(event.target.value)} aria-label="Project">
                  {projects.map((project) => <option key={project.id || project._id} value={project.id || project._id}>{project.name}</option>)}
                </select>
              )}
            </div>
          </header>
          <div className="workspace-content">
            {loadingProjects ? <div className="dash-empty"><Loader2 className="w-5 h-5 animate-spin" /></div> : !projects.length ? (
              <div className="workspace-card"><div className="workspace-card-body flex flex-col items-center py-16 text-center">
                <FolderGit2 className="w-7 h-7 text-[#12dce5] mb-4" />
                <p className="dash-empty-title">No projects yet</p>
                <p className="dash-empty-sub mb-5">Specs belong to a project. Create a project to start writing executable contracts — no workspace needed.</p>
                <button className="btn-workspace btn-primary" type="button" onClick={() => router.push('/workspace')}><Plus className="w-4 h-4" /> Create a project</button>
              </div>
            ) : (
              <>
                {notice && <div className="std-alert std-alert-error mb-5">{notice}</div>}
                {loadError && <div className="std-alert std-alert-error mb-5">{loadError}</div>}
                <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
                  <div><span className="text-sm font-semibold text-white">Contract library</span><span className="ml-3 text-xs text-[#9aaeba]">Scope, requirements, and verification</span></div>
                  <span className="text-xs text-[#9aaeba]">{specs.filter((spec) => spec.status === 'failing' || spec.status === 'drifted').length} need attention</span>
                </div>
                {loading ? <div className="dash-empty"><Loader2 className="w-5 h-5 animate-spin" /><p className="dash-empty-title">Loading specs</p></div> : specs.length === 0 ? (
                  <div className="workspace-card"><div className="workspace-card-body flex flex-col items-center py-16 text-center">
                    <FileCode2 className="w-7 h-7 text-[#12dce5] mb-4" /><p className="dash-empty-title">No specs in this project</p>
                    <p className="dash-empty-sub mb-5">Create a scoped contract with requirements agents can check against code.</p>
                    <button className="btn-workspace btn-primary" type="button" onClick={() => openEditor()}><Plus className="w-4 h-4" /> Create first spec</button>
                  </div></div>
                ) : (
                  <div className="divide-y divide-white/10">
                    {specs.map((spec) => {
                      const state = STATUS_STYLE[spec.status] || STATUS_STYLE.unvalidated;
                      const StatusIcon = state.Icon;
                      const requirementResults = spec.lastValidationResult?.requirements || [];
                      return (
                        <article key={spec._id} className="py-5 first:pt-0">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-semibold text-white">{spec.title}</h2>
                                <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: state.color }}><StatusIcon className="w-3.5 h-3.5" />{spec.status || 'unvalidated'}</span>
                                <span className="text-xs text-[#748194]">{spec.specId}</span>
                              </div>
                              {spec.description && <p className="mt-1 text-sm text-[#a9b7c4]">{spec.description}</p>}
                              <div className="mt-3 flex flex-wrap gap-2">
                                {(spec.targetModules || []).map((module) => <code key={module} className="text-xs text-[#80dbe4] bg-white/5 px-2 py-1">{module}</code>)}
                              </div>
                              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#9aaeba]">
                                <span>{(spec.requirements || []).length} requirements</span>
                                <span>{(spec.architecturalRules || []).length} architectural rules</span>
                                {spec.verificationCommand && <span>Command: <code>{spec.verificationCommand}</code></span>}
                                {spec.lastValidatedAt && <span>Validated {new Date(spec.lastValidatedAt).toLocaleString()}</span>}
                              </div>
                              {requirementResults.length > 0 && <div className="mt-3 grid gap-1.5">
                                {requirementResults.map((requirement, index) => <div key={requirement.id || index} className="flex items-start gap-2 text-xs text-[#c7d2dd]">
                                  {requirement.status === 'pass' ? <Check className="w-3.5 h-3.5 text-[#03ba03] mt-0.5" /> : requirement.status === 'fail' ? <X className="w-3.5 h-3.5 text-[#ec1414] mt-0.5" /> : <CircleHelp className="w-3.5 h-3.5 text-[#e5b84a] mt-0.5" />}
                                  <span>{requirement.id}: {requirement.text}{requirement.evidence ? <span className="ml-2 text-[#748194]">{requirement.evidence}</span> : null}</span>
                                </div>)}
                              </div>}
                            </div>
                            <div className="flex items-center gap-2">
                              <button type="button" className="btn-workspace btn-secondary" title="Run validation" onClick={() => runValidation(spec)} disabled={verifyingId === spec._id}>
                                {verifyingId === spec._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}<span className="hidden sm:inline">Validate</span>
                              </button>
                              <button type="button" className="btn-workspace btn-secondary" onClick={() => openEditor(spec)}>Edit</button>
                              <button type="button" className="btn-workspace btn-secondary" onClick={() => deleteSpec(spec)} title="Delete spec"><X className="w-4 h-4" /></button>
                            </div>
                            <p>{(selectedSpec.targetModules || []).join(', ')}</p>
                          </div>
                          <div className="specs-detail-actions">
                            <button type="button" className="btn-workspace btn-secondary" onClick={() => openEditor(selectedSpec)}>Edit</button>
                            <button type="button" className="specs-delete-button" onClick={() => deleteSpec(selectedSpec)} title="Delete spec" aria-label="Delete spec"><X /></button>
                            <button type="button" className="btn-workspace btn-primary" onClick={() => runValidation(selectedSpec)} disabled={verifyingId === selectedSpec._id}>
                              {verifyingId === selectedSpec._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                              Run Validation
                            </button>
                          </div>
                        </div>

                        <div className="specs-stats" aria-label="Validation summary">
                          <div><span>Total rules</span><strong>{requirements.length}</strong></div>
                          <div><span>Passing</span><strong className="is-passing">{passedCount}</strong></div>
                          <div><span>Failing</span><strong className="is-failing">{failedCount}</strong></div>
                          <div><span>Last validated</span><strong>{selectedSpec.lastValidatedAt ? formatValidationTime(selectedSpec.lastValidatedAt) : 'Never'}</strong></div>
                        </div>

                        {selectedSpec.description && <div className="specs-scope">
                          <h3>Purpose and scope</h3>
                          <p>{selectedSpec.description}</p>
                        </div>}

                        <div className="specs-requirements">
                          {requirements.length ? requirements.map((requirement, index) => {
                            const result = requirementResults.find((item) => item.id === requirement.id);
                            const RequirementIcon = result?.status === 'pass' ? Check : result?.status === 'fail' ? X : CircleHelp;
                            const resultClass = result?.status === 'pass' ? 'is-pass' : result?.status === 'fail' ? 'is-fail' : 'is-pending';
                            const category = requirement.category || requirement.checkType?.replace(/_/g, ' ') || requirement.severity || 'manual';
                            return (
                              <article className="specs-requirement" key={requirement.id || index}>
                                <span className={`specs-requirement-status ${resultClass}`}><RequirementIcon /></span>
                                <div className="specs-requirement-copy">
                                  <div className="specs-requirement-heading">
                                    <h3>{requirement.id || `REQ-${String(index + 1).padStart(3, '0')}`}</h3>
                                    <span className={`specs-requirement-tag is-${requirement.severity || 'manual'}`}>{category}</span>
                                  </div>
                                  <p>{requirement.text}</p>
                                  {result?.evidence && <span className="specs-requirement-evidence">{result.evidence}</span>}
                                </div>
                              </article>
                            );
                          }) : <div className="specs-empty"><FileCode2 className="w-6 h-6" /><p>No requirements defined</p><span>Edit this spec to add executable requirements.</span></div>}
                        </div>
                        {(selectedSpec.architecturalRules?.length > 0 || selectedSpec.forbiddenImports?.length > 0 || selectedSpec.constraints?.length > 0 || selectedSpec.verificationCommand) && (
                          <div className="specs-extra-details">
                            {selectedSpec.architecturalRules?.length > 0 && <div><h3>Architectural rules</h3><ul>{selectedSpec.architecturalRules.map((rule, index) => <li key={`${rule}-${index}`}>{rule}</li>)}</ul></div>}
                            {selectedSpec.forbiddenImports?.length > 0 && <div><h3>Forbidden imports</h3><ul>{selectedSpec.forbiddenImports.map((item) => <li key={item}><code>{item}</code></li>)}</ul></div>}
                            {selectedSpec.constraints?.length > 0 && <div><h3>Constraints</h3><ul>{selectedSpec.constraints.map((item, index) => <li key={`${item.key}-${index}`}><code>{item.key}{item.value ? ` = ${item.value}` : ''}</code></li>)}</ul></div>}
                            {selectedSpec.verificationCommand && <div><h3>Verification command</h3><code>{selectedSpec.verificationCommand}</code></div>}
                          </div>
                        )}
                      </>
                    );
                  })() : (
                    <div className="specs-empty specs-detail-empty"><FileCode2 className="w-7 h-7" /><p>Select a specification</p><span>Choose a contract from your library to inspect its rules and validation status.</span></div>
                  )}
                </section>
              </div>
            )}
          </div>
            </>
          )}
        </main>
        {successSpec && (
          <div className="specs-success-overlay">
            <section className="specs-success-dialog" role="dialog" aria-modal="true" aria-labelledby="specs-success-title">
              <span className="specs-success-icon"><Check /></span>
              <p className="specs-success-eyebrow">Specification created</p>
              <h2 id="specs-success-title">New SPEC Created Successfully</h2>
              <div className="specs-success-actions">
                <button type="button" className="btn-workspace btn-secondary" onClick={() => setSuccessSpec(null)}>Cancel</button>
                <button
                  type="button"
                  className="btn-workspace btn-primary"
                  onClick={() => {
                    setSelectedSpecId(successSpec._id);
                    setSuccessSpec(null);
                  }}
                >
                  View Specification
                </button>
              </div>
            </section>
          </div>
        )}
      </div>

      {editing && <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/75 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) closeEditor(); }}>
        <section className="ws-modal w-full max-w-3xl max-h-[92vh] overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#121821] p-5">
            <div><p className="text-xs uppercase text-[#12dce5]">Executable contract</p><h2 className="ws-modal-title">{editing?._id ? 'Edit Spec' : 'New Spec'}</h2></div>
            <button type="button" className="text-[#9aaeba] hover:text-white" onClick={closeEditor} aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={saveSpec} className="space-y-5 p-5">
            {notice && <div className="std-alert std-alert-error">{notice}</div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="ws-label">Name<input className="ws-input mt-2" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Auth security" required /></label>
              <label className="ws-label">Coverage threshold<input className="ws-input mt-2" type="number" min="0" max="100" value={form.coverageThreshold} onChange={(event) => setForm({ ...form, coverageThreshold: event.target.value })} placeholder="80" /></label>
            </div>
            <label className="ws-label">Description<textarea className="ws-input mt-2" rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What system contract does this govern?" /></label>
            <label className="ws-label">Target modules <span className="font-normal text-[#748194]">one glob per line</span><textarea className="ws-input mt-2 font-mono" rows={3} value={form.targetModules} onChange={(event) => setForm({ ...form, targetModules: event.target.value })} placeholder={'src/services/auth/**\nsrc/middleware/auth*'} /></label>
            <label className="ws-label">Architectural rules <span className="font-normal text-[#748194]">one rule per line</span><textarea className="ws-input mt-2" rows={3} value={form.architecturalRules} onChange={(event) => setForm({ ...form, architecturalRules: event.target.value })} placeholder="Auth logic stays in the auth service" /></label>
            <div>
              <div className="mb-2 flex items-center justify-between"><span className="ws-label">Requirements</span><button type="button" className="btn-workspace btn-secondary" onClick={() => setForm({ ...form, requirements: [...form.requirements, { ...EMPTY_REQUIREMENT }] })}><Plus className="w-3.5 h-3.5" /> Add requirement</button></div>
              <div className="space-y-3">
                {form.requirements.map((requirement, index) => <div key={index} className="grid gap-3 border border-white/10 p-3 sm:grid-cols-[1fr_150px_120px]">
                  <div className="space-y-2"><input className="ws-input" value={requirement.text} onChange={(event) => updateRequirement(index, 'text', event.target.value)} placeholder="JWT access tokens expire within 15 minutes" />
                    {['code_pattern', 'file_exists', 'test_name'].includes(requirement.checkType) && <input className="ws-input font-mono" value={requirement.checkValue} onChange={(event) => updateRequirement(index, 'checkValue', event.target.value)} placeholder={requirement.checkType === 'code_pattern' ? 'Regex pattern' : requirement.checkType === 'file_exists' ? 'path/to/file' : 'Test name'} />}</div>
                  <select className="ws-select" value={requirement.checkType} onChange={(event) => updateRequirement(index, 'checkType', event.target.value)}>{CHECK_TYPES.map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}</select>
                  <div className="flex gap-2"><select className="ws-select min-w-0" value={requirement.severity} onChange={(event) => updateRequirement(index, 'severity', event.target.value)}><option value="blocking">Blocking</option><option value="warning">Warning</option></select><button type="button" className="text-[#9aaeba] hover:text-red-400" title="Remove requirement" onClick={() => setForm({ ...form, requirements: form.requirements.filter((_, itemIndex) => itemIndex !== index) })}><X className="w-4 h-4" /></button></div>
                </div>)}
              </div>
            </div>
            <label className="ws-label">Forbidden imports <span className="font-normal text-[#748194]">one module name per line</span><textarea className="ws-input mt-2 font-mono" rows={2} value={form.forbiddenImports} onChange={(event) => setForm({ ...form, forbiddenImports: event.target.value })} placeholder="jsonwebtoken" /></label>
            <label className="ws-label">Constraints <span className="font-normal text-[#748194]">key=value per line</span><textarea className="ws-input mt-2 font-mono" rows={2} value={form.constraints} onChange={(event) => setForm({ ...form, constraints: event.target.value })} placeholder="tokenTtlSeconds=900" /></label>
            <label className="ws-label">Verification command<input className="ws-input mt-2 font-mono" value={form.verificationCommand} onChange={(event) => setForm({ ...form, verificationCommand: event.target.value })} placeholder="npm test -- --testPathPattern=auth" /></label>
            <div className="flex justify-end gap-3 border-t border-white/10 pt-4">
              <button type="button" className="btn-workspace btn-secondary" onClick={closeEditor} disabled={saving}>Cancel</button>
              <button type="submit" className="btn-workspace btn-primary" disabled={saving || !form.title.trim()}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{saving ? 'Saving' : 'Save Spec'}</button>
            </div>
          </form>
        </section>
      </div>}
    </AuthGuard>
  );
}
