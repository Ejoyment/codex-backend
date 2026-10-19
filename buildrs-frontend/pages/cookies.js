import Head from 'next/head';
import SiteShell from '../components/SiteShell';

const COOKIES_HTML = "<p>This Cookie Notice explains how CODEX ENTERPRISE LIMITED (&quot;<strong>we</strong>&quot;, &quot;<strong>us</strong>&quot; or &quot;<strong>our</strong>&quot;) uses cookies and similar technologies in connection with our website and applications (the &quot;<strong>Service</strong>&quot;).</p>\n<h2>What are cookies?</h2>\n<p>Cookies are small data files placed on your device when you visit a website. They help services work — for example, keeping you signed in and remembering your preferences.</p>\n<h2>What we use</h2>\n<p>We use <strong>only essential cookies and browser storage</strong>. We do not use advertising cookies, analytics cookies, social-media cookies, email pixel tags, or session-replay technology.</p>\n<table>\n<thead>\n<tr>\n<th>Type</th>\n<th>Name / Key</th>\n<th>Purpose</th>\n<th>Served by</th>\n<th>Lifetime</th>\n</tr>\n</thead>\n<tbody><tr>\n<td>Essential cookie</td>\n<td><code>auth_token</code> (httpOnly)</td>\n<td>Keeps you signed in when using Google sign-in</td>\n<td>Us</td>\n<td>24 hours</td>\n</tr>\n<tr>\n<td>Essential cookie</td>\n<td>Session cookie</td>\n<td>Server session for request handling and security</td>\n<td>Us</td>\n<td>Session (lost if the server restarts)</td>\n</tr>\n<tr>\n<td>Browser storage (localStorage)</td>\n<td><code>authToken</code>, <code>user</code>, subscription state</td>\n<td>Keeps your signed-in session and UI state</td>\n<td>Us</td>\n<td>Until you clear it or sign out</td>\n</tr>\n<tr>\n<td>Browser storage (localStorage)</td>\n<td>Editor drafts, standup cache</td>\n<td>Recovers unsaved editor work and cached team updates. Files that look like secrets (e.g. <code>.env</code>) are excluded from drafts.</td>\n<td>Us</td>\n<td>Until you clear it</td>\n</tr>\n<tr>\n<td>Browser storage (localStorage)</td>\n<td>Support-agent token</td>\n<td>Signs in support agents to the support console</td>\n<td>Us</td>\n<td>Until you clear it or sign out</td>\n</tr>\n<tr>\n<td>Browser storage (sessionStorage)</td>\n<td>Signup OTP/email scraps</td>\n<td>Prefills the signup verification step</td>\n<td>Us</td>\n<td>Session</td>\n</tr>\n</tbody></table>\n<h2>Your choices</h2>\n<ol>\n<li><strong>Browser settings.</strong> Most browsers let you block or delete cookies and site data. Blocking the essential cookies above will prevent you from staying signed in.</li>\n<li><strong>Sign out.</strong> Signing out clears your session tokens from the browser.</li>\n</ol>\n<p>There are no advertising or analytics opt-outs to manage because we do not use those technologies.</p>\n<p>For more information about how we collect, use, and share information, see our <a href=\"/privacy\">Privacy Policy</a>.</p>\n<h2>Changes</h2>\n<p>We may update this Cookie Notice from time to time. Changes take effect when posted.</p>\n<h2>Questions</h2>\n<p>Contact us at <a href=\"mailto:privacy@buildrshq.dev\">privacy@buildrshq.dev</a>.</p>\n<p>Last modified October 18, 2026.</p>\n<hr>\n<p>This document was adapted from a template prepared and made publicly available by General Legal, PC (&quot;General Legal&quot;). It is provided for general reference purposes only and does not constitute, and should not be construed as, legal advice. Use of this template does not create an attorney-client relationship with General Legal. General Legal has not reviewed, and takes no position on, any modifications made to this document or the deal terms it is used to document.</p>\n";

export default function Cookies() {
  return (
    <>
      <Head>
        <title>Cookie Notice — BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <SiteShell>
        {/* Hero */}
        <section className="relative overflow-hidden pt-36 pb-14 sm:pt-44">
          <div className="mkt-hero-bg" />
          <div className="relative mx-auto max-w-[860px] px-5 sm:px-8">
            <p className="mkt-eyebrow mb-6">
              <span className="dot">●</span> buildrs · legal
            </p>
            <h1 className="mkt-h1">Cookie notice.</h1>
            <p className="mkt-sub mt-6 max-w-[560px]">
              Essential cookies and browser storage only — no advertising, no analytics, no trackers.
            </p>
            <p className="mkt-mono mt-6 text-[12px] uppercase tracking-widest text-[#525764]">
              last modified · october 18, 2026
            </p>
          </div>
        </section>

        {/* Notice */}
        <section className="mx-auto max-w-[860px] px-5 pb-24 sm:px-8">
          <div
            className="legal-prose rounded-xl border border-[#ffffff12] bg-[#0d0d12] p-7 sm:p-10"
            dangerouslySetInnerHTML={{ __html: COOKIES_HTML }}
          />
        </section>
      </SiteShell>
    </>
  );
}
