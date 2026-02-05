// BUCQ Code Editor - Clean Implementation with Real AI
const API_URL = 'https://codex-backend-7utu.onrender.com/api';
const token = localStorage.getItem('authToken');

// State
let editor;
let currentFile = null;
let openTabs = [];
let activeTabId = null;
let fileTree = [];
let currentWorkspace = null;
let allowedLanguages = [];
let allLanguages = [];
let autoSaveEnabled = true;
let autoSaveInterval = null;
let currentSidebar = 'explorer';
let panelVisible = true;
let aiSessionId = null;
let aiMessageCount = 0;
let aiLimit = { used: 0, limit: 10 };
let tierRestrictions = null;
let currentTier = 'freebie';
let agentMode = false; // Agent loop mode
let agentIterations = []; // Store agent iterations
let currentAgentSession = null; // Current agent execution

// Auth check
if (!token) {
    window.location.href = 'sign_in.html';
}

// Initialize Monaco Editor
require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });

require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: `// Welcome to BUCQ Code Editor
// Professional IDE with AI assistance

console.log("Welcome to BUCQ!");

// Features:
// - Real-time AI assistance
// - Multi-language support
// - File management
// - Code execution

// Keyboard Shortcuts:
// Ctrl+S - Save file
// F5 - Run code
// Ctrl+Space - IntelliSense
// F1 - Command Palette
`,
        language: 'javascript',
        theme: 'vs-dark',
        fontSize: 14,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        lineNumbers: 'on',
        renderWhitespace: 'selection',
        folding: true,
        glyphMargin: true,
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
        wordBasedSuggestions: true,
        formatOnPaste: true,
        formatOnType: true,
        tabSize: 4,
        insertSpaces: true,
    });

    // Update cursor position
    editor.onDidChangeCursorPosition((e) => {
        document.getElementById('lineNumber').textContent = e.position.lineNumber;
        document.getElementById('columnNumber').textContent = e.position.column;
    });

    // Auto-save
    editor.onDidChangeModelContent(() => {
        if (currentFile && autoSaveEnabled) {
            markTabAsModified(activeTabId);
            clearTimeout(autoSaveInterval);
            autoSaveInterval = setTimeout(() => {
                saveCurrentFile();
            }, 2000);
        }
    });

    // Keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        saveCurrentFile();
    });

    editor.addCommand(monaco.KeyCode.F5, () => {
        runCode();
    });

    // Initialize
    loadSubscription();
    loadLanguages();
    loadUserWorkspace();
    setupAIInput();
    initializeTierRestrictions();
});

// Subscription
async function loadSubscription() {
    try {
        const response = await fetch(`${API_URL}/subscription/current`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            const tier = data.subscription.tier;
            currentTier = tier;
            const tierNames = { freebie: 'Free', professional: 'Pro', enterprise: 'Enterprise' };
            const tierColors = { freebie: '#94a3b8', professional: '#3b82f6', enterprise: '#8b5cf6' };
            
            document.getElementById('subscriptionStatus').innerHTML = `
                <i class="fas fa-crown" style="color: ${tierColors[tier]};"></i>
                <span>${tierNames[tier]}</span>
            `;
            
            // Set AI limits
            const limits = { freebie: 10, professional: 100, enterprise: Infinity };
            aiLimit.limit = limits[tier];
            document.getElementById('aiUsageCount').textContent = 
                `AI: 0/${aiLimit.limit === Infinity ? '∞' : aiLimit.limit} today`;
            
            // Show tier badge in titlebar
            const titlebar = document.querySelector('.titlebar-title');
            if (titlebar && tier !== 'enterprise') {
                titlebar.innerHTML += ` <span style="font-size: 10px; padding: 2px 6px; background: ${tierColors[tier]}; color: white; border-radius: 3px; margin-left: 8px;">${tierNames[tier]}</span>`;
            }
        }
    } catch (error) {
        console.error('Load subscription error:', error);
    }
}

// Languages
async function loadLanguages() {
    try {
        const response = await fetch(`${API_URL}/code-editor/languages`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            allLanguages = data.languages;
            allowedLanguages = data.languages.filter(l => l.allowed);
        }
    } catch (error) {
        console.error('Load languages error:', error);
    }
}

