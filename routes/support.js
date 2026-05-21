const express = require('express');
const router = express.Router();
const SupportTicket = require('../models/SupportTicket');
const SupportAgent = require('../models/SupportAgent');
const jwt = require('jsonwebtoken');

// Middleware to verify support agent token
const verifySupportAgent = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const agent = await SupportAgent.findById(decoded.agentId);
        
        if (!agent) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        req.agent = agent;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Support Agent Login
router.post('/agent/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const agent = await SupportAgent.findOne({ email });
        if (!agent) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await agent.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update status to online
        agent.status = 'online';
        agent.lastActive = new Date();
        await agent.save();

        const token = jwt.sign(
            { agentId: agent._id, role: agent.role },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '8h' }
        );

        res.json({
            token,
            agent: {
                id: agent._id,
                name: agent.name,
                email: agent.email,
                role: agent.role,
                status: agent.status
            }
        });
    } catch (error) {
        console.error('Agent login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Support Agent Logout
router.post('/agent/logout', verifySupportAgent, async (req, res) => {
    try {
        req.agent.status = 'offline';
        await req.agent.save();
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Logout failed' });
    }
});

/**
 * @swagger
 * /api/support/tickets:
 *   post:
 *     summary: Create a support ticket
 *     tags:
 *       - Support System
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               subject:
 *                 type: string
 *                 example: "AI assistant not responding"
 *               guestName:
 *                 type: string
 *                 example: "John Doe"
 *               guestEmail:
 *                 type: string
 *                 example: "john@example.com"
 *               message:
 *                 type: string
 *                 example: "The AI pair programmer stopped responding after 2 messages"
 *               userId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Support ticket created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 ticket:
 *                   type: object
 */
// Create Support Ticket (Public)
router.post('/tickets', async (req, res) => {
    try {
        const { subject, guestName, guestEmail, message, userId } = req.body;

        const ticket = new SupportTicket({
            subject,
            guestName: guestName || 'Guest',
            guestEmail,
            userId: userId || null,
            messages: [{
                sender: 'user',
                senderName: guestName || 'Guest',
                message,
                timestamp: new Date()
            }]
        });

        await ticket.save();

        res.json({
            ticketId: ticket.ticketId,
            ticket
        });
    } catch (error) {
        console.error('Create ticket error:', error);
        res.status(500).json({ error: 'Failed to create ticket' });
    }
});

// Get Ticket by ID (Public)
router.get('/tickets/:ticketId', async (req, res) => {
    try {
        const ticket = await SupportTicket.findOne({ ticketId: req.params.ticketId });
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch ticket' });
    }
});

// Get All Tickets (Agent Only)
router.get('/agent/tickets', verifySupportAgent, async (req, res) => {
    try {
        const { status, priority, assignedTo } = req.query;
        const filter = {};

        if (status) filter.status = status;
        if (priority) filter.priority = priority;
        if (assignedTo === 'me') filter.assignedTo = req.agent._id;

        const tickets = await SupportTicket.find(filter)
            .sort({ updatedAt: -1 })
            .populate('assignedTo', 'name email')
            .limit(100);

        res.json(tickets);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tickets' });
    }
});

// Assign Ticket to Agent
router.put('/agent/tickets/:ticketId/assign', verifySupportAgent, async (req, res) => {
    try {
        const ticket = await SupportTicket.findOne({ ticketId: req.params.ticketId });
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        ticket.assignedTo = req.agent._id;
        ticket.status = 'in-progress';
        await ticket.save();

        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: 'Failed to assign ticket' });
    }
});

// Update Ticket Status
router.put('/agent/tickets/:ticketId/status', verifySupportAgent, async (req, res) => {
    try {
        const { status } = req.body;
        const ticket = await SupportTicket.findOne({ ticketId: req.params.ticketId });
        
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        ticket.status = status;
        if (status === 'resolved' || status === 'closed') {
            ticket.resolvedAt = new Date();
        }
        await ticket.save();

        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update ticket' });
    }
});

// Get Agent Stats
router.get('/agent/stats', verifySupportAgent, async (req, res) => {
    try {
        const totalTickets = await SupportTicket.countDocuments({ assignedTo: req.agent._id });
        const openTickets = await SupportTicket.countDocuments({ 
            assignedTo: req.agent._id, 
            status: { $in: ['open', 'in-progress'] }
        });
        const resolvedToday = await SupportTicket.countDocuments({
            assignedTo: req.agent._id,
            resolvedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        });

        res.json({
            totalTickets,
            openTickets,
            resolvedToday,
            averageRating: req.agent.averageRating
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Get All Online Agents
router.get('/agents/online', async (req, res) => {
    try {
        const agents = await SupportAgent.find({ 
            status: { $in: ['online', 'away'] } 
        }).select('name status');
        res.json(agents);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch agents' });
    }
});

// Setup Demo Agent (One-time setup endpoint)
router.post('/setup/demo-agent', async (req, res) => {
    try {
        // Check if agent already exists
        const existingAgent = await SupportAgent.findOne({ email: 'agent@buildershq.com' });
        if (existingAgent) {
            return res.json({ 
                message: 'Demo agent already exists!',
                credentials: {
                    email: 'agent@buildershq.com',
                    password: 'agent123'
                }
            });
        }

        // Create demo agent
        const agent = new SupportAgent({
            name: 'Demo Support Agent',
            email: 'agent@buildershq.com',
            password: 'agent123',
            role: 'agent',
            status: 'offline'
        });

        await agent.save();

        res.json({
            success: true,
            message: 'Demo support agent created successfully!',
            credentials: {
                email: 'agent@buildershq.com',
                password: 'agent123'
            },
            loginUrl: '/support-admin.html'
        });
    } catch (error) {
        console.error('Setup demo agent error:', error);
        res.status(500).json({ error: 'Failed to create demo agent' });
    }
});

module.exports = router;
