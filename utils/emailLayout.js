// Shared branded HTML email layout for BuildrsHQ.
// Mirrors the product design system: near-black surfaces, hairline borders,
// teal accents, mono eyebrow labels. The logo is always present in the masthead.
// Uses table-based, all-inline styling for broad email-client compatibility.

const BRAND_NAME = 'BuildrsHQ';
const BRAND_TAGLINE = 'The Unified Development Command Center';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://buildrshq.dev';
const SUPPORT_EMAIL = 'support@buildrshq.dev';
const LOGO_URL = `${FRONTEND_URL}/buildrs.png`;

const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO_STACK = "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace";

const COLORS = {
  page: '#08080b',
  card: '#0d0d12',
  line: 'rgba(255,255,255,0.07)',
  insetBg: '#08080b',
  insetLine: 'rgba(255,255,255,0.10)',
  accent: '#2fd6e6',
  accentInk: '#06141a',
  title: '#eceef1',
  body: '#a8adba',
  dim: '#686e7c',
  faint: '#565d6b',
};

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * Render a branded BuildrsHQ email.
 *
 * @param {Object} opts
 * @param {string} [opts.eyebrow]     mono kicker above the title
 * @param {string} [opts.title]       headline
 * @param {string} [opts.titleWrap]   second line of headline (accent, optional)
 * @param {string} [opts.greeting]    e.g. "Hi Jane,"
 * @param {string[]} [opts.paragraphs] body paragraphs rendered above callouts
 * @param {string[]} [opts.paragraphsAfter] body paragraphs rendered below callouts
 * @param {string}   [opts.code]      big letter-spaced code (OTP etc.)
 * @param {string}   [opts.codeLabel] label above the code
 * @param {Object}   [opts.info]      highlighted band { label, value } e.g. expiry
 * @param {string}   [opts.quote]     quoted message (inviter note)
 * @param {string[]} [opts.features]  ✓ check-list items
 * @param {Object}   [opts.cta]       { url, label } primary button
 * @param {string}   [opts.link]      standalone URL repeated below the button
 */
