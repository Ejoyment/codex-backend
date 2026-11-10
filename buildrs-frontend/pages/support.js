import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  CreditCard,
  FileText,
  Headphones,
  KeyRound,
  Layers,
  ListFilter,
  Loader2,
  Mail,
  PenSquare,
  Plus,
  Send,
  ShieldCheck,
  Upload,
  Wrench,
  X,
} from 'lucide-react';

const MAX_DETAILS = 200;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.pdf'];

const TOPICS = [
  {
    id: 'billing',
    title: 'Billing & payments',
    description: 'Unexpected charges, invoices or refunds',
    complaint: 'Billing & Payment Complaint',
    icon: CreditCard,
  },
  {
    id: 'account',
    title: 'Account & access',
    description: 'Sign-in issues, permissions or locked accounts',
    complaint: 'Account & Access Complaint',
    icon: KeyRound,
  },
  {
    id: 'plans',
    title: 'Plans & subscriptions',
    description: 'Upgrades, plan limits or cancellations',
    complaint: 'Plans & Subscriptions Complaint',
    icon: Layers,
  },
  {
    id: 'technical',
    title: 'Technical issues',
    description: 'Something not working in your workspace',
    complaint: 'Technical Issue',
    icon: Wrench,
  },
];

const CATEGORY_LABELS = {
  billing: 'Customer Care · Billing',
  account: 'Customer Care · Account access',
  plans: 'Customer Care · Plans',
  technical: 'Customer Care · Technical',
  direct: 'Customer Care · Direct',
  general: 'Customer Care',
};

