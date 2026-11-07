const fs = require('fs');
let content = fs.readFileSync('utils/workspaceAuth.js', 'utf8');

// Build the old string exactly from what we saw
const lines = content.split('\n');
const oldLines = [];
for (let i = 73; i <= 86; i++) {
    oldLines.push(lines[i]);
}
const oldStr = oldLines.join('\n');

console.log('Old string length:', oldStr.length);
console.log('First 50 chars:', JSON.stringify(oldStr.substring(0, 50)));

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
    // Show character by character comparison
    console.log('Expected oldStr length:', oldStr.length);
}
