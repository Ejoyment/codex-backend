import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';
import { CheckCircle2, Users, Terminal, Bug, GitBranch, Puzzle } from 'lucide-react';

const features = [
  { title: 'AI Code Completion', desc: 'Intelligent autocomplete that understands your codebase and coding patterns', color: 'bg-blue-500', icon: CheckCircle2 },
  { title: 'Real-time Collaboration', desc: 'Work together with your team in real-time with live cursors and edits', color: 'bg-green-500', icon: Users },
  { title: 'Integrated Terminal', desc: 'Built-in terminal with full shell access and command history', color: 'bg-purple-500', icon: Terminal },
  { title: 'Advanced Debugging', desc: 'Powerful debugging tools with breakpoints, watch expressions, and call stacks', color: 'bg-yellow-500', icon: Bug },
  { title: 'Git Integration', desc: 'Seamless version control with visual diff, merge conflict resolution, and more', color: 'bg-red-500', icon: GitBranch },
  { title: 'Extensions Marketplace', desc: 'Thousands of extensions to customize your development environment', color: 'bg-indigo-500', icon: Puzzle },
];

export default function Features() {
  return (
    <>
      <Head>
        <title>Features - BuildrsHQ</title>
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
          <div className="max-w-7xl mx-auto text-center">
            <h1 className="text-5xl md:text-6xl font-bold mb-6">Powerful Features for Modern Development</h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">Everything you need to build, ship, and scale your applications with AI-powered assistance</p>
          </div>
        </section>

        <section className="content py-16 px-4">
          <div className="max-w-7xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div key={i} className="bg-[#1a2332] p-8 rounded-xl border border-gray-700 hover:border-blue-500 transition">
                  <div className={`w-12 h-12 ${feature.color} rounded-lg mb-4 flex items-center justify-center`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-gray-300">{feature.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="content py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl font-bold mb-6">Ready to experience the future of coding?</h2>
            <Link href="/signup" className="inline-block bg-white text-[#0a1628] px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-100 transition">
              Start Free Trial
            </Link>
          </div>
        </section>

        <footer className="content bg-[#070F34] border-t border-gray-700 py-12 px-4">
          <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="font-semibold mb-4 text-white">Product</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/features" className="hover:text-white">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-white">Pricing</Link></li>
                <li><Link href="/integrations" className="hover:text-white">Integrations</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4 text-white">Company</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/about" className="hover:text-white">About</Link></li>
                <li><Link href="/blog" className="hover:text-white">Blog</Link></li>
                <li><Link href="/careers" className="hover:text-white">Careers</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4 text-white">Resources</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/docs" className="hover:text-white">Documentation</Link></li>
                <li><Link href="/support" className="hover:text-white">Support</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4 text-white">Legal</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/privacy" className="hover:text-white">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-white">Terms</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-700 pt-8 text-center text-gray-400">
            <p>&copy; 2026 BuildrsHQ. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
