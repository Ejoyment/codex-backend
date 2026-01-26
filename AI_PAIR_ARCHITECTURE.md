# 🏗️ AI Pair Programming - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        USER BROWSER                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              ai-pair.html (Frontend UI)                 │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │ │
│  │  │ File Browser │  │ Code Editor  │  │ Chat Interface│ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │ │
│  │                                                          │ │
│  │              js/ai-pair.js (Frontend Logic)             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/REST API
                              │ (JWT Auth)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND SERVER (Node.js)                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              routes/ai-pair.js (API Routes)             │ │
│  │  • /repos          • /session        • /chat           │ │
│  │  • /files          • /apply-change   • /commit         │ │
│  └────────────────────────────────────────────────────────┘ │
│                              │                               │
│         ┌────────────────────┼────────────────────┐         │
│         ▼                    ▼                    ▼         │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Gemini    │    │   GitHub     │    │   MongoDB    │  │
│  │   Service   │    │   Service    │    │   Database   │  │
│  └─────────────┘    └──────────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                     │                     │
         ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ Google       │      │ GitHub       │      │ MongoDB      │
│ Gemini AI    │      │ API          │      │ Atlas        │
│ (External)   │      │ (External)   │      │ (Cloud)      │
└──────────────┘      └──────────────┘      └──────────────┘
```

## Component Details

### Frontend Layer

#### 1. ai-pair.html
- **Purpose**: User interface
- **Components**:
  - Top bar (repo selector, session info, usage counter)
  - Left pane (file browser + code editor)
  - Right pane (chat interface)
- **Technologies**: HTML5, Tailwind CSS, Highlight.js, Marked.js

#### 2. js/ai-pair.js
- **Purpose**: Frontend logic and API communication
- **Responsibilities**:
  - Repository management
  - File operations
  - Chat functionality
  - Code editing
  - State management
- **Technologies**: Vanilla JavaScript, Fetch API

### Backend Layer

#### 1. routes/ai-pair.js
- **Purpose**: API endpoints
- **Endpoints**: 11 REST endpoints
- **Middleware**:
  - JWT authentication
  - AI usage limits
  - Error handling
- **Technologies**: Express.js

#### 2. utils/geminiService.js
- **Purpose**: AI integration
- **Features**:
  - Chat with context
  - Code analysis
  - Code generation
  - Streaming responses
- **Technologies**: Google Generative AI SDK

#### 3. utils/githubService.js
- **Purpose**: GitHub integration
- **Features**:
  - Repository access
  - File operations
  - Commit management
  - Branch operations
- **Technologies**: Octokit (GitHub API)

### Data Layer

#### 1. models/AIPairSession.js
```javascript
{
  userId: ObjectId,
  repositoryId: String,
  repositoryName: String,
  repositoryOwner: String,
  branch: String,
  sessionName: String,
  status: String,
  totalMessages: Number,
  totalCommits: Number,
  totalEdits: Number
}
```

#### 2. models/ChatMessage.js
```javascript
{
  sessionId: ObjectId,
  userId: ObjectId,
  role: String, // 'user' or 'assistant'
  content: String,
  codeBlocks: Array,
  fileReferences: Array,
  createdAt: Date
}
```

#### 3. models/CodeChange.js
```javascript
{
  sessionId: ObjectId,
  userId: ObjectId,
  filePath: String,
  operation: String, // 'create', 'edit', 'delete'
  oldContent: String,
  newContent: String,
  diff: String,
  status: String, // 'pending', 'applied'
  commitSha: String,
  appliedAt: Date
}
```

## Data Flow

### 1. User Selects Repository
```
User clicks dropdown
    ↓
Frontend loads repos from /api/ai-pair/repos
    ↓
GitHub Service fetches from GitHub API
    ↓
Returns list to frontend
    ↓
User selects repo
    ↓
Frontend creates session via /api/ai-pair/session
    ↓
Session saved to MongoDB
    ↓
Files loaded from GitHub
```

### 2. User Opens File
```
User clicks file in browser
    ↓
Frontend requests /api/ai-pair/file/:owner/:repo/:path
    ↓
GitHub Service fetches file content
    ↓
Content displayed in editor
    ↓
File context stored in frontend state
```

### 3. User Chats with AI
```
User types message and clicks send
    ↓
Frontend sends to /api/ai-pair/chat with context
    ↓
Backend checks AI usage limits
    ↓
Message saved to ChatMessage collection
    ↓
Gemini Service processes with context
    ↓
AI response generated
    ↓
Response saved to ChatMessage collection
    ↓
Response sent to frontend
    ↓
Displayed in chat interface
```

### 4. User Saves Code
```
User edits code and clicks save
    ↓
Frontend sends to /api/ai-pair/apply-change
    ↓
CodeChange created with diff
    ↓
Frontend sends to /api/ai-pair/commit
    ↓
GitHub Service commits to repository
    ↓
CodeChange updated with commit SHA
    ↓
Success message shown to user
```

## Security Architecture

### Authentication Flow
```
User logs in
    ↓
JWT token generated
    ↓
Token stored in localStorage
    ↓
Token sent with every API request
    ↓
Backend verifies token
    ↓
User ID extracted from token
    ↓
Request processed for that user
```

### Authorization Checks
```
1. JWT token validation
2. User ownership verification
3. Subscription tier check
4. AI usage limit check
5. GitHub token validation
6. Repository access verification
```

## Performance Optimizations

### 1. Caching
- GitHub client cached per user
- Repository data cached in frontend
- File tree cached until refresh

### 2. Lazy Loading
- Files loaded on demand
- Chat history paginated
- Code changes loaded per session

### 3. Parallel Requests
- Repository and branches loaded together
- User profile and subscription loaded in parallel
- Multiple file operations batched

### 4. Efficient Queries
- MongoDB indexes on userId, sessionId
- Limit query results (100 messages, 50 changes)
- Select only needed fields

## Scalability Considerations

### Horizontal Scaling
- Stateless API design
- JWT for authentication (no server sessions)
- MongoDB for distributed data
- Load balancer ready

### Vertical Scaling
- Efficient memory usage
- Connection pooling
- Async/await for non-blocking I/O
- Stream processing for large files

### Rate Limiting
- Tier-based AI message limits
- GitHub API rate limit handling
- Request throttling per user
- Graceful degradation

## Error Handling

### Frontend
```
Try-catch blocks
    ↓
User-friendly error messages
    ↓
Loading states
    ↓
Retry mechanisms
    ↓
Fallback UI
```

### Backend
```
Input validation
    ↓
Try-catch blocks
    ↓
Error logging
    ↓
Appropriate HTTP status codes
    ↓
Detailed error messages (dev mode)
    ↓
Generic messages (production)
```

## Monitoring & Logging

### Metrics to Track
- API response times
- AI response times
- GitHub API calls
- Error rates
- User activity
- AI usage per tier
- Session duration
- Code changes per session

### Logging Points
- API requests/responses
- AI interactions
- GitHub operations
- Database queries
- Errors and exceptions
- User actions
- Performance metrics

## Future Architecture Enhancements

### Phase 2
- WebSocket for real-time streaming
- Redis for caching
- Message queue for async tasks
- CDN for static assets

### Phase 3
- Microservices architecture
- Kubernetes deployment
- GraphQL API
- Real-time collaboration
- Advanced analytics

---

**Architecture Version**: 1.0.0
**Last Updated**: January 25, 2026
**Status**: Production Ready
