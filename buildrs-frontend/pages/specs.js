import { useCallback, useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { AlertTriangle, Check, CheckCircle2, CircleHelp, FileCode2, FolderGit2, Loader2, Plus, Play, ShieldAlert, X } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch, projectApi } from '../lib/api';
import { useCachedData } from '../hooks/useCachedData';

const CHECK_TYPES = ['code_pattern', 'test_name', 'file_exists', 'ast_import', 'route', 'contract_test', 'ai_review', 'manual'];
const CHECK_VALUE_TYPES = ['code_pattern', 'file_exists', 'test_name', 'ast_import', 'route', 'contract_test'];
const RULE_CATEGORIES = ['Security', 'Architecture', 'Policy', 'Performance', 'Reliability', 'Other'];
const EMPTY_REQUIREMENT = { id: 'SECURITY-001', category: 'Security', text: '', checkType: 'manual', checkValue: '', severity: 'blocking' };
const EMPTY_FORM = {
  title: '', description: '', targetModules: '', architecturalRules: '', requirements: [{ ...EMPTY_REQUIREMENT }],
  forbiddenImports: '', constraints: '', verificationCommand: '', coverageThreshold: '',
};

const STATUS_STYLE = {
  unvalidated: { color: '#9aa1ae', Icon: CircleHelp },
  healthy: { color: '#34d399', Icon: CheckCircle2 },
  warning: { color: '#e5b84a', Icon: AlertTriangle },
  partial: { color: '#9aa1ae', Icon: CircleHelp },
  failing: { color: '#f87171', Icon: ShieldAlert },
  drifted: { color: '#f87171', Icon: AlertTriangle },
};

function statusLabel(status) {
  if (status === 'healthy') return 'All Pass';
  if (status === 'failing') return 'Failed';
  if (status === 'drifted') return 'Drifted';
  if (status === 'warning') return 'Warnings';
  if (status === 'partial') return 'Not evaluated';
  return 'Unvalidated';
}

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

function checkValueFor(requirement) {
  const config = requirement.checkConfig || {};
  switch (requirement.checkType) {
    case 'code_pattern': return config.pattern || '';
    case 'file_exists': return config.path || config.file || '';
    case 'test_name': return config.testName || '';
    case 'ast_import': return config.module || (Array.isArray(config.imports) ? config.imports.join(', ') : '');
    case 'route': return [config.method ? String(config.method).toUpperCase() : '', config.path || config.route || ''].filter(Boolean).join(' ');
    case 'contract_test': return config.command || '';
    default: return '';
  }
}

function checkConfigFor(type, value) {
  const raw = String(value || '').trim();
  if (type === 'code_pattern') return { pattern: raw };
  if (type === 'file_exists') return { path: raw };
  if (type === 'test_name') return { testName: raw };
  if (type === 'ast_import') {
    return raw.startsWith('!') ? { module: raw.slice(1), mode: 'forbid' } : { module: raw, mode: 'require' };
  }
  if (type === 'route') {
    const parts = raw.split(/\s+/);
    return parts.length >= 2 && /^[a-z]+$/i.test(parts[0])
      ? { method: parts[0].toLowerCase(), path: parts.slice(1).join(' ') }
      : { path: raw };
  }
  if (type === 'contract_test') return { command: raw };
  return {};
}

function checkValueLabel(type) {
  if (type === 'code_pattern') return 'Regex pattern';
  if (type === 'file_exists') return 'File path';
  if (type === 'test_name') return 'Test name';
  if (type === 'ast_import') return 'Module (prefix ! to forbid)';
  if (type === 'route') return 'Method and path';
  if (type === 'contract_test') return 'Test command';
  return 'Check value';
}

