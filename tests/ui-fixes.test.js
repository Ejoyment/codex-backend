/**
 * UI Fixes — unit tests for Bugs 1-5
 * These tests can be run via `npm test` (Jest) and verify the UI-related fixes
 * without needing a browser. They check file contents / logic that the UI depends on.
 */
const fs = require('fs');
const path = require('path');

const FRONTEND_ROOT = path.join(__dirname, '..', 'buildrs-frontend');

function readFrontend(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

describe('Bug 1 — FormData upload via apiFetch', () => {
  test('lib/api.js skips Content-Type for FormData', () => {
    const api = readFrontend('lib/api.js');
    expect(api).toMatch(/isFormData/);
    expect(api).toMatch(/instanceof FormData/);
    // Should NOT unconditionally set Content-Type
    expect(api).toMatch(/isFormData \? \{\} : \{ 'Content-Type'/);
    // Should delete Content-Type if FormData
    expect(api).toMatch(/delete headers\['Content-Type'\]/);
  });

  test('settings.js uploadPicture uses apiFetch not raw fetch', () => {
    const settings = readFrontend('pages/settings.js');
    expect(settings).toMatch(/apiFetch\('\/api\/profile\/picture'/);
    expect(settings).not.toMatch(/fetch\('\/api\/profile\/picture'/);
    // Should not manually read token for Authorization
    const uploadSection = settings.slice(settings.indexOf('const uploadPicture'));
    expect(uploadSection).not.toMatch(/localStorage\.getItem\('authToken'\)[\s\S]*fetch/);
  });

  test('profile.js also uses apiFetch for picture', () => {
    const profile = readFrontend('pages/profile.js');
    expect(profile).toMatch(/apiFetch\('\/api\/profile\/picture'/);
  });

  test('backend profile route returns profilePicture field', () => {
    const route = fs.readFileSync(path.join(__dirname, '..', 'routes/profile.js'), 'utf8');
    expect(route).toMatch(/profilePicture:.*\.profilePicture/);
    // Response should contain profilePicture
    expect(route).toMatch(/res\.json\(\{[\s\S]*profilePicture/);
  });
});

describe('Bug 2 — Company members null-user handling', () => {
  test('routes/company.js filters null user before membership check', () => {
    const company = fs.readFileSync(path.join(__dirname, '..', 'routes/company.js'), 'utf8');
    // Should filter before some()
    expect(company).toMatch(/filter\(m => !m\.user\)/);
    expect(company).toMatch(/filter\(m => m\.user\)\.some\(m => m\.user\._id/);
    expect(company).toMatch(/console\.warn.*missing user reference/);
    // Response should use validMembers
    expect(company).toMatch(/members: validMembers/);
  });

  test('teams.js fetchMembers filters null user', () => {
    const teams = readFrontend('pages/teams.js');
    expect(teams).toMatch(/filter\(m => m && m\.user\)/);
    expect(teams).toMatch(/Filtered.*missing user reference/);
  });

  test('teams.js MemberRow is defensive', () => {
    const teams = readFrontend('pages/teams.js');
    expect(teams).toMatch(/u\?\./);
    expect(teams).toMatch(/m\.user\?\._id/);
  });
});

describe('Bug 3 — Monaco editor', () => {
  test('editor.js imports Monaco', () => {
    const editor = readFrontend('pages/editor.js');
    expect(editor).toMatch(/@monaco-editor\/react/);
    expect(editor).toMatch(/from '@monaco-editor\/react'/);
    expect(editor).toMatch(/MonacoEditor/);
  });

  test('editor.js uses Editor component not textarea for code', () => {
    const editor = readFrontend('pages/editor.js');
    // Should have <MonacoEditor height="500px" language={monacoLanguage}
    expect(editor).toMatch(/<MonacoEditor/);
    expect(editor).toMatch(/monacoLanguage/);
    expect(editor).toMatch(/getMonacoLanguage/);
    expect(editor).toMatch(/handleEditorChange/);
    // Should NOT have textareaRef for code editing (only new-file modal may still have textarea)
    // The main code textarea should be gone - check that handleContentChange is removed
    expect(editor).not.toMatch(/function handleContentChange/);
    expect(editor).not.toMatch(/function handleKeyDown/);
  });

  test('package.json has monaco dependency', () => {
    const pkg = JSON.parse(readFrontend('package.json'));
    expect(pkg.dependencies['@monaco-editor/react']).toBeDefined();
  });

  test('getMonacoLanguage maps common languages', () => {
    const editor = readFrontend('pages/editor.js');
    expect(editor).toMatch(/javascript.*typescript.*python/s);
  });
});

describe('Bug 4 — Tier / subscription centralization', () => {
  test('lib/tier.js mirrors backend TIER_LIMITS', () => {
    const tier = readFrontend('lib/tier.js');
    expect(tier).toMatch(/freebie/);
    expect(tier).toMatch(/professional/);
    expect(tier).toMatch(/enterprise/);
    expect(tier).toMatch(/maxMembers/);
    expect(tier).toMatch(/maxAiMessagesPerDay/);
    expect(tier).toMatch(/aiPair/);
  });

  test('useAuth fetchUser also fetches subscription', () => {
    const useAuth = readFrontend('hooks/useAuth.js');
    expect(useAuth).toMatch(/subscriptionApi\.getCurrent/);
    expect(useAuth).toMatch(/setSubscription/);
  });

  test('AuthGuard ensures subscription when user cached', () => {
    const guard = readFrontend('components/AuthGuard.js');
    expect(guard).toMatch(/subscriptionApi\.getCurrent/);
    expect(guard).toMatch(/useAuthStore.*subscription/);
  });

  test('ai-pair.js uses tier-based aiLimit not hardcoded 50', () => {
    const aiPair = readFrontend('pages/ai-pair.js');
    expect(aiPair).not.toMatch(/const AI_LIMIT = 50/);
    expect(aiPair).toMatch(/getAiLimitForTier/);
    expect(aiPair).toMatch(/getTierLimits/);
  });

  test('teams.js disables Invite when at member limit', () => {
    const teams = readFrontend('pages/teams.js');
    expect(teams).toMatch(/inviteAtLimit/);
    expect(teams).toMatch(/memberLimit/);
    expect(teams).toMatch(/Upgrade to/);
  });
});

describe('Bug 5 — Workspace membership awareness', () => {
  test('hooks/useCurrentCompany exists with shared pattern', () => {
    expect(fs.existsSync(path.join(FRONTEND_ROOT, 'hooks/useCurrentCompany.js'))).toBe(true);
    const hook = readFrontend('hooks/useCurrentCompany.js');
    expect(hook).toMatch(/\/api\/company\/my-companies/);
    expect(hook).toMatch(/hasCompany/);
    expect(hook).toMatch(/NoWorkspaceEmptyState/);
  });

  test('messaging.js uses useCurrentCompany and shows empty state', () => {
    const msg = readFrontend('pages/messaging.js');
    expect(msg).toMatch(/useCurrentCompany/);
    expect(msg).toMatch(/NoWorkspaceEmptyState/);
    expect(msg).toMatch(/Loading workspace/);
  });

  test('team-memory.js shows NoWorkspace when no companies', () => {
    const tm = readFrontend('pages/team-memory.js');
    expect(tm).toMatch(/NoWorkspaceEmptyState/);
    expect(tm).toMatch(/companies\.length === 0/);
  });

  test('teams.js has CompanySettingsModal (open item fix)', () => {
    const teams = readFrontend('pages/teams.js');
    expect(teams).toMatch(/CompanySettingsModal/);
    expect(teams).toMatch(/Team Settings/);
    expect(teams).toMatch(/\/api\/company\/\$\{company\._id\}\/settings/);
    expect(teams).toMatch(/Settings.*onOpenSettings/s);
  });
});

describe('API base URL and endpoints', () => {
  test('lib/api.js has correct base URL without double /api', () => {
    const api = readFrontend('lib/api.js');
    expect(api).toMatch(/API_BASE_URL = 'https:\/\/codex-backend-7utu\.onrender\.com'/);
    expect(api).not.toMatch(/API_BASE_URL = 'https:\/\/codex-backend-7utu\.onrender\.com\/api'/);
  });

  test('all apiFetch calls use /api prefix', () => {
    const api = readFrontend('lib/api.js');
    // Find all apiFetch('/... patterns and ensure they start with /api
    const calls = [...api.matchAll(/apiFetch\('([^']+)'/g)].map(m => m[1]);
    calls.forEach(p => {
      expect(p.startsWith('/api')).toBe(true);
    });
  });
});
