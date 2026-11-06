# Remaining Audit Work

Generated: 2026-10-25  
Refreshed: 2026-11-06 (`main` at `5a492a2`)  
Repo: `/home/hiro/Documents/dev/codex/codex-backend`  
Revision: `d585ed9` on `fix/disable-host-debugging` (dirty working tree)  
Scope: `docs/audit`, `docs/review`, `docs/ops`, `docs/legal`, payments status/runbook, regional pricing.

This file consolidates the remaining, non-implemented work from the audited source documents. It does not replace legal review or production runbooks.

## Verified Non-Decision Queue (2026-11-06)

`main` was refreshed to `5a492a2`. The P0-P5 sections below are the original
audit record and contain stale entries; verify current code before acting.
Decision-gated work remains excluded: refunds/chargebacks/cancellation policy,
yearly-pricing policy, 30-day retirement, Flutterwave interval policy, compute
overage invoicing, and `.env*` sandbox denial.

### Backend and runtime
- **Pipelines still simulate success.** `routes/pipelines.js:136-174` marks
  stages complete with sleeps and random results instead of running a real
  isolated worker. Either implement execution or return an explicit `501`.
- **Sandbox readiness is misleading.** `utils/sandboxProvisioner.js:298-361`
  marks the sandbox `ready` even when Docker, clone, or install steps were
  skipped; `:342` falls back to `localhost` when `SANDBOX_PUBLIC_URL` is unset.
  Split `snapshot_ready` from `app_ready` and require a public base URL in
  production.
- **Mock provider data is still shipped.** Figma projects in
  `routes/dashboard.js:409`, integration sync in `:466-501`, and Discord
  channels/messages/send in `routes/discord-api.js:348-413`. Replace with real
  provider calls or explicit unsupported responses.
- **Stuck agent executions have no sweeper.** Old `AgentExecution` rows with
  `status: 'running'` can keep counting as active jobs. Add a bounded stale-row
  reaper using the existing AI timeout as the threshold.
- **Deployment errors expose raw messages.** `routes/deployments.js:624-630`
  and `:752-754` append `error.message`; `DeploymentLogsModal` renders the
  stored value. Persist a safe summary and keep diagnostics server-side.
- **Raw 500 messages still leak.** Roughly 370 `error.message`/`err.message`
  references remain in route/middleware code; centralize the safe envelope and
  map validation errors explicitly.
- **Company member arrays are uncapped.** `models/Company.js:28-46` can grow
  toward the document limit; add tier-aware caps or a relation.

### Frontend
- **Password-change UI is disabled.** `buildrs-frontend/pages/settings.js:1075`
  says the feature is coming soon even though the backend flow exists.
- **Support-agent setup is a dead end.**
  `buildrs-frontend/pages/setup-support-agent.js` only says "coming soon";
  hide the entry point or finish the flow.
- **Editor hydration and error handling.** `buildrs-frontend/pages/editor.js`
  and `buildrs-frontend/lib/ideRun.js` still have raw-error sinks and can open a
  saveable empty buffer after failed hydration. Use operation-specific copy and
  never treat hydration failure as an empty file.

### Larger refactors
- Extract composition/boot wiring from `server.js`.
- Route the remaining hand-rolled `jwt.verify` sites through one verifier.
- Externalize process-local run, terminal, and collaboration state, or document
  the single-instance assumption.
- Add CI linting and a coverage threshold; syntax and frontend build gates exist.

### Verified fixed; do not reopen
Trial expiry repair, scheduler provider scoping, notification dedupe index,
JWT base64url/skew handling, tier-script dry runs, sandbox host-exec policy,
and CI syntax/frontend-build gates.

## Result

No audited source document is fully resolved end-to-end. Every implementation/audit document still has at least one partial or open item. The closest is `docs/audit/AUDIT-2026-10-19.md`, where all 11 numbered findings are fixed but the structural design notes remain.