const DIRECT_PATH = {
  id: 'direct',
  title: 'Direct Message',
  subtitle: 'Express yourself better by sending a direct message',
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function scrollToTop() {
  if (typeof window !== 'undefined') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function StepEyebrow({ children }) {
  return <p className="supc-eyebrow">{children}</p>;
}

function PathBadge({ children }) {
  return <span className="supc-badge">{children}</span>;
}

function SupportStart({ onTopic, onDirect }) {
  return (
    <div className="supc-stack">
      <section className="supc-hero">
        <div className="supc-hero-head">
          <StepEyebrow>Step 1 of 3 · Get started</StepEyebrow>
          <h2 className="supc-h2">How can we help?</h2>
          <p className="supc-sub">
            Both options connect you with Customer Care. Choose what works best for you.
          </p>
        </div>

        <div className="supc-paths">
          <article className="supc-path">
            <div className="supc-path-top">
              <span className="supc-path-icon" aria-hidden="true">
                <ListFilter className="h-5 w-5" />
              </span>
              <PathBadge>Guided path</PathBadge>
            </div>
            <h3 className="supc-h3">Start with a complaint topic</h3>
            <p className="supc-path-copy">
              We&apos;ll prefill a subject to help you get started. You can edit every detail before sending.
            </p>

            <div className="supc-topics">
              {TOPICS.map((topic) => {
                const Icon = topic.icon;
                return (
                  <button
                    key={topic.id}
                    type="button"
                    className="supc-topic"
                    onClick={() => onTopic(topic)}
                  >
                    <span className="supc-topic-icon" aria-hidden="true">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="supc-topic-text">
                      <span className="supc-topic-title">{topic.title}</span>
                      <span className="supc-topic-desc">{topic.description}</span>
                    </span>
                    <ChevronRight className="supc-topic-arrow" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </article>

          <article className="supc-path supc-path-direct">
            <div className="supc-path-top">
              <span className="supc-path-icon" aria-hidden="true">
                <PenSquare className="h-5 w-5" />
              </span>
              <PathBadge>Direct path</PathBadge>
            </div>
            <h3 className="supc-h3">Message Customer Care directly</h3>
            <p className="supc-path-copy">
              Prefer to explain it in your own words? Write your subject and message without choosing a topic.
            </p>

            <ul className="supc-checks">
              <li><Check className="h-4 w-4" aria-hidden="true" /> Your own subject and message</li>
              <li><Check className="h-4 w-4" aria-hidden="true" /> Screenshots and files welcome</li>
              <li><Check className="h-4 w-4" aria-hidden="true" /> Straight to our Customer Care team</li>
            </ul>

            <div className="supc-direct-action">
              <button type="button" className="supc-btn supc-btn-primary" onClick={onDirect}>
                Send Direct Message
              </button>
            </div>
          </article>
        </div>
      </section>

      <section className="supc-steps" aria-label="How support works">
        <div className="supc-step">
          <span className="supc-step-icon" aria-hidden="true"><Send className="h-4 w-4" /></span>
          <div>
            <p className="supc-step-title">Send your request</p>
            <p className="supc-step-copy">Tell us what happened and add any useful files.</p>
          </div>
        </div>
        <div className="supc-step">
          <span className="supc-step-icon" aria-hidden="true"><Headphones className="h-4 w-4" /></span>
          <div>
            <p className="supc-step-title">We take it from here</p>
            <p className="supc-step-copy">A Customer Care specialist reviews your message.</p>
          </div>
        </div>
        <div className="supc-step">
          <span className="supc-step-icon" aria-hidden="true"><Mail className="h-4 w-4" /></span>
          <div>
            <p className="supc-step-title">Watch your inbox</p>
            <p className="supc-step-copy">Expect a reply within 1 business day.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function SupportForm({
  mode,
  topic,
  subject,
  setSubject,
  details,
  setDetails,
  files,
  fileError,
  onAddFiles,
  onRemoveFile,
  onCancel,
  onChangeTopic,
  onSubmit,
  submitting,
  error,
}) {
  const inputRef = useRef(null);
  const title = mode === 'guided' && topic ? topic.complaint : DIRECT_PATH.title;
  const panelTitle = mode === 'guided' ? 'Tell us what happened' : 'Tell us what’s going on';
  const detailsLabel = mode === 'guided' ? 'Complaint details' : 'Message';
  const detailsPlaceholder = mode === 'guided' ? 'Write your complaint' : 'Write your message';

  const handleDrop = (event) => {
    event.preventDefault();
    onAddFiles(event.dataTransfer?.files);
  };

  return (
    <div className="supc-workspace">
      <form
        className="supc-form-panel"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="supc-form-head">
          <StepEyebrow>Step 2 of 3 · Guided complaint</StepEyebrow>
          <h2 className="supc-h2">{panelTitle}</h2>
          <p className="supc-sub">
            We&apos;ve started your subject for you. Review it and describe what happened.
          </p>
        </div>

        {error && <div className="std-alert std-alert-error">{error}</div>}

        <div className="supc-field">
          <div className="supc-label-row">
            <label className="supc-label" htmlFor="support-subject">Subject *</label>
            <button type="button" className="supc-link" onClick={onChangeTopic}>
              Change topic
            </button>
          </div>
          <div className={`supc-input-wrap ${mode === 'guided' ? 'has-leading' : ''}`}>
            {mode === 'guided' && (
              <CheckCircle2 className="supc-input-icon" aria-hidden="true" />
            )}
            <input
              id="support-subject"
              type="text"
              required
              maxLength={160}
              className="supc-input"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Enter complaint subject"
            />
          </div>
        </div>

        <div className="supc-field">
          <label className="supc-label" htmlFor="support-details">{detailsLabel} *</label>
          <textarea
            id="support-details"
            required
            maxLength={MAX_DETAILS}
            rows={8}
            className="supc-textarea"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder={detailsPlaceholder}
          />
          <p className="supc-counter">{details.length}/{MAX_DETAILS}</p>
        </div>

        <div className="supc-field">
          <p className="supc-label">Attachments <span className="supc-optional">(optional)</span></p>
          <div
            className="supc-dropzone"
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <Upload className="supc-drop-icon" aria-hidden="true" />
            <div className="supc-drop-text">
              <span className="supc-drop-title">Choose a file or drag it here</span>
              <span className="supc-drop-sub">PNG, JPG or PDF · up to 10 MB per file</span>
            </div>
            <Plus className="supc-drop-plus" aria-hidden="true" />
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              multiple
              accept=".png,.jpg,.jpeg,.pdf"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                onAddFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </div>

          {fileError && <p className="supc-file-error">{fileError}</p>}

          {files.length > 0 && (
            <ul className="supc-files">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="supc-file">
                  <span className="supc-file-icon" aria-hidden="true"><FileText className="h-4 w-4" /></span>
                  <span className="supc-file-text">
                    <span className="supc-file-name">{file.name}</span>
                    <span className="supc-file-meta">{formatBytes(file.size)} · Ready to send</span>
                  </span>
                  <button
                    type="button"
                    className="supc-file-remove"
                    onClick={() => onRemoveFile(index)}
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="supc-form-actions">
          <button type="button" className="supc-btn supc-btn-outline" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className="supc-btn supc-btn-primary"
            disabled={submitting || !subject.trim() || !details.trim()}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {mode === 'guided' ? 'Submit Complaint' : 'Send Message'}
          </button>
        </div>
      </form>

      <aside className="supc-aside">
        <div className="supc-aside-card">
          <span className="supc-aside-icon" aria-hidden="true">
            <Headphones className="h-5 w-5" />
          </span>
          <h3 className="supc-h3">You&apos;re in the right place</h3>
          <p className="supc-aside-copy">
            Customer Care can help with billing, account access and anything blocking your workspace.
          </p>
          <p className="supc-aside-strong">Usually within 1 business day</p>
          <p className="supc-aside-copy">
            We&apos;ll email your account address when there&apos;s an update.
          </p>
        </div>
        <p className="supc-safety">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span>Please don&apos;t include passwords, API keys or full card details.</span>
        </p>
      </aside>
    </div>
  );
}

function SupportSuccess({ ticket, mode, subject, details, files, firstName, fullName, onBack }) {
  const [copied, setCopied] = useState(false);
  const reference = ticket?.referenceNumber || ticket?.ticketId || '—';
  const attachments = ticket?.attachments?.length
    ? ticket.attachments
    : files.map((file) => ({ name: file.name, size: file.size }));
  const category = ticket?.category || mode;
  const summaryLabel = mode === 'direct' ? 'Message Summary' : 'Complaint Summary';

  const copyReference = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(reference);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      // Clipboard access can be blocked; the reference stays visible.
    }
  }, [reference]);

  return (
    <section className="supc-success">
      <div className="supc-success-inner">
        <span className="supc-success-mark" aria-hidden="true">
          <Check className="h-7 w-7" />
        </span>
        <StepEyebrow>{mode === 'direct' ? 'Message sent' : 'Complaint submitted'}</StepEyebrow>
        <h2 className="supc-success-title">
          Thanks, {firstName}. We&apos;ve got your message
        </h2>

        <div className="supc-ref">
          <div>
            <p className="supc-ref-label">Your reference number</p>
            <p className="supc-ref-value">{reference}</p>
          </div>
          <button type="button" className="supc-copy" onClick={copyReference}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy reference'}
          </button>
        </div>

        <div className="supc-summary">
          <h3 className="supc-summary-title">{summaryLabel}</h3>

          <p className="supc-summary-label">Subject</p>
          <p className="supc-summary-value">{subject}</p>

          <p className="supc-summary-label">Details</p>
          <p className="supc-summary-body">{details}</p>

          <div className="supc-summary-grid">
            <div>
              <p className="supc-summary-label">Sent to</p>
              <p className="supc-summary-value">{CATEGORY_LABELS[category] || CATEGORY_LABELS.general}</p>
            </div>
            <div>
              <p className="supc-summary-label">Sent by</p>
              <p className="supc-summary-value">{fullName}</p>
            </div>
          </div>

          {attachments.length > 0 && (
            <div className="supc-summary-attachment">
              {attachments.map((file, index) => (
                <div key={`${file.name}-${index}`} className="supc-summary-file">
                  <span className="supc-file-icon" aria-hidden="true"><FileText className="h-4 w-4" /></span>
                  <span className="supc-file-text">
                    <span className="supc-file-name">{file.name}</span>
                    <span className="supc-file-meta">
                      {formatBytes(file.size)}
                      {index === attachments.length - 1
                        ? ` · ${attachments.length} attachment${attachments.length === 1 ? '' : 's'} sent`
                        : ''}
                    </span>
                  </span>
                  <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                </div>
              ))}
            </div>
          )}
        </div>

        <button type="button" className="supc-btn supc-btn-primary supc-success-back" onClick={onBack}>
          Back to Support Center
        </button>
      </div>
    </section>
  );
}

export default function Support() {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);

  const [step, setStep] = useState(1);
  const [mode, setMode] = useState('guided');
  const [topicId, setTopicId] = useState(null);
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [files, setFiles] = useState([]);
  const [fileError, setFileError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(null);

  const topic = useMemo(() => TOPICS.find((item) => item.id === topicId) || null, [topicId]);
  const fullName = user?.fullName || user?.name || 'You';
  const firstName = String(fullName).trim().split(/\s+/)[0] || 'there';

  useEffect(() => {
    scrollToTop();
  }, [step]);

  const resetFlow = () => {
    setStep(1);
    setMode('guided');
    setTopicId(null);
    setSubject('');
    setDetails('');
    setFiles([]);
    setFileError('');
    setError('');
    setSubmitted(null);
  };

  const chooseTopic = (nextTopic) => {
    setMode('guided');
    setTopicId(nextTopic.id);
    setSubject(nextTopic.title);
    setDetails('');
    setFiles([]);
    setFileError('');
    setError('');
    setStep(2);
  };

  const chooseDirect = () => {
    setMode('direct');
    setTopicId('direct');
    setSubject('');
    setDetails('');
    setFiles([]);
    setFileError('');
    setError('');
    setStep(2);
  };

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;
    setFileError('');

    const next = [...files];
    for (const file of incoming) {
      if (next.length >= MAX_FILES) {
        setFileError(`You can attach up to ${MAX_FILES} files.`);
        break;
      }
      const extension = `.${String(file.name).split('.').pop()?.toLowerCase() || ''}`;
      if (!ALLOWED_EXTENSIONS.includes(extension)) {
        setFileError('Only PNG, JPG, or PDF files are allowed.');
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setFileError('Attachments must be 10 MB or smaller.');
        continue;
      }
      next.push(file);
    }
    setFiles(next);
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setFileError('');
  };

  const submitTicket = async () => {
    if (!subject.trim() || !details.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const form = new FormData();
      form.append('subject', subject.trim());
      form.append('message', details.trim());
      form.append('category', mode === 'guided' ? topicId : 'direct');
      form.append('priority', 'medium');
      files.forEach((file) => form.append('attachments', file));

      const result = await apiFetch('/api/support/tickets', {
        method: 'POST',
        body: form,
        timeoutMs: 60000,
      });

      if (result.success === false) {
        throw new Error(result.message || 'Failed to send your message');
      }

      setSubmitted(result.ticket || { referenceNumber: result.referenceNumber, category: mode === 'guided' ? topicId : 'direct' });
      setStep(3);
    } catch (err) {
      setError(err.message || 'Failed to send your message');
    } finally {
      setSubmitting(false);
    }
  };

  const pageTitle = step === 2
    ? (mode === 'guided' && topic ? topic.complaint : DIRECT_PATH.title)
    : 'Support Center';
  const pageSubtitle = step === 2
    ? (mode === 'guided' ? 'Provide more details about your complaint.' : DIRECT_PATH.subtitle)
    : 'Get support from us. Choose a topic or send us a message.';

  return (
    <AuthGuard>
      <Head>
        <title>Support Center - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          {step !== 3 && (
            <header className="workspace-header dash-header supc-header">
              <div className="supc-heading">
                {step === 2 && (
                  <button type="button" className="supc-back" onClick={resetFlow} aria-label="Back to Support Center">
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                )}
                <div>
                  {step === 1 && (
                    <p className="dash-crumb">
                      Manage <span className="sep">/</span> Support Center
                    </p>
                  )}
                  <h1 className="dash-title supc-title">{pageTitle}</h1>
                  <p className="supc-header-sub">{pageSubtitle}</p>
                </div>
              </div>
            </header>
          )}

          <div className={`workspace-content supc-content ${step === 3 ? 'supc-content-success' : ''}`}>
            {step === 1 && (
              <SupportStart onTopic={chooseTopic} onDirect={chooseDirect} />
            )}

            {step === 2 && (
              <SupportForm
                mode={mode}
                topic={topic}
                subject={subject}
                setSubject={setSubject}
                details={details}
                setDetails={setDetails}
                files={files}
                fileError={fileError}
                onAddFiles={addFiles}
                onRemoveFile={removeFile}
                onCancel={resetFlow}
                onChangeTopic={resetFlow}
                onSubmit={submitTicket}
                submitting={submitting}
                error={error}
              />
            )}

            {step === 3 && (
              <SupportSuccess
                ticket={submitted}
                mode={mode}
                subject={subject}
                details={details}
                files={files}
                firstName={firstName}
                fullName={fullName}
                onBack={resetFlow}
              />
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
