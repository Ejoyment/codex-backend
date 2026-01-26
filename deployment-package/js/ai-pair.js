// AI Pair Programming Frontend
const API_URL = 'https://codexincenterprise.online/api';
const token = localStorage.getItem('authToken');

class AIPairProgramming {
    constructor() {
        this.currentSession = null;
        this.currentRepo = null;
        this.currentFile = null;
        this.files = [];
        this.messages = [];
        
        if (!token) {
            window.location.href = 'sign_in.html';
            return;
        }

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadRepositories();
        await this.loadAIUsage();
        this.setupKeyboardShortcuts();
    }

    setupEventListeners() {
        // Repository selector
        document.getElementById('repoSelector').addEventListener('change', (e) => {
            if (e.target.value) {
                this.selectRepository(e.target.value);
            }
        });

        // File refresh
        document.getElementById('refreshFiles').addEventListener('click', () => {
            if (this.currentRepo) {
                this.loadFiles();
            }
        });

        // Send message
        document.getElementById('sendMessage').addEventListener('click', () => {
            this.sendMessage();
        });

        // Chat input
        const chatInput = document.getElementById('chatInput');
        chatInput.addEventListener('input', (e) => {
            const count = e.target.value.length;
            document.getElementById('charCount').textContent = `${count}/2000`;
        });

        // Save file
        document.getElementById('saveFile').addEventListener('click', () => {
            this.saveCurrentFile();
        });

        // Code editor changes
        document.getElementById('codeEditor').addEventListener('input', () => {
            document.getElementById('saveFile').classList.remove('hidden');
        });
    }

