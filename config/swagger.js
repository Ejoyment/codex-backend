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
            location: { type: 'string' }
          }
        },
        Subscription: {
          type: 'object',
          properties: {
            tier: { type: 'string', enum: ['freebie', 'professional', 'enterprise'] },
            status: { type: 'string', enum: ['active', 'cancelled', 'expired', 'trial'] },
            features: { type: 'object' },
            pricing: { type: 'object' }
          }
        },
        Integration: {
          type: 'object',
          properties: {
            provider: { type: 'string', enum: ['github', 'discord', 'slack', 'notion', 'figma'] },
            isActive: { type: 'boolean' },
            lastSyncedAt: { type: 'string', format: 'date-time' }
          }
        },
        AIPairSession: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            repository: { type: 'string' },
            status: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./routes/*.js', './server.js']
};

const specs = swaggerJsdoc(options);
module.exports = specs;