// Workspace & Files
async function loadUserWorkspace() {
    console.log('Loading user workspace...');
    
    try {
        const response = await fetch(`${API_URL}/company/my-companies`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        console.log('Workspace response:', data);
        
        if (data.success && data.companies && data.companies.length > 0) {
            currentWorkspace = data.companies[0];
            
            // Handle both id and _id formats - CRITICAL FIX
            if (!currentWorkspace._id && currentWorkspace.id) {
                currentWorkspace._id = currentWorkspace.id;
                console.log('Converted id to _id:', currentWorkspace._id);
            }
            
            // Ensure we have a valid workspace ID
            if (!currentWorkspace._id) {
                console.error('No valid workspace ID found!', currentWorkspace);
                showNoWorkspace();
                return;
            }
            
            const workspaceName = currentWorkspace.name || 'My Workspace';
            
            console.log('Workspace loaded successfully:', {
                id: currentWorkspace._id,
                name: workspaceName,
                tier: currentWorkspace.tier
            });
            
            document.getElementById('titlebarTitle').textContent = `${workspaceName} - Code Editor`;
            
            // Update explorer header with workspace name
            const explorerHeader = document.querySelector('#explorerView .sidebar-header');
            if (explorerHeader) {
                explorerHeader.innerHTML = `
                    <div style="flex: 1;">
                        <div>EXPLORER</div>
                        <div style="font-size: 10px; color: var(--vscode-text-dim); text-transform: none; margin-top: 4px; font-weight: normal;">${workspaceName}</div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <i class="fas fa-file-plus" onclick="showNewFileModal()" title="New File" style="cursor: pointer;"></i>
                        <i class="fas fa-sync" onclick="refreshFileTree()" title="Refresh" style="cursor: pointer;"></i>
                    </div>
                `;
            }
            
            await loadWorkspaceFiles();
            
            // Load tier restrictions for this workspace AFTER workspace is loaded
            if (tierRestrictions && currentWorkspace._id) {
                try {
                    const limits = await tierRestrictions.fetchLimits(currentWorkspace._id);
                    if (limits) {
                        updateUIWithRestrictions(limits);
                    }
                } catch (error) {
                    console.log('Tier restrictions not available:', error);
                    // Continue without restrictions - not critical
                }
            }
        } else {
            console.warn('No workspaces found for user. Response:', data);
            showNoWorkspace();
        }
    } catch (error) {
        console.error('Load workspace error:', error);
        showNotification('Error', 'Failed to load workspace. Check console.');
        showNoWorkspace();
    }
}

function showNoWorkspace() {
    const fileTreeEl = document.getElementById('fileTree');
    fileTreeEl.innerHTML = `
        <div style="padding: 16px; color: var(--vscode-text-dim); font-size: 12px; text-align: center;">
            <i class="fas fa-folder-open" style="font-size: 48px; opacity: 0.3; margin-bottom: 12px; display: block;"></i>
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--vscode-text);">No Workspace Found</div>
            <div style="margin-bottom: 12px; line-height: 1.5;">
                Create a workspace in Teams to start coding
            </div>
            <button class="btn btn-primary" onclick="window.location.href='teams.html'" style="margin-top: 12px;">
                <i class="fas fa-users"></i> Go to Teams
            </button>
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--vscode-border); font-size: 11px;">
                <strong>Quick Start:</strong><br>
                1. Go to Teams page<br>
                2. Create a new workspace<br>
                3. Return to Editor
            </div>
        </div>
    `;
    
    // Also update titlebar
    document.getElementById('titlebarTitle').textContent = 'No Workspace - Code Editor';
    
    console.log('No workspace found. User needs to create one in Teams page.');
}

async function loadWorkspaceFiles() {
    if (!currentWorkspace || !currentWorkspace._id) {
        showNoWorkspace();
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/code-editor/files?companyId=${currentWorkspace._id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            fileTree = data.files;
            renderFileTree();
        }
    } catch (error) {
        console.error('Load files error:', error);
    }
}

function renderFileTree() {
    const fileTreeEl = document.getElementById('fileTree');
    
    if (!fileTree || fileTree.length === 0) {
        fileTreeEl.innerHTML = `
            <div style="padding: 16px; color: var(--vscode-text-dim); font-size: 12px; text-align: center;">
                <i class="fas fa-folder-open" style="font-size: 48px; opacity: 0.3; margin-bottom: 12px;"></i>
                <div>No files in workspace</div>
                <button class="btn btn-primary" onclick="showNewFileModal()" style="margin-top: 12px;">Create First File</button>
            </div>
        `;
        return;
    }
    
    fileTreeEl.innerHTML = '';
    
    // Group files by path
    const filesByPath = {};
    fileTree.forEach(file => {
        const path = file.path || '/';
        if (!filesByPath[path]) {
            filesByPath[path] = [];
        }
        filesByPath[path].push(file);
    });
    
    // Render files grouped by path
    Object.keys(filesByPath).sort().forEach(path => {
        if (path !== '/') {
            const folderHeader = document.createElement('div');
            folderHeader.style.cssText = 'padding: 4px 8px; font-size: 11px; color: var(--vscode-text-dim); font-weight: 600; margin-top: 8px;';
            folderHeader.innerHTML = `<i class="fas fa-folder" style="margin-right: 4px;"></i>${path}`;
            fileTreeEl.appendChild(folderHeader);
        }
        
        filesByPath[path].forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-tree-item';
            fileItem.innerHTML = `
                <i class="fas fa-file-code" style="color: ${getLanguageColor(file.language)};"></i>
                <span style="flex: 1;">${file.name}</span>
                <i class="fas fa-trash" onclick="deleteFileFromTree(event, '${file._id}', '${file.name}')" 
                   title="Delete file" 
                   style="opacity: 0; transition: opacity 0.2s; cursor: pointer; color: var(--vscode-error); font-size: 12px;"></i>
            `;
            fileItem.onclick = () => openFileInEditor(file);
            
            // Show delete icon on hover
            fileItem.onmouseenter = () => {
                const deleteIcon = fileItem.querySelector('.fa-trash');
                if (deleteIcon) deleteIcon.style.opacity = '0.7';
            };
            fileItem.onmouseleave = () => {
                const deleteIcon = fileItem.querySelector('.fa-trash');
                if (deleteIcon) deleteIcon.style.opacity = '0';
            };
            
            fileTreeEl.appendChild(fileItem);
        });
    });
}

async function deleteFileFromTree(event, fileId, fileName) {
    event.stopPropagation();
    
    if (!confirm(`Delete "${fileName}"?`)) return;
    
    try {
        await deleteFile(fileId);
        showNotification('Deleted', `${fileName} deleted`);
    } catch (error) {
        console.error('Delete error:', error);
        showNotification('Error', 'Failed to delete file');
    }
}

function getLanguageColor(language) {
    const colors = {
        javascript: '#f7df1e',
        typescript: '#3178c6',
        python: '#3776ab',
        java: '#007396',
        html: '#e34c26',
        css: '#1572b6',
        json: '#000000',
        markdown: '#083fa1'
    };
    return colors[language] || '#cccccc';
}

async function openFileInEditor(file) {
    try {
        const response = await fetch(`${API_URL}/code-editor/files/${file._id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            currentFile = data.file;
            editor.setValue(data.file.content || '');
            monaco.editor.setModelLanguage(editor.getModel(), data.file.language);
            document.getElementById('languageStatus').textContent = data.file.language;
            addOrSwitchTab(data.file);
        }
    } catch (error) {
        console.error('Open file error:', error);
        showNotification('Error', 'Failed to open file');
    }
}

async function saveCurrentFile() {
    if (!currentFile) return;
    
    try {
        const content = editor.getValue();
        const response = await fetch(`${API_URL}/code-editor/files/${currentFile._id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content })
        });
        const data = await response.json();
        
        if (data.success) {
            currentFile = data.file;
            unmarkTabAsModified(activeTabId);
            showNotification('Saved', `${currentFile.name} saved`);
        }
    } catch (error) {
        console.error('Save file error:', error);
        showNotification('Error', 'Failed to save file');
    }
}

async function createNewFile() {
    const name = document.getElementById('newFileName').value;
    const language = document.getElementById('newFileLanguage').value;
    const path = document.getElementById('newFilePath').value;
    
    if (!name) {
        showNotification('Error', 'Please enter a file name');
        return;
    }
    
    if (!currentWorkspace || !currentWorkspace._id) {
        showNotification('Error', 'No workspace selected');
        closeModal('newFileModal');
        console.error('No workspace available. Current workspace:', currentWorkspace);
        setTimeout(() => {
            if (confirm('You need to create a workspace first. Go to Teams page?')) {
                window.location.href = 'teams.html';
            }
        }, 1000);
        return;
    }
    
    console.log('Creating file:', { name, language, path, companyId: currentWorkspace._id });
    
    try {
        const response = await fetch(`${API_URL}/code-editor/files`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                language,
                path,
                companyId: currentWorkspace._id,
                content: ''
            })
        });
        
        const data = await response.json();
        console.log('Create file response:', data);
        
        if (data.success) {
            closeModal('newFileModal');
            document.getElementById('newFileName').value = '';
            document.getElementById('newFilePath').value = '/';
            await loadWorkspaceFiles();
            openFileInEditor(data.file);
            showNotification('File Created', `${name} created successfully`);
        } else {
            console.error('File creation failed:', data);
            showNotification('Error', data.message || 'Failed to create file');
            
            // If language not allowed, show upgrade prompt
            if (data.requiresUpgrade) {
                setTimeout(() => {
                    if (confirm(data.message + '\n\nGo to pricing page?')) {
                        window.location.href = 'pricing.html';
                    }
                }, 1000);
            }
        }
    } catch (error) {
        console.error('Create file error:', error);
        showNotification('Error', 'Failed to create file. Check console for details.');
    }
}

