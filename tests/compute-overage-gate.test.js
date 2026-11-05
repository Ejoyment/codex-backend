const Subscription = require('../models/Subscription');
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

  test('atomically reserves a small slice before starting', async () => {
    const sub = Object.assign(pro({ usedThisMonth: 2 }), { _id: 'sub-1' });
    const reserve = jest.spyOn(Subscription, 'findOneAndUpdate').mockResolvedValue(sub);

    const { req, res, next, promise } = run(sub);
    await promise;

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect(req.computeReservationHours).toBeGreaterThan(0);
    expect(reserve).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'sub-1' }),
      expect.objectContaining({ $inc: { 'cloudComputeHours.usedThisMonth': req.computeReservationHours } }),
      { new: true }
    );

    reserve.mockRestore();
  });

  test('blocks when the atomic reservation loses a concurrent race', async () => {
    const sub = Object.assign(pro({ usedThisMonth: 2 }), { _id: 'sub-1' });
    const reserve = jest.spyOn(Subscription, 'findOneAndUpdate').mockResolvedValue(null);

    const { res, next, promise } = run(sub);
    await promise;

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'COMPUTE_LIMIT_REACHED' }));

    reserve.mockRestore();
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
