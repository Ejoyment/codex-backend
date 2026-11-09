import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  ArrowRight,
  Check,
  FileText,
  Github,
  Loader2,
  Plus,
  Sparkles,
  User,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import AuthGuard from '../components/AuthGuard';
import SiteShell from '../components/SiteShell';
import useAuthStore from '../store/authStore';
import { apiFetch, githubApi } from '../lib/api';
import {
  DEFAULT_ONBOARDING,
  EMAIL_RE,
  FOCUS_EXTRAS,
  FOCUS_OPTIONS,
  MAX_INVITES,
  ONBOARDING_PLACEHOLDERS,
  STEPS,
  USE_CASES,
} from '../lib/onboardingConfig';


export default function Onboarding() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);

  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  // Seeded from DEFAULT_ONBOARDING so the flow opens on an example answer set
  // the user can adjust, instead of empty cards they must fill in first.
  const [useMode, setUseMode] = useState(DEFAULT_ONBOARDING.useMode);
  const [invites, setInvites] = useState([]);
  const [useCase, setUseCase] = useState(DEFAULT_ONBOARDING.useCase);
  const [focus, setFocus] = useState(DEFAULT_ONBOARDING.focus);
  const [focusExtras, setFocusExtras] = useState(DEFAULT_ONBOARDING.focusExtras);
  const [startMode, setStartMode] = useState(DEFAULT_ONBOARDING.startMode);
  const [nextAction, setNextAction] = useState(DEFAULT_ONBOARDING.nextAction);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [github, setGithub] = useState({ status: 'loading', account: '' });

  const prefilled = useRef(false);
  const pollRef = useRef(null);
  const titleRef = useRef(null);
  const lastStepRef = useRef(1);

  // Name/email come from the account that just signed up — prefill once so the
  // user is not retyping what they already gave us.
  useEffect(() => {
    if (prefilled.current || !user) return;
    prefilled.current = true;
    setFullName((prev) => prev || user.fullName || user.name || '');
    setEmail((prev) => prev || user.email || '');
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    githubApi
      .getStatus()
      .then((data) => {
        if (cancelled) return;
        setGithub({ status: data?.connected ? 'connected' : 'idle', account: data?.account || '' });
      })
      .catch(() => {
        if (!cancelled) setGithub({ status: 'idle', account: '' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => clearInterval(pollRef.current), []);

  // A stepper swaps content in place, so keyboard and screen reader users need
  // their focus carried to the new step heading (announced by the live region).
  useEffect(() => {
    if (lastStepRef.current === step) return;
    lastStepRef.current = step;
    titleRef.current?.focus({ preventScroll: true });
  }, [step]);

  const validInvites = invites
    .map((invite) => ({ email: invite.email.trim().toLowerCase(), role: invite.role }))
    .filter((invite) => EMAIL_RE.test(invite.email));

  const hasBadInvite = invites.some((invite) => invite.email.trim() && !EMAIL_RE.test(invite.email.trim()));
  const hasBlankInvite = invites.some((invite) => !invite.email.trim());

  const stepValid = (() => {
    if (step === 1) {
      if (!fullName.trim() || !EMAIL_RE.test(email)) return false;
      if (useMode === 'team' && (hasBadInvite || hasBlankInvite)) return false;
      return true;
    }
    if (step === 2) return Boolean(useCase);
    if (step === 3) return Boolean(focus);
    return true;
  })();

  const focusExtraConfig = focus ? FOCUS_EXTRAS[focus] : null;

  const addInvite = () =>
    setInvites((prev) => (prev.length >= MAX_INVITES ? prev : [...prev, { email: '', role: 'editor' }]));

  const updateInvite = (index, patch) =>
    setInvites((prev) => prev.map((invite, i) => (i === index ? { ...invite, ...patch } : invite)));

  const removeInvite = (index) => setInvites((prev) => prev.filter((_, i) => i !== index));

  const toggleExtra = (option) =>
    setFocusExtras((prev) => (prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option]));

  const selectFocus = (id) => {
    setFocus(id);
    // Swap in that role's recommended picks rather than a blank slate.
    setFocusExtras(FOCUS_EXTRAS[id]?.defaults ?? []);
  };

  const goNext = () => {
    if (!stepValid) return;
    setError('');
    setStep((s) => Math.min(s + 1, 5));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    setError('');
    setStep((s) => Math.max(s - 1, 1));
  };

  const connectGithub = async () => {
    setError('');
    setGithub((prev) => ({ ...prev, status: 'connecting' }));
    try {
      const data = await apiFetch('/api/github/connect');
      if (!data?.authUrl) throw new Error('GitHub is not configured on this deployment.');
      // Same-origin popup: the callback lands on /integrations, then we detect
      // the new integration through /api/github/status and close the window.
      const popup = window.open(data.authUrl, 'buildrs-github-oauth', 'width=620,height=780');
      clearInterval(pollRef.current);
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const status = await githubApi.getStatus();
          if (status?.connected) {
            clearInterval(pollRef.current);
            try {
              popup?.close();
            } catch {
              // Cross-origin close can fail; leaving it open is harmless.
            }
            setGithub({ status: 'connected', account: status.account || '' });
            return;
          }
        } catch {
          // Keep polling — a transient status failure is not a disconnect.
        }
        if (attempts >= 60) {
          clearInterval(pollRef.current);
          setGithub((prev) => (prev.status === 'connected' ? prev : { status: 'idle', account: prev.account }));
        }
      }, 2000);
    } catch (err) {
      setGithub((prev) => ({ ...prev, status: 'idle' }));
      setError(err.data?.message || err.message || 'Could not start the GitHub connection.');
    }
  };

  const finish = async () => {
    setLoading(true);
    setError('');
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    try {
      const res = await apiFetch('/api/auth/complete-onboarding', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          useMode,
          invites: useMode === 'team' ? validInvites : [],
          useCase,
          focus,
          focusExtras,
          startMode,
          template: startMode === 'template' ? 'nextjs' : null,
          teamSize: useMode === 'team' ? String(validInvites.length + 1) : 'Just me',
          role: focus ? [focus] : [],
          goals: focusExtras,
        }),
        returnErrorData: true,
      });
      // returnErrorData resolves instead of throwing on 4xx/5xx, so a failure
      // arrives here as an error body — never route as if setup succeeded.
      if (!res?.user) {
        throw new Error(res?.message || 'Could not save your setup. Please try again.');
      }
      if (!token) {
        setError('Onboarding completed, but the updated profile could not be loaded.');
        return;
      }
      setAuth(token, res.user);
      if (nextAction === 'agent') router.replace('/ai-pair');
      else if (nextAction === 'specs') router.replace('/specs');
      else router.replace('/dashboard?newProject=1');
    } catch (err) {
      setError(err.data?.message || err.message || 'Failed to complete onboarding.');
    } finally {
      setLoading(false);
    }
  };

  const skip = async () => {
    if (typeof window !== 'undefined' && !window.confirm('Exit setup? You can finish personalizing later from Settings.')) {
      return;
    }
    setLoading(true);
    setError('');
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    try {
      const res = await apiFetch('/api/auth/complete-onboarding', {
        method: 'POST',
        body: JSON.stringify({ skipped: true }),
        returnErrorData: true,
      });
      if (!res?.user) {
        throw new Error(res?.message || 'Could not exit setup right now.');
      }
      setAuth(token, res.user);
      router.replace('/dashboard');
    } catch (err) {
      setError(err.data?.message || err.message || 'Could not exit setup right now.');
      setLoading(false);
    }
  };

  const onCancel = () => {
    if (step === 1) skip();
    else goBack();
  };

  const firstName = fullName.trim().split(/\s+/)[0] || 'there';
  const workspaceLabel = useMode === 'team' ? `Team (${validInvites.length + 1} members)` : 'Solo';
  const useCaseLabel = USE_CASES.find((item) => item.id === useCase)?.label || 'Not set';
  const focusLabel = FOCUS_OPTIONS.find((item) => item.id === focus)?.label || 'Not set';

  return (
    <AuthGuard>
      <Head>
        <title>Set up your workspace · BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <SiteShell>
        <main className="onb-page">
          <div className="onb-shell">
            <div className="onb-card">
              <p className="onb-sr-only" aria-live="polite">
                Step {step} of {STEPS.length}: {STEPS[step - 1]}
              </p>
              <nav className="onb-steps" aria-label="Onboarding progress">
                {STEPS.map((label, index) => {
                  const number = index + 1;
                  const state = number < step ? 'done' : number === step ? 'active' : 'todo';
                  return (
                    <div
                      key={label}
                      className="onb-step-item"
                      aria-current={state === 'active' ? 'step' : undefined}
                    >
                      <div className={`onb-step ${state}`}>
                        <span className="onb-step-dot" aria-hidden="true">
                          {state === 'done' ? <Check size={12} /> : number}
                        </span>
                        <span className="onb-step-label">{label}</span>
                      </div>
                      {number < STEPS.length && (
                        <span aria-hidden="true" className={`onb-connector ${number < step ? 'done' : ''}`} />
                      )}
                    </div>
                  );
                })}
              </nav>

              {step === 1 && (
                <div className="onb-body">
                  <h1 className="onb-title" tabIndex={-1} ref={titleRef}>
                    Your next idea starts here.
                  </h1>
                  <p className="onb-sub">Tell us a little about you and we&apos;ll shape the workspace around it.</p>

                  <div className="onb-grid-2 onb-mt">
                    <div>
                      <label className="mkt-label" htmlFor="onb-name">
                        Name
                      </label>
                      <input
                        id="onb-name"
                        className="mkt-input"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder={ONBOARDING_PLACEHOLDERS.name}
                        autoComplete="name"
                      />
                    </div>
                    <div>
                      <label className="mkt-label" htmlFor="onb-email">
                        Email
                      </label>
                      <input
                        id="onb-email"
                        className="mkt-input onb-input-locked"
                        value={email}
                        placeholder={ONBOARDING_PLACEHOLDERS.email}
                        readOnly
                      />
                    </div>
                  </div>

                  <p className="onb-question">How will you use BuildrsHQ?</p>
                  <div className="onb-grid-2">
                    <Choice
                      selected={useMode === 'solo'}
                      Icon={User}
                      title="Just me"
                      hint="A personal workspace for your own projects"
                      onClick={() => setUseMode('solo')}
                    />
                    <Choice
                      selected={useMode === 'team'}
                      Icon={Users}
                      title="With a team"
                      hint="Collaborate, review and ship together"
                      onClick={() => setUseMode('team')}
                    />
                  </div>

                  {useMode === 'team' && (
                    <div className="onb-panel">
                      <div className="onb-panel-head">
                        <p className="mkt-label onb-mb-0">Invite your teammates</p>
                        <span className="onb-optional">Optional</span>
                      </div>
                      <p className="onb-hint">Invites go out once your workspace exists.</p>

                      {invites.map((invite, index) => (
                        <div className="onb-invite-row" key={`invite-${index}`}>
                          <input
                            className="mkt-input"
                            value={invite.email}
                            onChange={(e) => updateInvite(index, { email: e.target.value })}
                            placeholder={ONBOARDING_PLACEHOLDERS.invite}
                            type="email"
                            aria-label={`Teammate ${index + 1} email`}
                          />
                          <select
                            className="mkt-select onb-invite-role"
                            value={invite.role}
                            onChange={(e) => updateInvite(index, { role: e.target.value })}
                            aria-label={`Teammate ${index + 1} access`}
                          >
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <button
                            type="button"
                            className="onb-icon-btn"
                            onClick={() => removeInvite(index)}
                            aria-label={`Remove teammate ${index + 1}`}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}

                      {invites.length < MAX_INVITES && (
                        <button type="button" className="onb-add" onClick={addInvite}>
                          <Plus size={14} /> Add another member
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="onb-body">
                  <h1 className="onb-title" tabIndex={-1} ref={titleRef}>
                    What are you building?
                  </h1>
                  <p className="onb-sub">We use this to preload the right templates, specs and agents.</p>

                  <div className="onb-grid-2 onb-mt">
                    {USE_CASES.map(({ id, label, hint, Icon }) => (
                      <Choice
                        key={id}
                        selected={useCase === id}
                        Icon={Icon}
                        title={label}
                        hint={hint}
                        onClick={() => setUseCase(id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="onb-body">
                  <h1 className="onb-title" tabIndex={-1} ref={titleRef}>
                    What&apos;s your primary focus?
                  </h1>
                  <p className="onb-sub">Pick the hat you wear most — we&apos;ll tune the workspace to it.</p>

                  <div className="onb-grid-2 onb-mt">
                    {FOCUS_OPTIONS.map(({ id, label, hint, Icon }) => (
                      <Choice
                        key={id}
                        selected={focus === id}
                        Icon={Icon}
                        title={label}
                        hint={hint}
                        onClick={() => selectFocus(id)}
                      />
                    ))}
                  </div>

                  {focusExtraConfig && (
                    <div className="onb-panel">
                      <p className="mkt-label onb-mb-0">{focusExtraConfig.question}</p>
                      <div className="onb-chips">
                        {focusExtraConfig.options.map((option) => (
                          <button
                            key={option}
                            type="button"
                            className={`onb-chip ${focusExtras.includes(option) ? 'is-selected' : ''}`}
                            onClick={() => toggleExtra(option)}
                          >
                            {focusExtras.includes(option) && <Check size={12} />}
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === 4 && (
                <div className="onb-body">
                  <h1 className="onb-title" tabIndex={-1} ref={titleRef}>
                    Choose your starting point
                  </h1>
                  <p className="onb-sub">You can switch approaches later — nothing here is permanent.</p>

                  <div className="onb-segment onb-mt">
                    <button
                      type="button"
                      className={`onb-segment-btn ${startMode === 'template' ? 'is-selected' : ''}`}
                      onClick={() => setStartMode('template')}
                    >
                      <Sparkles size={14} /> Use a template
                    </button>
                    <button
                      type="button"
                      className={`onb-segment-btn ${startMode === 'scratch' ? 'is-selected' : ''}`}
                      onClick={() => setStartMode('scratch')}
                    >
                      <FileText size={14} /> Start from scratch
                    </button>
                  </div>

                  {startMode === 'template' ? (
                    <div className="onb-template">
                      <div className="onb-template-top">
                        <span className="onb-tag">WEB APP</span>
                        <span className="onb-recommended">Recommended for you</span>
                      </div>
                      <h3 className="onb-template-title">Next.js starter</h3>
                      <p className="onb-hint">
                        Auth, routing and a design system wired up, with the AI agent ready on the repo.
                      </p>
                      <div className="onb-chips onb-mt-sm">
                        {['Next.js', 'React', 'TypeScript', 'Tailwind CSS'].map((tech) => (
                          <span key={tech} className="onb-chip onb-chip-static">
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="onb-template onb-template-quiet">
                      <h3 className="onb-template-title">An empty canvas</h3>
                      <p className="onb-hint">
                        Start with a blank project. Add a repo, or let the agent scaffold the first files with you.
                      </p>
                    </div>
                  )}

                  <div className="onb-tools">
                    <div>
                      <p className="mkt-label onb-mb-0">Bring your tools</p>
                      <p className="onb-hint">Connect the places your code and specs already live.</p>
                    </div>
                    <div className="onb-tool-row">
                      <span className="onb-tool-icon">
                        <Github size={16} />
                      </span>
                      <div className="onb-tool-copy">
                        <span className="onb-tool-name">GitHub</span>
                        <span
                          className={`onb-tool-status ${github.status === 'connected' ? 'is-connected' : ''}`}
                          aria-live="polite"
                        >
                          {github.status === 'loading' && 'Checking connection…'}
                          {github.status === 'connected' && `Connected${github.account ? ` · ${github.account}` : ''}`}
                          {github.status === 'connecting' && 'Waiting for GitHub…'}
                          {github.status === 'idle' && 'Not connected'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="onb-btn onb-btn-ghost"
                        onClick={connectGithub}
                        disabled={github.status === 'connecting' || github.status === 'connected'}
                      >
                        {github.status === 'connecting' ? <Loader2 size={14} className="onb-spin" /> : null}
                        {github.status === 'connected' ? 'Connected' : github.status === 'connecting' ? 'Connecting' : 'Connect'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="onb-body">
                  <h1 className="onb-title" tabIndex={-1} ref={titleRef}>
                    You&apos;re ready to build, {firstName}
                  </h1>
                  <p className="onb-sub">Here&apos;s the workspace we&apos;ll set up for you.</p>

                  <div className="onb-chips onb-mt-sm">
                    <span className="onb-chip onb-chip-static">{workspaceLabel}</span>
                    <span className="onb-chip onb-chip-static">{focusLabel}</span>
                    <span className="onb-chip onb-chip-static">{useCaseLabel}</span>
                    {github.status === 'connected' && <span className="onb-chip onb-chip-static">GitHub connected</span>}
                  </div>

                  <p className="mkt-label onb-mt">Your best next step</p>
                  <button
                    type="button"
                    className={`onb-primary-card ${nextAction === 'project' ? 'is-selected' : ''}`}
                    onClick={() => setNextAction('project')}
                  >
                    <div>
                      <span className="onb-tag">NEXT.JS STARTER</span>
                      <h3 className="onb-template-title">Create your first project</h3>
                      <p className="onb-hint">
                        {startMode === 'template'
                          ? 'Next.js, React, TypeScript and Tailwind CSS, ready to run.'
                          : 'A blank project you can shape with the AI agent.'}
                      </p>
                    </div>
                    <span className="onb-primary-card-icon">
                      {nextAction === 'project' ? <Check size={16} /> : <Plus size={16} />}
                    </span>
                  </button>

                  <p className="mkt-label onb-mt">Or explore what&apos;s possible</p>
                  <div className="onb-grid-2">
                    <button
                      type="button"
                      className={`onb-tile ${nextAction === 'agent' ? 'is-selected' : ''}`}
                      onClick={() => setNextAction('agent')}
                    >
                      <Wand2 size={16} />
                      <span className="onb-tile-title">Try the AI agent</span>
                      <span className="onb-hint">Hand it a task and watch it plan, edit and test.</span>
                    </button>
                    <button
                      type="button"
                      className={`onb-tile ${nextAction === 'specs' ? 'is-selected' : ''}`}
                      onClick={() => setNextAction('specs')}
                    >
                      <FileText size={16} />
                      <span className="onb-tile-title">Explore specs</span>
                      <span className="onb-hint">Turn an idea into requirements the agent can execute.</span>
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <p className="onb-error" role="alert">
                  {error}
                </p>
              )}

              <div className="onb-actions">
                <span className="onb-note">About 2 minutes. Built around you.</span>
                <div className="onb-actions-right">
                  <button type="button" className="onb-btn onb-btn-ghost" onClick={onCancel} disabled={loading}>
                    Cancel
                  </button>
                  {step < 5 ? (
                    <button type="button" className="onb-btn onb-btn-primary" onClick={goNext} disabled={!stepValid}>
                      Next <ArrowRight size={14} />
                    </button>
                  ) : (
                    <button type="button" className="onb-btn onb-btn-primary" onClick={finish} disabled={loading}>
                      {loading ? <Loader2 size={14} className="onb-spin" /> : null}
                      {loading ? 'Creating workspace' : 'Create Workspace'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <p className="onb-footnote">You can change these preferences later in Settings.</p>
          </div>
        </main>
      </SiteShell>
    </AuthGuard>
  );
}

function Choice({ selected, Icon, title, hint, onClick }) {
  return (
    <button type="button" className={`onb-choice ${selected ? 'is-selected' : ''}`} onClick={onClick} aria-pressed={selected}>
      <span className="onb-choice-top">
        <span className="onb-choice-icon">
          <Icon size={15} />
        </span>
        <span className={`onb-check ${selected ? 'is-on' : ''}`}>{selected && <Check size={12} />}</span>
      </span>
      <span className="onb-choice-title">{title}</span>
      <span className="onb-choice-hint">{hint}</span>
    </button>
  );
}
