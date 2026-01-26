// Dashboard Integrations Logic
const API_URL = 'https://codexincenterprise.online/api';

// Helper function to add timeout to fetch
function fetchWithTimeout(url, options = {}, timeout = 5000) {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
    ]);
}

class DashboardIntegrations {
    constructor() {
        this.token = localStorage.getItem('authToken');
        this.dashboardData = null;
        this.tier = 'freebie';
    }

    async init() {
        if (!this.token) {
            console.error('No auth token found');
            window.location.href = 'sign_in.html';
            return;
        }

        try {
            // Load everything in parallel for speed
            console.log('Starting parallel data loading...');
            const startTime = Date.now();
            
            const [userResult, dashboardResult] = await Promise.all([
                this.loadUserProfile(),
                this.loadDashboardData()
            ]);
            
            const loadTime = Date.now() - startTime;
            console.log(`All data loaded in ${loadTime}ms, rendering dashboard...`);
            
            // Check if we have data
            if (!this.dashboardData) {
                console.error('Dashboard data is null after loading!');
                this.renderEmptyDashboard();
            } else {
                console.log('Dashboard data exists, calling renderDashboard()');
                this.renderDashboard();
            }
            
            // Hide skeleton after rendering is complete
            setTimeout(() => {
                document.body.classList.add('content-loaded');
                console.log('Skeleton hidden, dashboard visible');
            }, 100);
            
        } catch (error) {
            console.error('Dashboard initialization error:', error);
            console.error('Error stack:', error.stack);
            // Hide skeleton and show error state
            document.body.classList.add('content-loaded');
            this.renderErrorState();
        }
    }

    async loadUserProfile() {
        try {
            console.log('Loading user profile...');
            const response = await fetchWithTimeout(`${API_URL}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            }, 3000); // 3 second timeout

            const result = await response.json();
            
            if (result.success) {
                const user = result.user;
                const avatarUrl = user.profilePicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.fullName)}&background=3b82f6&color=fff`;
                
                // Update sidebar
                document.getElementById('sidebarName').textContent = user.fullName;
                document.getElementById('sidebarAvatar').src = avatarUrl;
                
                const roleText = user.role && user.role.length > 0 ? user.role.join(', ') : 'Team Member';
                document.getElementById('sidebarRole').textContent = roleText;
                
                // Update header
                document.getElementById('headerName').textContent = user.fullName;
                document.getElementById('headerAvatar').src = avatarUrl;
                document.getElementById('headerRole').textContent = roleText;
                
                console.log('User profile loaded');
                
                // Load subscription badge in parallel (don't wait)
                this.loadSubscriptionBadge();
            }
        } catch (error) {
            console.error('Error loading user profile:', error);
            // Set defaults on error
            document.getElementById('sidebarName').textContent = 'User';
            document.getElementById('headerName').textContent = 'User';
            document.getElementById('sidebarRole').textContent = 'Team Member';
            document.getElementById('headerRole').textContent = 'Team Member';
        }
    }