function renderEmail({
  eyebrow,
  title,
  titleWrap,
  greeting,
  paragraphs = [],
  paragraphsAfter = [],
  code,
  codeLabel = 'Your verification code',
  info,
  quote,
  features = [],
  cta,
  link,
}) {
  const renderParas = (list) =>
    list
      .map(
        (t) => `
        <tr>
          <td style="padding:10px 0 0 0;font-family:${FONT_STACK};font-size:14px;line-height:24px;color:${COLORS.body};">
            ${t}
          </td>
        </tr>`
      )
      .join('');

  const bodyRows = renderParas(paragraphs);

  const codeBlock = code
    ? `
        <tr>
          <td style="padding:26px 0 0 0;">
            <table width="100%" role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:${COLORS.insetBg};border:1px solid ${COLORS.insetLine};border-radius:10px;padding:22px 24px;text-align:center;">
                  <div style="font-family:${MONO_STACK};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${COLORS.dim};">${escapeHtml(codeLabel)}</div>
                  <div style="font-family:${MONO_STACK};font-size:30px;font-weight:700;letter-spacing:9px;color:${COLORS.accent};padding:12px 0 0 9px;mso-line-height-rule:exactly;line-height:38px;">
                    ${escapeHtml(code)}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    : '';

  const infoBand = info
    ? `
        <tr>
          <td style="padding:22px 0 0 0;">
            <table width="100%" role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:13px 16px;background:#0f1117;border-left:2px solid ${COLORS.accent};border-radius:6px;font-family:${FONT_STACK};font-size:13px;line-height:20px;color:#9aa1ae;">
                  ${info.label}
                  ${info.value ? `<strong style="color:${info.accent ? COLORS.accent : '#eceef1'};"> ${info.value}</strong>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    : '';

  const quoteBand = quote
    ? `
        <tr>
          <td style="padding:24px 0 0 0;">
            <table width="100%" role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:16px 20px;background:#0f1117;border:1px solid ${COLORS.insetLine};border-radius:8px;font-family:${FONT_STACK};font-size:14px;font-style:italic;line-height:24px;color:#9aa1ae;">
                  “${escapeHtml(quote)}”
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    : '';

  const featureRows = features
    .map(
      (f) => `
        <tr>
          <td style="padding:7px 0 0 0;font-family:${FONT_STACK};font-size:14px;line-height:22px;color:${COLORS.body};">
            <span style="color:${COLORS.accent};font-weight:700;">✓</span>&nbsp;&nbsp;&nbsp;${escapeHtml(f)}
          </td>
        </tr>`
    )
    .join('');

  const bodyRowsAfter = renderParas(paragraphsAfter);

  const featureBlock = features.length
    ? `
        <tr>
          <td style="padding:22px 0 0 0;">
            <table width="100%" role="presentation" cellpadding="0" cellspacing="0">
              ${featureRows}
            </table>
          </td>
        </tr>`
    : '';

  const buttonRow = cta
    ? `
        <tr>
          <td style="padding:32px 0 0 0;text-align:center;">
            <a href="${escapeHtml(cta.url)}" target="_blank"
               style="display:inline-block;background:${COLORS.accent};color:${COLORS.accentInk};padding:13px 30px;border-radius:8px;font-family:${FONT_STACK};font-size:14px;font-weight:600;text-decoration:none;">
              ${escapeHtml(cta.label)}
            </a>
          </td>
        </tr>
        ${
          link
            ? `
        <tr>
          <td style="padding:14px 0 0 0;text-align:center;font-family:${FONT_STACK};font-size:12px;line-height:18px;color:#9aa1ae;">
            Button not working? Copy and paste this link into your browser:<br>
            <a href="${escapeHtml(link)}" target="_blank" style="color:${COLORS.accent};text-decoration:none;word-break:break-all;">${escapeHtml(link)}</a>
          </td>
        </tr>`
            : ''
        }`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${escapeHtml(title)} — ${BRAND_NAME}</title>
</head>
<body style="margin:0;padding:0;-webkit-text-size-adjust:100%;background-color:${COLORS.page};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.page};">
    <tr>
      <td align="center" style="padding:36px 16px 36px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background-color:${COLORS.card};border:1px solid #1d2029;border-radius:14px;overflow:hidden;">

          <!-- Masthead -->
          <tr>
            <td style="padding:36px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <img src="${escapeHtml(LOGO_URL)}" alt="${BRAND_NAME}" width="44" height="44"
                         style="display:block;border:0;outline:none;text-decoration:none;border-radius:10px;">
                    <div style="padding-top:12px;font-family:${FONT_STACK};font-size:16px;font-weight:700;letter-spacing:-0.01em;color:${COLORS.title};">${BRAND_NAME}</div>
                    <div style="padding-top:3px;font-family:${MONO_STACK};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${COLORS.faint};">${BRAND_TAGLINE}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hairline divider -->
          <tr>
            <td style="padding:30px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="border-bottom:1px solid ${COLORS.line};font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:32px 40px 8px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${
                  eyebrow
                    ? `<tr><td style="padding-bottom:14px;font-family:${MONO_STACK};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${COLORS.dim};">${escapeHtml(eyebrow)}</td></tr>`
                    : ''
                }
                <tr>
                  <td style="font-family:${FONT_STACK};font-size:21px;font-weight:700;letter-spacing:-0.01em;line-height:28px;color:${COLORS.title};">
                    ${escapeHtml(title)}${titleWrap ? `&nbsp;<span style="color:${COLORS.accent};">${escapeHtml(titleWrap)}</span>` : ''}
                  </td>
                </tr>
                ${greeting ? `<tr><td style="padding:20px 0 0 0;font-family:${FONT_STACK};font-size:14px;line-height:24px;color:${COLORS.body};">${escapeHtml(greeting)}</td></tr>` : ''}
                ${bodyRows}
                ${codeBlock}
                ${infoBand}
                ${quoteBand}
                ${bodyRowsAfter}
                ${featureBlock}
                ${buttonRow}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:36px 40px 32px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-bottom:1px solid ${COLORS.line};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding-top:26px;text-align:center;font-family:${FONT_STACK};font-size:12px;line-height:20px;color:${COLORS.faint};">
                    <div style="font-weight:600;color:#8a90a0;">© ${new Date().getFullYear()} ${BRAND_NAME}</div>
                    <div style="padding-top:4px;">You received this email because of activity on your ${BRAND_NAME} account.</div>
                    <div style="padding-top:4px;">Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:${COLORS.accent};text-decoration:none;">${SUPPORT_EMAIL}</a></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = {
  renderEmail,
  BRAND_NAME,
  BRAND_TAGLINE,
  FRONTEND_URL,
  SUPPORT_EMAIL,
  LOGO_URL,
  escapeHtml,
};