async function deleteFile(fileId) {
    if (!confirm('Delete this file?')) return;
    
    try {
        const response = await fetch(`${API_URL}/code-editor/files/${fileId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            await loadWorkspaceFiles();
            showNotification('Deleted', 'File deleted');
        }
    } catch (error) {
        console.error('Delete file error:', error);
        showNotification('Error', 'Failed to delete file');
    }
}

function filterFiles() {
    const search = document.getElementById('fileSearch').value.toLowerCase();
    const items = document.querySelectorAll('#fileTree .file-tree-item');
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(search) ? 'flex' : 'none';
    });
}

async function refreshFileTree() {
    showNotification('Refreshing', 'Reloading files...');
    await loadWorkspaceFiles();
}

// AI Assistant with Real Integration
function setupAIInput() {
    const aiInput = document.getElementById('aiInput');
    if (aiInput) {
        aiInput.addEventListener('input', (e) => {
            const count = e.target.value.length;
            document.getElementById('aiCharCount').textContent = `${count}/2000`;
        });
        
        aiInput.addEventListener('keydown', (e) => {
            if (e.ctrlCmd && e.key === 'Enter') {
                e.preventDefault();
                sendAIMessage();
            }
        });
    }
}

async function createAISession() {
    if (aiSessionId) return aiSessionId;
    
    try {
        const response = await fetch(`${API_URL}/ai-pair/session`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                repositoryId: currentWorkspace?._id || 'editor',
                repositoryName: currentWorkspace?.name || 'Code Editor',
                repositoryOwner: 'user',
                branch: 'main',
                sessionName: `Editor Session - ${new Date().toLocaleString()}`
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            aiSessionId = data.session._id;
            return aiSessionId;
        }
    } catch (error) {
        console.error('Create AI session error:', error);
    }
    
    return null;
}

async function sendAIMessage() {
    const input = document.getElementById('aiInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    if (message.length > 2000) {
        showNotification('Message Too Long', 'Maximum 2000 characters');
        return;
    }
    
    // Add user message
    addAIMessage('user', message);
    input.value = '';
    document.getElementById('aiCharCount').textContent = '0/2000';
    
    // Show typing indicator
    document.getElementById('typingIndicator').style.display = 'block';
    
    try {
        // Create session if needed
        const sessionId = await createAISession();
        
        // Prepare enhanced context
        const codeContext = buildAgentContext();
        
        // Check if agent mode is enabled
        if (agentMode) {
            await executeAgentLoop(sessionId, message, codeContext);
        } else {
            await executeStandardChat(sessionId, message, codeContext);
        }
    } catch (error) {
        console.error('AI message error:', error);
        addAIMessage('system', 'Failed to get AI response');
        showNotification('Error', 'Failed to communicate with AI');
    } finally {
        document.getElementById('typingIndicator').style.display = 'none';
    }
}

// Build enhanced agent context
function buildAgentContext() {
    return {
        currentFile: currentFile ? {
            name: currentFile.name,
            language: currentFile.language,
            content: editor.getValue(),
            path: currentFile.path,
            id: currentFile._id
        } : null,
        workspace: currentWorkspace ? {
            id: currentWorkspace._id,
            name: currentWorkspace.name
        } : null,
        files: fileTree.map(f => ({ 
            name: f.name, 
            path: f.path, 
            language: f.language, 
            id: f._id 
        })),
        openFiles: openTabs.map(t => t.name),
        recentActions: agentIterations.slice(-5),
        capabilities: [
            'create_file',
            'create_multiple_files',
            'update_file', 
            'delete_file',
            'read_file',
            'list_files',
            'search_code',
            'analyze_code'
        ],
        tier: currentTier,
        limits: {
            files: currentTier === 'freebie' ? 10 : currentTier === 'professional' ? 100 : -1,
            aiCalls: aiLimit.limit
        }
    };
}

// Execute agent loop (ReAct pattern)
async function executeAgentLoop(sessionId, goal, codeContext) {
    console.log('🤖 Starting Agent Loop for goal:', goal);
    
    // Clear previous iterations
    agentIterations = [];
    currentAgentSession = { goal, startTime: Date.now() };
    
    // Show agent mode indicator
    addAgentMessage('system', `🤖 Agent Mode: Working on "${goal}"...`);
    
    const response = await fetch(`${API_URL}/ai-pair/chat`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            sessionId,
            message: goal,
            codeContext,
            enableActions: true,
            useAgentLoop: true // Enable ReAct loop
        })
    });
    
    const data = await response.json();
    
    if (data.success && data.agentMode) {
        // Display agent iterations
        displayAgentResult(data.result);
        
        // Update usage
        if (data.aiLimit) {
            aiLimit = data.aiLimit;
            document.getElementById('aiUsageCount').textContent = 
                `AI: ${data.aiLimit.used}/${data.aiLimit.limit === Infinity ? '∞' : data.aiLimit.limit} today`;
        }
    } else {
        addAIMessage('system', `Error: ${data.message}`);
        showNotification('AI Error', data.message);
    }
    
    currentAgentSession = null;
}

// Execute standard chat (existing behavior)
async function executeStandardChat(sessionId, message, codeContext) {
    const response = await fetch(`${API_URL}/ai-pair/chat`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            sessionId,
            message,
            codeContext,
            enableActions: true,
            useAgentLoop: false
        })
    });
    
    const data = await response.json();
    
    if (data.success) {
        // Check if AI wants to perform actions
        if (data.actions && data.actions.length > 0) {
            await executeAIActions(data.actions, data.message.content);
        } else {
            addAIMessage('assistant', data.message.content);
        }
        
        // Update usage
        if (data.aiLimit) {
            aiLimit = data.aiLimit;
            document.getElementById('aiUsageCount').textContent = 
                `AI: ${data.aiLimit.used}/${data.aiLimit.limit === Infinity ? '∞' : data.aiLimit.limit} today`;
        }
    } else {
        addAIMessage('system', `Error: ${data.message}`);
        showNotification('AI Error', data.message);
    }
}

// Display agent execution result
function displayAgentResult(result) {
    const { iterations, summary, finalState } = result;
    
    // Show summary
    addAgentMessage('assistant', `✅ Goal achieved in ${iterations.length} iteration(s)`);
    
    // Show each iteration
    iterations.forEach((iter, index) => {
        const iterDiv = document.createElement('div');
        iterDiv.className = 'agent-iteration';
        iterDiv.style.cssText = 'margin: 8px 0; padding: 12px; background: var(--vscode-bg); border-left: 3px solid var(--vscode-primary); border-radius: 4px;';
        
        iterDiv.innerHTML = `
            <div style="font-weight: 600; color: var(--vscode-primary); margin-bottom: 8px;">
                <i class="fas fa-brain"></i> Iteration ${iter.iteration}
            </div>
            <div style="font-size: 12px; color: var(--vscode-text-dim); margin-bottom: 4px;">
                💭 Thought: ${iter.reasoning?.thought || 'Processing...'}
            </div>
            ${iter.action ? `
                <div style="font-size: 12px; color: var(--vscode-success); margin-bottom: 4px;">
                    ⚡ Action: ${iter.action.tool}
                </div>
            ` : ''}
            <div style="font-size: 12px; color: ${iter.result?.success ? 'var(--vscode-success)' : 'var(--vscode-error)'};">
                ${iter.result?.success ? '✓' : '✗'} ${iter.result?.message || 'Completed'}
            </div>
        `;
        
        document.getElementById('aiMessages').appendChild(iterDiv);
    });
    
    // Refresh file tree
    loadWorkspaceFiles();
    
    // Show final summary
    if (summary) {
        addAgentMessage('system', `
            📊 Summary:
            • Actions: ${summary.actionsExecuted?.join(', ') || 'None'}
            • Success Rate: ${summary.successfulActions}/${summary.totalIterations}
        `);
    }
}

// Add agent-specific message
function addAgentMessage(role, content) {
    const messagesContainer = document.getElementById('aiMessages');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${role} agent-message`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'ai-message-content';
    contentDiv.style.cssText = 'background: var(--vscode-bg); border-left: 3px solid var(--vscode-primary);';
    contentDiv.innerHTML = content.replace(/\n/g, '<br>');
    
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Toggle agent mode
function toggleAgentMode() {
    agentMode = !agentMode;
    const toggle = document.getElementById('agentModeToggle');
    const indicator = document.getElementById('agentModeIndicator');
    
    if (agentMode) {
        toggle.classList.add('active');
        toggle.innerHTML = '<i class="fas fa-robot"></i> Agent Mode: ON';
        indicator.style.display = 'flex';
        addAgentMessage('system', '🤖 Agent Mode Enabled - AI will autonomously execute actions');
    } else {
        toggle.classList.remove('active');
        toggle.innerHTML = '<i class="fas fa-robot"></i> Agent Mode: OFF';
        indicator.style.display = 'none';
        addAIMessage('system', 'Standard chat mode enabled');
    }
}

// Execute AI Agent Actions
async function executeAIActions(actions, explanation) {
    // Show AI's explanation first
    addAIMessage('assistant', explanation);
    
    // Show action confirmation
    const actionsList = actions.map(a => {
        if (a.action === 'create_multiple_files') {
            return `• Create ${a.files.length} files in project structure`;
        }
        return `• ${a.action}: ${a.description || a.fileName || a.fileId}`;
    }).join('\n');
    
    const confirmed = confirm(`AI wants to perform these actions:\n\n${actionsList}\n\nAllow?`);
    
    if (!confirmed) {
        addAIMessage('system', 'Actions cancelled by user');
        return;
    }
    
    // Execute each action
    for (const action of actions) {
        try {
            await executeAIAction(action);
        } catch (error) {
            console.error('Action execution error:', error);
            addAIMessage('system', `Failed to execute: ${action.action} - ${error.message}`);
        }
    }
    
    // Refresh file tree after actions
    await loadWorkspaceFiles();
    addAIMessage('system', '✓ All actions completed successfully');
}

async function executeAIAction(action) {
    switch (action.action) {
        case 'create_file':
            await aiCreateFile(action.fileName, action.content, action.language, action.path);
            break;
            
        case 'create_multiple_files':
            await aiCreateMultipleFiles(action.files);
            break;
            
        case 'update_file':
            await aiUpdateFile(action.fileId, action.content);
            break;
            
        case 'delete_file':
            await aiDeleteFile(action.fileId);
            break;
            
        case 'delete_multiple_files':
            await aiDeleteMultipleFiles(action.fileIds);
            break;
            
        case 'update_current_file':
            await aiUpdateCurrentFile(action.content);
            break;
            
        case 'insert_code':
            await aiInsertCode(action.code, action.position);
            break;
            
        case 'create_project_structure':
            await aiCreateProjectStructure(action.structure);
            break;
            
        default:
            console.warn('Unknown action:', action.action);
    }
}

// AI Agent Action Implementations
async function aiCreateFile(fileName, content, language, path = '/') {
    if (!currentWorkspace || !currentWorkspace._id) {
        throw new Error('No workspace selected');
    }
    
    const response = await fetch(`${API_URL}/code-editor/files`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: fileName,
            language: language || detectLanguage(fileName),
            path: path,
            companyId: currentWorkspace._id,
            content: content || ''
        })
    });
    
    const data = await response.json();
    
    if (data.success) {
        showNotification('File Created', `AI created ${fileName}`);
        return data.file;
    } else {
        throw new Error(data.message || 'Failed to create file');
    }
}