The audit and review source documents were deleted after consolidation, as confirmed by the user. Legal policies, operational runbooks, payments status/runbook, and regional pricing were retained because they are active references rather than implementation records.

## Source Disposition

| Source | Verdict | Action |
|---|---|---|
| `docs/audit/AUDIT-2026-10-19.md` | All numbered findings fixed; design notes 1-3 open | Deleted after consolidation |
| `docs/audit/recommendations.md` | Partial: recs 6, 7, 8, 12, 13, 14; team decisions remain | Deleted after consolidation |
| `docs/audit/sweep3.md` | Partial: billing, CI, scripts, editor, terminal-buffer items remain | Deleted after consolidation |
| `docs/audit/PAYMENTS-EDITOR-AUDIT-2026-10-21.md` | Partial: P13, P15, E10, editor residuals | Deleted after consolidation |
| `docs/audit/bugs-and-design.md` | Many open high/medium findings and design risks | Deleted after consolidation |
| `docs/audit/failure-modes.md` | Partial: cross-rail billing, AI backoff, execution plane, TTL/index gaps, frontend errors | Deleted after consolidation |
| `docs/audit/legal-requirements.md` | Partial: provider inventory, export/deletion, retention, terms gaps | Deleted after consolidation |
| `docs/audit/knowledge-graph.md` | Descriptive and mostly current, but stale line/count references | Deleted after consolidation |
| `docs/review/sandbox-utils-review.md` | Mostly resolved; H3, M2, L2, per-language image remain | Deleted after consolidation |
| `docs/ops/launch-cutover.md` | Stale/partial operational checklist | Recorded below; retain unless explicitly deleted |
| `docs/ops/secret-rotation.md` | Stale/partial secret inventory and entitlement-secret claim | Recorded below; retain unless explicitly deleted |
| `docs/payments-status.txt` | Partial: P15 callback predicate, E5 wording, annual pricing | Recorded below; retain unless explicitly deleted |
| `docs/payments-admin-runbook.txt` | Current except legacy-log/callback wording | Correct or retain; do not delete without confirmation |
| `docs/regionalPricing.json` | Runtime config; yearly multiple conflicts with frontend | Keep as config; reconcile |
| `docs/legal/*.md` | Active policy drafts, not implementation records; several open obligations | Do not delete without explicit legal/owner confirmation |
| `docs/legal/decisions-needed.pdf` | Exact duplicate of Markdown | Retained; safe to delete/regenerate later |
| `docs/legal/terms-of-service.pdf` | Exact duplicate draft; contains `[[VERIFY]]` markers | Retained; not publishable |
| `docs/legal/privacy-policy.pdf` | Near-duplicate draft; contains placeholders | Retained; regenerate after final policy |
| `docs/audit/audit-addendum.pdf` | Partial duplicate of `sweep3.md` sections 5-6 | Deleted after consolidation |
| `docs/audit/audit-report.pdf` | Older compiled snapshot with unique historical content | Deleted after consolidation |

## P0: Security, Data Integrity, and Money

