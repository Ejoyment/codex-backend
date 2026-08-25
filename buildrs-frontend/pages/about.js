import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';
import { Lightbulb, Shield, Users, Zap } from 'lucide-react';

export default function About() {
  return (
    <>
      <Head>
        <title>About Us - BuildrsHQ</title>
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
              <h1 className="text-5xl md:text-6xl font-bold mb-6">Building the Future of Development</h1>
              <p className="text-xl text-gray-300 max-w-3xl mx-auto">We're on a mission to make every developer extraordinarily productive with AI-powered tools</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 mb-20">
              <div className="bg-[#1a2332] p-12 rounded-2xl border border-gray-700">
                <h2 className="text-3xl font-bold mb-6">Our Mission</h2>
                <p className="text-gray-300 text-lg leading-relaxed">
                  At BuildrsHQ, we believe that AI should amplify human creativity, not replace it. We're building tools that help developers focus on what matters most: solving problems and building amazing products.
                </p>
              </div>
              <div className="bg-[#1a2332] p-12 rounded-2xl border border-gray-700">
                <h2 className="text-3xl font-bold mb-6">Our Vision</h2>
                <p className="text-gray-300 text-lg leading-relaxed">
                  We envision a world where every developer has access to intelligent tools that make coding more intuitive, collaborative, and enjoyable.
                </p>
              </div>
            </div>

            <div className="mb-20">
              <h2 className="text-4xl font-bold text-center mb-12">Our Values</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-500 rounded-full mx-auto mb-4 flex items-center justify-center"><Lightbulb className="w-8 h-8 text-white" /></div>
                  <h3 className="text-xl font-bold mb-2">Innovation</h3>
                  <p className="text-gray-300">Pushing boundaries with cutting-edge AI technology</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-500 rounded-full mx-auto mb-4 flex items-center justify-center"><Shield className="w-8 h-8 text-white" /></div>
                  <h3 className="text-xl font-bold mb-2">Privacy</h3>
                  <p className="text-gray-300">Your code is yours. We never train on it</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-purple-500 rounded-full mx-auto mb-4 flex items-center justify-center"><Users className="w-8 h-8 text-white" /></div>
                  <h3 className="text-xl font-bold mb-2">Community</h3>
                  <p className="text-gray-300">Building together with developers worldwide</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-yellow-500 rounded-full mx-auto mb-4 flex items-center justify-center"><Zap className="w-8 h-8 text-white" /></div>
                  <h3 className="text-xl font-bold mb-2">Speed</h3>
                  <p className="text-gray-300">Making developers 10x more productive</p>
                </div>
              </div>
            </div>

            <div className="mb-20">
              <h2 className="text-4xl font-bold text-center mb-12">Meet Our Team</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                <div className="team-card bg-[#1a2332] rounded-xl overflow-hidden border border-gray-700">
                  <div className="h-48 bg-gradient-to-br from-blue-500 to-purple-600" />
                  <div className="p-6">
                    <h3 className="text-xl font-bold mb-1">Ejoymene David</h3>
                    <p className="text-blue-400 mb-3">CEO & Founder</p>
                    <p className="text-gray-300 text-sm">Oracle AI Certified Professional and OSCP holder with 2+ years AI industry experience</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-12 text-center">
              <h2 className="text-3xl font-bold mb-4">Join Us on This Journey</h2>
              <p className="text-xl mb-8 opacity-90">We're always looking for talented people to join our team</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/careers" className="bg-white text-blue-600 px-8 py-3 rounded-lg font-medium hover:bg-gray-100 transition">View Open Positions</Link>
                <Link href="/contact" className="border-2 border-white px-8 py-3 rounded-lg font-medium hover:bg-white/10 transition">Get in Touch</Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="bg-navy-dark border-t border-gray-700 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-4 gap-8 mb-8">
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <div className="w-8 h-8 bg-transparent-accent rounded"><img src="/buildrs.png" alt="" /></div>
                  <span className="text-xl font-semibold">BuildrsHQ</span>
                </div>
                <p className="text-gray-400 mb-4">The AI-first code editor built to make you extraordinarily productive.</p>
              </div>
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
          </div>
        </footer>
      </div>
    </>
  );
}