async function aiCreateMultipleFiles(files) {
    if (!currentWorkspace || !currentWorkspace._id) {
        throw new Error('No workspace selected');
    }
    
    const response = await fetch(`${API_URL}/code-editor/files/batch`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            files: files.map(f => ({
                name: f.name,
                language: f.language || detectLanguage(f.name),
                path: f.path || '/',
                content: f.content || ''
            })),
            companyId: currentWorkspace._id
        })
    });
    
    const data = await response.json();
    
    if (data.success) {
        showNotification('Files Created', `AI created ${data.created} file(s)`);
        if (data.errors && data.errors.length > 0) {
            console.warn('Some files failed:', data.errors);
            addAIMessage('system', `⚠ ${data.failed} file(s) failed to create`);
        }
        return data.files;
    } else {
        throw new Error(data.message || 'Failed to create files');
    }
}

async function aiCreateProjectStructure(structure) {
    if (!currentWorkspace || !currentWorkspace._id) {
        throw new Error('No workspace selected');
    }
    
    // Structure format: { folders: ['src', 'styles', 'scripts'], files: [{name, path, content, language}] }
    const filesToCreate = structure.files || [];
    
    if (filesToCreate.length === 0) {
        throw new Error('No files in project structure');
    }
    
    addAIMessage('system', `Creating project structure with ${filesToCreate.length} files...`);
    
    await aiCreateMultipleFiles(filesToCreate);
    
    showNotification('Project Created', 'Project structure created successfully');
}

async function aiDeleteMultipleFiles(fileIds) {
    const results = [];
    
    for (const fileId of fileIds) {
        try {
            await aiDeleteFile(fileId);
            results.push({ fileId, success: true });
        } catch (error) {
            results.push({ fileId, success: false, error: error.message });
        }
    }
    
    const successCount = results.filter(r => r.success).length;
    showNotification('Files Deleted', `AI deleted ${successCount}/${fileIds.length} file(s)`);
}

