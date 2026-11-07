const fs = require('fs');
let content = fs.readFileSync('utils/workspaceAuth.js', 'utf8');

// Build the old string line by line from the file
const lines = content.split('\n');
const oldLines = [];
for (let i = 73; i <= 86; i++) {
    oldLines.push(lines[i]);
}
const oldStr = oldLines.join('\n');

console.log('Old string:');
console.log(JSON.stringify(oldStr));
console.log('Length:', oldStr.length);

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

console.log('New string:');
console.log(JSON.stringify(newStr));
console.log('Length:', newStr.length);

if (content.includes(oldStr)) {
    content = content.replace(oldStr, newStr);
    fs.writeFileSync('utils/workspaceAuth.js', content);
    console.log('SUCCESS: Replaced successfully');
} else {
    console.log('FAILED: oldString not found');
}
