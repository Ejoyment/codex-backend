const fs = require('fs');
let content = fs.readFileSync('utils/workspaceAuth.js', 'utf8');

// Use regex to replace the fallback block
const oldPattern = /    \/\/ Fall back to personal scope: the user's own userId is their workspace\.\n    \/\/ Self-heal agents, old session data, stale company IDs all resolve\n    \/\/ here so personal users can always use AI actions\.\n    await ensurePersonalWorkspace\(userId\);\n    const personal = await resolveWorkspaceForUser\(userId, userId\);\n    if \(personal\) \{\n        return \{\n            ok: true,\n            workspace: personal\.workspace,\n            workspaceId: String\(personal\.workspace\._id\),\n            personal: true,\n        \};\n    \}/;

const newStr = `    // Fall back to personal scope only if the requested ID is the user's
    // own ID (personal scope) or no workspaceId was provided at all.
    if (!wsId || wsId === String(userId)) {
        await ensurePersonalWorkspace(userId);
        const personal = await resolveWorkspaceForUser(userId, userId);
        if (personal) {
            return {
                ok: true,
                workspace: personal.workspace,
                workspaceId: String(personal.workspace._id),
                personal: true,
            };
        }
    }`;

if (oldPattern.test(content)) {
    content = content.replace(oldPattern, newStr);
    fs.writeFileSync('utils/workspaceAuth.js', content);
    console.log('SUCCESS: Replaced successfully');
} else {
    console.log('FAILED: Pattern not found');
    // Show what we have around line 74-96
    const lines = content.split('\n');
    for (let i = 73; i < 96; i++) {
        if (lines[i]) console.log(i+1 + ':' + JSON.stringify(lines[i]));
    }
}
