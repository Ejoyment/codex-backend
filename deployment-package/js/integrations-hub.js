// Advanced Integrations Hub with Real-Time Manipulation
const API_URL = 'https://codexincenterprise.online/api';

class IntegrationsHub {
    constructor() {
        this.token = localStorage.getItem('authToken');
        this.currentIntegration = 'github';
        this.selectedRepo = null;
        this.selectedChannel = null;
        this.selectedProject = null;
        this.autoRefreshInterval = null;
    }

    async init() {
        if (!this.token) {
            window.location.href = 'sign_in.html';
            return;
        }

        await this.loadUserProfile();
        await this.loadGitHubData();
        
        // Start auto-refresh every 30 seconds
        this.startAutoRefresh();
        
        // Hide skeleton
        document.body.classList.add('content-loaded');
    }

    async loadUserProfile() {
        try {
            const response = await fetch(`${API_URL}/auth/me`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const result = await response.json();
            
            if (result.success) {
                const user = result.user;
                const avatarUrl = user.profilePicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.fullName)}&background=3b82f6&color=fff`;
                
                document.getElementById('headerName').textContent = user.fullName;
                document.getElementById('headerAvatar').src = avatarUrl;
                document.getElementById('headerRole').textContent = user.role?.join(', ') || 'Member';
            }
        } catch (error) {
            console.error('Load user error:', error);
        }
    }

    startAutoRefresh() {
        this.autoRefreshInterval = setInterval(() => {
            if (this.currentIntegration === 'github') {
                this.loadGitHubData();
            } else if (this.currentIntegration === 'discord') {
                this.loadDiscordData();
            } else if (this.currentIntegration === 'figma') {
                this.loadFigmaData();
            }
        }, 30000); // Refresh every 30 seconds
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
    }

    // ===== GITHUB INTEGRATION =====

    async loadGitHubData() {
        try {
            const response = await fetch(`${API_URL}/dashboard/data/github`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const result = await response.json();
            
            if (result.success && result.data) {
                this.renderGitHubRepos(result.data.repositories || []);
            }
        } catch (error) {
            console.error('Load GitHub data error:', error);
        }
    }

    renderGitHubRepos(repos) {
        const container = document.getElementById('githubRepos');
        
        if (repos.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No repositories found</p>';
            return;
        }

        container.innerHTML = repos.map(repo => `
            <div class="integration-card border border-gray-200 rounded-lg p-4 hover:shadow-md cursor-pointer" onclick="integrationsHub.selectRepo('${repo.name}', '${repo.owner}')">
                <div class="flex items-center justify-between mb-2">
                    <h3 class="font-semibold text-gray-900">${repo.name}</h3>
                    <span class="px-2 py-1 text-xs rounded ${repo.private ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}">
                        ${repo.private ? 'Private' : 'Public'}
                    </span>
                </div>
                <p class="text-sm text-gray-600 mb-2">${repo.description || 'No description'}</p>
                <div class="flex items-center justify-between text-xs text-gray-500">
                    <span>â­ ${repo.stars || 0}</span>
                    <span>ðŸ´ ${repo.forks || 0}</span>
                    <span>${repo.language || 'N/A'}</span>
                </div>
            </div>
        `).join('');
    }

    async selectRepo(repoName, owner) {
        this.selectedRepo = { name: repoName, owner };
        console.log('Selected repo:', this.selectedRepo);
        
        // Load file tree
        await this.loadRepoFiles(owner, repoName);
    }

    async loadRepoFiles(owner, repo) {
        const container = document.getElementById('fileBrowser');
        container.innerHTML = '<p class="text-gray-500 text-sm">Loading files...</p>';
        
        try {
            // Simulated file tree - in production, use GitHub API
            const files = [
                { name: 'README.md', type: 'file', path: 'README.md' },
                { name: 'package.json', type: 'file', path: 'package.json' },
                { name: 'src/', type: 'folder', path: 'src' },
                { name: 'src/index.js', type: 'file', path: 'src/index.js' },
                { name: 'src/utils.js', type: 'file', path: 'src/utils.js' },
                { name: 'tests/', type: 'folder', path: 'tests' },
                { name: '.gitignore', type: 'file', path: '.gitignore' }
            ];
            
            container.innerHTML = files.map(file => `
                <div class="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer" onclick="integrationsHub.openFile('${file.path}')">
                    <svg class="w-4 h-4 ${file.type === 'folder' ? 'text-blue-500' : 'text-gray-500'}" fill="currentColor" viewBox="0 0 20 20">
                        ${file.type === 'folder' 
                            ? '<path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path>'
                            : '<path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"></path>'
                        }
                    </svg>
                    <span class="text-sm text-gray-900">${file.name}</span>
                </div>
            `).join('');
        } catch (error) {
            console.error('Load files error:', error);
            container.innerHTML = '<p class="text-red-500 text-sm">Failed to load files</p>';
        }
    }

    async openFile(filePath) {
        const editor = document.getElementById('codeEditor');
        editor.value = 'Loading file...';
        
        try {
            // Simulated file content - in production, fetch from GitHub API
            const content = `// ${filePath}\n// This is a simulated file content\n// In production, this would fetch real content from GitHub API\n\nfunction example() {\n    console.log('Hello from ${filePath}');\n}\n\nexport default example;`;
            
            editor.value = content;
            editor.dataset.filePath = filePath;
        } catch (error) {
            console.error('Open file error:', error);
            editor.value = 'Failed to load file';
        }
    }

