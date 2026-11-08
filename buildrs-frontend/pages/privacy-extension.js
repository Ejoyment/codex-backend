import Head from 'next/head';

const LAST_UPDATED = 'November 8, 2026';

export default function PrivacyExtension() {
  return (
    <>
      <Head>
        <title>Buildrs Figma Helper – Privacy Policy</title>
        <link rel="icon" href="/buildrs.png" />
        <meta name="description" content="Privacy policy for the Buildrs Figma Helper Chrome extension." />
      </Head>

      <main style={{ maxWidth: 740, margin: '0 auto', padding: '48px 24px 80px', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#d3dae4', background: '#0b1017', minHeight: '100vh' }}>
        <a href="/" style={{ color: '#19d2db', fontSize: 13, textDecoration: 'none' }}>← Back to Buildrs</a>

        <h1 style={{ marginTop: 32, fontSize: 28, fontWeight: 700, color: '#e5ebf2' }}>
          Buildrs Figma Helper — Privacy Policy
        </h1>
        <p style={{ marginTop: 8, color: '#778398', fontSize: 13 }}>Last updated: {LAST_UPDATED}</p>

        <Section title="Overview">
          The Buildrs Figma Helper is a Chrome browser extension that syncs your Figma recent files
          to your Buildrs account so they appear automatically on the Buildrs Figma page. This policy
          explains what data the extension accesses, what it sends, and what it never touches.
        </Section>

        <Section title="What the extension reads">
          <ul>
            <li>Your <strong>Figma recent files list</strong> — specifically each file&apos;s key, name, thumbnail URL, and last-modified date. This is fetched from <code>www.figma.com</code> using your existing Figma browser session (cookies). The extension never reads your Figma password or stores your Figma cookies.</li>
            <li>Your <strong>Buildrs authentication token</strong> — read from <code>localStorage</code> on Buildrs pages (the same token the Buildrs web app already uses). This is used only to call the Buildrs sync endpoint.</li>
          </ul>
        </Section>

        <Section title="What is sent to Buildrs">
          The extension sends one HTTPS POST request to your Buildrs backend
          (<code>https://codex-backend-7utu.onrender.com/api/figma/files/sync</code> by default,
          or the API base you configure in the extension settings). The request contains:
          <ul>
            <li>File key (a short alphanumeric identifier)</li>
            <li>File name</li>
            <li>Thumbnail URL (a short-lived Figma CDN link)</li>
            <li>Last-modified date</li>
          </ul>
          Your Buildrs JWT is included as a bearer token in the Authorization header to authenticate the request.
          <strong> File contents, design layers, component data, and your Figma session cookies are never sent.</strong>
        </Section>

        <Section title="What is stored">
          <ul>
            <li><strong>chrome.storage.local</strong> — the extension stores your Buildrs API base URL, your Buildrs JWT, the last sync timestamp, and the count of synced files. This data lives in your browser and is never shared with any third party.</li>
            <li><strong>Buildrs backend</strong> — the file list (keys, names, thumbnails, modified dates) is stored on your Buildrs account and is only readable by you when signed in.</li>
          </ul>
        </Section>

        <Section title="What is never collected">
          <ul>
            <li>Your Figma password or login credentials</li>
            <li>Your Figma session cookies</li>
            <li>The actual content of your Figma files (layers, frames, components, assets)</li>
            <li>Browsing history or activity outside of <code>figma.com</code> and Buildrs pages</li>
            <li>Any data from websites other than <code>figma.com</code> and your configured Buildrs origin</li>
          </ul>
        </Section>

        <Section title="Data sharing">
          We do not sell, rent, or share your data with any third parties. The only data transfer is
          between your browser and your own Buildrs account.
        </Section>

        <Section title="Permissions used">
          <ul>
            <li><strong>scripting</strong> — to run a same-origin fetch inside a <code>figma.com</code> tab so your Figma session is used to read your recent files.</li>
            <li><strong>storage</strong> — to remember your Buildrs API base and authentication token between browser sessions.</li>
            <li><strong>tabs</strong> — to find an existing <code>figma.com</code> tab or open a new one temporarily.</li>
            <li><strong>alarms</strong> — to schedule an automatic re-sync every 15 minutes.</li>
            <li><strong>host_permissions: www.figma.com</strong> — required by the <code>scripting</code> API to inject the fetch script.</li>
            <li><strong>host_permissions: Buildrs origins</strong> — to POST the synced file list to your Buildrs account.</li>
          </ul>
        </Section>

        <Section title="Data retention">
          Your synced file list is replaced every time the extension syncs. You can remove all stored
          data at any time by uninstalling the extension or by disconnecting Figma from your Buildrs
          account settings.
        </Section>

        <Section title="Contact">
          If you have questions about this policy, email us at{' '}
          <a href="mailto:privacy@buildrshq.dev" style={{ color: '#19d2db' }}>privacy@buildrshq.dev</a>.
        </Section>
      </main>
    </>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2 style={{ fontSize: 16, fontWeight: 650, color: '#e5ebf2', marginBottom: 10 }}>{title}</h2>
      <div style={{ fontSize: 14, lineHeight: 1.75, color: '#9aaeba' }}>
        {children}
      </div>
    </section>
  );
}