- **Approval is not atomic across VFS and Git.** `utils/agentApprovalService.js:64-85` applies file changes before the merge, with no rollback or transaction. Make approval idempotent, merge-first, or compensating on failure.
- **Raw exception messages leak through HTTP 500 handlers.** Approximately 287 direct handlers still forward `error.message`/`err.message`; `server.js:609-618` only hides them in production. Introduce a stable error envelope and request IDs, and map safe validation errors explicitly.
- **The editor renders raw API/infrastructure errors.** `buildrs-frontend/pages/editor.js` has multiple sinks; `buildrs-frontend/lib/ideRun.js:71-75` turns 404 into user-visible text; `pages/editor.js:1839-1844` opens an empty buffer when hydration fails. Use operation-specific copy, distinguish 404, and never turn failed hydration into a saveable empty file.
- **Terminal errors expose VPS/SSH details.** `utils/terminalService.js:460-465`, `utils/vpsShell.js:127,136`, and `server.js:929-990` forward transport diagnostics. Return a generic terminal failure and keep diagnostics in structured server logs.
- **Deployment errors expose infrastructure details.** `routes/deployments.js:371,388` persists provider messages and `components/DeploymentLogsModal.js:218-225` renders them. Store a safe summary separately from private diagnostics.
- **Client-controlled database limits are unbounded.** `routes/ai-pair.js:388-397,414-426`, `routes/messaging.js:435-452`, and `routes/standup.js:234-249` accept large or non-finite limits. Clamp to finite positive integers per endpoint.
- **VFS can store duplicate files at one path.** `models/CodeFile.js:89` has a non-unique index; `utils/virtualFileSystem.js:232-260` and `routes/vfs.js:471-513` allow duplicates. Enforce a normalized unique `{company, path, name}` key and define overwrite semantics.
- **Compute preflight is still read-before-start.** `middleware/tierEnforcement.js:179-201` checks capacity before execution; `utils/creditPoolService.js:158-274` uses atomic increments for the charge path. Add atomic reservation or make overage behavior explicit for concurrent starts.
- **Audit logging is best-effort and swallowed.** `utils/auditLogService.js:3-20` does not fail required events. Use an outbox or define which events must fail closed.
- **AI-pair accepts mass-assigned fields.** `routes/ai-pair.js:459-467` accepts `status`; `:510-517` copies all non-identity fields. Use explicit allowlists and server-only state transitions.
- **Public support tickets trust a body-supplied `userId`.** `routes/support.js:324-335` should derive the owner from a verified token or reject the client-supplied ID.
- **File deletion can report success after both VFS and DB failures.** `routes/code-editor.js:645-675` ignores both results. Return explicit partial-failure state and invalidate caches.
- **Debug-room arrays are unbounded.** `server/models/DebugRoomModel.js:15-51`, `server/services/roomService.js:156-164`, and `server/routes/rooms.js:91-106` need participant/request/key caps.
- **Agent active-session check-then-act race.** `routes/agent-v1.js:114-130` needs a conditional transition or unique active-task constraint. `utils/dashboardOverview.js:90` also needs projection/limit bounds.
- **Account deletion uses the wrong CodeFile key.** `routes/auth.js:885-905` calls `CodeFile.deleteMany({ userId })`, but `models/CodeFile.js:26` uses `createdBy`. Fix the key, add an end-to-end deletion test, and fail closed or retry failed collection deletes.
- **P13 cancellation/refund/provider revocation remains incomplete.** Canonical Stripe uses `cancel_at_period_end`; Paystack/Flutterwave cancellation adapters are stubs (`server/services/billing/adapters/paystack.js:62-65`, `flutterwave.js:69-72`). Define refunds, chargebacks, revocation, and period-end semantics across all rails.
- **P15 still has three billing stacks.** `server.js:407,426-428,464-471` mounts legacy, provider, and canonical routes. Retire or hard-disable the non-canonical stacks and keep one read/write source of truth.
- **P15 callback predicate is too narrow.** `middleware/legacyBillingDeprecation.js:3-5` exempts only suffix `/webhook` and `/verify`; legacy Stripe `/webhook/stripe` and `/payment/stripe` can return 410. Fix the predicate and test every callback path.
- **Refund/dispute handling is incomplete.** `server/services/billing/entitlementService.js:266` is a visible no-op; `server/services/billing/adapters/stripe.js:122-123` maps refunds/disputes to `past_due`. Define chargeback/downgrade policy and tests.
- **Yearly pricing is inconsistent.** `docs/regionalPricing.json:40` uses a x10 multiple; frontend yearly prices in `buildrs-frontend/lib/plans.js:15,32` are 20% off; Flutterwave `/initialize` ignores interval (`routes/flutterwave-billing.js:13-17`). Choose one policy and propagate interval to all rails.

## P1: Billing and Reliability