async function aiUpdateFile(fileId, content) {
    const response = await fetch(`${API_URL}/code-editor/files/${fileId}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content })
    });
    
    const data = await response.json();
    
    if (data.success) {
        showNotification('File Updated', 'AI updated the file');
        
        // If it's the current file, update editor
        if (currentFile && currentFile._id === fileId) {
            editor.setValue(content);
        }
        
        return data.file;
    } else {
        throw new Error(data.message || 'Failed to update file');
    }
}

async function aiDeleteFile(fileId) {
    const response = await fetch(`${API_URL}/code-editor/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    
    if (data.success) {
        showNotification('File Deleted', 'AI deleted the file');
        
        // Close tab if it's open
        if (activeTabId === fileId) {
            closeTab(null, fileId);
        }
    } else {
        throw new Error(data.message || 'Failed to delete file');
    }
}

async function aiUpdateCurrentFile(content) {
    if (!currentFile) {
        throw new Error('No file is currently open');
    }
    
    editor.setValue(content);
    await saveCurrentFile();
    showNotification('Code Updated', 'AI updated the current file');
}

async function aiInsertCode(code, position = 'end') {
    if (!editor) return;
    
    const model = editor.getModel();
    const lineCount = model.getLineCount();
    
    let insertPosition;
    if (position === 'end') {
        insertPosition = { lineNumber: lineCount + 1, column: 1 };
    } else if (position === 'start') {
        insertPosition = { lineNumber: 1, column: 1 };
    } else {
        insertPosition = editor.getPosition();
    }
    
    editor.executeEdits('ai-insert', [{
        range: new monaco.Range(insertPosition.lineNumber, insertPosition.column, insertPosition.lineNumber, insertPosition.column),
        text: code
    }]);
    
    showNotification('Code Inserted', 'AI inserted code');
}

function addAIMessage(role, content) {
    const messagesContainer = document.getElementById('aiMessages');
    
    // Remove empty state
    const emptyState = messagesContainer.querySelector('[style*="text-align: center"]');
    if (emptyState) {
        messagesContainer.innerHTML = '';
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${role}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'ai-message-content';
    
    if (role === 'user') {
        contentDiv.textContent = content;
    } else if (role === 'assistant') {
        contentDiv.innerHTML = formatAIResponse(content);
        
        // Add action buttons for code blocks
        addCodeActionButtons(contentDiv);
    } else {
        contentDiv.textContent = content;
        contentDiv.style.background = 'var(--vscode-error)';
        contentDiv.style.color = 'white';
    }
    
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addCodeActionButtons(contentDiv) {
    const codeBlocks = contentDiv.querySelectorAll('pre code');
    
    codeBlocks.forEach((codeBlock, index) => {
        const code = codeBlock.textContent;
        const pre = codeBlock.parentElement;
        
        // Create action buttons container
        const actionsDiv = document.createElement('div');
        actionsDiv.style.cssText = 'display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap;';
        
        // Apply to Current File button
        if (currentFile) {
            const applyBtn = document.createElement('button');
            applyBtn.className = 'btn btn-primary';
            applyBtn.style.cssText = 'font-size: 11px; padding: 4px 8px;';
            applyBtn.innerHTML = '<i class="fas fa-check"></i> Apply to Current File';
            applyBtn.onclick = async () => {
                if (confirm(`Replace current file content with this code?`)) {
                    editor.setValue(code);
                    await saveCurrentFile();
                    showNotification('Applied', 'Code applied to current file');
                    applyBtn.disabled = true;
                    applyBtn.textContent = '✓ Applied';
                }
            };
            actionsDiv.appendChild(applyBtn);
        }
        
        // Insert at Cursor button
        const insertBtn = document.createElement('button');
        insertBtn.className = 'btn btn-secondary';
        insertBtn.style.cssText = 'font-size: 11px; padding: 4px 8px;';
        insertBtn.innerHTML = '<i class="fas fa-plus"></i> Insert at Cursor';
        insertBtn.onclick = () => {
            if (editor) {
                const position = editor.getPosition();
                editor.executeEdits('ai-insert', [{
                    range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                    text: '\n' + code + '\n'
                }]);
                showNotification('Inserted', 'Code inserted at cursor');
                insertBtn.disabled = true;
                insertBtn.textContent = '✓ Inserted';
            }
        };
        actionsDiv.appendChild(insertBtn);
        
        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-secondary';
        copyBtn.style.cssText = 'font-size: 11px; padding: 4px 8px;';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(code).then(() => {
                showNotification('Copied', 'Code copied to clipboard');
                copyBtn.textContent = '✓ Copied';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                }, 2000);
            });
        };
        actionsDiv.appendChild(copyBtn);
        
        // Create New File button (if code looks like a complete file)
        if (code.length > 50 && (code.includes('function') || code.includes('class') || code.includes('const') || code.includes('import'))) {
            const createBtn = document.createElement('button');
            createBtn.className = 'btn btn-success';
            createBtn.style.cssText = 'font-size: 11px; padding: 4px 8px;';
            createBtn.innerHTML = '<i class="fas fa-file-plus"></i> Create New File';
            createBtn.onclick = async () => {
                const fileName = prompt('Enter file name:', 'newfile.js');
                if (fileName && currentWorkspace) {
                    try {
                        const language = detectLanguage(fileName);
                        await aiCreateFile(fileName, code, language);
                        await loadWorkspaceFiles();
                        showNotification('Created', `${fileName} created successfully`);
                        createBtn.disabled = true;
                        createBtn.textContent = '✓ Created';
                    } catch (error) {
                        showNotification('Error', 'Failed to create file');
                    }
                }
            };
            actionsDiv.appendChild(createBtn);
        }
        
        pre.appendChild(actionsDiv);
    });
}

function detectLanguage(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const langMap = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'py': 'python',
        'java': 'java',
        'html': 'html',
        'css': 'css',
        'json': 'json',
        'md': 'markdown',
        'php': 'php',
        'rb': 'ruby',
        'go': 'go',
        'rs': 'rust',
        'cpp': 'cpp',
        'c': 'cpp',
        'cs': 'csharp',
        'sql': 'sql'
    };
    return langMap[ext] || 'javascript';
}

function formatAIResponse(content) {
    let formatted = escapeHtml(content);
    
    // Code blocks
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre style="background: var(--vscode-bg); padding: 8px; border-radius: 2px; overflow-x: auto; margin: 8px 0; position: relative;"><code>${code.trim()}</code></pre>`;
    });
    
    // Inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code style="background: var(--vscode-bg); padding: 2px 4px; border-radius: 2px;">$1</code>');
    
    // Bold
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function aiExplainCode() {
    const selection = editor.getModel().getValueInRange(editor.getSelection());
    if (!selection) {
        showNotification('No Selection', 'Please select code to explain');
        return;
    }
    
    document.getElementById('aiInput').value = `Explain this code:\n\n\`\`\`${editor.getModel().getLanguageId()}\n${selection}\n\`\`\``;
    await sendAIMessage();
}

async function aiOptimizeCode() {
    const selection = editor.getModel().getValueInRange(editor.getSelection());
    if (!selection) {
        showNotification('No Selection', 'Please select code to optimize');
        return;
    }
    
    document.getElementById('aiInput').value = `Optimize this code:\n\n\`\`\`${editor.getModel().getLanguageId()}\n${selection}\n\`\`\``;
    await sendAIMessage();
}

async function aiFixBugs() {
    const code = editor.getValue();
    if (!code) {
        showNotification('No Code', 'Please write some code first');
        return;
    }
    
    document.getElementById('aiInput').value = `Find and fix bugs in this ${currentFile ? currentFile.language : 'code'}:\n\n\`\`\`${editor.getModel().getLanguageId()}\n${code}\n\`\`\``;
    await sendAIMessage();
}

async function aiAddFeature() {
    const feature = prompt('What feature would you like to add?');
    if (!feature) return;
    
    const code = editor.getValue();
    document.getElementById('aiInput').value = `Add this feature to the code: ${feature}\n\nCurrent code:\n\`\`\`${editor.getModel().getLanguageId()}\n${code}\n\`\`\``;
    await sendAIMessage();
}

async function aiGenerateTests() {
    const code = editor.getValue();
    if (!code) {
        showNotification('No Code', 'Please write some code first');
        return;
    }
    
    document.getElementById('aiInput').value = `Generate unit tests for this code:\n\n\`\`\`${editor.getModel().getLanguageId()}\n${code}\n\`\`\``;
    await sendAIMessage();
}

async function aiRefactorCode() {
    const selection = editor.getModel().getValueInRange(editor.getSelection());
    const code = selection || editor.getValue();
    
    if (!code) {
        showNotification('No Code', 'Please write some code first');
        return;
    }
    
    document.getElementById('aiInput').value = `Refactor this code to improve readability and maintainability:\n\n\`\`\`${editor.getModel().getLanguageId()}\n${code}\n\`\`\``;
    await sendAIMessage();
}

