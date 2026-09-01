import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';
import { useState } from 'react';
import useToastStore from '../store/toastStore';

export default function Demo() {
  const [form, setForm] = useState({ fullName: '', email: '', company: '', teamSize: '', date: '', message: '' });
  const toast = useToastStore();
  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  const onSubmit = (e) => { e.preventDefault(); toast.success('Demo request received. We will reach out shortly.'); setForm({ fullName: '', email: '', company: '', teamSize: '', date: '', message: '' }); };

  return (
    <>
      <Head>
        <title>Schedule a Demo - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-[#0a1628] text-white overflow-x-hidden">
        <div className="cube cube-1" />
        <div className="cube cube-2" />
        <div className="cube cube-3" />

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

        <div className="h-20" />

        <section className="content py-20 px-4">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-5xl font-bold mb-6 text-center">Schedule a Demo</h1>
            <p className="text-xl text-gray-300 mb-12 text-center">See BuildrsHQ in action with a personalized demo</p>

            <div className="bg-[#1a2332] p-8 rounded-xl border border-gray-700">
              <form onSubmit={onSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Full Name</label>
                  <input type="text" name="fullName" value={form.fullName} onChange={onChange} className="w-full px-4 py-3 bg-[#0a1628] border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500" placeholder="John Doe" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Work Email</label>
                  <input type="email" name="email" value={form.email} onChange={onChange} className="w-full px-4 py-3 bg-[#0a1628] border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500" placeholder="john@company.com" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Company Name</label>
                  <input type="text" name="company" value={form.company} onChange={onChange} className="w-full px-4 py-3 bg-[#0a1628] border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Acme Inc" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Team Size</label>
                  <select name="teamSize" value={form.teamSize} onChange={onChange} className="w-full px-4 py-3 bg-[#0a1628] border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500" required>
                    <option value="">Select team size</option>
                    <option value="1-10">1-10 people</option>
                    <option value="11-50">11-50 people</option>
                    <option value="51-200">51-200 people</option>
                    <option value="200+">200+ people</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Preferred Date</label>
                  <input type="date" name="date" value={form.date} onChange={onChange} className="w-full px-4 py-3 bg-[#0a1628] border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Message (Optional)</label>
                  <textarea name="message" rows="4" value={form.message} onChange={onChange} className="w-full px-4 py-3 bg-[#0a1628] border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Tell us about your needs..." />
                </div>
                <button type="submit" className="w-full bg-blue-500 text-white px-6 py-4 rounded-lg font-semibold hover:bg-blue-600 transition">Schedule Demo</button>
              </form>
            </div>
          </div>
        </section>

        <footer className="bg-[#070F34] border-t border-gray-700 py-12 px-4">
          <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-8">
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/features" className="hover:text-white">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-white">Pricing</Link></li>
                <li><Link href="/changelog" className="hover:text-white">Changelog</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/about" className="hover:text-white">About</Link></li>
                <li><Link href="/blog" className="hover:text-white">Blog</Link></li>
                <li><Link href="/careers" className="hover:text-white">Careers</Link></li>
                <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/docs" className="hover:text-white">Documentation</Link></li>
                <li><Link href="/support" className="hover:text-white">Support</Link></li>
                <li><Link href="/privacy" className="hover:text-white">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-white">Terms</Link></li>
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
