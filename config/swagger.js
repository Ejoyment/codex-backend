const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CODEX INC Backend API',
      description: 'Enterprise AI Developer Platform - Complete API Reference',
      version: '1.0.0',
      contact: {
        name: 'CODEX Support',
        email: 'api-support@codexinc.com'
      },
      license: {
        name: 'ISC'
      }
    },
    servers: [
      {
        url: 'https://codex-backend-7utu.onrender.com',
        description: 'Production Server'
      },
      {
        url: 'http://localhost:3000',
        description: 'Development Server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            fullName: { type: 'string' },
            email: { type: 'string' },
            profilePicture: { type: 'string' },
            isVerified: { type: 'boolean' },
            bio: { type: 'string' },
            title: { type: 'string' },
            phone: { type: 'string' },
            location: { type: 'string' },
            role: { type: 'array', items: { type: 'string' } },
            company: { type: 'string' },
            teamSize: { type: 'string' },
            onboardingCompleted: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            lastLogin: { type: 'string', format: 'date-time' }
          }
        },
        Subscription: {
          type: 'object',
          properties: {
            tier: { type: 'string', enum: ['freebie', 'professional', 'enterprise'] },
            status: { type: 'string', enum: ['active', 'cancelled', 'expired', 'trial'] },
            features: { type: 'object' },
            pricing: { type: 'object' },
            trialEndsAt: { type: 'string', format: 'date-time' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' }
          }
        },
        Integration: {
          type: 'object',
          properties: {
            provider: { type: 'string', enum: ['github', 'discord', 'slack', 'notion', 'figma', 'vscode'] },
            isActive: { type: 'boolean' },
            providerUsername: { type: 'string' },
            providerEmail: { type: 'string' },
            lastSyncedAt: { type: 'string', format: 'date-time' }
          }
        },
        AIPairSession: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            repositoryName: { type: 'string' },
            repositoryOwner: { type: 'string' },
            branch: { type: 'string' },
            sessionName: { type: 'string' },
            status: { type: 'string', enum: ['active', 'completed', 'archived'] },
            totalMessages: { type: 'integer' },
            totalCommits: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            lastActivityAt: { type: 'string', format: 'date-time' }
          }
        },
        Company: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
            description: { type: 'string' },
            logo: { type: 'string' },
            owner: { $ref: '#/components/schemas/User' },
            memberCount: { type: 'integer' },
            memberLimit: { type: 'integer' },
            tier: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Channel: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            type: { type: 'string', enum: ['public', 'private', 'direct'] },
            members: { type: 'array', items: { type: 'object' } },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Message: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            content: { type: 'string' },
            sender: { $ref: '#/components/schemas/User' },
            type: { type: 'string', enum: ['text', 'file', 'code', 'image'] },
            edited: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Meeting: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            host: { $ref: '#/components/schemas/User' },
            roomId: { type: 'string' },
            status: { type: 'string', enum: ['scheduled', 'ongoing', 'completed', 'cancelled'] },
            scheduledAt: { type: 'string', format: 'date-time' },
            duration: { type: 'integer', description: 'Duration in minutes' }
          }
        },
        SupportTicket: {
          type: 'object',
          properties: {
            ticketId: { type: 'string' },
            subject: { type: 'string' },
            guestName: { type: 'string' },
            guestEmail: { type: 'string' },
            status: { type: 'string', enum: ['open', 'in-progress', 'resolved', 'closed'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            messages: { type: 'array', items: { type: 'object' } },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string' },
            title: { type: 'string' },
            message: { type: 'string' },
            read: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        CodeFile: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            language: { type: 'string' },
            content: { type: 'string' },
            path: { type: 'string' },
            createdBy: { $ref: '#/components/schemas/User' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Invitation: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'accepted', 'declined'] },
            invitedBy: { $ref: '#/components/schemas/User' },
            company: { $ref: '#/components/schemas/Company' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    tags: [
      { name: 'Authentication', description: 'User registration, login, OAuth, and account management' },
      { name: 'Email Verification', description: 'OTP-based email verification' },
      { name: 'Profile', description: 'User profile management' },
      { name: 'Subscription & Billing', description: 'Subscription plans, Stripe billing, and payment management' },
      { name: 'Trial Billing (Stripe)', description: 'Stripe-based trial billing with card setup' },
      { name: 'Paystack Billing', description: 'Paystack payment integration for NGN billing' },
      { name: 'Flutterwave Billing', description: 'Flutterwave payment integration for NGN billing' },
      { name: 'Integrations', description: 'OAuth integrations with GitHub, Discord, Slack, Notion, Figma, VS Code' },
      { name: 'Dashboard', description: 'Dashboard data and integration sync' },
      { name: 'AI Pair Programming', description: 'AI-powered pair programming sessions, chat, and code execution' },
      { name: 'Code Editor', description: 'Code file management and collaboration' },
      { name: 'Company', description: 'Company/workspace management and team members' },
      { name: 'Invitations', description: 'Team invitation management' },
      { name: 'Messaging', description: 'Real-time team messaging and channels' },
      { name: 'Meetings', description: 'Video meeting management' },
      { name: 'Collaboration', description: 'Real-time code collaboration sessions' },
      { name: 'Support System', description: 'Customer support tickets and agent management' },
      { name: 'Notifications', description: 'User notification management' },
      { name: 'GitHub API', description: 'Direct GitHub repository, branch, file, issue, and PR management' },
      { name: 'GitHub Advanced', description: 'Advanced GitHub operations with AI assistance' },
      { name: 'Discord API', description: 'Discord server, channel, and message management' },
      { name: 'Slack API', description: 'Slack workspace, channel, and message management' },
      { name: 'Notion API', description: 'Notion pages, databases, and block management' },
      { name: 'Figma API', description: 'Figma file, component, and comment management' },
      { name: 'LSP', description: 'Language Server Protocol - IntelliSense, completions, hover, definitions' },
      { name: 'Virtual File System', description: 'Workspace file tree, lazy loading, and code search' },
      { name: 'Terminal', description: 'Terminal session management (REST; real-time via Socket.IO)' },
      { name: 'Git', description: 'Git version control operations on workspaces' },
      { name: 'Debugger', description: 'Debug session management with breakpoints and stepping' },
      { name: 'Agent Confirmation', description: 'Human-in-the-loop confirmation for AI agent actions' },
      { name: 'Health', description: 'Server health and status endpoints' }
    ]
  },
  apis: ['./routes/*.js', './server.js'],
};

const specs = swaggerJsdoc(options);
module.exports = specs;