- **Trial expiry edge cases.** `middleware/trial.js:32-44,85-114` and `utils/billingCron.js:140-160`: missing trial dates may never expire, and expiry does not cancel pending schedules.
- **Legacy Stripe checkout idempotency.** `routes/subscription.js:187-205` needs an idempotency key and duplicate-session handling.
- **Multi-rail checkout can orphan an Entitlement.** `routes/subscription.js:256-269` and `server/services/billing/paymentRouter.js:34-97` need reconciliation when the entitlement write fails.
- **Paystack duplicate checkout sessions.** `routes/paystack-billing.js:173-210,487-520` validates amount/currency but still needs retry/duplicate-session handling and legacy convergence.
- **Legacy webhook dedupe.** `utils/webhookSecurity.js:26-41` and `server.js:274` fixed raw-body/path markers, but legacy apply still lacks shared idempotency with canonical billing.
- **Scheduler claims are not provider-scoped.** Due queries in `utils/paystackScheduler.js:215`, `utils/flutterwaveScheduler.js:206`, and `utils/billingScheduler.js:581` lack a provider filter. Filter or infer provider before claiming.
- **Charge failure semantics are inconsistent.** Decline, retry, `past_due`, and downgrade behavior still differ across schedulers.
- **Cancellation during an in-flight charge is unresolved.** `utils/paystackScheduler.js:245-250` only cancels pending rows; adapter cancellation is stubbed. Reconcile `processing` rows and provider mandates.
- **Signup OTP flow deletes before send.** `routes/otp.js:41-46,135-139` and `utils/emailServiceResend.js:49-104` should send before deleting the previous OTP and repair signup subdocuments.
- **Signin lockout and OAuth failure handling.** `routes/auth.js:225-279` and `config/passport.js` need atomic lockout, OAuth error redirects, and token-fragment cleanup.
- **AuthGuard/token-store edge cases.** `components/AuthGuard.js:17-55`, `store/authStore.js:8-9`, and `lib/api.js:51-70` need safe JSON parsing, timeout retries, and stable `fetchUser` behavior.
- **Onboarding and DevGate trust client state.** `pages/onboarding.js:26-48` is unguarded and uses a raw token; `components/DevGate.js:35-55` is client-side. Guard the page, validate ownership, and remove client secrets.
- **Socket presence/typing/meetings need durable authorization.** `utils/messagingSocket.js:40-55`, `utils/collabRealtimeSocket.js`, and `utils/meetingSocket.js` need persistence, authz, and cross-instance routing.
- **Notification dedupe index is not unique.** `models/Notification.js:116-117` allows duplicates; stuck `running` executions still need a sweeper.
- **HITL room mismatch remains.** Owner/workspace binding is fixed in `utils/hitlGates.js:80-105`, but the room target differs from `server.js:726`; late-approval semantics also need definition.
- **AI worker and provider resilience.** `routes/agent-v1.js:246-280` is fire-and-forget; `utils/aiService.js:104-117` lacks health/backoff/429 queueing. Add durable worker timeouts, provider health, and shared rate limits.
- **Execution approval/tweak verification is partial.** `utils/agentApprovalService.js:18-62` verifies specs, but merge atomicity, unknown checks, and idempotency remain.
- **Terminal lifecycle gaps.** `utils/terminalService.js` and `models/TerminalLog.js:45-59` have TTL/entry caps, but PTY history, generic errors, and destroy reconciliation remain.
- **Sandbox/exec/LSP/debug lifecycle.** `utils/sandboxProvisioner.js`, `utils/sandboxExecutor.js`, `utils/containerWorker.js`, `utils/lspManager.js`, and `utils/debugAdapter.js` need cleanup, timeouts, isolation, and real debug data.
- **Deployment failure handling.** `routes/deployments.js:58-67` sweeps stale deploys, but safe errors, remote timeout ownership, and subdomain locking remain.
- **User/company deletion fan-out.** `routes/auth.js:885-1004` still needs CodeFile key fixes, provider token revocation policy, and optional VectorMemory cleanup.
- **Subscription reset default and version caps.** `models/Subscription.js:58,136-149` can default `resetAt` to yearly; enforce caps and run a cohort migration.
- **Missing TTLs.** `models/TeamActivity.js` and `models/Standup.js` lack TTLs; add them and cap log bytes.
- **Meilisearch field mismatch.** `utils/codeSearchService.js:345` queries `companyId` while `CodeFile` stores `company`; align fields and rebuild strategy.
- **API client hardcodes a Render URL.** `buildrs-frontend/lib/api.js:14` should require an env origin; retries at `:51-70` reuse the controller and lack 429 backoff.
- **Frontend shell/SSE resilience.** `_app`, toast boundaries, and `lib/ideRun.js:62-100` need segment boundaries, durable toasts, and SSE timeout/401/null-body handling.
- **Checkout/dashboard false states.** `pages/checkout.js:64`, `hooks/useDashboard.js:143-150`, notifications, integrations, and waitlist need real error states rather than zeros or success placeholders.
- **Onboarding/SSE/integration edges.** `pages/onboarding.js:26-48`, `lib/ideRun.js`, and `pages/integrations.js:99-101` need validation, expiry recovery, and `authUrl` errors.

