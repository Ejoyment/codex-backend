/**
 * Support Center (Figma "Support Agent" flow).
 *
 * The revamped page creates a ticket with a guided category, a short
 * human-readable reference, and optional PNG/JPG/PDF attachments. These
 * tests pin the additive backend contract so the existing JSON clients keep
 * working.
 */
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';
mongoose.set('bufferCommands', false);

jest.doMock('../middleware/auth', () => ({
    authenticateToken: (req, res, next) => next(),
    isUserSessionValid: jest.fn(async () => true),
}));

const savedTickets = [];
jest.doMock('../models/SupportTicket', () => {
    class MockSupportTicket {
        constructor(data) {
            Object.assign(this, data);
            this.ticketId = `TKT-${savedTickets.length + 1}`;
        }

        async save() {
            savedTickets.push(this);
            return this;
        }

        static exists() {
            return Promise.resolve(false);
        }
    }
    return MockSupportTicket;
});

jest.doMock('../models/SupportAgent', () => ({
    findById: jest.fn(),
    findOne: jest.fn(),
}));

const saveSupportAttachment = jest.fn(async (file) => ({
    name: file.originalname,
    size: file.size,
    mimeType: file.mimetype,
    url: `/uploads/support/${file.originalname}`,
    key: file.originalname,
    storage: 'local',
}));
jest.doMock('../utils/supportAttachmentStorage', () => ({
    MAX_BYTES: 10 * 1024 * 1024,
    MAX_FILES: 5,
    ALLOWED_MIME: new Set(['image/png', 'image/jpeg', 'application/pdf']),
    saveSupportAttachment,
}));

const supportRouter = require('../routes/support');
const SupportTicket = require('../models/SupportTicket');

const app = express();
app.use(express.json());
app.use('/api/support', supportRouter);

beforeEach(() => {
    savedTickets.length = 0;
    saveSupportAttachment.mockClear();
});

describe('Support Center ticket creation', () => {
    test('JSON clients still create a ticket and receive a reference', async () => {
        const res = await request(app)
            .post('/api/support/tickets')
            .send({ subject: 'Duplicate charge', description: 'Two invoices', category: 'billing' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.referenceNumber).toMatch(/^BH-\d{5}$/);
        expect(res.body.ticket.category).toBe('billing');
        expect(res.body.ticket.attachments).toEqual([]);
    });

    test('unknown categories fall back to general', async () => {
        const res = await request(app)
            .post('/api/support/tickets')
            .send({ subject: 'Hello', message: 'Body', category: 'not-a-category' });

        expect(res.status).toBe(200);
        expect(res.body.ticket.category).toBe('general');
    });

    test('multipart attachments are persisted on the ticket', async () => {
        const res = await request(app)
            .post('/api/support/tickets')
            .field('subject', 'Billing & payments')
            .field('message', 'Duplicate charge')
            .field('category', 'billing')
            .attach('attachments', Buffer.from('%PDF-1.4 test'), 'invoice.pdf');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(saveSupportAttachment).toHaveBeenCalledTimes(1);

        const saved = savedTickets[0];
        expect(saved.attachments).toHaveLength(1);
        expect(saved.attachments[0]).toMatchObject({ name: 'invoice.pdf', mimeType: 'application/pdf' });
    });

    test('rejects attachments that are not PNG, JPG, or PDF', async () => {
        const res = await request(app)
            .post('/api/support/tickets')
            .field('subject', 'Billing')
            .field('message', 'Body')
            .attach('attachments', Buffer.from('MZ'), 'payload.exe');

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(saveSupportAttachment).not.toHaveBeenCalled();
        expect(savedTickets).toHaveLength(0);
    });

    test('missing subject or message is still a 400 envelope', async () => {
        const res = await request(app)
            .post('/api/support/tickets')
            .send({ subject: 'Only a subject' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual(expect.objectContaining({ success: false }));
    });
});

describe('SupportTicket schema', () => {
    test('stores the support-center fields', () => {
        const realModel = jest.requireActual('../models/SupportTicket');
        const paths = Object.keys(realModel.schema.paths);

        expect(paths).toEqual(expect.arrayContaining([
            'referenceNumber',
            'category',
            'attachments',
        ]));
        expect(SupportTicket).toBeDefined();
    });
});
