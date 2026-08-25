import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';
import { useState } from 'react';
import { Check } from 'lucide-react';

const plans = [
  {
    name: 'STARTER',
    price: '50',
    yearlyPrice: '40',
    period: 'per month',
    features: ['Up to 10 projects', 'Basic AI assistance', '48-hour support response', 'Limited API access', 'Community support'],
    description: 'Perfect for individuals',
    buttonText: 'Start Free Trial',
    href: '/signup',
    isPopular: false,
  },
  {
    name: 'PROFESSIONAL',
    price: '99',
    yearlyPrice: '79',
    period: 'per month',
    features: ['Unlimited projects', 'Advanced AI features', '24-hour support response', 'Full API access', 'Priority support', 'Team collaboration', 'Custom integrations'],
    description: 'For growing teams',
    buttonText: 'Get Started',
    href: '/signup',
    isPopular: true,
  },
  {
    name: 'ENTERPRISE',
    price: '299',
    yearlyPrice: '239',
    period: 'per month',
    features: ['Everything in Professional', 'Custom solutions', 'Dedicated account manager', '1-hour support response', 'SSO Authentication', 'Advanced security', 'Custom contracts', 'SLA agreement'],
    description: 'For large organizations',
    buttonText: 'Contact Sales',
    href: '/contact',
    isPopular: false,
  },
];

export default function Pricing() {
  const [yearly, setYearly] = useState(false);

  return (
    <>
      <Head>
        <title>Pricing - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-navy text-white">
        <ModernHeader
          navigation={[
            { href: '/features', label: 'Features' },
            { href: '/pricing', label: 'Pricing' },
            { href: '/blog', label: 'Blog' },
            { href: '/changelog', label: 'Changelog' },
          ]}
          ctaButtons={[
            { href: '/sign_in', label: 'Sign In' },
            { href: '/signup', label: 'Start Free Trial', primary: true },
          ]}
        />

        <main className="pt-28 pb-20 px-4">
          <div className="max-w-6xl mx-auto text-center mb-12">
            <h1 className="text-5xl md:text-6xl font-bold mb-6">Plans Built for Every Stage</h1>
            <p className="text-xl text-gray-300 mb-8">Start free. Scale at your own pace. No credit card required.</p>
            <div className="inline-flex items-center gap-3 bg-navy-light rounded-full p-1">
              <button type="button" onClick={() => setYearly(false)} className={`px-4 py-2 rounded-full text-sm font-medium transition ${!yearly ? 'bg-blue-500 text-white' : 'text-gray-300'}`}>Monthly</button>
              <button type="button" onClick={() => setYearly(true)} className={`px-4 py-2 rounded-full text-sm font-medium transition ${yearly ? 'bg-blue-500 text-white' : 'text-gray-300'}`}>Yearly</button>
            </div>
          </div>

          <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-8">
            {plans.map((plan, i) => (
              <div key={i} className={`relative rounded-2xl border p-8 ${plan.isPopular ? 'border-blue-500 bg-navy-light' : 'border-gray-700 bg-[#1a2332]'}`}>
                {plan.isPopular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded-full">Most Popular</span>}
                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <p className="text-gray-400 mb-6">{plan.description}</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold">${yearly ? plan.yearlyPrice : plan.price}</span>
                  <span className="text-gray-400">/{plan.period}</span>
                </div>
                <Link href={plan.href} className={`block text-center py-3 rounded-lg font-medium mb-6 ${plan.isPopular ? 'cta-button text-white' : 'border border-gray-600 text-white hover:bg-white/5'}`}>
                  {plan.buttonText}
                </Link>
                <ul className="space-y-3">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-3 text-gray-300">
                      <Check className="w-4 h-4 text-green-400" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </main>

        <footer className="bg-navy-dark border-t border-gray-700 py-12">
          <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-4 gap-8">
            <div>
              <h4 className="font-bold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/features" className="hover:text-white">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-white">Pricing</Link></li>
                <li><Link href="#" className="hover:text-white">Security</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/about" className="hover:text-white">About</Link></li>
                <li><Link href="/blog" className="hover:text-white">Blog</Link></li>
                <li><Link href="/careers" className="hover:text-white">Careers</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Resources</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/docs" className="hover:text-white">Docs</Link></li>
                <li><Link href="#" className="hover:text-white">API</Link></li>
                <li><Link href="#" className="hover:text-white">Status</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/privacy" className="hover:text-white">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-white">Terms</Link></li>
                <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2026 BuildrsHQ. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
