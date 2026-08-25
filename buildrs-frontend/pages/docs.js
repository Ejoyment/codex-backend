import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';
import { BookOpen, Code, Puzzle, Wrench } from 'lucide-react';

const docs = [
  { title: 'Getting Started', desc: 'Quick start guide to set up BuildrsHQ and create your first project', icon: BookOpen, color: 'bg-blue-500' },
  { title: 'API Reference', desc: 'Complete API documentation with examples and best practices', icon: Code, color: 'bg-green-500' },
  { title: 'Tutorials', desc: 'Step-by-step tutorials for common workflows and advanced features', icon: Puzzle, color: 'bg-purple-500' },
  { title: 'Integrations', desc: 'Connect BuildrsHQ with your favorite tools and services', icon: Wrench, color: 'bg-yellow-500' },
];

export default function Docs() {
  return (
    <>
      <Head>
        <title>Documentation - BuildrsHQ</title>
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
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h1 className="text-5xl md:text-6xl font-bold mb-6">Documentation</h1>
              <p className="text-xl text-gray-300 max-w-3xl mx-auto">Everything you need to get started with BuildrsHQ and master your development workflow</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
              {docs.map((doc, i) => {
                const Icon = doc.icon;
                return (
                  <div key={i} className="doc-card bg-[#1a2332] p-8 rounded-xl border border-gray-700">
                    <div className={`w-12 h-12 ${doc.color} rounded-lg mb-4 flex items-center justify-center`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold mb-3">{doc.title}</h3>
                    <p className="text-gray-300 mb-4">{doc.desc}</p>
                    <a href="#" className="text-blue-400 hover:text-blue-300 font-medium">Read more →</a>
                  </div>
                );
              })}
            </div>

            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-12 text-center">
              <h2 className="text-3xl font-bold mb-4">Need Help?</h2>
              <p className="text-xl mb-8 opacity-90">Our support team is here to help you succeed</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/support" className="bg-white text-blue-600 px-8 py-3 rounded-lg font-medium hover:bg-gray-100 transition">Contact Support</Link>
                <a href="https://discord.gg/buildershq" className="border-2 border-white px-8 py-3 rounded-lg font-medium hover:bg-white/10 transition">Join Community</a>
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
          </div>
          <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2026 BuildrsHQ. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
