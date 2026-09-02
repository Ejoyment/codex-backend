import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';

export default function Index() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <Head>
        <title>BuildrsHQ | Ship Better Code, Faster</title>
        <link rel="icon" href="/buildrs.png" />
        <meta name="google-site-verification" content="NInX_C65m0qT6XHwkGnzhfNT-uR1ZbkUdm6BhFJNTVc" />
        <style>{`
          * { font-family: 'Space Grotesk', sans-serif; }
          body { overflow-x: hidden; }
          .content-wrapper { position: relative; z-index: 1; }
          .modern-header {
            position: fixed; top: 20px; left: 20px; right: 20px; z-index: 50;
            backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            background-color: rgba(26,31,54,0.85); border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); transition: all 0.3s ease;
          }
          .modern-header:hover { box-shadow: 0 12px 40px rgba(0,0,0,0.4); }
          @media (max-width: 640px) { .modern-header { top: 10px; left: 10px; right: 10px; border-radius: 12px; } }
          .nav-link { position: relative; transition: all 0.2s ease; }
          .nav-link::after {
            content: ''; position: absolute; bottom: -2px; left: 50%; width: 0; height: 2px;
            background: linear-gradient(to right, #3b82f6, #8b5cf6); transition: all 0.3s ease; transform: translateX(-50%);
          }
          .nav-link:hover::after { width: 80%; }
          .cta-button {
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); transition: all 0.3s ease;
          }
          .cta-button:hover { box-shadow: 0 10px 25px -5px rgba(99,102,241,0.5); transform: scale(1.05); }
          .integration-scroll {
            overflow: hidden; position: relative; width: 100%;
            mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
            -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
          }
          .integration-track { display: flex; gap: 4rem; animation: scroll 30s linear infinite; width: fit-content; }
          .integration-item { flex: 0 0 auto; min-width: 120px; }
          @keyframes scroll { from { transform: translateX(0); } to { transform: translateX(calc(-50% - 2rem)); } }
          .integration-scroll:hover .integration-track { animation-play-state: paused; }
          .editor-mockup {
            background: #0f172a; border: 1px solid #334155; border-radius: 12px; overflow: hidden;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
          }
          .editor-sidebar {
            background: #1e293b; border-right: 1px solid #334155; width: 200px;
          }
          .editor-tab {
            padding: 8px 12px; font-size: 12px; color: #94a3b8; border-bottom: 1px solid #334155;
            display: flex; align-items: center; gap: 8px;
          }
          .editor-tab.active { background: #0f172a; color: #e2e8f0; }
          .code-line { height: 20px; display: flex; align-items: center; gap: 12px; padding: 0 16px; font-size: 13px; font-family: 'Courier New', monospace; }
          .line-number { color: #475569; width: 20px; text-align: right; flex-shrink: 0; }
        `}</style>
      </Head>

      <div className="min-h-screen bg-[#0B0C15] text-white overflow-x-hidden">
        <div className="content-wrapper">
          {/* Header */}
          <header className="modern-header">
            <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10">
              <div className="flex justify-between items-center h-16">
                <Link href="/" className="flex items-center space-x-3 group">
                  <div className="w-20 h-10 flex items-center justify-center transform">
                    <img src="/buildrs.png" alt="BuildrsHQ" className="w-20 h-16" />
                  </div>
                  <span className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">BuildrsHQ</span>
                </Link>
                <nav className="hidden lg:flex items-center space-x-1">
                  <Link href="/features" className="nav-link px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/5">Product</Link>
                  <Link href="/pricing" className="nav-link px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/5">Solutions</Link>
                  <Link href="/blog" className="nav-link px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/5">Resources</Link>
                  <Link href="/pricing" className="nav-link px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/5">Pricing</Link>
                </nav>
                <div className="hidden lg:flex items-center space-x-3">
                  <Link href="/sign_in" className="px-6 py-2.5 rounded-lg text-white hover:bg-white/5 transition-all duration-200 font-medium">Sign in</Link>
                  <Link href="/signup" className="cta-button px-6 py-2.5 rounded-lg text-white font-medium">Get Started</Link>
                </div>
                <button type="button" onClick={() => setMenuOpen((v) => !v)} className="lg:hidden p-2 rounded-lg hover:bg-white/5 transition-colors" aria-label="Toggle mobile menu">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
                </button>
              </div>
            </div>
            <div className={`${menuOpen ? 'block' : 'hidden'} lg:hidden border-t border-white/10 bg-[#0B0C15]/95 backdrop-blur-lg`}>
              <div className="max-w-7xl mx-auto px-4 py-4 space-y-2">
                <Link href="/features" className="block px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 transition-all">Product</Link>
                <Link href="/pricing" className="block px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 transition-all">Solutions</Link>
                <Link href="/blog" className="block px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 transition-all">Resources</Link>
                <Link href="/pricing" className="block px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 transition-all">Pricing</Link>
                <div className="pt-4 space-y-2">
                  <Link href="/sign_in" className="block px-4 py-3 rounded-lg text-center text-white hover:bg-white/5 transition-all font-medium">Sign in</Link>
                  <Link href="/signup" className="block px-4 py-3 rounded-lg text-center cta-button text-white font-medium">Get Started</Link>
                </div>
              </div>
            </div>
          </header>

          {/* Hero Section */}
          <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                {/* Left Column */}
                <div>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                    <span className="text-sm text-gray-300">AI Powered Software development</span>
                  </div>
                  
                  <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
                    Build Software<br />
                    together at<br />
                    <span className="bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">AI speed</span>
                  </h1>
                  
                  <p className="text-lg text-gray-300 mb-8 max-w-lg">
                    BuildrsHQ combines AI pair programming, real-time collaboration, and intelligent integrations in one powerful development workspace for modern teams.
                  </p>
                  
                  <div className="flex flex-col sm:flex-row gap-4 mb-12">
                    <Link href="/signup" className="cta-button px-8 py-3 rounded-lg text-white font-medium inline-flex items-center justify-center gap-2">
                      Start Building
                    </Link>
                    <Link href="/demo" className="px-8 py-3 rounded-lg font-medium border border-gray-600 hover:bg-white/5 transition inline-flex items-center justify-center gap-2">
                      Explore Platform
                    </Link>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden">
                      <img src="/public/1000222021 1 (1).png" alt="Codex Inc" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">A product of CODEX INC ENTERPRISE</p>
                      <p className="text-xs text-gray-400">(Trusted by teams building the future)</p>
                    </div>
                  </div>
                </div>

                {/* Right Column - Workspace Mockup */}
                <div className="relative">
                  <div className="editor-mockup">
                    {/* Window Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                          <img src="/buildrs.png" alt="BuildrsHQ" className="w-5 h-5" />
                        </div>
                        <span className="text-sm font-medium">BuildrsHQ Workspace</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-xs text-green-400">LIVE</span>
                      </div>
                    </div>

                    <div className="flex">
                      {/* Sidebar */}
                      <div className="editor-sidebar p-4 hidden md:block">
                        <div className="text-xs text-gray-400 mb-4">OVERVIEW</div>
                        <div className="mb-4">
                          <div className="text-xs text-gray-500 mb-2">PROJECTS</div>
                          <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/5 mb-1">
                            <div className="w-4 h-4 bg-blue-500 rounded"></div>
                            <span className="text-xs text-gray-300">Acme Web app</span>
                          </div>
                          <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5">
                            <div className="w-4 h-4 bg-purple-500 rounded"></div>
                            <span className="text-xs text-gray-300">Mobile Dashboard</span>
                          </div>
                        </div>
                        <div className="mb-4">
                          <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5">
                            <div className="w-4 h-4 bg-cyan-500 rounded flex items-center justify-center">
                              <span className="text-[10px] text-black font-bold">AI</span>
                            </div>
                            <span className="text-xs text-gray-300">AI Assistant</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-2">TOOLS</div>
                          <div className="space-y-1">
                            <div className="text-xs text-gray-400 px-2 py-1">AI Chat</div>
                            <div className="text-xs text-gray-400 px-2 py-1">Pull requests</div>
                            <div className="text-xs text-gray-400 px-2 py-1">Integrations</div>
                            <div className="text-xs text-gray-400 px-2 py-1">Settings</div>
                          </div>
                        </div>
                      </div>

                      {/* Main Editor Area */}
                      <div className="flex-1">
                        {/* Tabs */}
                        <div className="flex border-b border-gray-700 bg-[#0f172a]">
                          <div className="editor-tab active">
                            <span className="text-gray-400">main.py</span>
                            <span className="text-gray-500">×</span>
                          </div>
                        </div>

                        {/* Code Content */}
                        <div className="p-4 font-mono text-sm bg-[#0f172a]">
                          <div className="code-line"><span className="line-number">1</span><span className="text-purple-400">import</span> <span className="text-blue-300">React</span></div>
                          <div className="code-line"><span className="line-number">2</span>&nbsp;</div>
                          <div className="code-line"><span className="line-number">3</span><span className="text-purple-400">function</span> <span className="text-yellow-300">App</span>() {'{'}</div>
                          <div className="code-line"><span className="line-number">4</span>  <span className="text-purple-400">return</span> (</div>
                          <div className="code-line"><span className="line-number">5</span>    <span className="text-gray-400">&lt;</span><span className="text-blue-300">Dashboard</span> <span className="text-gray-400">/&gt;</span></div>
                          <div className="code-line"><span className="line-number">6</span>  )</div>
                          <div className="code-line"><span className="line-number">7</span>{'}'}</div>
                          <div className="code-line"><span className="line-number">8</span>&nbsp;</div>
                          <div className="code-line"><span className="line-number">9</span><span className="text-purple-400">export</span> <span className="text-purple-400">default</span> <span className="text-yellow-300">App</span></div>
                        </div>

                        {/* AI Status Bar */}
                        <div className="px-4 py-2 bg-[#1e293b] border-t border-gray-700 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                              <span className="text-xs text-blue-400">AI is updating code...</span>
                            </div>
                            <span className="text-xs text-gray-500">Generating code...</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Floating Live Preview Card */}
                  <div className="absolute -bottom-6 -right-6 bg-[#1e293b] border border-gray-700 rounded-xl p-4 shadow-2xl hidden lg:block">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-gray-400">Live Preview</span>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-xs text-green-400">Connected</span>
                      </div>
                    </div>
                    <div className="bg-[#0f172a] rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                          <img src="/buildrs.png" alt="" className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-semibold">BuildrsHQ Dashboard</span>
                      </div>
                      <p className="text-xs text-gray-400 mb-3">AI Powered workplace</p>
                      <button className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 rounded text-xs font-medium transition">
                        Get Started →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Divider */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>
          </div>

          {/* Everything In One Place Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-6">
                <span className="text-sm text-gray-300">Everything In One Place</span>
              </div>
              
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                Everything your team needs to<br />
                build together
              </h2>
              
              <p className="text-lg text-gray-300 max-w-2xl mx-auto">
                From AI assistance to deployments, BuildrsHQ provides all the tools modern development teams need to ship better software faster.
              </p>
            </div>
          </section>

          {/* Features Split Section */}
          <section className="py-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="grid lg:grid-cols-2 gap-12 items-start">
                {/* Left - Code Editor Mockup */}
                <div className="editor-mockup">
                  {/* Tab Bar */}
                  <div className="flex items-center gap-1 px-4 py-2 bg-[#1e293b] border-b border-gray-700">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0f172a] rounded text-xs text-gray-300">
                      <span className="text-gray-500">main.tsx</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500">
                      <span>dashboard.tsx</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500">
                      <span>api.ts</span>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-xs text-green-400">LIVE</span>
                    </div>
                  </div>

                  <div className="flex">
                    {/* Editor Sidebar */}
                    <div className="w-48 bg-[#1e293b] border-r border-gray-700 p-4 hidden lg:block">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-6 h-6 rounded bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                          <img src="/buildrs.png" alt="" className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-semibold">BuildrsHQ</span>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/5">
                          <div className="w-4 h-4 bg-blue-500 rounded"></div>
                          <span className="text-xs text-gray-300">Projects</span>
                        </div>
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5">
                          <div className="w-4 h-4 bg-gray-600 rounded"></div>
                          <span className="text-xs text-gray-400">Source Code</span>
                        </div>
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5">
                          <div className="w-4 h-4 bg-cyan-500 rounded flex items-center justify-center">
                            <span className="text-[10px] text-black font-bold">AI</span>
                          </div>
                          <span className="text-xs text-gray-400">AI Pair</span>
                        </div>
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5">
                          <div className="w-4 h-4 bg-gray-600 rounded"></div>
                          <span className="text-xs text-gray-400">Tasks</span>
                        </div>
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5">
                          <div className="w-4 h-4 bg-gray-600 rounded"></div>
                          <span className="text-xs text-gray-400">Integrations</span>
                        </div>
                      </div>

                      <div className="mt-8">
                        <div className="text-xs text-gray-500 mb-2">Workspace</div>
                        <div className="text-xs text-gray-400 px-2 py-1">Acme Web App</div>
                        <div className="text-xs text-gray-400 px-2 py-1">Mobile Dashboard</div>
                        <div className="text-xs text-gray-400 px-2 py-1">API Service</div>
                      </div>
                    </div>

                    {/* Main Code Area */}
                    <div className="flex-1 p-4 font-mono text-sm bg-[#0f172a]">
                      <div className="code-line"><span className="line-number">1</span><span className="text-purple-400">import</span> <span className="text-blue-300">React</span><span className="text-gray-400">,</span> <span className="text-purple-400">{'useState'}</span><span className="text-gray-400">,</span> <span className="text-purple-400">{'useMemo'}</span> <span className="text-purple-400">from</span> <span className="text-green-300">'react'</span></div>
                      <div className="code-line"><span className="line-number">2</span><span className="text-purple-400">import</span> <span className="text-blue-300">{'ChartContainer'}</span><span className="text-gray-400">,</span> <span className="text-blue-300">{'MetricCard'}</span> <span className="text-purple-400">from</span> <span className="text-green-300">'./components'</span></div>
                      <div className="code-line"><span className="line-number">3</span><span className="text-purple-400">import</span> <span className="text-blue-300">{'useFetchMetrics'}</span> <span className="text-purple-400">from</span> <span className="text-green-300">'../hooks'</span></div>
                      <div className="code-line"><span className="line-number">4</span>&nbsp;</div>
                      <div className="code-line"><span className="line-number">5</span><span className="text-purple-400">export</span> <span className="text-purple-400">const</span> <span className="text-yellow-300">DashboardPreview</span><span className="text-gray-400">:</span> <span className="text-blue-300">React.FC</span><span className="text-gray-400">&lt;</span><span className="text-blue-300">DashboardProps</span><span className="text-gray-400">&gt; = (</span><span className="text-orange-300">{'({ projectId })'}</span><span className="text-gray-400">) =&gt; {'{'}</span></div>
                      <div className="code-line"><span className="line-number">6</span>  <span className="text-purple-400">const</span> <span className="text-blue-300">{'filter'}</span> <span className="text-gray-400">=</span> <span className="text-yellow-300">useState</span><span className="text-gray-400">&lt;</span><span className="text-blue-300">string</span><span className="text-gray-400">&gt;('all')</span></div>
                      <div className="code-line"><span className="line-number">7</span>  <span className="text-purple-400">const</span> <span className="text-blue-300">{'metrics'}</span> <span className="text-gray-400">=</span> <span className="text-yellow-300">useFetchMetrics</span><span className="text-gray-400">(</span><span className="text-orange-300">{'projectId'}</span><span className="text-gray-400">)</span></div>
                      <div className="code-line"><span className="line-number">8</span>&nbsp;</div>
                      <div className="code-line"><span className="line-number">9</span>  <span className="text-gray-500">// Optimize expensive transformations as suggested by BuildrsAI</span></div>
                      <div className="code-line"><span className="line-number">10</span>  <span className="text-purple-400">const</span> <span className="text-blue-300">{'processedData'}</span> <span className="text-gray-400">=</span> <span className="text-yellow-300">{'useMemo'}</span><span className="text-gray-400">(() =&gt; {'{'}</span></div>
                      <div className="code-line"><span className="line-number">11</span>    <span className="text-purple-400">return</span> <span className="text-blue-300">{'metrics'}</span><span className="text-gray-400">.</span><span className="text-yellow-300">{'filter'}</span><span className="text-gray-400">(</span><span className="text-orange-300">{'m'}</span> <span className="text-gray-400">=&gt;</span> <span className="text-blue-300">{'m'}</span><span className="text-gray-400">.</span><span className="text-yellow-300">{'status'}</span> <span className="text-gray-400">===</span> <span className="text-green-300">{'filter'}</span><span className="text-gray-400">)</span></div>
                      <div className="code-line"><span className="line-number">12</span>  <span className="text-gray-400">{'}'}, [metrics, filter])'</span></div>
                      <div className="code-line"><span className="line-number">13</span>&nbsp;</div>
                      <div className="code-line"><span className="line-number">14</span>  <span className="text-purple-400">return</span> <span className="text-gray-400">(</span></div>
                      <div className="code-line"><span className="line-number">15</span>    <span className="text-gray-400">&lt;</span><span className="text-blue-300">{'ChartContainer'}</span> <span className="text-yellow-300">{'title'}</span><span className="text-gray-400">=</span><span className="text-green-300">"Performance Output"</span> <span className="text-yellow-300">{'data'}</span><span className="text-gray-400">=</span><span className="text-gray-400">{'{processedData}'}</span> <span className="text-gray-400">/&gt;</span></div>
                      <div className="code-line"><span className="line-number">16</span>    <span className="text-gray-400">&lt;</span><span className="text-blue-300">{'MetricCard'}</span> <span className="text-yellow-300">{'label'}</span><span className="text-gray-400">=</span><span className="text-green-300">"Core Web Vitals"</span> <span className="text-yellow-300">{'score'}</span><span className="text-gray-400">=</span><span className="text-gray-400">{'{98}'}</span> <span className="text-gray-400">/&gt;</span></div>
                      <div className="code-line"><span className="line-number">17</span>  <span className="text-gray-400">{'})'}</span></div>
                      <div className="code-line"><span className="line-number">18</span><span className="text-gray-400">{'}'}</span></div>
                    </div>

                    {/* AI Assistant Panel */}
                    <div className="w-64 bg-[#1e293b] border-l border-gray-700 p-4 hidden xl:block">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-6 h-6 bg-purple-500 rounded flex items-center justify-center">
                          <span className="text-xs text-white font-bold">AI</span>
                        </div>
                        <span className="text-sm font-medium">AI Assistant</span>
                      </div>
                      <p className="text-xs text-gray-400 mb-4">
                        I can help optimize your Dashboard component. Consider using <span className="text-blue-400">useMemo</span> for the data transformation.
                      </p>
                      <div className="bg-[#0f172a] rounded-lg p-3">
                        <input
                          type="text"
                          placeholder="Ask AI..."
                          className="w-full bg-transparent text-xs text-gray-300 placeholder-gray-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bottom Bar */}
                  <div className="px-4 py-2 bg-[#1e293b] border-t border-gray-700 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <span className="text-xs text-gray-400">main</span>
                      </div>
                      <span className="text-xs text-gray-500">3 changes</span>
                    </div>
                  </div>
                </div>

                {/* Right - Feature Cards */}
                <div className="space-y-4">
                  <div className="bg-[#1e293b] border border-gray-700 rounded-xl p-6 hover:border-gray-600 transition">
                    <div className="w-12 h-12 rounded-lg mb-4 overflow-hidden bg-white/5">
                      <img src="/public/986 (1) 1.png" alt="AI Pair Programming" className="w-full h-full object-cover" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">AI Pair Programming</h3>
                    <p className="text-gray-400 text-sm">Write alongside an intelligent coding assistant that understands your project context and helps you build faster.</p>
                  </div>

                  <div className="bg-[#1e293b] border border-gray-700 rounded-xl p-6 hover:border-gray-600 transition">
                    <div className="w-12 h-12 rounded-lg mb-4 overflow-hidden bg-white/5">
                      <img src="/public/987 1.png" alt="Real-Time collaboration" className="w-full h-full object-cover" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Real-Time collaboration</h3>
                    <p className="text-gray-400 text-sm">Collaborate with your team in real-time without wasting time switching between different development tools.</p>
                  </div>

                  <div className="bg-[#1e293b] border border-gray-700 rounded-xl p-6 hover:border-gray-600 transition">
                    <div className="w-12 h-12 rounded-lg mb-4 overflow-hidden bg-white/5">
                      <img src="/public/988 1.png" alt="Intelligent Integrations" className="w-full h-full object-cover" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Intelligent Integrations</h3>
                    <p className="text-gray-400 text-sm">Connect Repositories, Development tools, APIs and Team Workflows in one place.</p>
                  </div>

                  <div className="bg-[#1e293b] border border-gray-700 rounded-xl p-6 hover:border-gray-600 transition">
                    <div className="w-12 h-12 rounded-lg mb-4 overflow-hidden bg-white/5">
                      <img src="/public/985 (1) 1.png" alt="Team Development" className="w-full h-full object-cover" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Team Development</h3>
                    <p className="text-gray-400 text-sm">Give distributed teams a unified environment for Planning, Building, Reviewing and Shipping.</p>
                  </div>

                  <div className="text-center pt-4">
                    <Link href="/features" className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 font-medium transition">
                      Explore all Features
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="bg-[#0B0C15] border-t border-gray-800 py-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-8">
                {/* Brand Column */}
                <div className="col-span-2">
                  <div className="flex items-center space-x-2 mb-4">
                    <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                      <img src="/buildrs.png" alt="" className="w-5 h-5" />
                    </div>
                    <span className="text-xl font-semibold">BuildrsHQ</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-6 max-w-xs">
                    "AI powered development platform for modern tech teams building the future"
                  </p>
                  <div className="flex items-center gap-4">
                    <a href="#" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition">
                      <span className="text-xs font-bold">X</span>
                    </a>
                    <a href="#" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition">
                      <span className="text-xs font-bold">in</span>
                    </a>
                    <a href="#" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition">
                      <span className="text-xs font-bold">📷</span>
                    </a>
                    <a href="#" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition">
                      <span className="text-xs font-bold">♪</span>
                    </a>
                  </div>
                </div>

                {/* Product */}
                <div>
                  <h4 className="font-semibold mb-4 text-sm">Product</h4>
                  <ul className="space-y-2 text-sm text-gray-400">
                    <li><Link href="/features" className="hover:text-white transition">Features</Link></li>
                    <li><Link href="/integrations" className="hover:text-white transition">Integrations</Link></li>
                    <li><Link href="/ai-pair" className="hover:text-white transition">AI assistant</Link></li>
                    <li><Link href="/changelog" className="hover:text-white transition">Changelog</Link></li>
                  </ul>
                </div>

                {/* Solutions */}
                <div>
                  <h4 className="font-semibold mb-4 text-sm">Solutions</h4>
                  <ul className="space-y-2 text-sm text-gray-400">
                    <li><Link href="/pricing" className="hover:text-white transition">Enterprise</Link></li>
                    <li><Link href="/pricing" className="hover:text-white transition">Startups</Link></li>
                    <li><Link href="/pricing" className="hover:text-white transition">Remote teams</Link></li>
                    <li><Link href="/pricing" className="hover:text-white transition">Agencies</Link></li>
                  </ul>
                </div>

                {/* Resources */}
                <div>
                  <h4 className="font-semibold mb-4 text-sm">Resources</h4>
                  <ul className="space-y-2 text-sm text-gray-400">
                    <li><Link href="/docs" className="hover:text-white transition">Docs</Link></li>
                    <li><Link href="/blog" className="hover:text-white transition">Blogs</Link></li>
                    <li><Link href="/support" className="hover:text-white transition">Guides</Link></li>
                    <li><Link href="/support" className="hover:text-white transition">Help center</Link></li>
                  </ul>
                </div>

                {/* Company */}
                <div>
                  <h4 className="font-semibold mb-4 text-sm">Company</h4>
                  <ul className="space-y-2 text-sm text-gray-400">
                    <li><Link href="/about" className="hover:text-white transition">About us</Link></li>
                    <li><Link href="/careers" className="hover:text-white transition">Careers</Link></li>
                    <li><Link href="/contact" className="hover:text-white transition">Contact</Link></li>
                    <li><Link href="/privacy" className="hover:text-white transition">Privacy</Link></li>
                  </ul>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
