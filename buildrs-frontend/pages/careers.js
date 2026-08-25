import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';
import { Briefcase, CalendarDays, DollarSign, Users, MessageSquare } from 'lucide-react';

const jobs = [
  { title: 'Senior Full-Stack Engineer', department: 'Engineering', type: 'Full-time', location: 'Remote', desc: 'Build the core features of our AI-powered code editor. Work with React, Node.js, and cutting-edge AI models.', requirements: ['5+ years of full-stack development experience', 'Strong proficiency in TypeScript, React, and Node.js', 'Experience with AI/ML integration is a plus'] },
  { title: 'AI/ML Research Engineer', department: 'AI Research', type: 'Full-time', location: 'Remote', desc: 'Push the boundaries of AI-assisted coding. Research and implement novel approaches to code generation and understanding.', requirements: ['PhD or Masters in CS, ML, or related field', 'Experience with LLMs and transformer architectures', 'Strong publication record preferred'] },
  { title: 'Product Designer', department: 'Design', type: 'Full-time', location: 'Remote', desc: 'Design beautiful, intuitive experiences for developers. Shape the future of how developers interact with AI.', requirements: ['4+ years of product design experience', 'Strong portfolio showcasing developer tools or B2B products', 'Proficiency in Figma and modern design tools'] },
  { title: 'Developer Advocate', department: 'DevRel', type: 'Full-time', location: 'Remote', desc: 'Be the voice of our developer community. Create content, speak at conferences, and help developers succeed.', requirements: ['3+ years of developer advocacy or technical writing', 'Strong coding background and communication skills', 'Experience creating technical content and tutorials'] },
];

export default function Careers() {
  return (
    <>
      <Head>
        <title>Careers - BuildrsHQ</title>
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
              <h1 className="text-5xl md:text-6xl font-bold mb-6">Join Our Team</h1>
              <p className="text-xl text-gray-300 max-w-3xl mx-auto">Help us build the future of AI-powered development tools</p>
            </div>

            <div className="grid lg:grid-cols-3 gap-8 mb-20">
              <div className="bg-[#1a2332] p-8 rounded-xl border border-gray-700 text-center">
                <div className="w-16 h-16 bg-blue-500 rounded-full mx-auto mb-4 flex items-center justify-center"><Briefcase className="w-8 h-8 text-white" /></div>
                <h3 className="text-xl font-bold mb-2">Remote First</h3>
                <p className="text-gray-300">Work from anywhere in the world with flexible hours</p>
              </div>
              <div className="bg-[#1a2332] p-8 rounded-xl border border-gray-700 text-center">
                <div className="w-16 h-16 bg-green-500 rounded-full mx-auto mb-4 flex items-center justify-center"><CalendarDays className="w-8 h-8 text-white" /></div>
                <h3 className="text-xl font-bold mb-2">Unlimited PTO</h3>
                <p className="text-gray-300">Take the time you need to recharge and stay balanced</p>
              </div>
              <div className="bg-[#1a2332] p-8 rounded-xl border border-gray-700 text-center">
                <div className="w-16 h-16 bg-purple-500 rounded-full mx-auto mb-4 flex items-center justify-center"><DollarSign className="w-8 h-8 text-white" /></div>
                <h3 className="text-xl font-bold mb-2">Competitive Equity</h3>
                <p className="text-gray-300">Share in our success with generous stock options</p>
              </div>
            </div>

            <div className="mb-20">
              <h2 className="text-4xl font-bold text-center mb-12">Open Positions</h2>
              <div className="space-y-6">
                {jobs.map((job, i) => (
                  <div key={i} className="job-card bg-[#1a2332] p-8 rounded-xl border border-gray-700">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
                      <div>
                        <h3 className="text-2xl font-bold mb-2">{job.title}</h3>
                        <div className="flex flex-wrap gap-2 mb-2">
                          <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">{job.department}</span>
                          <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">{job.location}</span>
                          <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm">{job.type}</span>
                        </div>
                      </div>
                      <Link href="/contact" className="cta-button px-6 py-3 rounded-lg text-white font-medium inline-block text-center mt-4 md:mt-0">Apply Now</Link>
                    </div>
                    <p className="text-gray-300 mb-4">{job.desc}</p>
                    <ul className="text-gray-300 space-y-2">
                      {job.requirements.map((req, idx) => (<li key={idx}>• {req}</li>))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-12 text-center">
              <h2 className="text-3xl font-bold mb-4">Don't See Your Role?</h2>
              <p className="text-xl mb-8 opacity-90">We're always looking for exceptional talent. Send us your resume!</p>
              <Link href="/contact" className="bg-white text-blue-600 px-8 py-3 rounded-lg font-medium hover:bg-gray-100 transition inline-block">Get in Touch</Link>
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
