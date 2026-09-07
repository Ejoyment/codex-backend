const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const aiService = require('../utils/aiService');
const figmaContextService = require('../utils/figmaContextService');
const teamMemoryService = require('../utils/teamMemoryService');
const { addAuditLog } = require('../utils/auditLogService');
const { getFigmaIntegration } = require('../utils/figmaContextService');

function targetPrompt(target) {
  const t = String(target || 'react').toLowerCase();
  if (t === 'html' || t === 'css' || t === 'vanilla') {
    return {
      label: 'vanilla HTML + CSS',
      files: ['index.html', 'styles.css'],
      rules:
        'Create a single self-contained index.html plus a styles.css. Use semantic HTML5, CSS custom properties matching the design tokens, responsive layout, and no external frameworks.',
    };
  }
  if (t === 'component' || t === 'tailwind') {
    return {
      label: 'Tailwind CSS component',
      files: ['component.jsx'],
      rules:
        'Return one functional React component styled with Tailwind utility classes derived from the design tokens (colors/sizes). Include the className strings only; do not emit CSS files.',
    };
  }
  return {
    label: 'React + inline CSS',
    files: ['Component.jsx', 'Component.css'],
    rules:
      'Create production-ready React components in JSX. Match the design faithfully: exact layout proportions, colors, typography and spacing from the design tokens. Prefer functional components with hooks. Output plain JSX/CSS, no TypeScript annotations, no markdown fences inside the code.',
  };
}

function summarizeDesign(designContext, target) {
  const lines = [];
  const { designSystem, colors, typography, components, nodeTree } = designContext || {};
  lines.push(`Target framework: ${target.label}`);
  lines.push(`Design file: ${designContext.file?.name || 'untitled'} (${designContext.fileKey || 'unknown'})`);

  const colorArr = colors?.length
    ? colors
    : designSystem?.colors?.length
      ? designSystem.colors
      : designSystem?.rawTokens?.colors || [];
  if (colorArr.length) {
    lines.push('\nColor tokens:');
    colorArr.slice(0, 60).forEach((c) => {
      if (typeof c === 'string') lines.push(`  - ${c}`);
      else if (c?.name && c?.value) lines.push(`  - ${c.name}: ${c.value}`);
      else if (c?.name && c?.color) lines.push(`  - ${c.name}: ${c.color}`);
      else lines.push(`  - ${JSON.stringify(c)}`);
    });
  }

  const typeArr = typography?.length
    ? typography
    : designSystem?.typography?.length
      ? designSystem.typography
      : designSystem?.rawTokens?.typography || [];
  if (typeArr.length) {
    lines.push('\nTypography tokens:');
    typeArr.slice(0, 40).forEach((t) => {
      if (typeof t === 'string') lines.push(`  - ${t}`);
      else if (t?.name) lines.push(`  - ${t.name}: ${t.fontSize || t.size || ''} ${t.weight || ''} ${t.fontFamily || ''}`.trim());
      else lines.push(`  - ${JSON.stringify(t)}`);
    });
  }

  const compArr = components?.length ? components : designSystem?.components || [];
  if (compArr.length) {
    lines.push(`\nComponents (${compArr.length}):`);
    compArr.slice(0, 40).forEach((c) => {
      if (typeof c === 'string') lines.push(`  - ${c}`);
      else if (c?.name) lines.push(`  - ${c.name} (${c.type || 'component'})`);
      else lines.push(`  - ${JSON.stringify(c)}`);
    });
  }

  if (nodeTree) {
    lines.push('\nNode tree summary:');
    lines.push(typeof nodeTree === 'string' ? nodeTree : JSON.stringify(nodeTree).slice(0, 1500));
  }

  if (designSystem?.rawTokens?.spacing?.length) {
    lines.push('\nSpacing tokens:');
    designSystem.rawTokens.spacing.slice(0, 30).forEach((s) => {
      if (typeof s === 'string') lines.push(`  - ${s}`);
      else if (s?.name) lines.push(`  - ${s.name}: ${s.value ?? s.size ?? ''}`);
      else lines.push(`  - ${JSON.stringify(s)}`);
    });
  }

  return lines.join('\n');
}

async function makeTitle(fileKey, nodeId, designContext) {
  const base = designContext.file?.name || 'Design';
  return nodeId ? `${base} (node ${nodeId})` : base;
}

