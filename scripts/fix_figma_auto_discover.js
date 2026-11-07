const fs = require('fs');
let content = fs.readFileSync('routes/figma-api.js', 'utf8');

const oldStr = `        // After OAuth, try to auto-discover the user's Figma teams/folders so
        // they don't have to paste links manually. Figma doesn't expose a
        // "list my teams" API, so we can only discover teams/folders the user
        // has previously linked or that we can find from their profile.
        try {
            const { fetchSourceLibrary } = require('../utils/figmaLibrary');
            const discoveredSources = [];
            // Figma doesn't expose a "list my teams" API, so we can't
            // auto-discover teams without a team ID. The user will need to
            // paste at least one team/folder link on the Figma page.
            // We store whatever we can and let the frontend show it.
        } catch (error) {
            console.error('Figma auto-discovery error:', error.message);
        }`;

const newStr = `        // Auto-discover the user's Figma teams/folders/files after OAuth so
        // they don't have to paste links manually. Figma exposes:
        //   GET /v1/teams          -> list teams the user belongs to
        //   GET /v1/teams/:team_id/folders -> list folders in a team
        //   GET /v2/folders/:folder_id/files -> list files in a folder
        try {
            const teamsResponse = await axios.get('https://api.figma.com/v1/teams', {
                headers: { 'Authorization': 'Bearer ' + access_token },
                timeout: 15000
            });

            const teams = teamsResponse.data?.teams || [];

            const sources = [];
            for (const team of teams) {
                try {
                    const teamFolders = await axios.get(
                        'https://api.figma.com/v1/teams/' + encodeURIComponent(team.id) + '/folders',
                        {
                            headers: { 'Authorization': 'Bearer ' + access_token },
                            timeout: 15000
                        }
                    );

                    const folderRoots = (teamFolders.data?.folders || []).map((folder) => ({
                        id: String(folder.id),
                        name: folder.name || 'Untitled folder',
                        parentId: null,
                        depth: 1
                    }));

                    if (folderRoots.length > 0) {
                        const library = await fetchSourceLibrary(access_token, {
                            type: 'team',
                            id: team.id,
                            name: team.name || 'Figma team'
                        });

                        if (library && library.folders) {
                            sources.push({
                                type: 'team',
                                id: team.id,
                                name: library.name || team.name || 'Figma team',
                                folders: library.folders,
                                fileCount: library.fileCount || 0,
                                addedAt: new Date().toISOString()
                            });
                        }
                    }
                } catch (teamErr) {
                    console.error('Failed to fetch team ' + team.id + ' folders:', teamErr.message);
                }
            }

            // Store discovered team/folder sources on the integration so the
            // Figma page can show them immediately without the user pasting links
            if (sources.length > 0) {
                await Integration.findOneAndUpdate(
                    { userId, provider: 'figma' },
                    { \$set: { 'metadata.figmaSources': sources } }
                );
            }
        } catch (error) {
            console.error('Figma auto-discovery error:', error.message);
        }`;

if (content.includes(oldStr)) {
    content = content.replace(oldStr, newStr);
    fs.writeFileSync('routes/figma-api.js', content);
    console.log('SUCCESS: Replaced successfully');
} else {
    console.log('FAILED: oldString not found');
}
