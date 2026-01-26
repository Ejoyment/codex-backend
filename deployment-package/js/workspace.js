// Workspace Management
const API_URL = 'https://codexincenterprise.online/api';

class WorkspaceManager {
    constructor() {
        this.token = localStorage.getItem('authToken');
        this.currentCompany = null;
        this.currentTab = 'overview';
    }

    async init() {
        if (!this.token) {
            window.location.href = 'sign_in.html';
            return;
        }

        await this.loadUserProfile();
        await this.loadCompanies();
        
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

    async loadCompanies() {
        try {
            const response = await fetch(`${API_URL}/company/my-companies`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const result = await response.json();
            
            if (result.success) {
                const selector = document.getElementById('companySelector');
                selector.innerHTML = '<option value="">Select Workspace...</option>';
                
                result.companies.forEach(company => {
                    const option = document.createElement('option');
                    option.value = company.id;
                    option.textContent = `${company.name} (${company.userRole})`;
                    selector.appendChild(option);
                });
                
                // Auto-select if only one company
                if (result.companies.length === 1) {
                    selector.value = result.companies[0].id;
                    this.selectCompany(result.companies[0].id);
                } else if (result.companies.length === 0) {
                    document.getElementById('noCompanyState').classList.remove('hidden');
                    document.getElementById('workspaceContent').classList.add('hidden');
                }
                
                selector.addEventListener('change', (e) => {
                    if (e.target.value) {
                        this.selectCompany(e.target.value);
                    }
                });
            }
        } catch (error) {
            console.error('Load companies error:', error);
        }
    }

    async selectCompany(companyId) {
        try {
            const response = await fetch(`${API_URL}/company/${companyId}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const result = await response.json();
            
            if (result.success) {
                this.currentCompany = result.company;
                this.displayCompany();
                await this.loadCompanyData();
            }
        } catch (error) {
            console.error('Select company error:', error);
        }
    }

    displayCompany() {
        document.getElementById('noCompanyState').classList.add('hidden');
        document.getElementById('workspaceContent').classList.remove('hidden');
        
        const company = this.currentCompany;
        document.getElementById('companyName').textContent = company.name;
        document.getElementById('companyDescription').textContent = company.description || 'No description';
        document.getElementById('memberCount').textContent = `${company.members.length} members`;
        document.getElementById('companyTier').textContent = company.subscription.tier.charAt(0).toUpperCase() + company.subscription.tier.slice(1);
        
        // Update logo
        const logoEl = document.getElementById('companyLogo');
        if (company.logo) {
            logoEl.innerHTML = `<img src="${company.logo}" class="w-full h-full object-cover rounded-lg">`;
        } else {
            logoEl.textContent = company.name.charAt(0).toUpperCase();
        }
        
        // Update stats
        document.getElementById('statsProjects').textContent = company.stats.totalProjects;
        document.getElementById('statsTasks').textContent = company.stats.totalTasks;
        document.getElementById('statsCompleted').textContent = company.stats.completedTasks;
        document.getElementById('statsMeetings').textContent = company.stats.totalMeetings;
    }

    async loadCompanyData() {
        await Promise.all([
            this.loadActivity(),
            this.loadProjects(),
            this.loadTasks(),
            this.loadMeetings(),
            this.loadMembers()
        ]);
    }

    async loadActivity() {
        try {
            const response = await fetch(`${API_URL}/collaboration/${this.currentCompany.id}/activity`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const result = await response.json();
            
            if (result.success && result.activities.length > 0) {
                const feed = document.getElementById('activityFeed');
                feed.innerHTML = result.activities.slice(0, 5).map(activity => `
                    <div class="flex items-start space-x-3">
                        <img src="${activity.user.profilePicture || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(activity.user.fullName)}" class="w-8 h-8 rounded-full">
                        <div class="flex-1">
                            <p class="text-sm text-gray-900">${activity.action}</p>
                            <p class="text-xs text-gray-500">${new Date(activity.createdAt).toLocaleString()}</p>
                        </div>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Load activity error:', error);
        }
    }

    async loadProjects() {
        try {
            const response = await fetch(`${API_URL}/collaboration/${this.currentCompany.id}/projects`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const result = await response.json();
            
            if (result.success) {
                const list = document.getElementById('projectsList');
                if (result.projects.length === 0) {
                    list.innerHTML = '<p class="text-gray-500 text-sm col-span-3">No projects yet</p>';
                } else {
                    list.innerHTML = result.projects.map(project => `
                        <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="font-semibold text-gray-900">${project.name}</h4>
                                <span class="px-2 py-1 text-xs rounded ${this.getStatusColor(project.status)}">${project.status}</span>
                            </div>
                            <p class="text-sm text-gray-600 mb-3">${project.description || 'No description'}</p>
                            <div class="flex items-center justify-between text-xs text-gray-500">
                                <span>${project.members.length} members</span>
                                <span>${project.progress}% complete</span>
                            </div>
                        </div>
                    `).join('');
                }
            }
        } catch (error) {
            console.error('Load projects error:', error);
        }
    }

    async loadTasks() {
        try {
            const response = await fetch(`${API_URL}/collaboration/${this.currentCompany.id}/tasks`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const result = await response.json();
            
            if (result.success) {
                const list = document.getElementById('tasksList');
                if (result.tasks.length === 0) {
                    list.innerHTML = '<p class="text-gray-500 text-sm">No tasks yet</p>';
                } else {
                    list.innerHTML = result.tasks.map(task => `
                        <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                            <div class="flex items-center justify-between">
                                <div class="flex-1">
                                    <div class="flex items-center space-x-2 mb-1">
                                        <h4 class="font-semibold text-gray-900">${task.title}</h4>
                                        <span class="px-2 py-1 text-xs rounded ${this.getStatusColor(task.status)}">${task.status}</span>
                                        <span class="px-2 py-1 text-xs rounded ${this.getPriorityColor(task.priority)}">${task.priority}</span>
                                    </div>
                                    <p class="text-sm text-gray-600">${task.description || 'No description'}</p>
                                    <div class="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                                        ${task.assignedTo ? `<span>Assigned to: ${task.assignedTo.fullName}</span>` : '<span>Unassigned</span>'}
                                        ${task.dueDate ? `<span>Due: ${new Date(task.dueDate).toLocaleDateString()}</span>` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('');
                }
            }
        } catch (error) {
            console.error('Load tasks error:', error);
        }
    }

    async loadMeetings() {
        try {
            const response = await fetch(`${API_URL}/collaboration/${this.currentCompany.id}/meetings`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const result = await response.json();
            
            if (result.success) {
                const list = document.getElementById('meetingsList');
                const upcomingList = document.getElementById('upcomingMeetings');
                
                if (result.meetings.length === 0) {
                    list.innerHTML = '<p class="text-gray-500 text-sm">No meetings scheduled</p>';
                    upcomingList.innerHTML = '<p class="text-gray-500 text-sm">No upcoming meetings</p>';
                } else {
                    const upcoming = result.meetings.filter(m => new Date(m.scheduledAt) > new Date() && m.status === 'scheduled').slice(0, 3);
                    
                    list.innerHTML = result.meetings.map(meeting => `
                        <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="font-semibold text-gray-900">${meeting.title}</h4>
                                <span class="px-2 py-1 text-xs rounded ${this.getStatusColor(meeting.status)}">${meeting.status}</span>
                            </div>
                            <p class="text-sm text-gray-600 mb-2">${meeting.description || 'No description'}</p>
                            <div class="flex items-center justify-between text-xs text-gray-500">
                                <span>${new Date(meeting.scheduledAt).toLocaleString()}</span>
                                <span>${meeting.duration} min</span>
                                <span>${meeting.participants.length} participants</span>
                            </div>
                        </div>
                    `).join('');
                    
                    if (upcoming.length > 0) {
                        upcomingList.innerHTML = upcoming.map(meeting => `
                            <div class="flex items-start space-x-3">
                                <div class="w-10 h-10 bg-blue-100 rounded flex items-center justify-center text-blue-600 font-semibold text-sm">
                                    ${new Date(meeting.scheduledAt).getDate()}
                                </div>
                                <div class="flex-1">
                                    <p class="text-sm font-medium text-gray-900">${meeting.title}</p>
                                    <p class="text-xs text-gray-500">${new Date(meeting.scheduledAt).toLocaleString()}</p>
                                </div>
                            </div>
                        `).join('');
                    }
                }
            }
        } catch (error) {
            console.error('Load meetings error:', error);
        }
    }

    async loadMembers() {
        const list = document.getElementById('membersList');
        const members = this.currentCompany.members;
        
        list.innerHTML = members.map(member => `
            <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                <div class="flex items-center space-x-3">
                    <img src="${member.user.profilePicture || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(member.user.fullName)}" class="w-12 h-12 rounded-full">
                    <div class="flex-1">
                        <h4 class="font-semibold text-gray-900">${member.user.fullName}</h4>
                        <p class="text-sm text-gray-600">${member.user.email}</p>
                        <span class="inline-block mt-1 px-2 py-1 text-xs rounded ${this.getRoleColor(member.role)}">${member.role}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    getStatusColor(status) {
        const colors = {
            'planning': 'bg-gray-100 text-gray-800',
            'active': 'bg-blue-100 text-blue-800',
            'in-progress': 'bg-blue-100 text-blue-800',
            'review': 'bg-yellow-100 text-yellow-800',
            'completed': 'bg-green-100 text-green-800',
            'done': 'bg-green-100 text-green-800',
            'scheduled': 'bg-purple-100 text-purple-800',
            'todo': 'bg-gray-100 text-gray-800',
            'blocked': 'bg-red-100 text-red-800'
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    }

    getPriorityColor(priority) {
        const colors = {
            'low': 'bg-green-100 text-green-800',
            'medium': 'bg-yellow-100 text-yellow-800',
            'high': 'bg-orange-100 text-orange-800',
            'urgent': 'bg-red-100 text-red-800'
        };
        return colors[priority] || 'bg-gray-100 text-gray-800';
    }

    getRoleColor(role) {
        const colors = {
            'owner': 'bg-purple-100 text-purple-800',
            'admin': 'bg-blue-100 text-blue-800',
            'member': 'bg-green-100 text-green-800',
            'viewer': 'bg-gray-100 text-gray-800'
        };
        return colors[role] || 'bg-gray-100 text-gray-800';
    }
}

// Tab switching
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.workspace-tab').forEach(tab => {
        tab.classList.remove('active', 'border-blue-600', 'text-blue-600');
        tab.classList.add('border-transparent', 'text-gray-500');
    });
    event.target.classList.add('active', 'border-blue-600', 'text-blue-600');
    event.target.classList.remove('border-transparent', 'text-gray-500');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    document.getElementById(`${tabName}Tab`).classList.remove('hidden');
}

// Modal functions
function showCreateCompanyModal() {
    const modal = `
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-lg p-8 max-w-md w-full mx-4">
                <h3 class="text-xl font-bold text-gray-900 mb-6">Create Workspace</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Workspace Name</label>
                        <input type="text" id="companyName" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Description</label>
                        <textarea id="companyDescription" rows="3" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
                    </div>
                </div>
                <div class="flex space-x-3 mt-6">
                    <button onclick="closeModal()" class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition">
                        Cancel
                    </button>
                    <button onclick="createCompany()" class="flex-1 px-4 py-2 bg-[#0a1628] text-white rounded-lg hover:bg-[#1a2332] transition">
                        Create
                    </button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('modalContainer').innerHTML = modal;
}

async function createCompany() {
    const name = document.getElementById('companyName').value.trim();
    const description = document.getElementById('companyDescription').value.trim();
    
    if (!name || name.length === 0) {
        alert('Please enter a workspace name');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/company/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${workspaceManager.token}`
            },
            body: JSON.stringify({ name, description })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('Workspace created successfully!');
            closeModal();
            location.reload();
        } else {
            // Show the actual error message from the server
            alert(`Error: ${result.message || 'Failed to create workspace'}`);
        }
    } catch (error) {
        console.error('Create company error:', error);
        alert(`Failed to create workspace: ${error.message}`);
    }
}

function showInviteMemberModal() {
    const modal = `
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-lg p-8 max-w-md w-full mx-4">
                <h3 class="text-xl font-bold text-gray-900 mb-6">Invite Team Member</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                        <input type="email" id="memberEmail" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Role</label>
                        <select id="memberRole" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                            <option value="viewer">Viewer</option>
                        </select>
                    </div>
                </div>
                <div class="flex space-x-3 mt-6">
                    <button onclick="closeModal()" class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition">
                        Cancel
                    </button>
                    <button onclick="inviteMember()" class="flex-1 px-4 py-2 bg-[#0a1628] text-white rounded-lg hover:bg-[#1a2332] transition">
                        Invite
                    </button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('modalContainer').innerHTML = modal;
}

async function inviteMember() {
    const email = document.getElementById('memberEmail').value;
    const role = document.getElementById('memberRole').value;
    
    if (!email) {
        alert('Please enter an email address');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/company/${workspaceManager.currentCompany.id}/invite`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${workspaceManager.token}`
            },
            body: JSON.stringify({ email, role })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('Member invited successfully!');
            closeModal();
            workspaceManager.selectCompany(workspaceManager.currentCompany.id);
        } else {
            alert(result.message || 'Failed to invite member');
        }
    } catch (error) {
        console.error('Invite member error:', error);
        alert('Failed to invite member');
    }
}

function closeModal() {
    document.getElementById('modalContainer').innerHTML = '';
}

function showJoinCompanyModal() {
    alert('Join workspace feature coming soon! Ask your team admin to invite you via email.');
}

function showCreateProjectModal() {
    alert('Create project modal - Coming soon!');
}

function showCreateTaskModal() {
    alert('Create task modal - Coming soon!');
}

function showScheduleMeetingModal() {
    alert('Schedule meeting modal - Coming soon!');
}

function showCompanySettings() {
    alert('Company settings - Coming soon!');
}

function sendMessage() {
    alert('Chat feature - Coming soon!');
}

// Initialize
let workspaceManager;
document.addEventListener('DOMContentLoaded', () => {
    workspaceManager = new WorkspaceManager();
    workspaceManager.init();
});
