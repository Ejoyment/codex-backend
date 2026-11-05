describe('AI router local privacy configuration', () => {
  const originalValue = process.env.LOCAL_PRIVACY_MODE;
  const originalGeminiApiKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    if (originalValue === undefined) delete process.env.LOCAL_PRIVACY_MODE;
    else process.env.LOCAL_PRIVACY_MODE = originalValue;
    if (originalGeminiApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiApiKey;
    jest.resetModules();
    jest.restoreAllMocks();
  });

  test.each([
    ['true', true],
    ['TRUE', true],
    ['1', true],
    ['yes', true],
    ['on', true],
    ['false', false],
    ['FALSE', false],
    ['0', false],
    ['no', false],
    ['off', false],
  ])('interprets LOCAL_PRIVACY_MODE=%s as %s', (value, expected) => {
    process.env.LOCAL_PRIVACY_MODE = value;
    jest.resetModules();

    const aiRouterService = require('../utils/aiRouterService');

    expect(aiRouterService.localPrivacyMode).toBe(expected);
  });

  test('fails closed to local routing for an unrecognized privacy setting', () => {
    process.env.LOCAL_PRIVACY_MODE = 'enabled-ish';
    jest.resetModules();
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const aiRouterService = require('../utils/aiRouterService');

    expect(aiRouterService.localPrivacyMode).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(
      '[ai] invalid local privacy mode "enabled-ish"; using local routing for safety'
    );
  });

  test('normalizes string values passed per request and through the setter', () => {
    delete process.env.LOCAL_PRIVACY_MODE;
    jest.resetModules();

    const aiRouterService = require('../utils/aiRouterService');

    expect(aiRouterService.setLocalPrivacyMode('false')).toBe(false);
    expect(aiRouterService.setLocalPrivacyMode('true')).toBe(true);
  });

  test('routes textual privacy flags according to their boolean value', async () => {
    delete process.env.LOCAL_PRIVACY_MODE;
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    jest.resetModules();
    const aiRouterService = require('../utils/aiRouterService');
    const local = jest.spyOn(aiRouterService, 'routeLocal').mockResolvedValue({ success: true });
    const cloud = jest.spyOn(aiRouterService, 'routeCloud').mockResolvedValue({ success: true });

    await aiRouterService.routeChat([], {}, { provider: 'gemini', localPrivacyMode: 'false' });
    await aiRouterService.routeChat([], {}, { provider: 'gemini', localPrivacyMode: 'true' });

    expect(cloud).toHaveBeenCalledTimes(1);
    expect(local).toHaveBeenCalledTimes(1);
  });

  test('routes explicitly selected local providers without substituting a cloud provider', async () => {
    delete process.env.LOCAL_PRIVACY_MODE;
    jest.resetModules();
    const aiRouterService = require('../utils/aiRouterService');
    const local = jest.spyOn(aiRouterService, 'routeLocal').mockResolvedValue({ success: true });

    await aiRouterService.routeChat([], {}, { provider: 'lm-studio' });

    expect(local).toHaveBeenCalledWith([], {}, 'lm-studio');
  });

  test('deployment privacy mode cannot be disabled by a per-request false value', async () => {
    process.env.LOCAL_PRIVACY_MODE = 'true';
    jest.resetModules();
    const aiRouterService = require('../utils/aiRouterService');
    const local = jest.spyOn(aiRouterService, 'routeLocal').mockResolvedValue({ success: true });
    const cloud = jest.spyOn(aiRouterService, 'routeCloud').mockResolvedValue({ success: true });

    await aiRouterService.routeChat([], {}, {
      provider: 'gemini',
      localPrivacyMode: false,
    });

    expect(local).toHaveBeenCalledTimes(1);
    expect(cloud).not.toHaveBeenCalled();
  });
});
