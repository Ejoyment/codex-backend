process.env.STRIPE_SECRET_KEY = 'sk_test_cancel_policy';

jest.mock('stripe', () => {
  const update = jest.fn();
  const cancel = jest.fn();
  const factory = jest.fn(() => ({ subscriptions: { update, cancel } }));
  factory.__mocks = { update, cancel };
  return factory;
});

const stripeFactory = require('stripe');
const { update, cancel } = stripeFactory.__mocks;
const { StripeAdapter } = require('../server/services/billing/adapters/stripe');

beforeEach(() => {
  update.mockReset().mockResolvedValue({ id: 'sub_1', status: 'active' });
  cancel.mockReset().mockResolvedValue({ id: 'sub_1', status: 'canceled' });
});

describe('Stripe cancellation policy', () => {
  test('defaults to cancel_at_period_end instead of immediate cancellation', async () => {
    const result = await new StripeAdapter().cancelSubscription({ subscriptionId: 'sub_1' });

    expect(update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true });
    expect(cancel).not.toHaveBeenCalled();
    expect(result).toMatchObject({ cancelAtPeriodEnd: true, status: 'active' });
  });

  test('immediate cancellation remains available for abuse/refund handling', async () => {
    const result = await new StripeAdapter().cancelSubscription({
      subscriptionId: 'sub_1',
      atPeriodEnd: false,
    });

    expect(cancel).toHaveBeenCalledWith('sub_1');
    expect(update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ cancelAtPeriodEnd: false, status: 'canceled' });
  });
});