function checkValuePlaceholder(type) {
  if (type === 'code_pattern') return "from ['\"]express['\"]";
  if (type === 'file_exists') return 'src/index.ts';
  if (type === 'test_name') return 'auth contract';
  if (type === 'ast_import') return 'express';
  if (type === 'route') return 'GET /health';
  if (type === 'contract_test') return 'npm test -- auth';
  return '';
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
      checkValue: checkValueFor(requirement),
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
  const userId = user?._id || user?.id || user?.userId || null;
  // Specs belong to a project. A workspace is optional collaboration context,
  // so a solo project gets the full spec workflow with no workspace at all.
  const [projectId, setProjectId] = useState('');
  const [selectedSpecId, setSelectedSpecId] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [verifyingId, setVerifyingId] = useState('');
  const [editing, setEditing] = useState(null);
  const [successSpec, setSuccessSpec] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const {
    data: projects,
    loading: loadingProjects,
    refresh: refreshProjects,
  } = useCachedData(userId, 'projects', async () => {
    const result = await projectApi.list({ noCache: true });
    return result.projects || [];
  }, { refreshOnVisibility: true, intervalMs: 30000 });

  const {
    data: specs,
    loading: loadingSpecs,
    refresh: refreshSpecs,
  } = useCachedData(userId, `specs:${projectId}`, async () => {
    if (!projectId) return [];
    const result = await apiFetch(`/api/v1/specs/project/${projectId}`, { noCache: true });
    return result.specs || [];
  }, { refreshOnVisibility: true, intervalMs: 30000 });

  const selectedSpec = specs.find((spec) => spec._id === selectedSpecId) || specs[0] || null;

  useEffect(() => {
    if (projects.length && !projectId) {
      setProjectId(projects[0]?.id || projects[0]?._id || '');
    }
  }, [projects, projectId]);

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
        const checkConfig = checkConfigFor(requirement.checkType, requirement.checkValue);
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
      await refreshSpecs();
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
      const verdict = validation.verdict || (validation.passed ? 'pass' : 'not_evaluated');
      await refreshSpecs();
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
      await refreshSpecs();
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
                                {CHECK_VALUE_TYPES.includes(requirement.checkType) && <label className="specs-editor-field">
                                  <span>{checkValueLabel(requirement.checkType)}</span>
                                  <input className="ws-input" value={requirement.checkValue} onChange={(event) => updateRequirement(index, 'checkValue', event.target.value)} placeholder={checkValuePlaceholder(requirement.checkType)} />
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
          </div>
          <div className="specs-content">
            {notice && <div className="std-alert std-alert-error">{notice}</div>}
            {loadingSpecs ? <div className="specs-empty"><Loader2 className="w-5 h-5 animate-spin" /></div> : !projects.length ? (
              <div className="specs-empty-card">
                <FolderGit2 className="w-7 h-7 text-[#2fd6e6] mb-4" />
                <p className="dash-empty-title">No projects yet</p>
                <p className="dash-empty-sub mb-5">Specs belong to a project. Create a project to start writing executable contracts — no workspace needed.</p>
                <button className="btn-workspace btn-primary" type="button" onClick={() => router.push('/workspace')}><Plus className="w-4 h-4" /> Create a project</button>
              </div>
            ) : (
              <div className="specs-workspace">
                <section className="specs-library" aria-label="Specifications">
                  <div className="specs-library-heading">
                    <div>
                      <h2>Specifications</h2>
                      <p>{specs.length} executable contract{specs.length === 1 ? '' : 's'}</p>
                    </div>
                    <button type="button" className="btn-workspace btn-primary" onClick={() => openEditor()} disabled={!projectId}>
                      <Plus className="w-4 h-4" /><span>New Spec</span>
                    </button>
                  </div>
                  {loadingSpecs ? <div className="specs-empty"><Loader2 className="w-5 h-5 animate-spin" /><span>Loading specs...</span></div> : specs.length === 0 ? (
                    <div className="specs-empty">
                      <FileCode2 className="w-6 h-6" />
                      <p>No specs in this project</p>
                      <span>Create a scoped contract with requirements agents can check against code.</span>
                      <button className="btn-workspace btn-primary" type="button" onClick={() => openEditor()}><Plus className="w-4 h-4" /> Create first spec</button>
                    </div>
                  ) : (
                    <div className="specs-library-list">
                      {specs.map((spec) => {
                        const state = STATUS_STYLE[spec.status] || STATUS_STYLE.unvalidated;
                        const StatusIcon = state.Icon;
                        const requirementCount = (spec.requirements || []).length;
                        const validationTime = spec.lastValidatedAt ? formatValidationTime(spec.lastValidatedAt) : 'Not validated';
                        return (
                          <button
                            type="button"
                            key={spec._id}
                            className={`specs-library-item ${selectedSpec?._id === spec._id ? 'is-selected' : ''}`}
                            onClick={() => setSelectedSpecId(spec._id)}
                            aria-pressed={selectedSpec?._id === spec._id}
                          >
                            <span className="specs-library-item-top">
                              <span className="specs-library-item-title">{spec.title || spec.specId}</span>
                              <span className="specs-status" style={{ color: state.color }}>
                                <StatusIcon />{statusLabel(spec.status)}
                              </span>
                            </span>
                            <span className="specs-library-item-path">{(spec.targetModules || []).join(', ') || spec.specId || 'No target modules'}</span>
                            <span className="specs-library-item-meta">{requirementCount} rule{requirementCount === 1 ? '' : 's'} · {validationTime}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {specs.length > 0 && <p className="specs-attention-count">{specs.filter((spec) => spec.status === 'failing' || spec.status === 'drifted').length} need attention</p>}
                </section>

                <section className="specs-detail" aria-label="Selected specification">
                  {selectedSpec ? (() => {
                    const requirementResults = selectedSpec.lastValidationResult?.requirements || [];
                    const passedCount = requirementResults.filter((item) => item.status === 'pass').length;
                    const failedCount = requirementResults.filter((item) => item.status === 'fail').length;
                    const notEvaluatedCount = requirementResults.filter((item) => !['pass', 'fail'].includes(item.status)).length;
                    const requirements = selectedSpec.requirements || [];
                    return (
                      <>
                        <div className="specs-detail-header">
                          <div className="specs-detail-title">
                            <div className="specs-detail-name">
                              <h2>{selectedSpec.title || selectedSpec.specId}</h2>
                              <span className="specs-detail-id">{selectedSpec.specId}</span>
                              {selectedSpec.status && <span className="specs-status" style={{ color: (STATUS_STYLE[selectedSpec.status] || STATUS_STYLE.unvalidated).color }}>{statusLabel(selectedSpec.status)}</span>}
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
                          <div><span>Not evaluated</span><strong className="is-pending">{notEvaluatedCount}</strong></div>
                          <div><span>Last validated</span><strong>{selectedSpec.lastValidatedAt ? formatValidationTime(selectedSpec.lastValidatedAt) : 'Never'}</strong></div>
                        </div>
                        <p className="specs-trust-note">
                          Approval blocks only on failed blocking requirements. Not-evaluated checks are neutral and never count as failures.
                        </p>

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

    </AuthGuard>
  );
}