    async saveFile() {
        const editor = document.getElementById('codeEditor');
        const filePath = editor.dataset.filePath;
        const content = editor.value;
        
        if (!filePath) {
            alert('No file selected');
            return;
        }
        
        if (!this.selectedRepo) {
            alert('No repository selected');
            return;
        }
        
        try {
            // In production, commit changes to GitHub
            console.log('Saving file:', filePath, 'to repo:', this.selectedRepo);
            alert(`File ${filePath} saved successfully!\n\nIn production, this would commit changes to GitHub.`);
        } catch (error) {
            console.error('Save file error:', error);
            alert('Failed to save file');
        }
    }

    // ===== DISCORD INTEGRATION =====

    async loadDiscordData() {
        try {
            const response = await fetch(`${API_URL}/dashboard/data/discord`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const result = await response.json();
            
            if (result.success && result.data) {
                this.renderDiscordServers(result.data.servers || []);
            }
        } catch (error) {
            console.error('Load Discord data error:', error);
        }
    }

    renderDiscordServers(servers) {
        const container = document.getElementById('discordServers');
        
        if (servers.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No servers found</p>';
            return;
        }

        container.innerHTML = servers.map(server => `
            <div class="border border-gray-200 rounded-lg p-3">
                <h3 class="font-semibold text-gray-900 mb-2">${server.name}</h3>
                <div class="space-y-1">
                    ${(server.channels || []).map(channel => `
                        <div class="flex items-center space-x-2 p-2 hover:bg-indigo-50 rounded cursor-pointer" onclick="integrationsHub.selectChannel('${server.id}', '${channel.id}', '${channel.name}')">
                            <span class="text-gray-500">#</span>
                            <span class="text-sm text-gray-700">${channel.name}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }

    async selectChannel(serverId, channelId, channelName) {
        this.selectedChannel = { serverId, channelId, channelName };
        document.getElementById('channelName').textContent = `#${channelName}`;
        
        await this.loadChannelMessages(serverId, channelId);
    }

    async loadChannelMessages(serverId, channelId) {
        const container = document.getElementById('discordMessages');
        container.innerHTML = '<p class="text-gray-500 text-sm text-center">Loading messages...</p>';
        
        try {
            // Simulated messages - in production, fetch from Discord API
            const messages = [
                { author: 'John Doe', content: 'Hey team! How\'s everyone doing?', timestamp: new Date(Date.now() - 3600000) },
                { author: 'Jane Smith', content: 'Great! Just finished the new feature.', timestamp: new Date(Date.now() - 1800000) },
                { author: 'Bob Johnson', content: 'Awesome work! Can you share the PR?', timestamp: new Date(Date.now() - 900000) }
            ];
            
            container.innerHTML = messages.map(msg => `
                <div class="flex items-start space-x-3">
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(msg.author)}&background=random" class="w-8 h-8 rounded-full">
                    <div class="flex-1">
                        <div class="flex items-center space-x-2 mb-1">
                            <span class="font-semibold text-sm text-gray-900">${msg.author}</span>
                            <span class="text-xs text-gray-500">${msg.timestamp.toLocaleTimeString()}</span>
                        </div>
                        <p class="text-sm text-gray-700">${msg.content}</p>
                    </div>
                </div>
            `).join('');
            
            // Auto-scroll to bottom
            container.scrollTop = container.scrollHeight;
        } catch (error) {
            console.error('Load messages error:', error);
            container.innerHTML = '<p class="text-red-500 text-sm text-center">Failed to load messages</p>';
        }
    }

    async sendDiscordMessage() {
        const input = document.getElementById('discordMessageInput');
        const message = input.value.trim();
        
        if (!message) {
            alert('Please enter a message');
            return;
        }
        
        if (!this.selectedChannel) {
            alert('Please select a channel first');
            return;
        }
        
        try {
            // In production, send message via Discord API
            console.log('Sending message:', message, 'to channel:', this.selectedChannel);
            
            // Add message to UI
            const container = document.getElementById('discordMessages');
            const newMessage = `
                <div class="flex items-start space-x-3">
                    <img src="https://ui-avatars.com/api/?name=You&background=3b82f6" class="w-8 h-8 rounded-full">
                    <div class="flex-1">
                        <div class="flex items-center space-x-2 mb-1">
                            <span class="font-semibold text-sm text-gray-900">You</span>
                            <span class="text-xs text-gray-500">${new Date().toLocaleTimeString()}</span>
                        </div>
                        <p class="text-sm text-gray-700">${message}</p>
                    </div>
                </div>
            `;
            container.innerHTML += newMessage;
            container.scrollTop = container.scrollHeight;
            
            input.value = '';
            
            alert('Message sent successfully!\n\nIn production, this would send via Discord API.');
        } catch (error) {
            console.error('Send message error:', error);
            alert('Failed to send message');
        }
    }

    // ===== FIGMA INTEGRATION =====

    async loadFigmaData() {
        try {
            const response = await fetch(`${API_URL}/dashboard/data/figma`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const result = await response.json();
            
            if (result.success && result.data) {
                this.renderFigmaProjects(result.data.projects || []);
            }
        } catch (error) {
            console.error('Load Figma data error:', error);
        }
    }

    renderFigmaProjects(projects) {
        const container = document.getElementById('figmaProjects');
        
        if (projects.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No projects found</p>';
            return;
        }

        container.innerHTML = projects.map(project => `
            <div class="integration-card border border-gray-200 rounded-lg p-4 hover:shadow-md cursor-pointer" onclick="integrationsHub.selectFigmaProject('${project.id}', '${project.name}')">
                <h3 class="font-semibold text-gray-900 mb-1">${project.name}</h3>
                <p class="text-xs text-gray-500">${project.fileCount || 0} files</p>
            </div>
        `).join('');
    }

    async selectFigmaProject(projectId, projectName) {
        this.selectedProject = { id: projectId, name: projectName };
        console.log('Selected project:', this.selectedProject);
        
        await this.loadFigmaFiles(projectId);
    }

    async loadFigmaFiles(projectId) {
        const container = document.getElementById('figmaFiles');
        container.innerHTML = '<p class="text-gray-500 text-sm col-span-2">Loading files...</p>';
        
        try {
            // Simulated files - in production, fetch from Figma API
            const files = [
                { name: 'Homepage Design', thumbnail: 'https://via.placeholder.com/300x200/667eea/ffffff?text=Homepage', lastModified: new Date() },
                { name: 'Mobile App UI', thumbnail: 'https://via.placeholder.com/300x200/f093fb/ffffff?text=Mobile+App', lastModified: new Date() },
                { name: 'Dashboard Mockup', thumbnail: 'https://via.placeholder.com/300x200/4facfe/ffffff?text=Dashboard', lastModified: new Date() },
                { name: 'Component Library', thumbnail: 'https://via.placeholder.com/300x200/43e97b/ffffff?text=Components', lastModified: new Date() }
            ];
            
            container.innerHTML = files.map(file => `
                <div class="integration-card border border-gray-200 rounded-lg overflow-hidden hover:shadow-md cursor-pointer" onclick="integrationsHub.openFigmaFile('${file.name}')">
                    <img src="${file.thumbnail}" alt="${file.name}" class="w-full h-32 object-cover">
                    <div class="p-3">
                        <h4 class="font-semibold text-sm text-gray-900 mb-1">${file.name}</h4>
                        <p class="text-xs text-gray-500">Modified ${file.lastModified.toLocaleDateString()}</p>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Load files error:', error);
            container.innerHTML = '<p class="text-red-500 text-sm col-span-2">Failed to load files</p>';
        }
    }

    openFigmaFile(fileName) {
        alert(`Opening ${fileName} in Figma...\n\nIn production, this would open the file in Figma or embed the Figma viewer.`);
    }
}

// Global functions
function showIntegration(integration) {
    // Update button styles
    document.querySelectorAll('.integration-btn').forEach(btn => {
        btn.classList.remove('border-gray-900', 'bg-gray-900', 'text-white', 'border-indigo-600', 'bg-indigo-600');
        btn.classList.add('border-gray-300', 'text-gray-700');
    });
    
    // Hide all panels
    document.querySelectorAll('.integration-panel').forEach(panel => {
        panel.classList.add('hidden');
    });
    
    // Show selected panel
    document.getElementById(`${integration}Integration`).classList.remove('hidden');
    
    // Update current integration
    integrationsHub.currentIntegration = integration;
    
    // Load data
    if (integration === 'github') {
        integrationsHub.loadGitHubData();
    } else if (integration === 'discord') {
        integrationsHub.loadDiscordData();
    } else if (integration === 'figma') {
        integrationsHub.loadFigmaData();
    }
}

function refreshAllIntegrations() {
    if (integrationsHub.currentIntegration === 'github') {
        integrationsHub.loadGitHubData();
    } else if (integrationsHub.currentIntegration === 'discord') {
        integrationsHub.loadDiscordData();
    } else if (integrationsHub.currentIntegration === 'figma') {
        integrationsHub.loadFigmaData();
    }
}

function createGitHubRepo() {
    alert('Create GitHub Repository\n\nIn production, this would open a modal to create a new repository via GitHub API.');
}

function createBranch() {
    if (!integrationsHub.selectedRepo) {
        alert('Please select a repository first');
        return;
    }
    alert('Create Branch\n\nIn production, this would create a new branch in the selected repository.');
}

function createPullRequest() {
    if (!integrationsHub.selectedRepo) {
        alert('Please select a repository first');
        return;
    }
    alert('Create Pull Request\n\nIn production, this would open a modal to create a new PR.');
}

function createIssue() {
    if (!integrationsHub.selectedRepo) {
        alert('Please select a repository first');
        return;
    }
    alert('Create Issue\n\nIn production, this would open a modal to create a new issue.');
}

function viewCommits() {
    if (!integrationsHub.selectedRepo) {
        alert('Please select a repository first');
        return;
    }
    alert('View Commits\n\nIn production, this would show the commit history.');
}

function saveFile() {
    integrationsHub.saveFile();
}

function sendDiscordMessage() {
    integrationsHub.sendDiscordMessage();
}

function createFigmaProject() {
    alert('Create Figma Project\n\nIn production, this would create a new project via Figma API.');
}

function createFigmaFile() {
    if (!integrationsHub.selectedProject) {
        alert('Please select a project first');
        return;
    }
    alert('Create Figma File\n\nIn production, this would create a new design file.');
}

// Initialize
let integrationsHub;
document.addEventListener('DOMContentLoaded', () => {
    integrationsHub = new IntegrationsHub();
    integrationsHub.init();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (integrationsHub) {
        integrationsHub.stopAutoRefresh();
    }
});