## P2: Platform, Ops, and Design

- **Terminal ring buffers leak.** `server/sockets/roomSocket.js:26,53-54,193` clears only on close; `server/services/roomService.js:224-232` deletes DB rows only. Clear in-memory buffers from the sweeper.
- **CI gaps remain.** `.github/workflows/ci.yml` has audit/secret gates, but no lint/build; the syntax loop skips `server/`, `scripts/`, and `tests/`; PRs to `develop` skip CI; coverage has no threshold.
- **Tier scripts can write production without confirmation.** `scripts/migrate-tier-names.js:33` and `scripts/sync-tier-restrictions.js:87,122` need dry-run defaults, confirmation, and bounded saves.
- **`FRONTEND_URL` is not fully validated.** `utils/bootConfig.js:75-77` warns only; `routes/paystack-billing.js:102` is unguarded; some rails fall back to localhost. Fail fast or guard every callback URL.
- **Swagger hardcodes a localhost URL.** `config/swagger.js:24` should come from environment/config.
- **Mock surface diverges from real adapters.** Align mock/test behavior or document the divergence.
- **`isTokenExpired` mishandles base64url.** `buildrs-frontend/lib/security.js:45-55` uses `atob` without normalization, skew, or refresh.
- **Commit & Push sends the entire file set.** `buildrs-frontend/pages/editor.js:2804-2828` pushes `gatherDeploymentFiles()`; send only changed files and preserve remote changes.
- **LSP sync dies after remount.** `pages/editor.js:419,2438` registers providers once behind `lspProvidersRef`; the timer is not cleared on unmount.
- **Auto-deploy defaults on.** `pages/editor.js:610-649,2773` persists the toggle but defaults to true; default off or require explicit consent.
- **Enterprise card is a dead end.** `pages/settings.js:626-632` is disabled with no contact-sales/support path.
- **Secrets reach run/sandbox/deploy buffers.** AI context strips `.env*` at `pages/editor.js:1869-1895`, but run/sandbox/deploy still receive secret buffers. Deny `.env*` server-side.
- **Mixed tier labels disagree.** `pages/editor.js:26-32` returns "Team" for both team tiers; `lib/tier.js:162-169` distinguishes Team Std/Team Prem. Use one helper.
- **Sandbox host-exec override remains.** `utils/sandboxExecutor.js:21-23` honors `SANDBOX_ALLOW_HOST_EXEC=true` in production; refuse the override in production or document a dev-only exception.
- **Sandbox regex validation and 30s test timeout.** `utils/sandboxExecutor.js` still uses `validateCode` and a hardcoded 30s timeout; remove/justify or parameterize.
- **Sandbox advertises languages but uses one image.** `utils/sandboxExecutor.js:203-215` advertises seven languages, while `utils/sandboxSecurity.js:60` hardcodes `node:18-alpine`; `getDockerImage` is unused.
- **Launch checklist uses the wrong health path.** `docs/ops/launch-cutover.md` checks `/health`, but only `/api/health` exists (`server.js:585`).
- **Launch checklist env inventory is incomplete.** `.env.example` lacks `SENTRY_DSN`, `REDIS_URL`, `TERMINAL_EXEC_MODE`, `TERMINAL_SSH_*`, and `IDE_ALLOW_HOST_EXEC`.
- **Terminal-mode wording is wrong.** Container mode only refuses local PTY; remote container requires VPS transport (`utils/terminalService.js:19-32,433,459-465`).
- **Sandbox smoke expects `[docker]` on success.** `[docker]` is logged only when Docker is unavailable (`utils/sandboxProvisioner.js:299`); assert readiness instead.
- **Entitlement signing secret fallback.** `server/services/billing/entitlementSignature.js:26-35` falls back to `JWT_SECRET`; enforce a dedicated secret or correct the runbook.
- **Secret inventory is incomplete.** Add `ENTITLEMENT_SIGNING_SECRET_PREVIOUS`, `TERMINAL_SSH_KEY`, `SECRET_ENCRYPTION_KEY`, `TURN_STATIC_SECRET`, `VSCODE_EXTENSION_TOKEN`, and `DEMO_AGENT_PASSWORD` to `docs/ops/secret-rotation.md`.
- **Runbook log format is wrong.** `middleware/legacyBillingDeprecation.js:26` logs `route=${name}`, not the matched route; update the runbook or code.
- **Pipelines simulate success.** `routes/pipelines.js:142-160` should use a real isolated worker or return unsupported.
- **Sandbox is marked ready on preview only.** `utils/sandboxProvisioner.js:298-370` should distinguish `snapshot_ready` from `app_ready`.
- **Sandbox URL defaults to localhost.** `utils/sandboxProvisioner.js:341-345` and `utils/bootConfig.js` warn only; require a reachable public base URL.
- **Terminal can silently become simulated.** `utils/terminalService.js:65-74,520-532` and `pages/editor.js:1194-1203` should fail closed or label the mode accurately.
- **Support-agent setup is a dead end.** `buildrs-frontend/pages/setup-support-agent.js:18-21` should be hidden or implemented.
- **Vector memory defaults to process memory.** `utils/vectorMemory.js:16,44` and the homepage claim at `pages/index.js:26` need a durable backend or removal.
- **Boot checks do not gate all advertised dependencies.** `utils/bootConfig.js:10-88` mostly warns for Redis/mail/payments/Docker/SSH/sandbox. Add deployment profiles and readiness gates.
- **Sandbox/IDE runs depend on process-local state.** `utils/sandboxProvisioner.js:18-20` and `routes/ide.js:31-44` need durable leases or owner pinning.
- **`server.js` remains a god entrypoint.** Routes, namespaces, boot, cron, and shutdown are still in one file; extract composition modules.
- **Hand-rolled auth remains at 12 sites.** `routes/support.js`, `middleware/subscription.js`, `middleware/trial.js`, `middleware/teamRestrictions.js`, and `middleware/tierEnforcement.js` still call `jwt.verify` directly. Route through one verifier.
- **In-memory state remains.** Redis covers sessions, rate limits, sockets, and cron leadership, but runs and terminal buffers are process-local. Document the single-instance assumption or externalize them.
- **Collaboration state is single-process.** `utils/collaborationService.js:19-41` needs a durable CRDT store or single-owner routing.
- **Workspace/project models overlap.** `utils/workspaceIdentity.js`, `models/LocalProject.js`, and `models/TeamProject.js` need one canonical project aggregate.
- **Embedded arrays can approach 16 MB.** `models/Company.js:28-46` and DebugRoom arrays need caps or relations.
- **Quota enforcement mixes atomic and non-atomic paths.** `middleware/tierEnforcement.js:59-88` and `utils/creditPoolService.js:95-227` need atomic reservation and idempotent release.
- **Observability is partial.** Sentry is wired, but request IDs, failure counters, and critical-workflow coverage remain.
- **Editor is a god component.** `buildrs-frontend/pages/editor.js` and `lib/api.js`/`store/authStore.js` need feature extraction and an explicit auth lifecycle contract.
- **SPOFs remain.** Single Node process, shared VPS, JWT singularity, and hardcoded frontend origin are still open.

