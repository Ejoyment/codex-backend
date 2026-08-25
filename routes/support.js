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

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

/**
 * @swagger
 * /api/support/agent/login:
 *   post:
 *     summary: Support agent login
 *     tags:
 *       - Support System
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Agent logged in successfully
 *       401:
 *         description: Invalid credentials
 */
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
            process.env.JWT_SECRET,
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

/**
 * @swagger
 * /api/support/agent/logout:
 *   post:
 *     summary: Support agent logout
 *     tags:
 *       - Support System
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Agent logged out successfully
 *       401:
 *         description: Unauthorized
 */
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
 *               guestName:
 *                 type: string
 *               guestEmail:
 *                 type: string
 *               message:
 *                 type: string
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

/**
 * @swagger
 * /api/support/tickets/{ticketId}:
 *   get:
 *     summary: Get ticket by ID
 *     tags:
 *       - Support System
 *     parameters:
 *       - name: ticketId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket details
 *       404:
 *         description: Ticket not found
 */
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

/**
 * @swagger
 * /api/support/agent/tickets:
 *   get:
 *     summary: Get all tickets (agent only)
 *     tags:
 *       - Support System
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [open, in-progress, resolved, closed]
 *       - name: priority
 *         in: query
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *       - name: assignedTo
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of tickets
 *       401:
 *         description: Unauthorized
 */
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

/**
 * @swagger
 * /api/support/agent/tickets/{ticketId}/assign:
 *   put:
 *     summary: Assign ticket to agent
 *     tags:
 *       - Support System
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: ticketId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket assigned successfully
 *       404:
 *         description: Ticket not found
 *       401:
 *         description: Unauthorized
 */
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

/**
 * @swagger
 * /api/support/agent/tickets/{ticketId}/status:
 *   put:
 *     summary: Update ticket status
 *     tags:
 *       - Support System
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: ticketId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, in-progress, resolved, closed]
 *     responses:
 *       200:
 *         description: Ticket status updated
 *       404:
 *         description: Ticket not found
 *       401:
 *         description: Unauthorized
 */
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

/**
 * @swagger
 * /api/support/agent/stats:
 *   get:
 *     summary: Get agent statistics
 *     tags:
 *       - Support System
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Agent statistics
 *       401:
 *         description: Unauthorized
 */
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

/**
 * @swagger
 * /api/support/agents/online:
 *   get:
 *     summary: Get all online agents
 *     tags:
 *       - Support System
 *     responses:
 *       200:
 *         description: List of online agents
 */
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

/**
 * @swagger
 * /api/support/agent/register:
 *   post:
 *     summary: Register a new support agent account
 *     description: Allows a new agent to create their own account. Email is auto-generated using their name with @buildrshq.dev domain.
 *     tags:
 *       - Support System
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 description: Full name of the agent
 *                 example: John Doe
 *               password:
 *                 type: string
 *                 description: Password for the agent account
 *                 example: SecurePassword123
 *     responses:
 *       201:
 *         description: Agent account created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 agent:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *       400:
 *         description: Invalid input or email already exists
 */
// Agent Self-Registration
router.post('/agent/register', async (req, res) => {
    try {
        const { name, password } = req.body;

        // Validation
        if (!name || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Please provide your name and password' 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                error: 'Password must be at least 6 characters long' 
            });
        }

        // Generate email from name: firstname@buildrshq.dev
        // Extract first name, convert to lowercase, remove spaces and special characters
        const nameParts = name.trim().split(/\s+/);
        const firstName = nameParts[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        
        if (!firstName) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid name provided' 
            });
        }

        const generatedEmail = `${firstName}@buildrshq.dev`;

        // Check if agent with this email already exists
        const existingAgent = await SupportAgent.findOne({ email: generatedEmail });
        if (existingAgent) {
            return res.status(400).json({ 
                success: false, 
                error: 'An agent account with this email already exists. Please contact admin if this is your account.' 
            });
        }

        // Create the agent account
        const agent = new SupportAgent({
            name: name.trim(),
            email: generatedEmail,
            password: password,
            role: 'agent',
            status: 'offline'
        });

        await agent.save();

        res.status(201).json({
            success: true,
            message: 'Agent account created successfully!',
            agent: {
                id: agent._id,
                name: agent.name,
                email: agent.email,
                role: agent.role
            },
            loginUrl: '/support-admin'
        });
    } catch (error) {
        console.error('Agent registration error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create agent account' 
        });
    }
});

/**
 * @swagger
 * /api/support/setup/demo-agent:
 *   post:
 *     summary: Setup demo support agent
 *     tags:
 *       - Support System
 *     responses:
 *       200:
 *         description: Demo agent created or already exists
 */
// Setup Demo Agent (One-time setup endpoint)
router.post('/setup/demo-agent', async (req, res) => {
    try {
        const demoEmail = process.env.DEMO_AGENT_EMAIL || 'agent@buildershq.com';
        const demoPassword = process.env.DEMO_AGENT_PASSWORD;

        if (!demoPassword) {
            return res.status(500).json({ 
                error: 'DEMO_AGENT_PASSWORD environment variable not set. Please configure it before setting up a demo agent.' 
            });
        }

        // Check if agent already exists
        const existingAgent = await SupportAgent.findOne({ email: demoEmail });
        if (existingAgent) {
            return res.json({ 
                message: 'Demo agent already exists!',
                email: demoEmail,
                hint: 'See DEMO_AGENT_PASSWORD env var for login'
            });
        }

        // Create demo agent
        const agent = new SupportAgent({
            name: process.env.DEMO_AGENT_NAME || 'Demo Support Agent',
            email: demoEmail,
            password: demoPassword,
            role: 'agent',
            status: 'offline'
        });

        await agent.save();

        res.json({
            success: true,
            message: 'Demo support agent created successfully!',
            email: demoEmail,
            loginHint: 'Use DEMO_AGENT_PASSWORD env var for login',
            loginUrl: '/support-admin'
        });
    } catch (error) {
        console.error('Setup demo agent error:', error);
        res.status(500).json({ error: 'Failed to create demo agent' });
    }
});

module.exports = router;