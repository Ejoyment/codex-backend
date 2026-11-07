const fs = require('fs');
let content = fs.readFileSync('utils/workspaceAuth.js', 'utf8');

const oldStr = `    // Fall back to personal scope: the user's own userId is their workspace.
    // Self-heal agents, old session data, stale company IDs all resolve
    // here so personal users can always use AI actions.
    await ensurePersonalWorkspace(userId);
    const personal = await resolveWorkspaceForUser(userId, userId);
    if (personal) {
        return {
            ok: true,
            workspace: personal.workspace,
            workspaceId: String(personal.workspace._id),
            personal: true,
        };
    }`;

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

if (content.includes(oldStr)) {
    content = content.replace(oldStr, newStr);
    fs.writeFileSync('utils/workspaceAuth.js', content);
    console.log('SUCCESS: Replaced successfully');
} else {
    console.log('FAILED: oldString not found');
    const lines = content.split('\n');
    for (let i = 73; i < 96; i++) {
        console.log((i+1) + ':' + JSON.stringify(lines[i]));
    }
}