router.post('/generate', authenticateToken, async (req, res) => {
  const { fileKey, nodeId = null, target = 'react', companyId, prompt = '', workspaceId } = req.body;

  if (!fileKey) {
    return res.status(400).json({ success: false, message: 'fileKey is required' });
  }

  try {
    let designContext = {
      fileKey,
      designSystem: {},
      components: [],
      nodeTree: null,
      colors: [],
      typography: [],
    };

    try {
      const context = await figmaContextService.getDesignContext(req.userId, fileKey, nodeId, 'codegen');
      if (context) {
        designContext = {
          fileKey,
          file: context.file || null,
          nodeId: context.nodeId || null,
          designSystem: context.designSystem || context.rawTokens || {},
          components: context.components || context.designSystem?.components || [],
          nodeTree: context.nodeTree || null,
          colors: context.designSystem?.colors || [],
          typography: context.designSystem?.typography || [],
        };
      }
    } catch (figmaError) {
      console.warn('Design context fetch failed, continuing with tokens only:', figmaError.message);
      try {
        const tokens = await figmaContextService.ingestDesignTokens(req.userId, fileKey, nodeId);
        designContext.designSystem = { rawTokens: tokens || {} };
      } catch (ingestError) {
        console.warn('Token ingest also failed:', ingestError.message);
      }
    }

    const targetInfo = targetPrompt(target);
    const designSummary = summarizeDesign({ ...designContext, target: targetInfo }, targetInfo);
    const title = await makeTitle(fileKey, nodeId, designContext);

    let conventions = '';
    if (companyId) {
      try {
        conventions = await teamMemoryService.getConventionsPrompt(companyId) || '';
      } catch (convError) {
        console.warn('Conventions fetch failed:', convError.message);
      }
    }

    const systemPrompt = [
      'You are BuildrsHQ, a senior product engineer turning Figma designs into pixel-accurate production code.',
      targetInfo.rules,
      conventions ? `\nTeam coding conventions (follow these strictly):\n${conventions}` : '',
      '\nNever include explanatory commentary around the code. Output ONLY the code files, one after another, using the exact file path as a header line like:',
      '\n### FILE: src/Component.jsx',
      '\nfollowed by the file contents.',
    ].filter(Boolean).join('\n');

    const userPrompt = [
      `Design context:\n${designSummary}`,
      prompt ? `\nAdditional requirements from the user:\n${prompt}` : '',
      targetInfo.files?.length ? `\nProduce these files: ${targetInfo.files.join(', ')}` : '',
      '\nMake it look exactly like the design. Use the token colors without deviating.',
    ].filter(Boolean).join('\n');

    const aiResult = await aiService.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { agentMode: false, workspaceId, language: 'javascript' }
    );

    let files = [];
    const content = aiResult.content || '';
    const blocks = aiResult.codeBlocks || [{ lang: 'jsx', code: content }];

    blocks.forEach((b) => {
      if (b.file || b.fileName) {
        files.push({ name: b.file || b.fileName, path: b.file || b.fileName, language: b.lang || 'javascript', content: b.code });
      }
    });

    if (!files.length) {
      const split = content.split(/###\s*FILE:\s*(.+)/gi);
      if (split.length > 1) {
        for (let i = 1; i < split.length; i += 2) {
          files.push({ name: split[i].trim(), path: split[i].trim(), language: 'javascript', content: (split[i + 1] || '').trim() });
        }
      }
      if (!files.length && content.trim()) {
        const lang = targetInfo.files?.[0] || 'index.html';
        const name = lang.includes('css') ? 'styles.css' : lang.includes('jsx') ? 'Component.jsx' : 'index.html';
        files.push({ name, path: name, language: name.endsWith('.css') ? 'css' : name.endsWith('.jsx') ? 'javascript' : 'html', content: content.trim() });
      }
    }

    res.json({
      success: true,
      title,
      fileKey,
      nodeId,
      target: targetInfo.label,
      content,
      files,
      tokenCount: designContext.designSystem?.tokenCount || 0,
      message: `Generated ${files.length} file${files.length === 1 ? '' : 's'} from the design`,
    });

    addAuditLog({
      companyId: workspaceId || companyId,
      actorId: req.userId,
      event: 'ai.design_to_code',
      category: 'ai',
      target: `${title || fileKey} → ${targetInfo.label}`,
      details: { fileKey, nodeId, filesGenerated: files.length, prompt: prompt ? prompt.slice(0, 200) : '' },
      req
    });
  } catch (error) {
    console.error('Design-to-code error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/status', authenticateToken, async (req, res) => {
  try {
    await getFigmaIntegration(req.userId);
    res.json({ success: true, connected: true });
  } catch {
    res.json({ success: true, connected: false });
  }
});

module.exports = router;