## P3: Product and UX Residuals

- **Dashboard/Discord data is synthetic.** `routes/dashboard.js:415-451` and `routes/discord-api.js:347-405` should call real providers or return unsupported.
- **`analyze_code` does not parse.** `utils/agentOrchestrator.js:1014-1027` reports syntax-valid without real parsing; use language tooling or label it heuristic.
- **Password-change UI is missing.** `buildrs-frontend/pages/settings.js:1065` says unavailable although `routes/auth.js:690-749` exists. Wire the form or remove the notice.
- **HITL room mismatch.** `utils/hitlGates.js:90` and `server.js:726` target different rooms; align them and keep owner/workspace binding.
- **Editor error handling and hydration.** See P0; this is the largest editor UX/data-loss risk.
- **Privacy page is stale.** `buildrs-frontend/pages/privacy.js:4` omits Hugging Face, still mentions Ollama/LM Studio, and has stale export/retention claims. Reconcile with the live policy and providers.
- **Maturity claims exceed implementation.** `buildrs-frontend/pages/index.js:682-711` advertises partial features; add release boundaries and acceptance checklists.

## P4: Legal and Policy Obligations

- **Provider inventory mismatch.** Privacy policy lists Google, Groq, Mistral, Anthropic, and OpenAI; `config/aiProviders.js:4-36` implements Gemini, Mistral, Groq, and Hugging Face. Add Hugging Face, remove/explain Anthropic, and add provider policy links.
- **"Providers do not train" is unverified.** No `store:false`, zero-retention, or training-control code exists in `utils/aiService.js` or adapters. Confirm DPAs/API terms before publishing.
- **Backup retention is unresolved.** `docs/legal/privacy-policy.md:68` has `[[VERIFY]]` for MongoDB Atlas/Render snapshots; confirm actual tiers and retention.
- **Export policy conflicts with implementation.** The policy says no self-service export, but `GET /api/profile/export` exists (`routes/profile.js:253`). Resolve PP-15 and expand the export if it is public.
- **Account deletion is incomplete.** Fix the CodeFile key, decide company/team-owned data handling, revoke provider tokens, and add an end-to-end deletion test.
- **Cookie/storage inventory is incomplete.** Add `buildrs:notification-sound`, `buildrs:notification-seen`, `buildrs-dev-unlocked`, `auth-storage`, and session `userEmail`; make session lifetime conditional on Redis.
- **Terms lack AI/agent/execution terms.** Add UGC, AI output, OAuth actions, MCP/webhook/API acceptable use, and liability terms.
- **Refund/chargeback/cancellation terms need alignment.** The Terms say nonrefundable and immediate cancellation, but current billing uses period-end cancellation and has no refund path.
- **Usage limits are not in the Terms.** Publish quotas and enforcement behavior.
- **Termination/suspension enforcement is partial.** Add an admin suspension path if marketed, or narrow the Terms.
- **Recurring billing claim is unsupported on new rails.** Checkout creates one-time Paystack/Flutterwave payments; only legacy schedules renew. Implement mandates or amend the Terms.
- **Grace period is not implemented.** `gracePeriodEndsAt` is defined but never written/read; `failedPayments` is never incremented. Implement timed grace/payment-method update or amend the Terms.
- **99.9% SLA and WCAG 2.1 AA are unverified.** Only `/api/health` exists; no availability measurement, status page, or accessibility audit. Add monitoring/audit or soften the claims.
- **Live Terms page is stale.** `buildrs-frontend/pages/terms.js:4-14` is an old placeholder with a February 2026 date; publish the current draft after counsel review.
- **Legal decisions remain open.** `docs/legal/decisions-needed.md` still has PP-6, PP-8, PP-11, PP-15, ToS-3, ToS-8/9, and ToS-15 open. Resolve PP-15 and ToS-15 first.

