#!/usr/bin/env node
/**
 * Verify the configured AI models exist and (optionally) answer.
 *
 * Deployment self-heal, the deployment repair agent and AI pair programming all
 * depend on at least one working model. A retired model name or an expired key
 * is otherwise only discovered when a deployment fails and the repair attempt
 * dies, which is the worst possible moment.
 *
 * Usage:
 *   node scripts/check-ai-models.js            # list models, verify names
 *   node scripts/check-ai-models.js --live     # also send a tiny completion
 *
 * Exit codes: 0 = every configured provider usable, 1 = at least one problem,
 * 2 = no provider configured at all.
 */
require('dotenv').config();

const { providerDefinitions } = require('../config/aiProviders');

const LIVE = process.argv.includes('--live');
const TIMEOUT_MS = 30000;

function withTimeout(ms) {
    return AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
}

async function getJson(url, headers = {}) {
    const response = await fetch(url, { headers, signal: withTimeout(TIMEOUT_MS) });
    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        const error = new Error(`${response.status} ${response.statusText}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
        error.status = response.status;
        throw error;
    }
    return response.json();
}

function normalizeGeminiId(name) {
    return String(name || '').replace(/^models\//, '');
}

async function listModels(key, definition) {
    switch (key) {
        case 'gemini': {
            const data = await getJson(
                `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(definition.apiKey)}`
            );
            return (data.models || [])
                .filter((model) => (model.supportedGenerationMethods || []).includes('generateContent'))
                .map((model) => normalizeGeminiId(model.name));
        }
        case 'openrouter': {
            const data = await getJson('https://openrouter.ai/api/v1/models');
            return (data.data || []).map((model) => model.id);
        }
        case 'mistral': {
            const data = await getJson('https://api.mistral.ai/v1/models', {
                Authorization: `Bearer ${definition.apiKey}`,
            });
            return (data.data || data.models || []).map((model) => model.id || model.name);
        }
        case 'groq': {
            const data = await getJson('https://api.groq.com/openai/v1/models', {
                Authorization: `Bearer ${definition.apiKey}`,
            });
            return (data.data || []).map((model) => model.id);
        }
        case 'huggingface': {
            // The inference API exposes no cheap model list; resolve each
            // configured name directly.
            const wanted = [definition.model, ...(definition.fallbackModels || [])];
            const available = [];
            for (const model of wanted) {
                try {
                    await getJson(`https://huggingface.co/api/models/${model}`);
                    available.push(model);
                } catch (_) {
                    // reported as MISS below
                }
            }
            return available;
        }
        default:
            return [];
    }
}

async function liveProbe(key, definition) {
    // Require lazily so the provider snapshot is built from this process env.
    const aiService = require('../utils/aiService');
    const models = [definition.model, ...(definition.fallbackModels || [])];
    const results = [];
    for (const model of models) {
        const startedAt = Date.now();
        const result = await aiService.chat(
            [{ role: 'user', content: 'Reply with the single word: ok' }],
            {
                provider: key,
                model,
                allowModelFallback: false,
                // A health check must report the primary model's real state,
                // not silently pass by failing over to another provider.
                allowProviderFallback: false,
                aiMaxRetries: 0,
                maxTokens: 24,
                timeoutMs: TIMEOUT_MS,
            }
        );
        results.push({
            model,
            ok: Boolean(result?.success && String(result.content || '').trim()),
            ms: Date.now() - startedAt,
            error: result?.success ? null : (result?.error || 'empty response'),
        });
        if (results[0].ok) break;
    }
    return results;
}

function pad(value, width) {
    const text = String(value ?? '');
    return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

async function main() {
    const definitions = providerDefinitions();
    const configured = Object.entries(definitions).filter(([, definition]) => definition.available);
    const unconfigured = Object.entries(definitions).filter(([, definition]) => !definition.available);

    console.log('Configured providers:', configured.map(([key]) => key).join(', ') || 'none');
    if (unconfigured.length) {
        console.log('Missing API keys:', unconfigured.map(([, definition]) => `${definition.name} (${definition.apiKeyEnv})`).join(', '));
    }
    if (!configured.length) {
        console.error('\nNo AI provider is configured. Set at least one API key before deployments can self-heal.');
        process.exit(2);
    }

    let problems = 0;
    for (const [key, definition] of configured) {
        console.log(`\n${definition.name} (${key})`);
        console.log(`  primary model: ${definition.model}`);
        if (definition.fallbackModels?.length) {
            console.log(`  fallback models: ${definition.fallbackModels.join(', ')}`);
        }

        let models = [];
        try {
            models = await listModels(key, definition);
            console.log(`  provider reachable: ${models.length} model(s) visible`);
        } catch (error) {
            problems += 1;
            console.log(`  provider listing FAILED: ${error.message}`);
        }

        if (models.length) {
            const wanted = [definition.model, ...(definition.fallbackModels || [])];
            for (const model of wanted) {
                const ok = key === 'huggingface'
                    ? models.includes(model)
                    : models.includes(model) || (key === 'gemini' && models.includes(normalizeGeminiId(model)));
                console.log(`  ${ok ? 'OK  ' : 'MISS'} ${model}`);
                if (!ok) problems += 1;
            }
        }

        if (LIVE) {
            try {
                const probes = await liveProbe(key, definition);
                for (const probe of probes) {
                    console.log(`  live ${probe.ok ? 'OK  ' : 'FAIL'} ${pad(probe.model, 34)} ${probe.ms}ms${probe.error ? ` — ${probe.error.slice(0, 160)}` : ''}`);
                }
                if (!probes.some((probe) => probe.ok)) problems += 1;
            } catch (error) {
                problems += 1;
                console.log(`  live probe FAILED: ${error.message}`);
            }
        }
    }

    console.log(`\n${problems === 0 ? 'All configured AI models look usable.' : `${problems} AI configuration problem(s) found.`}`);
    process.exit(problems === 0 ? 0 : 1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
