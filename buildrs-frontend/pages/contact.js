import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';
import { useState } from 'react';
import { Mail, MessageSquare, Users, Twitter } from 'lucide-react';

export default function Contact() {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', company: '', subject: 'General Inquiry', message: '' });

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = (e) => {
    e.preventDefault();
    alert('Message sent. We will get back to you soon.');
    setForm({ firstName: '', lastName: '', email: '', company: '', subject: 'General Inquiry', message: '' });
  };

  return (
    <>
      <Head>
        <title>Contact Us - BuildrsHQ</title>
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
            { href: '/docs', label: 'Docs' },
          ]}
          ctaButtons={[
            { href: '/sign_in', label: 'Sign In' },
            { href: '/signup', label: 'Start Free Trial', primary: true },
          ]}
        />

        <div className="h-20" />

        <section className="py-20 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h1 className="text-5xl md:text-6xl font-bold mb-6">Get in Touch</h1>
              <p className="text-xl text-gray-300">We'd love to hear from you. Choose how you'd like to reach us.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mb-16">
              <div className="bg-[#1a2332] p-8 rounded-xl border border-gray-700 text-center">
                <div className="w-16 h-16 bg-blue-500 rounded-full mx-auto mb-4 flex items-center justify-center"><Mail className="w-8 h-8 text-white" /></div>
                <h3 className="text-xl font-bold mb-2">Email Us</h3>
                <p className="text-gray-300 mb-4">For general inquiries</p>
                <a href="mailto:hello@buildershq.com" className="text-blue-400 hover:text-blue-300">hello@buildershq.com</a>
              </div>
              <div className="bg-[#1a2332] p-8 rounded-xl border border-gray-700 text-center">
                <div className="w-16 h-16 bg-green-500 rounded-full mx-auto mb-4 flex items-center justify-center"><MessageSquare className="w-8 h-8 text-white" /></div>
                <h3 className="text-xl font-bold mb-2">Support</h3>
                <p className="text-gray-300 mb-4">Need help with the product?</p>
                <Link href="/support" className="text-blue-400 hover:text-blue-300">Visit Support Center</Link>
              </div>
              <div className="bg-[#1a2332] p-8 rounded-xl border border-gray-700 text-center">
                <div className="w-16 h-16 bg-purple-500 rounded-full mx-auto mb-4 flex items-center justify-center"><Users className="w-8 h-8 text-white" /></div>
                <h3 className="text-xl font-bold mb-2">Community</h3>
                <p className="text-gray-300 mb-4">Join the conversation</p>
                <a href="#" className="text-blue-400 hover:text-blue-300">Join Discord</a>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-12">
              <div className="bg-[#1a2332] rounded-2xl p-8 md:p-12 border border-gray-700">
                <h2 className="text-3xl font-bold mb-8">Send Us a Message</h2>
                <form onSubmit={onSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium mb-2">First Name</label>
                      <input type="text" name="firstName" value={form.firstName} onChange={onChange} className="w-full px-4 py-3 bg-[#0a1628] border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500" placeholder="John" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Last Name</label>
                      <input type="text" name="lastName" value={form.lastName} onChange={onChange} className="w-full px-4 py-3 bg-[#0a1628] border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Doe" required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Email</label>
                    <input type="email" name="email" value={form.email} onChange={onChange} className="w-full px-4 py-3 bg-[#0a1628] border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500" placeholder="john@company.com" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Company</label>
                    <input type="text" name="company" value={form.company} onChange={onChange} className="w-full px-4 py-3 bg-[#0a1628] border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Your company name" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Subject</label>
                    <select name="subject" value={form.subject} onChange={onChange} className="w-full px-4 py-3 bg-[#0a1628] border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500">
                      <option>General Inquiry</option>
                      <option>Sales</option>
                      <option>Partnership</option>
                      <option>Press</option>
                      <option>Careers</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Message</label>
                    <textarea name="message" rows="6" value={form.message} onChange={onChange} className="w-full px-4 py-3 bg-[#0a1628] border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Tell us how we can help..." required />
                  </div>
                  <button type="submit" className="w-full cta-button px-8 py-4 rounded-lg text-white font-medium text-lg">Send Message</button>
                </form>
              </div>

              <div className="space-y-8">
                <div>
                  <h2 className="text-3xl font-bold mb-6">Other Ways to Reach Us</h2>
                  <div className="space-y-6">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0"><Mail className="w-6 h-6 text-white" /></div>
                      <div>
                        <h3 className="font-bold mb-1">Sales</h3>
                        <p className="text-gray-300 mb-2">Interested in BuildrsHQ for your team?</p>
                        <a href="mailto:sales@buildershq.com" className="text-blue-400 hover:text-blue-300">sales@buildershq.com</a>
                      </div>
                    </div>
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0"><MessageSquare className="w-6 h-6 text-white" /></div>
                      <div>
                        <h3 className="font-bold mb-1">Technical Support</h3>
                        <p className="text-gray-300 mb-2">Need help with a technical issue?</p>
                        <a href="mailto:support@buildershq.com" className="text-blue-400 hover:text-blue-300">support@buildershq.com</a>
                      </div>
                    </div>
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center flex-shrink-0"><Twitter className="w-6 h-6 text-white" /></div>
                      <div>
                        <h3 className="font-bold mb-1">Press & Media</h3>
                        <p className="text-gray-300 mb-2">Media inquiries and press kit</p>
                        <a href="mailto:press@buildershq.com" className="text-blue-400 hover:text-blue-300">press@buildershq.com</a>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-8">
                  <h3 className="text-2xl font-bold mb-4">Join Our Community</h3>
                  <p className="mb-6 opacity-90">Connect with thousands of developers using BuildrsHQ</p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <a href="#" className="bg-white text-blue-600 px-6 py-3 rounded-lg font-medium hover:bg-gray-100 transition text-center">Discord</a>
                    <a href="#" className="border-2 border-white px-6 py-3 rounded-lg font-medium hover:bg-white/10 transition text-center">Twitter</a>
                  </div>
                </div>
              </div>
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
            <div>
              <h4 className="font-semibold mb-4">Connect</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">Twitter</a></li>
                <li><a href="#" className="hover:text-white">GitHub</a></li>
                <li><a href="#" className="hover:text-white">Discord</a></li>
                <li><a href="#" className="hover:text-white">LinkedIn</a></li>
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
