import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export default function Index() {
  return (
    <>
      <Head>
        <title>BuildrsHQ | Ship Better Code, Faster</title>
        <link rel="icon" href="/buildrs.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="min-h-screen bg-navy text-white overflow-x-hidden">
        {/* 3D Animated Cubes */}
        <div className="cube-container cube-container-1">
          <div className="cube">
            <div className="cube-face cube-face-front" />
            <div className="cube-face cube-face-back" />
            <div className="cube-face cube-face-right" />
            <div className="cube-face cube-face-left" />
            <div className="cube-face cube-face-top" />
            <div className="cube-face cube-face-bottom" />
          </div>
        </div>
        <div className="cube-container cube-container-2">
          <div className="cube">
            <div className="cube-face cube-face-front" />
            <div className="cube-face cube-face-back" />
            <div className="cube-face cube-face-right" />
            <div className="cube-face cube-face-left" />
            <div className="cube-face cube-face-top" />
            <div className="cube-face cube-face-bottom" />
          </div>
        </div>
        <div className="cube-container cube-container-3">
          <div className="cube">
            <div className="cube-face cube-face-front" />
            <div className="cube-face cube-face-back" />
            <div className="cube-face cube-face-right" />
            <div className="cube-face cube-face-left" />
            <div className="cube-face cube-face-top" />
            <div className="cube-face cube-face-bottom" />
          </div>
        </div>

        <div className="content-wrapper">
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

          {/* Spacer for fixed header */}
          <div className="h-28" />

          {/* Hero Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-5xl md:text-6xl font-bold mb-6">
                Ship Better Code, Faster
              </h1>
              <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
                The AI-first code editor. Built to make you extraordinarily productive, Buildr is the best way to code with AI.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <Link href="/signup" className="bg-white text-navy px-8 py-3 rounded-md font-medium inline-block text-center hover:bg-gray-100 transition">
                  Start Free Trial
                </Link>
                <Link href="/demo" className="border border-gray-600 px-8 py-3 rounded-md font-medium hover:bg-gray-800 inline-block text-center transition">
                  Schedule a Demo
                </Link>
              </div>

              {/* Animated Code Editor Preview */}
              <div className="bg-navy-light rounded-lg p-6 max-w-4xl mx-auto shadow-2xl border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex space-x-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full" />
                    <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                  </div>
                  <div className="text-sm text-gray-400 flex items-center space-x-2">
                    <span>app.py</span>
                    <span className="w-3 h-3 bg-green-500 rounded-full" />
                  </div>
                </div>
                <div className="bg-navy-dark rounded p-6 text-left font-mono text-sm overflow-hidden relative">
                  <div className="absolute left-6 top-6 text-gray-600 select-none space-y-1">
                    {[...Array(12)].map((_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>
                  <div className="ml-8 space-y-1" id="codeContent">
                    <div className="code-line"><span className="text-purple-400">import</span> <span className="text-blue-300">numpy</span> <span className="text-purple-400">as</span> <span className="text-blue-300">np</span></div>
                    <div className="code-line"><span className="text-purple-400">from</span> <span className="text-blue-300">sklearn</span> <span className="text-purple-400">import</span> <span className="text-blue-300">datasets</span></div>
                    <div className="code-line">&nbsp;</div>
                    <div className="code-line"><span className="text-purple-400">def</span> <span className="text-yellow-300">train_model</span><span className="text-gray-400">(</span><span className="text-orange-300">data</span><span className="text-gray-400">):</span></div>
                    <div className="code-line"><span className="ml-4 text-gray-500"># AI-powered code completion</span></div>
                    <div className="code-line typing-line"><span className="ml-4 text-blue-300">model</span> <span className="text-purple-400">=</span> <span className="text-green-300"></span><span className="cursor-blink">|</span></div>
                    <div className="code-line opacity-0 suggestion-line"><span className="ml-4 text-gray-500 italic">? RandomForestClassifier(n_estimators=100)</span></div>
                    <div className="code-line opacity-0"><span className="ml-4 text-blue-300">model</span><span className="text-gray-400">.</span><span className="text-yellow-300">fit</span><span className="text-gray-400">(</span><span className="text-orange-300">data</span><span className="text-gray-400">)</span></div>
                    <div className="code-line opacity-0"><span className="ml-4 text-purple-400">return</span> <span className="text-blue-300">model</span></div>
                    <div className="code-line opacity-0">&nbsp;</div>
                  </div>
                  <div className="ai-popup absolute right-6 top-20 bg-gray-800 border border-blue-500 rounded-lg p-4 shadow-xl opacity-0">
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                      <span className="text-xs text-blue-400 font-semibold">AI Assistant</span>
                    </div>
                    <p className="text-xs text-gray-300">Suggesting optimal model...</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center space-x-4">
                    <span className="flex items-center space-x-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full" />
                      <span>Python 3.11</span>
                    </span>
                    <span>UTF-8</span>
                    <span>Ln 6, Col 23</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 bg-blue-400 rounded-full" />
                    <span className="text-blue-400">AI Active</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Features Section */}
          <section className="py-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-12">
                Everything you need to build better software
              </h2>
              <p className="text-center text-gray-300 mb-16 max-w-2xl mx-auto">
                Buildr is designed from the ground up to be the most productive developer environment.
              </p>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[
                  { title: 'AI that understands your codebase', desc: 'Buildr indexes your entire codebase and understands the context of your project to provide intelligent suggestions.', color: 'bg-blue-accent' },
                  { title: 'Pair program with AI', desc: 'Chat with an AI that can see your code, make edits, and help you debug issues in real-time.', color: 'bg-green-accent' },
                  { title: 'Smart autocomplete', desc: 'Get intelligent code completions that understand your coding patterns and project structure.', color: 'bg-purple-500' },
                  { title: 'Privacy first', desc: 'Your code stays private. We use SOC 2 compliant infrastructure and never train on your code.', color: 'bg-red-500' },
                  { title: 'Built for teams', desc: 'Share AI conversations, collaborate on code, and maintain consistency across your team.', color: 'bg-yellow-500' },
                  { title: 'Import from anywhere', desc: 'Seamlessly import your existing projects from VS Code, GitHub, or any other editor.', color: 'bg-indigo-500' },
                ].map((feature, i) => (
                  <div key={i} className="bg-navy-light p-6 rounded-lg">
                    <div className={`w-12 h-12 ${feature.color} rounded-lg mb-4 flex items-center justify-center`}>
                      <ChevronRight className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                    <p className="text-gray-300">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Integration Section */}
          <section className="py-16 px-4 sm:px-6 lg:px-8 bg-navy-dark">
            <div className="max-w-7xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-12">Integrates with your favorite tools</h2>
              <div className="integration-scroll mb-16">
                <div className="integration-track">
                  {[...Array(30)].map((_, i) => (
                    <div key={i} className="integration-item flex flex-col items-center space-y-2">
                      <div className="w-16 h-16 bg-navy-light rounded-lg flex items-center justify-center">
                        <div className="w-8 h-8 bg-gray-600 rounded" />
                      </div>
                      <span className="text-sm text-gray-300">Tool {i + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