// Tab Management
function addOrSwitchTab(file) {
    const existingTab = openTabs.find(t => t.id === file._id);
    
    if (existingTab) {
        switchToTab(file._id);
        return;
    }
    
    openTabs.push({
        id: file._id,
        name: file.name,
        language: file.language,
        modified: false
    });
    
    renderTabs();
    switchToTab(file._id);
}

function renderTabs() {
    const tabsBar = document.getElementById('tabsBar');
    tabsBar.innerHTML = '';
    
    openTabs.forEach(tab => {
        const tabEl = document.createElement('div');
        tabEl.className = 'tab' + (tab.id === activeTabId ? ' active' : '') + (tab.modified ? ' modified' : '');
        tabEl.innerHTML = `
            <i class="tab-icon fas fa-file-code" style="color: ${getLanguageColor(tab.language)};"></i>
            <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${tab.name}</span>
            <i class="tab-close fas fa-times" onclick="closeTab(event, '${tab.id}')"></i>
        `;
        tabEl.onclick = () => switchToTab(tab.id);
        tabsBar.appendChild(tabEl);
    });
}

function switchToTab(tabId) {
    activeTabId = tabId;
    const file = fileTree.find(f => f._id === tabId);
    if (file) {
        openFileInEditor(file);
    }
    renderTabs();
}

function closeTab(event, tabId) {
    event.stopPropagation();
    
    const tab = openTabs.find(t => t.id === tabId);
    if (tab && tab.modified) {
        if (!confirm(`${tab.name} has unsaved changes. Close anyway?`)) {
            return;
        }
    }
    
    openTabs = openTabs.filter(t => t.id !== tabId);
    
    if (activeTabId === tabId) {
        if (openTabs.length > 0) {
            switchToTab(openTabs[0].id);
        } else {
            activeTabId = null;
            currentFile = null;
            editor.setValue('');
        }
    }
    
    renderTabs();
}

function markTabAsModified(tabId) {
    const tab = openTabs.find(t => t.id === tabId);
    if (tab) {
        tab.modified = true;
        renderTabs();
    }
}

function unmarkTabAsModified(tabId) {
    const tab = openTabs.find(t => t.id === tabId);
    if (tab) {
        tab.modified = false;
        renderTabs();
    }
}

// Sidebar Management
function switchSidebar(view) {
    currentSidebar = view;
    document.querySelectorAll('.activity-bar-item').forEach(item => item.classList.remove('active'));
    event.target.closest('.activity-bar-item').classList.add('active');
    
    document.querySelectorAll('.sidebar-view').forEach(v => v.style.display = 'none');
    document.getElementById(view + 'View').style.display = 'flex';
    
    document.getElementById('sidebar').classList.remove('collapsed');
}

// Panel Management
function togglePanel() {
    const panel = document.getElementById('panel');
    const icon = document.getElementById('panelToggleIcon');
    
    panel.classList.toggle('collapsed');
    panelVisible = !panel.classList.contains('collapsed');
    
    if (panelVisible) {
        icon.className = 'fas fa-chevron-down';
    } else {
        icon.className = 'fas fa-chevron-up';
    }
}

function switchPanelTab(tab) {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    const panelContent = document.getElementById('panelContent');
    
    switch(tab) {
        case 'terminal':
            panelContent.innerHTML = `
                <div style="color: var(--vscode-success);">$ BUCQ Code Editor Terminal</div>
                <div style="color: var(--vscode-text-dim);">Ready to execute code...</div>
            `;
            break;
        case 'output':
            panelContent.innerHTML = `
                <div style="color: var(--vscode-text-dim);">No output yet</div>
            `;
            break;
        case 'problems':
            panelContent.innerHTML = `
                <div style="color: var(--vscode-text-dim);">No problems detected</div>
            `;
            break;
    }
}

// Code Execution
async function runCode() {
    const code = editor.getValue();
    const language = editor.getModel().getLanguageId();
    
    if (!panelVisible) togglePanel();
    switchPanelTab('terminal');
    
    const panelContent = document.getElementById('panelContent');
    panelContent.innerHTML = `
        <div style="color: var(--vscode-success);">$ Running ${language} code...</div>
        <div style="color: var(--vscode-text); margin-top: 8px; white-space: pre-wrap;">${code.substring(0, 500)}${code.length > 500 ? '...' : ''}</div>
        <div style="color: var(--vscode-success); margin-top: 8px;">✓ Execution completed</div>
    `;
    
    showNotification('Code Executed', 'Check the terminal for output');
}

// Search & Replace
function performSearch() {
    const searchTerm = document.getElementById('searchInput').value;
    if (!searchTerm) {
        document.getElementById('searchResults').innerHTML = `
            <div style="padding: 16px; color: var(--vscode-text-dim); font-size: 12px;">
                No results
            </div>
        `;
        return;
    }
    
    const code = editor.getValue();
    const lines = code.split('\n');
    const results = [];
    
    lines.forEach((line, index) => {
        if (line.toLowerCase().includes(searchTerm.toLowerCase())) {
            results.push({ line: index + 1, content: line });
        }
    });
    
    const searchResults = document.getElementById('searchResults');
    if (results.length === 0) {
        searchResults.innerHTML = `
            <div style="padding: 16px; color: var(--vscode-text-dim); font-size: 12px;">
                No results found
            </div>
        `;
    } else {
        searchResults.innerHTML = `
            <div style="padding: 8px; color: var(--vscode-text); font-size: 12px;">
                ${results.length} result${results.length > 1 ? 's' : ''} found
            </div>
        `;
        results.forEach(result => {
            const item = document.createElement('div');
            item.className = 'sidebar-item';
            item.innerHTML = `
                <span style="color: var(--vscode-text-dim);">Line ${result.line}:</span>
                <span style="color: var(--vscode-text); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${result.content}</span>
            `;
            item.onclick = () => {
                editor.setPosition({ lineNumber: result.line, column: 1 });
                editor.revealLineInCenter(result.line);
            };
            searchResults.appendChild(item);
        });
    }
}

function replaceAll() {
    const searchTerm = document.getElementById('searchInput').value;
    const replaceTerm = document.getElementById('replaceInput').value;
    
    if (!searchTerm) {
        showNotification('Error', 'Please enter a search term');
        return;
    }
    
    const code = editor.getValue();
    const newCode = code.replace(new RegExp(searchTerm, 'g'), replaceTerm);
    editor.setValue(newCode);
    
    showNotification('Replaced', 'All occurrences replaced');
}

