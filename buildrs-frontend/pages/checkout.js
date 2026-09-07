import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuard from '../components/AuthGuard';
import Sidebar from '../components/Sidebar';
import useAuthStore from '../store/authStore';
import { apiFetch, subscriptionApi } from '../lib/api';
import useToastStore from '../store/toastStore';
import { Loader2, CreditCard, Check, ArrowLeft, Zap, Building2, Mail } from 'lucide-react';

const PLANS = [
  {
    id: 'professional',
    name: 'Professional',
    monthlyPrice: 25,
    yearlyPrice: 290,
    monthlyNote: '/mo',
    yearlyNote: '/yr',
    blurb: 'For teams that ship on a cadence.',
    featured: true,
    features: [
      'Everything in Starter',
      'Unlimited projects',
      'Advanced AI pair · codebase memory',
      'Real-time co-editing · presence',
      'Tasks · standups · meetings',
      'GitHub · Slack · Figma integrations',
      'Priority support',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 999,
    yearlyPrice: 9990,
    monthlyNote: '/mo',
    yearlyNote: '/yr',
    blurb: 'For orgs with compliance to meet.',
    featured: false,
    contactSales: true,
    features: [
      'Everything in Professional',
      'SSO authentication',
      'Audit logs',
      'Dedicated account manager',
      '1-hour support SLA',
      'Custom contracts',
      'SOC 2-ready infrastructure',
    ],
  },
];

const PAYMENT_PROVIDERS = [
  { id: 'stripe', label: 'Stripe', desc: 'Pay with card', icon: CreditCard },
  { id: 'paystack', label: 'Paystack', desc: 'Card, bank transfer, mobile money', icon: Zap },
  { id: 'flutterwave', label: 'Flutterwave', desc: 'Card, bank, USSD, mobile money', icon: Zap },
];

export default function Checkout() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const setSubscription = useAuthStore((s) => s.setSubscription);
  const toast = useToastStore();

  const [selectedPlan, setSelectedPlan] = useState('professional');
  const [yearly, setYearly] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState('stripe');
  const [loading, setLoading] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  const [clientSecret, setClientSecret] = useState(null);
  const [stripeElements, setStripeElements] = useState(null);
  const stripeCardRef = useRef(null);
  const stripeInstanceRef = useRef(null);

  useEffect(() => {
    if (!subscription) {
      subscriptionApi.getCurrent().then((data) => {
        if (data.subscription) setSubscription(data.subscription);
      }).catch(() => {});
    }
  }, [subscription, setSubscription]);

  const interval = yearly ? 'yearly' : 'monthly';

  const loadStripe = useCallback(async () => {
    if (stripeInstanceRef.current) return stripeInstanceRef.current;
    const { loadStripe: ls } = await import('@stripe/stripe-js');
    const stripe = await ls(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
    stripeInstanceRef.current = stripe;
    return stripe;
  }, []);

  const initStripeElements = useCallback(async () => {
    if (stripeReady || clientSecret) return;
    try {
      const data = await apiFetch('/api/trial-billing/setup-intent', { method: 'POST' });
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        const stripe = await loadStripe();
        if (!stripe) return;
        const elements = stripe.elements({ clientSecret: data.clientSecret });
        const card = elements.create('card', {
          style: {
            base: {
              color: '#eceef1',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              fontSize: '14px',
              '::placeholder': { color: '#565d6b' },
            },
            invalid: { color: '#f87171' },
          },
        });
        setStripeElements({ stripe, elements, card });
        setStripeReady(true);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to initialize Stripe');
    }
  }, [stripeReady, clientSecret, loadStripe]);

  useEffect(() => {
    if (selectedProvider === 'stripe' && selectedPlan === 'professional' && !stripeReady) {
      const timer = setTimeout(() => initStripeElements(), 100);
      return () => clearTimeout(timer);
    }
  }, [selectedProvider, selectedPlan, stripeReady, initStripeElements]);

  useEffect(() => {
    if (stripeReady && stripeElements && stripeCardRef.current && !stripeElements._mounted) {
      stripeElements.card.mount(stripeCardRef.current);
      stripeElements._mounted = true;
    }
  }, [stripeReady, stripeElements]);

  const handleStripeSubmit = async () => {
    if (!stripeElements) return;
    setLoading(true);
    try {
      const { stripe, card } = stripeElements;
      const { setupIntent, error } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card },
      });
      if (error) {
        toast.error(error.message || 'Card setup failed');
        return;
      }
      await apiFetch('/api/trial-billing/setup-payment', {
        method: 'POST',
        body: JSON.stringify({ paymentMethodId: setupIntent.payment_method }),
      });
      toast.success('Payment method saved!');
      router.push('/payment-success');
    } catch (err) {
      toast.error(err.message || 'Payment setup failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePaystack = async () => {
    setLoading(true);
    try {
      const amount = selectedPlan === 'professional'
        ? (yearly ? 29000 : 2500)
        : 0;
      const data = await apiFetch('/api/paystack-billing/initialize', {
        method: 'POST',
        body: JSON.stringify({
          email: user?.email,
          amount,
          plan: selectedPlan,
        }),
      });
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        toast.error('Failed to initialize Paystack payment');
      }
    } catch (err) {
      toast.error(err.message || 'Paystack payment failed');
    } finally {
      setLoading(false);
    }
  };

  const handleFlutterwave = async () => {
    setLoading(true);
    try {
      const amount = selectedPlan === 'professional'
        ? (yearly ? 290 : 25)
        : 0;
      const data = await apiFetch('/api/flutterwave-billing/initialize', {
        method: 'POST',
        body: JSON.stringify({
          email: user?.email,
          amount,
          plan: selectedPlan,
        }),
      });
      if (data?.data?.link) {
        window.location.href = data.data.link;
      } else {
        toast.error('Failed to initialize Flutterwave payment');
      }
    } catch (err) {
      toast.error(err.message || 'Flutterwave payment failed');
    } finally {
      setLoading(false);
    }
  };

  const handleHostedCheckout = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/subscription/create-checkout', {
        method: 'POST',
        body: JSON.stringify({ tier: selectedPlan, interval }),
      });
      if (data.url) {
        window.location.href = data.url;
      } else if (data.contactSales) {
        toast.info('Please contact our sales team for Enterprise pricing');
        router.push('/contact');
      } else {
        toast.error('Failed to create checkout session');
      }
    } catch (err) {
      toast.error(err.message || 'Checkout failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = () => {
    if (selectedPlan === 'enterprise') {
      router.push('/contact');
      return;
    }
    if (selectedProvider === 'stripe') {
      handleStripeSubmit();
    } else if (selectedProvider === 'paystack') {
      handlePaystack();
    } else if (selectedProvider === 'flutterwave') {
      handleFlutterwave();
    }
  };

  return (
    <AuthGuard>
      <Head>
        <title>Checkout - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
        <meta name="description" content="Upgrade your BuildrsHQ workspace" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <header className="workspace-header dash-header">
            <div>
              <p className="dash-crumb">
                BuildrsHQ <span className="sep">/</span> Checkout
              </p>
              <h1 className="dash-title">Checkout</h1>
              <div className="dash-statusline">
                <span className="status-indicator status-online" />
                <span>Upgrade your workspace</span>
              </div>
            </div>
          </header>

          <div className="workspace-content">
            <div className="max-w-4xl mx-auto space-y-8">
              {subscription?.tier && subscription.tier !== 'free' && subscription.tier !== 'starter' && (
                <div className="flex items-center gap-3 p-4 rounded-xl border border-[rgba(47,214,230,0.2)] bg-[rgba(47,214,230,0.05)]">
                  <Check className="w-5 h-5 text-[#2fd6e6] flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">
                      You're on the {subscription.tier} plan
                    </p>
                    <p className="text-xs text-[#9aa1ae] mt-0.5">
                      Status: {subscription.status || 'active'}
                    </p>
                  </div>
                  <Link
                    href="/settings"
                    className="btn-workspace btn-secondary text-xs"
                  >
                    Manage billing
                  </Link>
                </div>
              )}

              <div>
                <p className="mkt-eyebrow mb-3">
                  <span className="dot">●</span> billing · interval
                </p>
                <div className="inline-flex items-center gap-1 rounded-lg border border-[#ffffff12] bg-[#0d0d12] p-1">
                  <button
                    type="button"
                    onClick={() => setYearly(false)}
                    className={`mkt-mono rounded-md px-4 py-2 text-xs tracking-wide transition ${
                      !yearly ? 'bg-[#1b1b22] text-white' : 'text-[#686e7c] hover:text-white'
                    }`}
                  >
                    monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setYearly(true)}
                    className={`mkt-mono flex items-center gap-2 rounded-md px-4 py-2 text-xs tracking-wide transition ${
                      yearly ? 'bg-[#1b1b22] text-white' : 'text-[#686e7c] hover:text-white'
                    }`}
                  >
                    yearly <span className="text-[#2fd6e6]">save ~17%</span>
                  </button>
                </div>
              </div>

              <div>
                <p className="mkt-eyebrow mb-4">
                  <span className="dot">●</span> billing · plan
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {PLANS.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlan(plan.id)}
                      className={`relative text-left p-6 rounded-xl border transition-all ${
                        selectedPlan === plan.id
                          ? 'border-[#2fd6e6] bg-[rgba(47,214,230,0.05)] shadow-[0_0_40px_-15px_rgba(47,214,230,0.25)]'
                          : 'border-[#ffffff12] bg-[#0d0d12] hover:border-[#ffffff24]'
                      }`}
                    >
                      {selectedPlan === plan.id && (
                        <div className="absolute top-4 right-4">
                          <div className="w-5 h-5 rounded-full bg-[#2fd6e6] flex items-center justify-center">
                            <Check className="w-3 h-3 text-[#04181b]" />
                          </div>
                        </div>
                      )}
                      <p className="mkt-mono text-[11px] uppercase tracking-widest text-[#686e7c]">
                        {plan.name}
                      </p>
                      <p className="mt-2 text-[13.5px] text-[#a8adba]">{plan.blurb}</p>
                      <div className="mt-4 flex items-end gap-2">
                        <span className="text-3xl font-semibold text-white">
                          {plan.contactSales ? '$999' : yearly ? `$${Math.round(plan.yearlyPrice / 12)}` : `$${plan.monthlyPrice}`}
                        </span>
                        <span className="mkt-mono pb-1 text-xs text-[#686e7c]">
                          {plan.contactSales ? '/mo' : plan.monthlyNote}
                        </span>
                      </div>
                      {yearly && !plan.contactSales && (
                        <p className="mkt-mono mt-1 text-[11px] text-[#525764]">
                          or ${plan.yearlyPrice}/yr billed annually
                        </p>
                      )}
                      <ul className="mt-4 space-y-2">
                        {plan.features.slice(0, 4).map((f) => (
                          <li key={f} className="flex items-start gap-2 text-[12px]">
                            <span className="text-[#2fd6e6] mt-0.5">✓</span>
                            <span className="text-[#a8adba]">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </button>
                  ))}
                </div>
              </div>

              {selectedPlan === 'enterprise' ? (
                <div className="space-y-4">
                  <div className="p-6 rounded-xl border border-[#ffffff12] bg-[#0d0d12]">
                    <div className="flex items-center gap-3 mb-4">
                      <Building2 className="w-5 h-5 text-[#2fd6e6]" />
                      <h3 className="text-sm font-semibold text-white">Enterprise Plan</h3>
                    </div>
                    <p className="text-[13.5px] text-[#a8adba] mb-4">
                      Custom pricing for teams with compliance requirements. Contact our sales team for a tailored quote.
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push('/contact')}
                      className="btn-workspace btn-primary"
                    >
                      <Mail className="w-4 h-4" />
                      Contact Sales
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPlan('professional')}
                    className="text-xs text-[#686e7c] hover:text-white transition"
                  >
                    ← Back to Professional plan
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <p className="mkt-eyebrow mb-4">
                      <span className="dot">●</span> billing · payment method
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {PAYMENT_PROVIDERS.map(({ id, label, desc, icon: Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setSelectedProvider(id)}
                          className={`text-left p-4 rounded-xl border transition-all ${
                            selectedProvider === id
                              ? 'border-[#2fd6e6] bg-[rgba(47,214,230,0.05)]'
                              : 'border-[#ffffff12] bg-[#0d0d12] hover:border-[#ffffff24]'
                          }`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <Icon className="w-4 h-4 text-[#2fd6e6]" />
                            <span className="text-sm font-medium text-white">{label}</span>
                          </div>
                          <p className="text-[12px] text-[#686e7c]">{desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedProvider === 'stripe' && (
                    <div className="p-6 rounded-xl border border-[#ffffff12] bg-[#0d0d12] space-y-4">
                      <p className="text-sm font-medium text-white">Card Details</p>
                      {!stripeReady ? (
                        <div className="flex items-center gap-2 py-4 text-[#686e7c]">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Loading payment form...</span>
                        </div>
                      ) : (
                        <div ref={stripeCardRef} className="p-3 rounded-lg border border-[#ffffff12] bg-[#0a0b10]" />
                      )}
                    </div>
                  )}

                  {selectedProvider === 'paystack' && (
                    <div className="p-6 rounded-xl border border-[#ffffff12] bg-[#0d0d12]">
                      <p className="text-sm text-[#a8adba]">
                        You'll be redirected to Paystack to complete payment with card, bank transfer, or mobile money.
                      </p>
                    </div>
                  )}

                  {selectedProvider === 'flutterwave' && (
                    <div className="p-6 rounded-xl border border-[#ffffff12] bg-[#0d0d12]">
                      <p className="text-sm text-[#a8adba]">
                        You'll be redirected to Flutterwave to complete payment with card, bank, USSD, or mobile money.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <button
                      type="button"
                      onClick={handlePayment}
                      disabled={loading || (selectedProvider === 'stripe' && !stripeReady)}
                      className="btn-workspace btn-primary flex items-center justify-center gap-2 px-8 py-3"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4" />
                          Subscribe · ${yearly ? Math.round(290 / 12) : 25}/mo
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleHostedCheckout}
                      disabled={loading}
                      className="btn-workspace btn-secondary flex items-center justify-center gap-2 px-6 py-3"
                    >
                      Use hosted checkout →
                    </button>
                  </div>

                  <p className="mkt-mono text-[11px] text-[#525764]">
                    all prices in USD · billed via {selectedProvider === 'stripe' ? 'Stripe' : selectedProvider === 'paystack' ? 'Paystack' : 'Flutterwave'} · cancel anytime from settings
                  </p>
                </div>
              )}

              <div className="pt-4 border-t border-[#ffffff0d]">
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 text-xs text-[#686e7c] hover:text-white transition"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Back to pricing
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