## P5: Documentation Cleanup

- Historical audit/review sources were deleted; their open items are captured above. Do not recreate them solely to refresh stale line/count references.
- Update `docs/ops/launch-cutover.md` for `/api/health`, env names, terminal-mode wording, and sandbox smoke expectations.
- Update `docs/ops/secret-rotation.md` for the entitlement fallback and missing secrets.
- Correct `docs/payments-status.txt` P15 callback claims, E5 pricing wording, and annual-price mismatch.
- Correct `docs/payments-admin-runbook.txt` legacy log format and callback-exemption section.
- Reconcile `docs/regionalPricing.json` with `buildrs-frontend/lib/plans.js` and provider interval handling.
- Regenerate legal PDFs only after policy decisions are final; do not publish the current drafts.

## Verified Fixed and Not To Be Reopened

The following are implemented and should not be re-added as open work without new evidence:

- `AUDIT-2026-10-19` findings 1-11: socket auth, sandbox port leak, OTP fail-mode, AI registry, HTTP timeouts, Mongo fail-fast, support-agent lifecycle, cache pruning, trial scan bounds, JWT algorithm pinning, stuck-processing reaper.
- `PAYMENTS-EDITOR-AUDIT` P1, P5, P6, P2/E3, P3/E1, P4/E2, P7-P12, P14, P11/E4, E5, E6, E7, E8, E9, E11.
- `sweep3` tier mirroring, strict entitlement fields, server-side amount validation, Stripe renewal resolution, legacy raw-body fix, duplicate-event 200, atomic idempotency, room-socket liveness, room-signal authz, terminal chunk cap, room-ID validation, `/app` unmount, `client/` removal, dead DebugRoom require, entitlement route, cross-tenant file IDOR, scheduler double-claim, remote cursors, agent execution wiring, GitHub delete, status badge, socket reconnect rejoin, deploy timers, PTY project-switch warning, per-file dirty baseline, read-only preview, stop-deployment confirm, downgrade timing, deterministic file keys, settings credits.
- `bugs-and-design` B1 socket ownership and B31 duplicated AI provider config.
- `failure-modes` entitlement endpoint, liveness/permission fail-closed behavior, support realtime auth, canonical apply idempotency, debug-room sweeper, BYOM removal.
- Legal P7: encrypted integration/MCP secrets, hashed OTPs, BYOM removal.

## Verification Note

Test-count evidence is inconsistent between audit passes: one pass reported a full green run at 104 suites/1537 tests, another reported 35 suites/803 tests. Re-run the repository's canonical test command before release and record the exact command, commit, and result.

## Deletion Completed

The user confirmed deletion of the audit/review sources only. The following were deleted after consolidation:

- All of `docs/audit/` (including audit PDFs, diagrams, and graph tooling).
- `docs/review/sandbox-utils-review.md`.

The following were retained because they are active legal or operational references rather than implementation records:

- `docs/legal/privacy-policy.md`
- `docs/legal/terms-of-service.md`
- `docs/legal/cookie-notice.md`
- `docs/legal/decisions-needed.md`
- `docs/ops/launch-cutover.md`
- `docs/ops/secret-rotation.md`
- `docs/payments-status.txt`
- `docs/payments-admin-runbook.txt`
- `docs/regionalPricing.json`

The legal PDFs were also retained. They are draft exports and should not be published. `docs/legal/decisions-needed.pdf` and `docs/legal/terms-of-service.pdf` are exact duplicates of their Markdown sources; `docs/legal/privacy-policy.pdf` is a near-duplicate with placeholders and should be regenerated after final policy text.