    setupKeyboardShortcuts() {
        document.getElementById('chatInput').addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.sendMessage();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveCurrentFile();
            }
        });
    }

    showLoading(text = 'Loading...') {
        document.getElementById('loadingText').textContent = text;
        document.getElementById('loadingOverlay').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }

    async loadRepositories() {
        try {
            this.showLoading('Loading repositories...');
            
            const response = await fetch(`${API_URL}/ai-pair/repos`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (data.success) {
                const selector = document.getElementById('repoSelector');
                selector.innerHTML = '<option value="">Select Repository...</option>';
                
                data.repositories.forEach(repo => {
                    const option = document.createElement('option');
                    option.value = JSON.stringify({
                        id: repo.id,
                        name: repo.name,
                        owner: repo.owner,
                        fullName: repo.fullName,
                        defaultBranch: repo.defaultBranch
                    });
                    option.textContent = repo.fullName;
                    selector.appendChild(option);
                });
            } else {
                this.showError(data.message);
            }
        } catch (error) {
            console.error('Load repos error:', error);
            this.showError('Failed to load repositories. Make sure GitHub is connected.');
        } finally {
            this.hideLoading();
        }
    }

    async selectRepository(repoJson) {
        try {
            this.currentRepo = JSON.parse(repoJson);
            this.showLoading('Creating session...');

            // Create new session
            const response = await fetch(`${API_URL}/ai-pair/session`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    repositoryId: this.currentRepo.id.toString(),
                    repositoryName: this.currentRepo.name,
                    repositoryOwner: this.currentRepo.owner,
                    branch: this.currentRepo.defaultBranch,
                    sessionName: `${this.currentRepo.name} - ${new Date().toLocaleString()}`
                })
            });

            const data = await response.json();

            if (data.success) {
                this.currentSession = data.session;
                document.getElementById('sessionInfo').classList.remove('hidden');
                document.getElementById('sessionName').textContent = this.currentRepo.fullName;
                
                await this.loadFiles();
                this.addSystemMessage(`Started session with ${this.currentRepo.fullName}`);
            } else {
                this.showError(data.message);
            }
        } catch (error) {
            console.error('Select repo error:', error);
            this.showError('Failed to create session');
        } finally {
            this.hideLoading();
        }
    }

    async loadFiles() {
        try {
            this.showLoading('Loading files...');
            
            const response = await fetch(
                `${API_URL}/ai-pair/files/${this.currentRepo.owner}/${this.currentRepo.name}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            const data = await response.json();

            if (data.success) {
                this.files = data.files;
                this.renderFileTree();
            } else {
                this.showError(data.message);
            }
        } catch (error) {
            console.error('Load files error:', error);
            this.showError('Failed to load files');
        } finally {
            this.hideLoading();
        }
    }

    renderFileTree() {
        const fileTree = document.getElementById('fileTree');
        fileTree.innerHTML = '';

        if (this.files.length === 0) {
            fileTree.innerHTML = '<div class="text-gray-500 text-center py-4">No files found</div>';
            return;
        }

        this.files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'file-tree-item flex items-center space-x-2';
            
            const icon = file.type === 'dir' ? 'ðŸ“' : 'ðŸ“„';
            item.innerHTML = `
                <span>${icon}</span>
                <span class="flex-1 truncate">${file.name}</span>
                <span class="text-xs text-gray-500">${this.formatSize(file.size)}</span>
            `;

            if (file.type === 'file') {
                item.addEventListener('click', () => this.openFile(file));
            } else {
                item.addEventListener('click', () => this.loadDirectory(file.path));
            }

            fileTree.appendChild(item);
        });
    }

    async openFile(file) {
        try {
            this.showLoading('Loading file...');
            
            const response = await fetch(
                `${API_URL}/ai-pair/file/${this.currentRepo.owner}/${this.currentRepo.name}/${file.path}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            const data = await response.json();

            if (data.success) {
                this.currentFile = {
                    ...file,
                    content: data.file.content,
                    sha: data.file.sha
                };

                document.getElementById('currentFileName').textContent = file.name;
                document.getElementById('fileLanguage').textContent = this.getLanguage(file.name);
                document.getElementById('codeEditor').value = data.file.content;
                document.getElementById('saveFile').classList.add('hidden');

                // Highlight active file
                document.querySelectorAll('.file-tree-item').forEach(item => {
                    item.classList.remove('active');
                });
                event.currentTarget.classList.add('active');
            } else {
                this.showError(data.message);
            }
        } catch (error) {
            console.error('Open file error:', error);
            this.showError('Failed to open file');
        } finally {
            this.hideLoading();
        }
    }

    async loadDirectory(path) {
        try {
            this.showLoading('Loading directory...');
            
            const response = await fetch(
                `${API_URL}/ai-pair/files/${this.currentRepo.owner}/${this.currentRepo.name}?path=${encodeURIComponent(path)}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            const data = await response.json();

            if (data.success) {
                this.files = data.files;
                this.renderFileTree();
            }
        } catch (error) {
            console.error('Load directory error:', error);
        } finally {
            this.hideLoading();
        }
    }

    async sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();

        if (!message) return;

        if (!this.currentSession) {
            this.showError('Please select a repository first');
            return;
        }

        if (message.length > 2000) {
            this.showError('Message too long (max 2000 characters)');
            return;
        }

        // Add user message to UI
        this.addMessage('user', message);
        input.value = '';
        document.getElementById('charCount').textContent = '0/2000';

        // Show typing indicator
        document.getElementById('typingIndicator').classList.remove('hidden');

        try {
            const codeContext = {
                repository: {
                    owner: this.currentRepo.owner,
                    name: this.currentRepo.name,
                    branch: this.currentRepo.defaultBranch
                },
                files: this.files.map(f => ({ path: f.path })),
                currentFile: this.currentFile ? {
                    path: this.currentFile.path,
                    language: this.getLanguage(this.currentFile.name),
                    content: document.getElementById('codeEditor').value
                } : null
            };

            const response = await fetch(`${API_URL}/ai-pair/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: this.currentSession._id,
                    message,
                    codeContext
                })
            });

            const data = await response.json();

            if (data.success) {
                this.addMessage('assistant', data.message.content, data.message.codeBlocks);
                
                // Update AI usage
                if (data.aiLimit) {
                    this.updateAIUsage(data.aiLimit);
                }
            } else {
                this.showError(data.message);
            }
        } catch (error) {
            console.error('Send message error:', error);
            this.showError('Failed to send message');
        } finally {
            document.getElementById('typingIndicator').classList.add('hidden');
        }
    }

    addMessage(role, content, codeBlocks = []) {
        const messagesContainer = document.getElementById('chatMessages');
        
        // Remove empty state
        if (messagesContainer.querySelector('.text-center')) {
            messagesContainer.innerHTML = '';
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${role === 'user' ? 'ml-8' : 'mr-8'}`;

        const isUser = role === 'user';
        const bgColor = isUser ? 'bg-blue-600' : 'bg-gray-700';
        const alignment = isUser ? 'ml-auto' : '';

        // Parse markdown and code blocks
        let formattedContent = content;
        if (!isUser) {
            formattedContent = marked.parse(content);
        }

        messageDiv.innerHTML = `
            <div class="${bgColor} ${alignment} rounded-lg p-3 max-w-full">
                <div class="flex items-start space-x-2">
                    <div class="flex-shrink-0">
                        ${isUser ? 'ðŸ‘¤' : 'ðŸ¤–'}
                    </div>
                    <div class="flex-1 text-sm prose prose-invert max-w-none">
                        ${formattedContent}
                    </div>
                </div>
            </div>
        `;

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Highlight code blocks
        messageDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }

    addSystemMessage(content) {
        const messagesContainer = document.getElementById('chatMessages');
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';
        messageDiv.innerHTML = `
            <div class="bg-gray-600 rounded-lg p-2 text-center text-xs text-gray-300">
                ${content}
            </div>
        `;

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async saveCurrentFile() {
        if (!this.currentFile) return;

        try {
            this.showLoading('Saving file...');

            const newContent = document.getElementById('codeEditor').value;

            const response = await fetch(`${API_URL}/ai-pair/apply-change`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: this.currentSession._id,
                    filePath: this.currentFile.path,
                    newContent,
                    operation: 'edit'
                })
            });

            const data = await response.json();

            if (data.success) {
                // Now commit the change
                const commitResponse = await fetch(`${API_URL}/ai-pair/commit`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: this.currentSession._id,
                        changeIds: [data.codeChange._id],
                        commitMessage: `Update ${this.currentFile.name}`
                    })
                });

                const commitData = await commitResponse.json();

                if (commitData.success) {
                    this.addSystemMessage(`âœ“ Saved ${this.currentFile.name} to GitHub`);
                    document.getElementById('saveFile').classList.add('hidden');
                    this.currentFile.content = newContent;
                } else {
                    this.showError('Failed to commit: ' + commitData.message);
                }
            } else {
                this.showError(data.message);
            }
        } catch (error) {
            console.error('Save file error:', error);
            this.showError('Failed to save file');
        } finally {
            this.hideLoading();
        }
    }

    async loadAIUsage() {
        try {
            const response = await fetch(`${API_URL}/subscription/current`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (data.success) {
                const tier = data.subscription.tier;
                const limits = {
                    freebie: 10,
                    professional: 100,
                    enterprise: 'âˆž'
                };
                
                document.getElementById('aiUsageText').textContent = 
                    `AI: 0/${limits[tier]} today`;
            }
        } catch (error) {
            console.error('Load AI usage error:', error);
        }
    }

    updateAIUsage(aiLimit) {
        document.getElementById('aiUsageText').textContent = 
            `AI: ${aiLimit.used}/${aiLimit.limit} today`;
    }

    getLanguage(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const langMap = {
            'js': 'JavaScript',
            'ts': 'TypeScript',
            'py': 'Python',
            'java': 'Java',
            'cpp': 'C++',
            'c': 'C',
            'cs': 'C#',
            'go': 'Go',
            'rs': 'Rust',
            'php': 'PHP',
            'rb': 'Ruby',
            'html': 'HTML',
            'css': 'CSS',
            'json': 'JSON',
            'md': 'Markdown',
            'txt': 'Text'
        };
        return langMap[ext] || ext.toUpperCase();
    }

    formatSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
        return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
    }

    showError(message) {
        alert(message);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new AIPairProgramming();
});
