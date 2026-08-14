const request = require('supertest');
const app = require('../server');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const aiService = require('../utils/aiService');

// Mock aiService
jest.mock('../utils/aiService', () => ({
    reviewCode: jest.fn(),
    debugCode: jest.fn(),
    chat: jest.fn(),
    getAvailableProvider: jest.fn().mockReturnValue('groq'),
    providers: {
        groq: { name: 'Groq (Fast Inference)' }
    }
}));

describe('AI Features API Endpoints', () => {
    let token;
    let userId;

    beforeAll(async () => {
        // Connect to a test database if not already connected
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/codex-test');
        }

        // Create a test user
        const user = await User.create({
            fullName: 'Test AI User',
            email: `test-ai-${Date.now()}@example.com`,
            password: 'password123',
            isVerified: true
        });
        userId = user._id;

        // Create a subscription for the user
        await Subscription.create({
            userId: userId,
            tier: 'professional',
            status: 'active'
        });

        // Generate token
        token = jwt.sign({ id: userId }, process.env.JWT_SECRET || 'your-secret-key');
    });

    afterAll(async () => {
        await User.deleteMany({ email: /test-ai-/ });
        await Subscription.deleteMany({ userId: userId });
        await mongoose.connection.close();
    });

    describe('POST /api/ai-pair/review', () => {
        test('should return 401 if no token provided', async () => {
            const res = await request(app)
                .post('/api/ai-pair/review')
                .send({ code: 'console.log("test")' });
            expect(res.status).toBe(401);
        });

        test('should return 400 if code is missing', async () => {
            const res = await request(app)
                .post('/api/ai-pair/review')
                .set('Authorization', `Bearer ${token}`)
                .send({ language: 'javascript' });
            expect(res.status).toBe(400);
            expect(res.body.message).toContain('Code is required');
        });

        test('should return 200 and review content on success', async () => {
            aiService.reviewCode.mockResolvedValue({
                success: true,
                content: 'This code looks good, but consider adding a comment.',
                codeBlocks: [],
                fileReferences: []
            });

            const res = await request(app)
                .post('/api/ai-pair/review')
                .set('Authorization', `Bearer ${token}`)
                .send({ code: 'console.log("hello world")', language: 'javascript' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.review).toBeDefined();
            expect(aiService.reviewCode).toHaveBeenCalledWith('console.log("hello world")', 'javascript', {});
        });

        test('should return 500 if AI service fails', async () => {
            aiService.reviewCode.mockResolvedValue({
                success: false,
                error: 'Provider unavailable'
            });

            const res = await request(app)
                .post('/api/ai-pair/review')
                .set('Authorization', `Bearer ${token}`)
                .send({ code: 'some code' });

            expect(res.status).toBe(500);
            expect(res.body.message).toContain('AI review failed');
        });
    });

    describe('POST /api/ai-pair/debug', () => {
        test('should return 200 and debug advice on success', async () => {
            aiService.debugCode.mockResolvedValue({
                success: true,
                content: 'The error is caused by a missing semicolon.',
                codeBlocks: [{ language: 'javascript', code: 'console.log("fixed");' }],
                fileReferences: []
            });

            const res = await request(app)
                .post('/api/ai-pair/debug')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    code: 'console.log("broken")',
                    language: 'javascript',
                    error: 'SyntaxError: Unexpected token'
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.debugAdvice).toBeDefined();
            expect(res.body.codeBlocks).toHaveLength(1);
            expect(aiService.debugCode).toHaveBeenCalledWith('console.log("broken")', 'javascript', 'SyntaxError: Unexpected token', {});
        });
    });
});