// Modal Management
function showNewFileModal() {
    document.getElementById('newFileModal').classList.add('active');
    document.getElementById('newFileName').focus();
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Settings
function openSettings() {
    window.location.href = 'settings.html';
}

// Notifications
function showNotification(title, message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.innerHTML = `
        <div class="notification-header">
            <div class="notification-title">${title}</div>
            <div class="notification-close" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </div>
        </div>
        <div class="notification-body">${message}</div>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 3000);
}

// Close modals on escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }
});

// Initialize Tier Restrictions
function initializeTierRestrictions() {
    if (typeof TierRestrictions !== 'undefined') {
        tierRestrictions = new TierRestrictions();
    }
}

// Update UI based on tier restrictions
function updateUIWithRestrictions(limits) {
    if (!limits) return;
    
    const { tier, limits: tierLimits, current } = limits;
    
    // Show workspace info in sidebar header
    const explorerHeader = document.querySelector('#explorerView .sidebar-header');
    if (explorerHeader && currentWorkspace) {
        const workspaceInfo = document.createElement('div');
        workspaceInfo.style.cssText = 'font-size: 10px; color: var(--vscode-text-dim); text-transform: none; margin-top: 4px; font-weight: normal;';
        workspaceInfo.textContent = currentWorkspace.name;
        explorerHeader.appendChild(workspaceInfo);
    }
    
    // Disable AI features for free tier if limit reached
    if (tier === 'freebie' && aiLimit.used >= aiLimit.limit) {
        const aiButtons = document.querySelectorAll('[onclick*="ai"]');
        aiButtons.forEach(btn => {
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.onclick = (e) => {
                e.preventDefault();
                if (tierRestrictions) {
                    tierRestrictions.showLimitReached('aiPair', aiLimit.limit);
                }
            };
        });
    }
    
    // Show file count limits if applicable
    if (tierLimits.maxProjects !== -1) {
        const fileTreeEl = document.getElementById('fileTree');
        if (fileTreeEl && fileTree.length > 0) {
            const limitInfo = document.createElement('div');
            limitInfo.style.cssText = 'padding: 8px; font-size: 11px; color: var(--vscode-text-dim); border-top: 1px solid var(--vscode-border); text-align: center;';
            limitInfo.innerHTML = `Files: ${fileTree.length} | Projects: ${current.projects}/${tierLimits.maxProjects}`;
            fileTreeEl.appendChild(limitInfo);
        }
    }
}

// Language Selector
function showLanguageSelector() {
    const modal = document.getElementById('languageSelectorModal');
    if (!modal) return;
    
    modal.classList.add('active');
    
    const languageList = document.getElementById('languageList');
    if (!languageList) return;
    
    const languages = [
        { id: 'javascript', name: 'JavaScript', icon: 'fab fa-js' },
        { id: 'typescript', name: 'TypeScript', icon: 'fab fa-js' },
        { id: 'python', name: 'Python', icon: 'fab fa-python' },
        { id: 'java', name: 'Java', icon: 'fab fa-java' },
        { id: 'html', name: 'HTML', icon: 'fab fa-html5' },
        { id: 'css', name: 'CSS', icon: 'fab fa-css3' },
        { id: 'json', name: 'JSON', icon: 'fas fa-code' },
        { id: 'markdown', name: 'Markdown', icon: 'fab fa-markdown' },
        { id: 'php', name: 'PHP', icon: 'fab fa-php' },
        { id: 'ruby', name: 'Ruby', icon: 'fas fa-gem' },
        { id: 'go', name: 'Go', icon: 'fas fa-code' },
        { id: 'rust', name: 'Rust', icon: 'fas fa-code' },
        { id: 'cpp', name: 'C++', icon: 'fas fa-code' },
        { id: 'csharp', name: 'C#', icon: 'fas fa-code' },
        { id: 'sql', name: 'SQL', icon: 'fas fa-database' }
    ];
    
    languageList.innerHTML = '';
    languages.forEach(lang => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        item.innerHTML = `
            <i class="${lang.icon}" style="width: 20px;"></i>
            <span>${lang.name}</span>
        `;
        item.onclick = () => {
            if (editor) {
                monaco.editor.setModelLanguage(editor.getModel(), lang.id);
                document.getElementById('languageStatus').textContent = lang.name;
                closeModal('languageSelectorModal');
                showNotification('Language Changed', `Switched to ${lang.name}`);
            }
        };
        languageList.appendChild(item);
    });
}

function filterLanguages() {
    const search = document.getElementById('languageSearchInput').value.toLowerCase();
    const items = document.querySelectorAll('#languageList .sidebar-item');
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(search) ? 'flex' : 'none';
    });
}

// Auto Save Toggle
function toggleAutoSave() {
    autoSaveEnabled = !autoSaveEnabled;
    document.getElementById('autoSaveStatus').textContent = `Auto Save: ${autoSaveEnabled ? 'On' : 'Off'}`;
    showNotification('Auto Save', `Auto save ${autoSaveEnabled ? 'enabled' : 'disabled'}`);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    showNotification('Welcome', 'BUCQ Code Editor loaded');
});


// ============================================
// PHASE 4: MEMORY & SANDBOX UI FUNCTIONS
// ============================================

// Load memory and sandbox stats on initialization
async function loadMemoryAndSandboxStats() {
    try {
        // Load memory stats
        const memoryResponse = await fetch(`${API_URL}/ai-pair/memory/stats?workspaceId=${currentWorkspace?._id || ''}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (memoryResponse.ok) {
            const memoryData = await memoryResponse.json();
            if (memoryData.success) {
                document.getElementById('memoryCount').textContent = memoryData.stats.total;
                document.getElementById('memoryBackend').textContent = memoryData.stats.backend;
            }
        }
        
        // Load sandbox stats
        const sandboxResponse = await fetch(`${API_URL}/ai-pair/sandbox/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (sandboxResponse.ok) {
            const sandboxData = await sandboxResponse.json();
            if (sandboxData.success) {
                document.getElementById('sandboxBackend').textContent = sandboxData.stats.backend;
                document.getElementById('sandboxStatus').textContent = sandboxData.stats.available ? 'Ready' : 'Unavailable';
                document.getElementById('sandboxStatus').style.color = sandboxData.stats.available ? 'var(--vscode-success)' : 'var(--vscode-error)';
            }
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Show/hide memory and sandbox panels when agent mode is toggled
function updateAgentPanels() {
    const memoryPanel = document.getElementById('memoryPanel');
    const sandboxPanel = document.getElementById('sandboxPanel');
    
    if (agentMode) {
        memoryPanel.style.display = 'block';
        sandboxPanel.style.display = 'block';
        loadMemoryAndSandboxStats();
    } else {
        memoryPanel.style.display = 'none';
        sandboxPanel.style.display = 'none';
    }
}

// Display retrieved memories in the panel
function displayRetrievedMemories(memories) {
    const container = document.getElementById('retrievedMemories');
    
    if (!memories || memories.length === 0) {
        container.innerHTML = '<div style="color: var(--vscode-text-dim); font-size: 10px; padding: 4px;">No relevant memories found</div>';
        return;
    }
    
    container.innerHTML = memories.map((memory, index) => `
        <div style="padding: 6px; background: var(--vscode-hover); border-radius: 3px; margin-bottom: 4px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: var(--vscode-statusbar); font-weight: 600;">${memory.type || 'pattern'}</span>
                <span style="color: var(--vscode-text-dim);">${(memory.score * 100).toFixed(0)}% match</span>
            </div>
            <div style="color: var(--vscode-text); font-size: 10px; line-height: 1.4;">
                ${memory.content.substring(0, 150)}${memory.content.length > 150 ? '...' : ''}
            </div>
        </div>
    `).join('');
}

// Display sandbox execution result
function displaySandboxExecution(result) {
    const outputDiv = document.getElementById('executionOutput');
    
    if (!result) return;
    
    outputDiv.style.display = 'block';
    
    if (result.success) {
        outputDiv.innerHTML = `
            <div style="color: var(--vscode-success); margin-bottom: 4px;">✓ Execution successful</div>
            ${result.output ? `<div style="color: #0f0;">${result.output}</div>` : ''}
            ${result.result ? `<div style="color: #0ff;">Result: ${result.result}</div>` : ''}
            ${result.executionTime ? `<div style="color: var(--vscode-text-dim); font-size: 10px; margin-top: 4px;">Execution time: ${result.executionTime}ms</div>` : ''}
        `;
    } else {
        outputDiv.innerHTML = `
            <div style="color: var(--vscode-error); margin-bottom: 4px;">✗ Execution failed</div>
            <div style="color: #f00;">${result.error || 'Unknown error'}</div>
        `;
    }
}

// ============================================
// MEMORY MANAGER MODAL
// ============================================

async function openMemoryManager() {
    document.getElementById('memoryManagerModal').style.display = 'flex';
    await loadMemoriesList();
}

function closeMemoryManager() {
    document.getElementById('memoryManagerModal').style.display = 'none';
}

async function loadMemoriesList(query = '') {
    const memoryList = document.getElementById('memoryList');
    memoryList.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--vscode-text-dim);">Loading memories...</div>';
    
    try {
        const url = query 
            ? `${API_URL}/ai-pair/memory/retrieve?query=${encodeURIComponent(query)}&k=20&workspaceId=${currentWorkspace?._id || ''}`
            : `${API_URL}/ai-pair/memory/retrieve?query=&k=50&workspaceId=${currentWorkspace?._id || ''}`;
            
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success && data.results && data.results.length > 0) {
            memoryList.innerHTML = data.results.map((memory, index) => `
                <div style="padding: 12px; background: var(--vscode-bg); border: 1px solid var(--vscode-border); border-radius: 4px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <div>
                            <span style="color: var(--vscode-statusbar); font-weight: 600; margin-right: 8px;">
                                ${memory.metadata?.type || 'pattern'}
                            </span>
                            ${memory.metadata?.language ? `<span style="color: var(--vscode-text-dim); font-size: 11px;">${memory.metadata.language}</span>` : ''}
                        </div>
                        ${memory.score ? `<span style="color: var(--vscode-text-dim); font-size: 11px;">${(memory.score * 100).toFixed(1)}% match</span>` : ''}
                    </div>
                    <div style="color: var(--vscode-text); font-size: 12px; line-height: 1.5; margin-bottom: 8px; max-height: 100px; overflow-y: auto;">
                        ${memory.content}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: var(--vscode-text-dim); font-size: 10px;">
                            ${memory.metadata?.timestamp ? new Date(memory.metadata.timestamp).toLocaleString() : ''}
                        </span>
                        <button class="btn btn-danger" onclick="deleteMemory('${memory.id}')" style="font-size: 10px; padding: 4px 8px;">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            memoryList.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--vscode-text-dim);">No memories found</div>';
        }
    } catch (error) {
        console.error('Failed to load memories:', error);
        memoryList.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--vscode-error);">Failed to load memories</div>';
    }
}

