// Source Code Page - Load from GitHub Repositories
const API_URL = 'http://localhost:3000/api';
const token = localStorage.getItem('authToken');

class SourceCodeManager {
    constructor() {
        this.repositories = [];
        this.filteredRepos = [];
        
        if (!token) {
            window.location.href = 'sign_in.html';
            return;
        }

        this.init();
    }

    async init() {
        await this.loadUserData();
        await this.loadRepositories();
        this.setupEventListeners();
    }

    async loadUserData() {
        try {
            const result = await api.getCurrentUser(token);
            
            if (result.success) {
                const user = result.user;
                const avatarUrl = user.profilePicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.fullName)}&background=3b82f6&color=fff`;
                
                document.getElementById('sidebarName').textContent = user.fullName;
                document.getElementById('headerName').textContent = user.fullName;
                document.getElementById('sidebarAvatar').src = avatarUrl;
                document.getElementById('headerAvatar').src = avatarUrl;
                
                await this.loadSubscription();
            } else {
                window.location.href = 'sign_in.html';
            }
        } catch (error) {
            console.error('Error:', error);
            window.location.href = 'sign_in.html';
        }
    }

    async loadSubscription() {
        try {
            const response = await fetch(`${API_URL}/subscription/current`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
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
            console.error('Error loading subscription:', error);
        }
    }

    async loadRepositories() {
        try {
            // Check if GitHub is connected
            const response = await fetch(`${API_URL}/integrations`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();
            
            if (data.success) {
                const githubIntegration = data.integrations.find(i => i.provider === 'github' && i.isActive);
                
                if (githubIntegration) {
                    // Fetch GitHub repositories
                    await this.fetchGitHubRepositories();
                } else {
                    this.showNoIntegrationMessage();
                }
            }
        } catch (error) {
            console.error('Error loading repositories:', error);
            this.showErrorMessage();
        } finally {
            // Hide skeleton
            setTimeout(() => {
                document.body.classList.add('content-loaded');
            }, 300);
        }
    }

    async fetchGitHubRepositories() {
        try {
            // Get GitHub data from dashboard API
            const response = await fetch(`${API_URL}/dashboard/data/github`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();
            
            if (data.success && data.data && data.data.repositories) {
                this.repositories = data.data.repositories;
                this.filteredRepos = [...this.repositories];
                this.renderRepositories();
            } else {
                this.showNoDataMessage();
            }
        } catch (error) {
            console.error('Error fetching GitHub repositories:', error);
            this.showNoDataMessage();
        }
    }

    renderRepositories() {
        const container = document.querySelector('.grid.grid-cols-2');
        
        if (this.filteredRepos.length === 0) {
            container.innerHTML = `
                <div class="col-span-2 text-center py-12">
                    <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                    </svg>
                    <p class="text-lg font-medium text-gray-900">No repositories found</p>
                    <p class="mt-2 text-gray-600">Create repositories in GitHub to see them here</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.filteredRepos.map(repo => this.createRepoCard(repo)).join('');
        
        // Update pagination
        this.updatePagination();
    }