    async loadSubscriptionBadge() {
        try {
            const response = await fetchWithTimeout(`${API_URL}/subscription/current`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            }, 3000); // 3 second timeout

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
            console.error('Error loading subscription:', error);
            // Set default on error
            const badge = document.getElementById('subscriptionBadge');
            badge.className = 'mt-2 px-2 py-1 rounded text-xs text-center bg-gray-600 text-gray-200';
            badge.innerHTML = 'Freebie';
        }
    }

    async loadDashboardData() {
        try {
            console.log('Loading dashboard data...');
            const response = await fetchWithTimeout(`${API_URL}/dashboard/data`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            }, 5000); // 5 second timeout

            const result = await response.json();
            console.log('Dashboard data response:', result);
            
            if (result.success) {
                this.dashboardData = result.data;
                this.tier = result.data.tier;
                console.log('Dashboard data loaded:', this.dashboardData);
                console.log('Tier:', this.tier);
                console.log('Connected integrations:', this.dashboardData.connectedIntegrations);
                console.log('Connected integrations count:', this.dashboardData.connectedIntegrations.length);
                console.log('Allowed integrations:', this.dashboardData.allowedIntegrations);
                
                // Log each connected integration
                if (this.dashboardData.connectedIntegrations.length > 0) {
                    this.dashboardData.connectedIntegrations.forEach(int => {
                        console.log(`  - ${int.platform}: username=${int.username}, connectedAt=${int.connectedAt}`);
                    });
                } else {
                    console.warn('âš ï¸ No connected integrations returned from API!');
                }
                
                return result.data;
            } else {
                console.error('Failed to load dashboard data:', result.message);
                return null;
            }
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            // Return empty data structure on error
            this.dashboardData = {
                tier: 'freebie',
                allowedIntegrations: ['discord'],
                connectedIntegrations: [],
                integrationData: {},
                stats: {
                    activeProjects: 0,
                    totalCompleted: 0,
                    teamMembers: 0
                }
            };
            return null;
        }
    }

    renderDashboard() {
        console.log('renderDashboard called, dashboardData:', this.dashboardData);
        
        if (!this.dashboardData) {
            console.log('No dashboard data, showing empty state');
            this.renderEmptyDashboard();
            return;
        }

        console.log('Rendering stats and integrations...');
        this.renderStats();
        this.renderIntegrationSections();
        console.log('Dashboard render complete');
    }

    renderStats() {
        const stats = this.dashboardData.stats;
        
        document.getElementById('activeProjectsCount').textContent = stats.activeProjects;
        document.getElementById('totalCompletedCount').textContent = stats.totalCompleted;
        document.getElementById('teamMembersCount').textContent = stats.teamMembers;
        
        // Update status text
        if (stats.activeProjects > 0) {
            document.getElementById('activeProjectsStatus').textContent = `${stats.activeProjects} active`;
        }
        if (stats.totalCompleted > 0) {
            document.getElementById('totalCompletedStatus').textContent = `${stats.totalCompleted} completed`;
        }
        if (stats.teamMembers > 0) {
            document.getElementById('teamMembersStatus').textContent = `${stats.teamMembers} members`;
        }
    }

    renderIntegrationSections() {
        const container = document.getElementById('integrationSections');
        if (!container) {
            console.error('Integration sections container not found!');
            return;
        }

        console.log('Rendering integration sections...');
        const startTime = Date.now();
        
        // Clear container
        container.innerHTML = '';

        // Use document fragment for better performance
        const fragment = document.createDocumentFragment();

        // Define all possible integrations with proper SVG logos
        const allIntegrations = [
            { 
                platform: 'github', 
                name: 'GitHub', 
                logo: `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clip-rule="evenodd"></path>
                </svg>`,
                premium: true 
            },
            { 
                platform: 'discord', 
                name: 'Discord', 
                logo: `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>`,
                premium: false 
            },
            { 
                platform: 'slack', 
                name: 'Slack', 
                logo: `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.165 0a2.528 2.528 0 012.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.165 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 01-2.52-2.523 2.526 2.526 0 012.52-2.52h6.313A2.527 2.527 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.313z"/>
                </svg>`,
                premium: true 
            },
            { 
                platform: 'notion', 
                name: 'Notion', 
                logo: `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/>
                </svg>`,
                premium: true 
            },
            { 
                platform: 'figma', 
                name: 'Figma', 
                logo: `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.014-4.49-4.49S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.02 3.019 3.02h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V8.981H8.148zM8.172 24c-2.489 0-4.515-2.014-4.515-4.49s2.014-4.49 4.49-4.49h4.588v4.441c0 2.503-2.047 4.539-4.563 4.539zm-.024-7.51a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.365 3.019 3.044 3.019 1.705 0 3.093-1.376 3.093-3.068v-2.97H8.148zm7.704 0h-.098c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h.098c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.49-4.49 4.49zm-.097-7.509c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h.098c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-.098z"/>
                </svg>`,
                premium: true 
            },
            { 
                platform: 'vscode', 
                name: 'VS Code', 
                logo: `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"/>
                </svg>`,
                premium: true 
            }
        ];

        console.log('Total integrations to render:', allIntegrations.length);

        allIntegrations.forEach(integration => {
            const isConnected = this.dashboardData.connectedIntegrations.some(
                ci => ci.platform === integration.platform
            );
            const isAllowed = this.dashboardData.allowedIntegrations.includes(integration.platform);
            const hasData = this.dashboardData.integrationData[integration.platform]?.length > 0;

            console.log(`${integration.name}: connected=${isConnected}, allowed=${isAllowed}, hasData=${hasData}`);

            const section = this.createIntegrationSection(
                integration,
                isConnected,
                isAllowed,
                hasData
            );

            fragment.appendChild(section);
        });

        // Append all at once for better performance
        container.appendChild(fragment);
        
        const renderTime = Date.now() - startTime;
        console.log(`Integration sections rendered in ${renderTime}ms`);
    }

    createIntegrationSection(integration, isConnected, isAllowed, hasData) {
        const section = document.createElement('div');
        section.className = 'bg-white rounded-lg shadow p-6 mb-4';

        if (!isAllowed) {
            // Premium feature for free users
            section.innerHTML = `
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center space-x-3">
                        <div class="text-gray-900">${integration.logo}</div>
                        <div>
                            <h3 class="font-semibold text-gray-900">${integration.name}</h3>
                            <span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Premium</span>
                        </div>
                    </div>
                </div>
                <div class="text-center py-8">
                    <p class="text-gray-600 mb-4">Upgrade to Professional to unlock ${integration.name} integration</p>
                    <a href="pricing.html" class="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition">
                        Upgrade Now
                    </a>
                </div>
            `;
        } else if (!isConnected) {
            // Not connected but allowed
            section.innerHTML = `
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center space-x-3">
                        <div class="text-gray-900">${integration.logo}</div>
                        <h3 class="font-semibold text-gray-900">${integration.name}</h3>
                    </div>
                </div>
                <div class="text-center py-8">
                    <div class="text-gray-400 mb-4">
                        <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
                        </svg>
                    </div>
                    <p class="text-gray-600 mb-4">Connect ${integration.name} to see your ${this.getDataDescription(integration.platform)}</p>
                    <button onclick="window.location.href='settings.html#integrations'" class="bg-[#0a1628] text-white px-6 py-2 rounded-lg hover:bg-[#1a2332] transition">
                        Connect ${integration.name}
                    </button>
                </div>
            `;
        } else if (!hasData) {
            // Connected but no data yet
            section.innerHTML = `
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center space-x-3">
                        <div class="text-gray-900">${integration.logo}</div>
                        <div>
                            <h3 class="font-semibold text-gray-900">${integration.name}</h3>
                            <span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Connected</span>
                        </div>
                    </div>
                    <button onclick="dashboardIntegrations.syncIntegration('${integration.platform}')" class="text-gray-600 hover:text-gray-900">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                    </button>
                </div>
                <div class="text-center py-8">
                    <p class="text-gray-600 mb-4">No data yet. Click sync to fetch your ${integration.name} data.</p>
                    <button onclick="dashboardIntegrations.syncIntegration('${integration.platform}')" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition">
                        Sync Now
                    </button>
                </div>
            `;
        } else {
            // Connected with data
            const data = this.dashboardData.integrationData[integration.platform];
            section.innerHTML = `
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center space-x-3">
                        <div class="text-gray-900">${integration.logo}</div>
                        <div>
                            <h3 class="font-semibold text-gray-900">${integration.name}</h3>
                            <span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Connected</span>
                        </div>
                    </div>
                    <button onclick="dashboardIntegrations.syncIntegration('${integration.platform}')" class="text-gray-600 hover:text-gray-900">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                    </button>
                </div>
                <div class="space-y-2">
                    ${this.renderIntegrationData(integration.platform, data)}
                </div>
                <div class="mt-4 text-center">
                    <a href="settings.html#integrations" class="text-sm text-blue-600 hover:underline">Manage Integration</a>
                </div>
            `;
        }

        return section;
    }

    renderIntegrationData(platform, data) {
        if (!data || data.length === 0) return '<p class="text-gray-500 text-sm">No data available</p>';

        return data.slice(0, 5).map(item => {
            const itemData = item.data;
            const time = new Date(item.lastSynced).toLocaleString();

            switch (platform) {
                case 'github':
                    if (item.dataType === 'repositories') {
                        return `
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded">
                                <div>
                                    <p class="font-medium text-sm">${itemData.name}</p>
                                    <p class="text-xs text-gray-600">${itemData.description || 'No description'}</p>
                                </div>
                                <span class="text-xs text-gray-500">â­ ${itemData.stars || 0}</span>
                            </div>
                        `;
                    } else if (item.dataType === 'commits') {
                        return `
                            <div class="flex items-center space-x-3 p-3 bg-gray-50 rounded">
                                <div class="flex-1">
                                    <p class="text-sm">${itemData.message}</p>
                                    <p class="text-xs text-gray-600">${itemData.author} â€¢ ${time}</p>
                                </div>
                            </div>
                        `;
                    }
                    break;

                case 'discord':
                    if (item.dataType === 'messages') {
                        return `
                            <div class="flex items-start space-x-3 p-3 bg-gray-50 rounded">
                                <div class="flex-1">
                                    <p class="text-sm font-medium">${itemData.author}</p>
                                    <p class="text-sm text-gray-700">${itemData.content}</p>
                                    <p class="text-xs text-gray-500">#${itemData.channel} â€¢ ${time}</p>
                                </div>
                            </div>
                        `;
                    }
                    break;

                case 'slack':
                    if (item.dataType === 'messages') {
                        return `
                            <div class="flex items-start space-x-3 p-3 bg-gray-50 rounded">
                                <div class="flex-1">
                                    <p class="text-sm font-medium">${itemData.user}</p>
                                    <p class="text-sm text-gray-700">${itemData.text}</p>
                                    <p class="text-xs text-gray-500">#${itemData.channel} â€¢ ${time}</p>
                                </div>
                            </div>
                        `;
                    }
                    break;

                case 'notion':
                    if (item.dataType === 'pages') {
                        return `
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded">
                                <div>
                                    <p class="font-medium text-sm">${itemData.title}</p>
                                    <p class="text-xs text-gray-600">Last edited: ${time}</p>
                                </div>
                            </div>
                        `;
                    }
                    break;

                case 'figma':
                    if (item.dataType === 'files') {
                        return `
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded">
                                <div>
                                    <p class="font-medium text-sm">${itemData.name}</p>
                                    <p class="text-xs text-gray-600">Modified: ${time}</p>
                                </div>
                            </div>
                        `;
                    }
                    break;

                case 'vscode':
                    if (item.dataType === 'recent') {
                        return `
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded">
                                <div>
                                    <p class="font-medium text-sm">${itemData.file}</p>
                                    <p class="text-xs text-gray-600">${itemData.workspace}</p>
                                </div>
                            </div>
                        `;
                    }
                    break;
            }

            return '';
        }).join('');
    }

    getDataDescription(platform) {
        const descriptions = {
            github: 'repositories, commits, and pull requests',
            discord: 'server activity and messages',
            slack: 'workspace messages and channels',
            notion: 'pages, databases, and tasks',
            figma: 'designs, prototypes, and files',
            vscode: 'recent files and workspace activity'
        };
        return descriptions[platform] || 'data';
    }

    async syncIntegration(platform) {
        try {
            const response = await fetch(`${API_URL}/dashboard/sync/${platform}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const result = await response.json();
            
            if (result.success) {
                alert(`${platform} synced successfully! Refreshing dashboard...`);
                await this.loadDashboardData();
                this.renderDashboard();
            } else {
                alert(`Failed to sync ${platform}: ${result.message}`);
            }
        } catch (error) {
            console.error('Sync error:', error);
            alert(`Error syncing ${platform}`);
        }
    }

    renderEmptyDashboard() {
        console.log('renderEmptyDashboard called');
        const container = document.getElementById('integrationSections');
        if (container) {
            container.innerHTML = `
                <div class="bg-white rounded-lg shadow p-8 text-center">
                    <div class="text-gray-400 mb-4">
                        <svg class="w-20 h-20 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                        </svg>
                    </div>
                    <h3 class="text-xl font-semibold text-gray-900 mb-2">Connect Your Tools</h3>
                    <p class="text-gray-600 mb-6">Connect your favorite tools to see all your work in one place</p>
                    <a href="settings.html#integrations" class="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition">
                        Connect Integrations
                    </a>
                </div>
            `;
        } else {
            console.error('integrationSections container not found in renderEmptyDashboard');
        }
    }

    renderErrorState() {
        const container = document.getElementById('integrationSections');
        if (container) {
            container.innerHTML = `
                <div class="bg-white rounded-lg shadow p-8 text-center">
                    <div class="text-red-400 mb-4">
                        <svg class="w-20 h-20 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                    <h3 class="text-xl font-semibold text-gray-900 mb-2">Unable to Load Dashboard</h3>
                    <p class="text-gray-600 mb-6">There was an error loading your dashboard data. Please try refreshing the page.</p>
                    <button onclick="location.reload()" class="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition">
                        Refresh Page
                    </button>
                </div>
            `;
        }
    }
}

// Initialize dashboard integrations
let dashboardIntegrations;
document.addEventListener('DOMContentLoaded', () => {
    dashboardIntegrations = new DashboardIntegrations();
    dashboardIntegrations.init();
    
    // Safety timeout: if integrations still showing loading after 10 seconds, show error
    setTimeout(() => {
        const container = document.getElementById('integrationSections');
        if (container && container.innerHTML.includes('Loading your integrations')) {
            console.error('TIMEOUT: Integrations still loading after 10 seconds!');
            console.error('Dashboard data:', dashboardIntegrations.dashboardData);
            container.innerHTML = `
                <div class="bg-white rounded-lg shadow p-8 text-center">
                    <div class="text-red-400 mb-4">
                        <svg class="w-20 h-20 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                    <h3 class="text-xl font-semibold text-gray-900 mb-2">Loading Timeout</h3>
                    <p class="text-gray-600 mb-4">Dashboard took too long to load. Check console for errors.</p>
                    <button onclick="location.reload()" class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition">
                        Refresh Page
                    </button>
                </div>
            `;
        }
    }, 10000);
});
