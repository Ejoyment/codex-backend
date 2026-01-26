// Tasks Page - Load from GitHub Issues
const API_URL = 'https://codexincenterprise.online/api';
const token = localStorage.getItem('authToken');

class TasksManager {
    constructor() {
        this.tasks = [];
        this.currentRepo = null;
        
        if (!token) {
            window.location.href = 'sign_in.html';
            return;
        }

        this.init();
    }

    async init() {
        await this.loadUserData();
        await this.loadTasks();
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

    async loadTasks() {
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
                    // Fetch GitHub issues as tasks
                    await this.fetchGitHubIssues();
                } else {
                    this.showNoIntegrationMessage();
                }
            }
        } catch (error) {
            console.error('Error loading tasks:', error);
            this.showErrorMessage();
        } finally {
            // Hide skeleton
            setTimeout(() => {
                document.body.classList.add('content-loaded');
            }, 300);
        }
    }

    async fetchGitHubIssues() {
        try {
            // Get GitHub data from dashboard API
            const response = await fetch(`${API_URL}/dashboard/data/github`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();
            
            if (data.success && data.data) {
                // Convert GitHub issues to tasks
                this.tasks = this.convertIssuesToTasks(data.data);
                this.renderTasks();
            } else {
                this.showNoDataMessage();
            }
        } catch (error) {
            console.error('Error fetching GitHub issues:', error);
            this.showNoDataMessage();
        }
    }

    convertIssuesToTasks(githubData) {
        const tasks = [];
        
        // Extract issues from GitHub data
        if (githubData.issues && Array.isArray(githubData.issues)) {
            githubData.issues.forEach(issue => {
                tasks.push({
                    id: issue.id || issue.number,
                    name: issue.title,
                    assignee: issue.assignee || issue.user || 'Unassigned',
                    priority: this.determinePriority(issue.labels),
                    status: issue.state === 'open' ? 'In Progress' : 'Completed',
                    dueDate: issue.due_date || issue.updated_at || new Date().toISOString(),
                    completed: issue.state === 'closed',
                    url: issue.html_url
                });
            });
        }

        // If no issues, create sample tasks from repos
        if (tasks.length === 0 && githubData.repositories) {
            githubData.repositories.slice(0, 10).forEach((repo, index) => {
                tasks.push({
                    id: `repo-${index}`,
                    name: `Review ${repo.name}`,
                    assignee: repo.owner || 'You',
                    priority: 'Medium',
                    status: 'Pending',
                    dueDate: repo.updated_at || new Date().toISOString(),
                    completed: false,
                    url: repo.html_url
                });
            });
        }

        return tasks;
    }

    determinePriority(labels) {
        if (!labels || !Array.isArray(labels)) return 'Medium';
        
        const labelNames = labels.map(l => (typeof l === 'string' ? l : l.name).toLowerCase());
        
        if (labelNames.some(l => l.includes('critical') || l.includes('urgent') || l.includes('high'))) {
            return 'High';
        } else if (labelNames.some(l => l.includes('low') || l.includes('minor'))) {
            return 'Low';
        }
        
        return 'Medium';
    }

    renderTasks() {
        const tbody = document.querySelector('tbody');
        
        if (this.tasks.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-6 py-12 text-center text-gray-500">
                        <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                        </svg>
                        <p class="text-lg font-medium">No tasks found</p>
                        <p class="mt-2">Connect GitHub and create issues to see tasks here</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.tasks.map(task => this.createTaskRow(task)).join('');
    }

    createTaskRow(task) {
        const priorityColors = {
            'High': 'bg-red-100 text-red-700',
            'Medium': 'bg-yellow-100 text-yellow-700',
            'Low': 'bg-green-100 text-green-700'
        };

        const statusColors = {
            'Completed': 'bg-green-100 text-green-700',
            'In Progress': 'bg-blue-100 text-blue-700',
            'Pending': 'bg-gray-200 text-gray-700'
        };

        const assigneeName = typeof task.assignee === 'string' ? task.assignee : (task.assignee?.login || 'Unassigned');
        const avatarUrl = typeof task.assignee === 'object' && task.assignee?.avatar_url 
            ? task.assignee.avatar_url 
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(assigneeName)}&background=f59e0b&color=fff`;

        const dueDate = new Date(task.dueDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        return `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4">
                    <input type="checkbox" ${task.completed ? 'checked' : ''} class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500">
                </td>
                <td class="px-6 py-4">
                    <a href="${task.url || '#'}" target="_blank" class="text-sm text-gray-900 hover:text-blue-600">
                        ${task.name}
                    </a>
                </td>
                <td class="px-6 py-4">
                    <img class="w-8 h-8 rounded-full" src="${avatarUrl}" alt="${assigneeName}">
                </td>
                <td class="px-6 py-4">
                    <span class="px-3 py-1 ${priorityColors[task.priority]} text-xs font-medium rounded-full">${task.priority}</span>
                </td>
                <td class="px-6 py-4">
                    <span class="px-3 py-1 ${statusColors[task.status]} text-xs font-medium rounded-full">${task.status}</span>
                </td>
                <td class="px-6 py-4 text-sm text-gray-600">${dueDate}</td>
                <td class="px-6 py-4">
                    <button class="text-gray-400 hover:text-gray-600">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }

    showNoIntegrationMessage() {
        const tbody = document.querySelector('tbody');
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-12 text-center">
                    <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                    </svg>
                    <p class="text-lg font-medium text-gray-900">GitHub Not Connected</p>
                    <p class="mt-2 text-gray-600">Connect your GitHub account to see tasks from your repositories</p>
                    <a href="settings.html" class="mt-4 inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        Connect GitHub
                    </a>
                </td>
            </tr>
        `;
    }

    showNoDataMessage() {
        const tbody = document.querySelector('tbody');
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-12 text-center text-gray-500">
                    <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                    </svg>
                    <p class="text-lg font-medium">No tasks available</p>
                    <p class="mt-2">Create issues in your GitHub repositories to see them here</p>
                </td>
            </tr>
        `;
    }

    showErrorMessage() {
        const tbody = document.querySelector('tbody');
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-12 text-center text-red-600">
                    <svg class="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p class="text-lg font-medium">Error loading tasks</p>
                    <p class="mt-2">Please try refreshing the page</p>
                </td>
            </tr>
        `;
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.querySelector('input[placeholder="Search Tasks..."]');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterTasks(e.target.value);
            });
        }
    }

    filterTasks(searchTerm) {
        const filteredTasks = this.tasks.filter(task => 
            task.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        const tbody = document.querySelector('tbody');
        if (filteredTasks.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-6 py-8 text-center text-gray-500">
                        No tasks match your search
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = filteredTasks.map(task => this.createTaskRow(task)).join('');
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new TasksManager();
});
