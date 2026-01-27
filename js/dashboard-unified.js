// Unified Dashboard with Live Integrations Hub
const API_URL = 'https://codexincenterprise.online/api';

class UnifiedDashboard {
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

        try {
            // Load everything in parallel with timeout
            await Promise.race([
                Promise.all([
                    this.loadUserProfile(),
                    this.loadDashboardStats(),
                    this.loadGitHubData()
                ]),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Loading timeout')), 15000)
                )
            ]);
            
            // Start auto-refresh
            this.startAutoRefresh();
            
        } catch (error) {
            console.error('Dashboard init error:', error);
            // Still show dashboard even if some data fails
        } finally {
            // Always hide skeleton after attempt
            setTimeout(() => {
                document.body.classList.add('content-loaded');
            }, 500);
        }
    }

    async loadUserProfile() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(`${API_URL}/auth/me`, {
                headers: { 'Authorization': `Bearer ${this.token}` },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            const result = await response.json();
            
            if (result.success) {
                const user = result.user;
                // Fix profile picture URL - add backend URL if relative path
                let avatarUrl = user.profilePicture;
                if (avatarUrl && avatarUrl.startsWith('/uploads/')) {
                    avatarUrl = `https://codex-backend-7utu.onrender.com${avatarUrl}`;
                } else if (!avatarUrl) {
                    avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.fullName)}&background=3b82f6&color=fff`;
                }
                
                // Update sidebar
                document.getElementById('sidebarName').textContent = user.fullName;
                document.getElementById('sidebarAvatar').src = avatarUrl;
                document.getElementById('sidebarRole').textContent = user.role?.join(', ') || 'Team Member';
                
                // Update header
                document.getElementById('headerName').textContent = user.fullName;
                document.getElementById('headerAvatar').src = avatarUrl;
                document.getElementById('headerRole').textContent = user.role?.join(', ') || 'Team Member';
                
                // Load subscription badge
                this.loadSubscriptionBadge();
            }
        } catch (error) {
            console.error('Load user error:', error);
            // Set default values on error
            document.getElementById('sidebarName').textContent = 'User';
            document.getElementById('headerName').textContent = 'User';
        }
    }

    async loadSubscriptionBadge() {
        try {
            const response = await fetch(`${API_URL}/subscription/current`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            
            if (data.success) {
                const tier = data.subscription.tier;
                const badge = document.getElementById('subscriptionBadge');
                
                const tierColors = {
                    freebie: 'bg-gray-600 text-gray-200',
                    professional: 'bg-blue-600 text-white',
                    enterprise: 'bg-purple-600 text-white'
                };
                
                const tierNames = {
                    freebie: 'Freebie',
                    professional: 'Professional',
                    enterprise: 'Enterprise'
                };
                
                badge.className = `mt-2 px-2 py-1 rounded text-xs text-center font-semibold ${tierColors[tier]}`;
                badge.innerHTML = tierNames[tier];
            }
        } catch (error) {
            console.error('Load subscription error:', error);
        }
    }

    async loadDashboardStats() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(`${API_URL}/dashboard/data`, {
                headers: { 'Authorization': `Bearer ${this.token}` },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            const result = await response.json();
            
            if (result.success && result.data) {
                const stats = result.data.stats;
                
                document.getElementById('activeProjectsCount').textContent = stats.activeProjects;
                document.getElementById('totalCompletedCount').textContent = stats.totalCompleted;
                document.getElementById('teamMembersCount').textContent = stats.teamMembers;
                
                document.getElementById('activeProjectsStatus').textContent = `${stats.activeProjects} active`;
                document.getElementById('totalCompletedStatus').textContent = `${stats.totalCompleted} completed`;
                document.getElementById('teamMembersStatus').textContent = `${stats.teamMembers} members`;
            }
        } catch (error) {
            console.error('Load stats error:', error);
            // Set default values on error
            document.getElementById('activeProjectsCount').textContent = '0';
            document.getElementById('totalCompletedCount').textContent = '0';
            document.getElementById('teamMembersCount').textContent = '0';
            document.getElementById('activeProjectsStatus').textContent = 'Loading...';
            document.getElementById('totalCompletedStatus').textContent = 'Loading...';
            document.getElementById('teamMembersStatus').textContent = 'Loading...';
        }
    }

    startAutoRefresh() {
        this.autoRefreshInterval = setInterval(() => {
            this.loadDashboardStats();
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
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(`${API_URL}/dashboard/data/github`, {
                headers: { 'Authorization': `Bearer ${this.token}` },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            const result = await response.json();
            
            if (result.success && result.data) {
                this.renderGitHubRepos(result.data.repositories || []);
            } else if (!result.connected) {
                const container = document.getElementById('githubRepos');
                container.innerHTML = `
                    <div class="text-center p-6 bg-gray-50 rounded-lg">
                        <p class="text-gray-600 mb-3">GitHub not connected</p>
                        <a href="settings.html" class="text-blue-600 hover:text-blue-700 font-medium">
                            Connect GitHub →
                        </a>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Load GitHub data error:', error);
            const container = document.getElementById('githubRepos');
            container.innerHTML = `
                <div class="text-center p-4 bg-yellow-50 rounded-lg">
                    <p class="text-yellow-800 text-sm">Failed to load GitHub data</p>
                    <button onclick="dashboard.loadGitHubData()" class="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium">
                        Retry
                    </button>
                </div>
            `;
        }
    }

    renderGitHubRepos(repos) {
        const container = document.getElementById('githubRepos');
        
        if (repos.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No repositories found</p>';
            return;
        }

        container.innerHTML = repos.map(repo => `
            <div class="integration-card border border-gray-200 rounded-lg p-4 hover:shadow-md cursor-pointer" onclick="dashboard.selectRepo('${repo.name}', '${repo.owner}')">
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
        await this.loadRepoFiles(owner, repoName);
    }

    async loadRepoFiles(owner, repo) {
        const container = document.getElementById('fileBrowser');
        container.innerHTML = '<p class="text-gray-500 text-sm">Loading files...</p>';
        
        try {
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
                <div class="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer" onclick="dashboard.openFile('${file.path}')">
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
        }
    }

    async openFile(filePath) {
        const editor = document.getElementById('codeEditor');
        const content = `// ${filePath}\n// This is a simulated file content\n// In production, this would fetch real content from GitHub API\n\nfunction example() {\n    console.log('Hello from ${filePath}');\n}\n\nexport default example;`;
        editor.value = content;
        editor.dataset.filePath = filePath;
    }

    async saveFile() {
        const editor = document.getElementById('codeEditor');
        const filePath = editor.dataset.filePath;
        
        if (!filePath || !this.selectedRepo) {
            alert('No file or repository selected');
            return;
        }
        
        alert(`File ${filePath} saved successfully!\n\nIn production, this would commit changes to GitHub.`);
    }

    // ===== DISCORD INTEGRATION =====

    async loadDiscordData() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(`${API_URL}/dashboard/data/discord`, {
                headers: { 'Authorization': `Bearer ${this.token}` },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            const result = await response.json();
            
            if (result.success && result.data) {
                this.renderDiscordServers(result.data.servers || []);
            } else if (!result.connected) {
                const container = document.getElementById('discordServers');
                container.innerHTML = `
                    <div class="text-center p-6 bg-gray-50 rounded-lg">
                        <p class="text-gray-600 mb-3">Discord not connected</p>
                        <a href="settings.html" class="text-blue-600 hover:text-blue-700 font-medium">
                            Connect Discord →
                        </a>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Load Discord data error:', error);
            const container = document.getElementById('discordServers');
            container.innerHTML = `
                <div class="text-center p-4 bg-yellow-50 rounded-lg">
                    <p class="text-yellow-800 text-sm">Failed to load Discord data</p>
                    <button onclick="dashboard.loadDiscordData()" class="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium">
                        Retry
                    </button>
                </div>
            `;
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
                        <div class="flex items-center space-x-2 p-2 hover:bg-indigo-50 rounded cursor-pointer" onclick="dashboard.selectChannel('${server.id}', '${channel.id}', '${channel.name}')">
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
        
        container.scrollTop = container.scrollHeight;
    }

    async sendDiscordMessage() {
        const input = document.getElementById('discordMessageInput');
        const message = input.value.trim();
        
        if (!message || !this.selectedChannel) {
            alert('Please enter a message and select a channel');
            return;
        }
        
        const container = document.getElementById('discordMessages');
        container.innerHTML += `
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
        container.scrollTop = container.scrollHeight;
        input.value = '';
        
        alert('Message sent successfully!\n\nIn production, this would send via Discord API.');
    }

    // ===== FIGMA INTEGRATION =====

    async loadFigmaData() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(`${API_URL}/dashboard/data/figma`, {
                headers: { 'Authorization': `Bearer ${this.token}` },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            const result = await response.json();
            
            if (result.success && result.data) {
                this.renderFigmaProjects(result.data.projects || []);
            } else if (!result.connected) {
                const container = document.getElementById('figmaProjects');
                container.innerHTML = `
                    <div class="text-center p-6 bg-gray-50 rounded-lg">
                        <p class="text-gray-600 mb-3">Figma not connected</p>
                        <a href="settings.html" class="text-blue-600 hover:text-blue-700 font-medium">
                            Connect Figma →
                        </a>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Load Figma data error:', error);
            const container = document.getElementById('figmaProjects');
            container.innerHTML = `
                <div class="text-center p-4 bg-yellow-50 rounded-lg">
                    <p class="text-yellow-800 text-sm">Failed to load Figma data</p>
                    <button onclick="dashboard.loadFigmaData()" class="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium">
                        Retry
                    </button>
                </div>
            `;
        }
    }

    renderFigmaProjects(projects) {
        const container = document.getElementById('figmaProjects');
        
        if (projects.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No projects found</p>';
            return;
        }

        container.innerHTML = projects.map(project => `
            <div class="integration-card border border-gray-200 rounded-lg p-4 hover:shadow-md cursor-pointer" onclick="dashboard.selectFigmaProject('${project.id}', '${project.name}')">
                <h3 class="font-semibold text-gray-900 mb-1">${project.name}</h3>
                <p class="text-xs text-gray-500">${project.fileCount || 0} files</p>
            </div>
        `).join('');
    }

    async selectFigmaProject(projectId, projectName) {
        this.selectedProject = { id: projectId, name: projectName };
        await this.loadFigmaFiles(projectId);
    }

    async loadFigmaFiles(projectId) {
        const container = document.getElementById('figmaFiles');
        const files = [
            { name: 'Homepage Design', thumbnail: 'https://via.placeholder.com/300x200/667eea/ffffff?text=Homepage', lastModified: new Date() },
            { name: 'Mobile App UI', thumbnail: 'https://via.placeholder.com/300x200/f093fb/ffffff?text=Mobile+App', lastModified: new Date() },
            { name: 'Dashboard Mockup', thumbnail: 'https://via.placeholder.com/300x200/4facfe/ffffff?text=Dashboard', lastModified: new Date() },
            { name: 'Component Library', thumbnail: 'https://via.placeholder.com/300x200/43e97b/ffffff?text=Components', lastModified: new Date() }
        ];
        
        container.innerHTML = files.map(file => `
            <div class="integration-card border border-gray-200 rounded-lg overflow-hidden hover:shadow-md cursor-pointer" onclick="dashboard.openFigmaFile('${file.name}')">
                <img src="${file.thumbnail}" alt="${file.name}" class="w-full h-32 object-cover">
                <div class="p-3">
                    <h4 class="font-semibold text-sm text-gray-900 mb-1">${file.name}</h4>
                    <p class="text-xs text-gray-500">Modified ${file.lastModified.toLocaleDateString()}</p>
                </div>
            </div>
        `).join('');
    }

    openFigmaFile(fileName) {
        alert(`Opening ${fileName} in Figma...\n\nIn production, this would open the file in Figma or embed the Figma viewer.`);
    }
}

// Global functions
function showIntegration(integration) {
    document.querySelectorAll('.integration-btn').forEach(btn => {
        btn.classList.remove('border-gray-900', 'bg-gray-900', 'text-white');
        btn.classList.add('border-gray-300', 'text-gray-700');
    });
    
    document.querySelectorAll('.integration-panel').forEach(panel => {
        panel.classList.add('hidden');
    });
    
    document.getElementById(`${integration}Integration`).classList.remove('hidden');
    dashboard.currentIntegration = integration;
    
    if (integration === 'github') {
        dashboard.loadGitHubData();
    } else if (integration === 'discord') {
        dashboard.loadDiscordData();
    } else if (integration === 'figma') {
        dashboard.loadFigmaData();
    }
}

function refreshAllData() {
    dashboard.loadDashboardStats();
    dashboard.loadGitHubData();
}

function createGitHubRepo() {
    alert('Create GitHub Repository\n\nIn production, this would open a modal to create a new repository via GitHub API.');
}

function createBranch() {
    if (!dashboard.selectedRepo) {
        alert('Please select a repository first');
        return;
    }
    alert('Create Branch\n\nIn production, this would create a new branch in the selected repository.');
}

function createPullRequest() {
    if (!dashboard.selectedRepo) {
        alert('Please select a repository first');
        return;
    }
    alert('Create Pull Request\n\nIn production, this would open a modal to create a new PR.');
}

function createIssue() {
    if (!dashboard.selectedRepo) {
        alert('Please select a repository first');
        return;
    }
    alert('Create Issue\n\nIn production, this would open a modal to create a new issue.');
}

function viewCommits() {
    if (!dashboard.selectedRepo) {
        alert('Please select a repository first');
        return;
    }
    alert('View Commits\n\nIn production, this would show the commit history.');
}

function saveFile() {
    dashboard.saveFile();
}

function sendDiscordMessage() {
    dashboard.sendDiscordMessage();
}

function createFigmaProject() {
    alert('Create Figma Project\n\nIn production, this would create a new project via Figma API.');
}

function createFigmaFile() {
    if (!dashboard.selectedProject) {
        alert('Please select a project first');
        return;
    }
    alert('Create Figma File\n\nIn production, this would create a new design file.');
}

// Initialize
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new UnifiedDashboard();
    dashboard.init();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (dashboard) {
        dashboard.stopAutoRefresh();
    }
});