async function searchMemories() {
    const query = document.getElementById('memorySearchInput').value;
    await loadMemoriesList(query);
}

async function deleteMemory(memoryId) {
    if (!confirm('Delete this memory?')) return;
    
    try {
        // Note: Delete endpoint not yet implemented in backend
        // This is a placeholder for future implementation
        alert('Memory deletion will be implemented in the backend');
        await loadMemoriesList();
    } catch (error) {
        console.error('Failed to delete memory:', error);
        alert('Failed to delete memory');
    }
}

async function clearAllMemories() {
    if (!confirm('Clear ALL memories? This cannot be undone!')) return;
    
    try {
        const response = await fetch(`${API_URL}/ai-pair/memory/clear?workspaceId=${currentWorkspace?._id || ''}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('All memories cleared successfully');
            await loadMemoriesList();
            await loadMemoryAndSandboxStats();
        } else {
            alert('Failed to clear memories: ' + data.message);
        }
    } catch (error) {
        console.error('Failed to clear memories:', error);
        alert('Failed to clear memories');
    }
}

// ============================================
// SANDBOX RUNNER MODAL
// ============================================

function openSandboxRunner() {
    document.getElementById('sandboxRunnerModal').style.display = 'flex';
    
    // Pre-fill with current file content if available
    if (currentFile && editor) {
        const code = editor.getValue();
        document.getElementById('sandboxCodeInput').value = code;
        
        // Set language based on current file
        const langSelect = document.getElementById('sandboxLanguage');
        const fileExt = currentFile.name.split('.').pop().toLowerCase();
        const langMap = {
            'js': 'javascript',
            'py': 'python',
            'java': 'java',
            'go': 'go',
            'rs': 'rust',
            'rb': 'ruby',
            'php': 'php'
        };
        if (langMap[fileExt]) {
            langSelect.value = langMap[fileExt];
        }
    }
}

function closeSandboxRunner() {
    document.getElementById('sandboxRunnerModal').style.display = 'none';
}

async function executeSandboxCode() {
    const code = document.getElementById('sandboxCodeInput').value;
    const language = document.getElementById('sandboxLanguage').value;
    const timeout = parseInt(document.getElementById('sandboxTimeout').value);
    const outputDisplay = document.getElementById('sandboxOutputDisplay');
    
    if (!code.trim()) {
        outputDisplay.innerHTML = '<span style="color: var(--vscode-error);">Please enter code to execute</span>';
        return;
    }
    
    outputDisplay.innerHTML = '<span style="color: var(--vscode-warning);"><i class="fas fa-spinner fa-spin"></i> Executing code...</span>';
    
    try {
        const response = await fetch(`${API_URL}/ai-pair/execute`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code, language, timeout })
        });
        
        const data = await response.json();
        
        if (data.success) {
            let output = '';
            output += `<div style="color: var(--vscode-success); margin-bottom: 8px;">✓ Execution successful</div>`;
            
            if (data.output) {
                output += `<div style="color: #0f0; margin-bottom: 8px;">Output:\n${data.output}</div>`;
            }
            
            if (data.result !== undefined) {
                output += `<div style="color: #0ff; margin-bottom: 8px;">Result: ${data.result}</div>`;
            }
            
            if (data.errors) {
                output += `<div style="color: #ff0; margin-bottom: 8px;">Errors:\n${data.errors}</div>`;
            }
            
            if (data.executionTime !== undefined) {
                output += `<div style="color: var(--vscode-text-dim); font-size: 11px; margin-top: 8px;">Execution time: ${data.executionTime}ms</div>`;
            }
            
            outputDisplay.innerHTML = output;
        } else {
            outputDisplay.innerHTML = `
                <div style="color: var(--vscode-error); margin-bottom: 8px;">✗ Execution failed</div>
                <div style="color: #f00;">${data.message || data.error || 'Unknown error'}</div>
            `;
        }
    } catch (error) {
        console.error('Sandbox execution error:', error);
        outputDisplay.innerHTML = `
            <div style="color: var(--vscode-error); margin-bottom: 8px;">✗ Execution failed</div>
            <div style="color: #f00;">${error.message}</div>
        `;
    }
}

function clearSandboxOutput() {
    document.getElementById('sandboxOutputDisplay').innerHTML = 'Ready to execute code...';
}

// Update the toggle agent mode function to show/hide panels
const originalToggleAgentMode = toggleAgentMode;
toggleAgentMode = function() {
    originalToggleAgentMode();
    updateAgentPanels();
};

// Load stats when workspace is loaded
const originalLoadWorkspace = loadWorkspace;
loadWorkspace = async function() {
    await originalLoadWorkspace();
    if (agentMode) {
        await loadMemoryAndSandboxStats();
    }
};