    createRepoCard(repo) {
        const language = repo.language || 'Unknown';
        const languageColors = {
            'TypeScript': { bg: 'bg-blue-100', text: 'text-blue-700', icon: 'text-blue-600' },
            'JavaScript': { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: 'text-yellow-600' },
            'Python': { bg: 'bg-green-100', text: 'text-green-700', icon: 'text-green-600' },
            'Go': { bg: 'bg-cyan-100', text: 'text-cyan-700', icon: 'text-cyan-600' },
            'Java': { bg: 'bg-red-100', text: 'text-red-700', icon: 'text-red-600' },
            'Ruby': { bg: 'bg-pink-100', text: 'text-pink-700', icon: 'text-pink-600' },
            'PHP': { bg: 'bg-purple-100', text: 'text-purple-700', icon: 'text-purple-600' },
            'C++': { bg: 'bg-indigo-100', text: 'text-indigo-700', icon: 'text-indigo-600' },
            'C#': { bg: 'bg-violet-100', text: 'text-violet-700', icon: 'text-violet-600' },
            'HTML': { bg: 'bg-orange-100', text: 'text-orange-700', icon: 'text-orange-600' },
            'CSS': { bg: 'bg-blue-100', text: 'text-blue-700', icon: 'text-blue-600' },
            'Markdown': { bg: 'bg-gray-200', text: 'text-gray-700', icon: 'text-gray-600' }
        };

        const colors = languageColors[language] || { bg: 'bg-gray-100', text: 'text-gray-700', icon: 'text-gray-600' };

        const updatedAt = new Date(repo.updated_at || repo.pushed_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        const timeAgo = this.getTimeAgo(repo.updated_at || repo.pushed_at);

        return `
            <div class="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 ${colors.bg} rounded-lg flex items-center justify-center">
                            <svg class="w-6 h-6 ${colors.icon}" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"></path>
                            </svg>
                        </div>
                        <div>
                            <h3 class="font-semibold text-gray-900">
                                <a href="${repo.html_url}" target="_blank" class="hover:text-blue-600">
                                    ${repo.name}
                                </a>
                            </h3>
                            <span class="inline-block mt-1 px-2 py-1 ${colors.bg} ${colors.text} text-xs font-medium rounded uppercase">
                                ${language}
                            </span>
                        </div>
                    </div>
                    <a href="${repo.html_url}" target="_blank" class="p-2 hover:bg-gray-100 rounded transition">
                        <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                        </svg>
                    </a>
                </div>
                ${repo.description ? `<p class="text-sm text-gray-600 mb-4 line-clamp-2">${repo.description}</p>` : ''}
                <div class="flex items-center justify-between text-sm text-gray-500">
                    <div class="flex items-center space-x-4">
                        <span class="flex items-center">
                            <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
                            </svg>
                            ${repo.open_issues_count || 0} issues
                        </span>
                        <span class="flex items-center">
                            <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
                            </svg>
                            ${repo.stargazers_count || 0}
                        </span>
                        <span>Updated ${timeAgo}</span>
                    </div>
                    ${repo.private ? '<span class="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">Private</span>' : ''}
                </div>
            </div>
        `;
    }

    getTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
        if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`;
        return `${Math.floor(seconds / 31536000)}y ago`;
    }

    updatePagination() {
        const totalRepos = this.repositories.length;
        const showing = this.filteredRepos.length;
        
        const paginationText = document.querySelector('.text-sm.text-gray-600');
        if (paginationText) {
            paginationText.innerHTML = `Showing <span class="font-semibold">${showing}</span> of <span class="font-semibold">${totalRepos}</span> repositories`;
        }
    }

    showNoIntegrationMessage() {
        const container = document.querySelector('.grid.grid-cols-2');
        container.innerHTML = `
            <div class="col-span-2 text-center py-12">
                <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                </svg>
                <p class="text-lg font-medium text-gray-900">GitHub Not Connected</p>
                <p class="mt-2 text-gray-600">Connect your GitHub account to see your repositories</p>
                <a href="settings.html" class="mt-4 inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Connect GitHub
                </a>
            </div>
        `;
    }

    showNoDataMessage() {
        const container = document.querySelector('.grid.grid-cols-2');
        container.innerHTML = `
            <div class="col-span-2 text-center py-12">
                <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                </svg>
                <p class="text-lg font-medium text-gray-900">No repositories found</p>
                <p class="mt-2 text-gray-600">Create repositories in GitHub to see them here</p>
            </div>
        `;
    }

    showErrorMessage() {
        const container = document.querySelector('.grid.grid-cols-2');
        container.innerHTML = `
            <div class="col-span-2 text-center py-12">
                <svg class="w-16 h-16 mx-auto mb-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="text-lg font-medium text-gray-900">Error loading repositories</p>
                <p class="mt-2 text-gray-600">Please try refreshing the page</p>
            </div>
        `;
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.querySelector('input[placeholder="Search Source Code..."]');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterRepositories(e.target.value);
            });
        }

        // Language filter
        const languageFilter = document.querySelector('select[class*="All Languages"]');
        if (languageFilter) {
            languageFilter.addEventListener('change', (e) => {
                this.filterByLanguage(e.target.value);
            });
        }
    }

    filterRepositories(searchTerm) {
        this.filteredRepos = this.repositories.filter(repo => 
            repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (repo.description && repo.description.toLowerCase().includes(searchTerm.toLowerCase()))
        );
        
        this.renderRepositories();
    }

    filterByLanguage(language) {
        if (language === 'All Languages') {
            this.filteredRepos = [...this.repositories];
        } else {
            this.filteredRepos = this.repositories.filter(repo => 
                repo.language === language
            );
        }
        
        this.renderRepositories();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new SourceCodeManager();
});
