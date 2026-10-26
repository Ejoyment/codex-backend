const { enforceCloudComputeLimit } = require('../middleware/tierEnforcement');

function run(subscription) {
  const req = { subscription };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const next = jest.fn();
  return { req, res, next, promise: enforceCloudComputeLimit()(req, res, next) };
}

function pro(cloudComputeHours = {}) {
  return {
    tier: 'pro',
    getCloudComputeHours: () => 10,
    cloudComputeHours: { usedThisMonth: 10, ...cloudComputeHours },
  };
}

describe('compute overage gate', () => {
  test('blocks new jobs at the included limit when overage is off', async () => {
    const { res, next, promise } = run(pro());
    await promise;
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'COMPUTE_LIMIT_REACHED',
      overageEnabled: false,
    }));
  });

  test('allows new jobs past the limit when overage is opted in and under the cap', async () => {
    const { res, next, promise } = run(pro({
      overageEnabled: true,
      overageCapMinor: 5000,
      overageAmountMinor: 100,
    }));
    await promise;
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  test('blocks at the monthly overage cap', async () => {
    const { res, next, promise } = run(pro({
      overageEnabled: true,
      overageCapMinor: 5000,
      overageAmountMinor: 5000,
    }));
    await promise;
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      overageCapReached: true,
      overageCapMinor: 5000,
    }));
  });

  test('still allows jobs under the included limit', async () => {
    const { res, next, promise } = run(pro({ usedThisMonth: 2 }));
    await promise;
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  test('developer tier remains blocked', async () => {
    const { res, next, promise } = run({
      tier: 'developer',
      getCloudComputeHours: () => 0,
      cloudComputeHours: {},
    });
    await promise;
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
