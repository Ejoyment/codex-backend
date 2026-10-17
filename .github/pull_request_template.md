# Pull request checklist

## Must-test before merging (all required)

- [ ] `env JWT_SECRET=test-secret-for-automated-testing-32chars NODE_ENV=test MONGODB_URI=mongodb://localhost:27017/codex-inc-ci-test npx jest --forceExit --coverage=false` — full suite green (known exception: `tests/lsp-manager.test.js` pyright-completions flake; must pass solo)
- [ ] New/changed routes covered by endpoint tests (auth shapes, tenant isolation, fail-closed)
- [ ] No client-supplied pricing/amounts reach any provider adapter (server prices everything)
- [ ] `docs/regionalPricing.json` still valid JSON; `config/regionalPricing` loader accepts it
- [ ] No secrets in diff (`git diff` shows no tokens, keys, `.env` contents)
- [ ] Socket changes tested with both shapes of auth (`{ token }`) and assert `connect_error` on missing/bad token
- [ ] TTL/retention changes: new expiring collections have an index + a backfill story for pre-existing rows

## Merge checklist

- [ ] Linked decision/audit reference (e.g. "decision 3.5", "rec 11") in the PR description
- [ ] Backfill scripts included where storage shapes changed (dry-run default, `--apply` writes)
- [ ] Env-var additions documented (name, default, where read)
- [ ] Frontend copy updated if pricing/billing text changed (amounts, "per year", rail names)
- [ ] Open follow-ups listed (refund wording, ToS, retention declaration, Redis instance, sandbox runs)
- [ ] Branch rebased on latest `main`; no merge conflicts
