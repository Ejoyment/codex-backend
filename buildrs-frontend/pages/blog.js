import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';
import { Calendar, MessageSquare, Users, BookOpen, LifeBuoy } from 'lucide-react';

const posts = [
  { date: 'February 8, 2026', title: 'Introducing AI Pair Programming', desc: 'Learn how our new AI pair programming feature can help you code faster and smarter.', gradient: 'from-blue-500 to-purple-600' },
  { date: 'February 5, 2026', title: '10 Tips for Better Code Reviews', desc: 'Best practices for conducting effective code reviews in your team.', gradient: 'from-green-500 to-blue-600' },
  { date: 'February 1, 2026', title: 'Building Scalable Microservices', desc: 'A comprehensive guide to designing and deploying microservices architecture.', gradient: 'from-purple-500 to-pink-600' },
];

const footerLinks = [
  { title: 'Product', links: [{ href: '/features', label: 'Features' }, { href: '/pricing', label: 'Pricing' }, { href: '/changelog', label: 'Changelog' }] },
  { title: 'Company', links: [{ href: '/about', label: 'About' }, { href: '/blog', label: 'Blog' }, { href: '/careers', label: 'Careers' }, { href: '/contact', label: 'Contact' }] },
  { title: 'Resources', links: [{ href: '/docs', label: 'Documentation' }, { href: '/support', label: 'Support' }, { href: '/demo', label: 'Schedule Demo' }] },
  { title: 'Legal', links: [{ href: '/privacy', label: 'Privacy Policy' }, { href: '/terms', label: 'Terms of Service' }] },
];

export default function Blog() {
  return (
    <>
      <Head>
        <title>Blog - BuildrsHQ</title>
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
          <div className="max-w-7xl mx-auto">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 text-center">Blog</h1>
            <p className="text-xl text-gray-300 mb-12 text-center">Latest updates, tutorials, and insights from the CODEX team</p>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {posts.map((post, i) => (
                <article key={i} className="bg-[#1a2332] rounded-xl border border-gray-700 overflow-hidden hover:border-blue-500 transition">
                  <div className={`h-48 bg-gradient-to-br ${post.gradient}`} />
                  <div className="p-6">
                    <div className="text-sm text-gray-400 mb-2">{post.date}</div>
                    <h3 className="text-xl font-bold mb-3">{post.title}</h3>
                    <p className="text-gray-300 mb-4">{post.desc}</p>
                    <Link href="#" className="text-blue-400 hover:text-blue-300">Read more →</Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <footer className="content bg-[#070F34] border-t border-gray-700 py-16 px-4">
          <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-8 mb-12">
            {footerLinks.map((group) => (
              <div key={group.title}>
                <h4 className="text-lg font-bold mb-4">{group.title}</h4>
                <ul className="space-y-2 text-gray-400">
                  {group.links.map((link) => (
                    <li key={link.href}><Link href={link.href} className="hover:text-white transition">{link.label}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-700 pt-8 text-center text-gray-400">
            <p>&copy; 2026 BuildrsHQ. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
