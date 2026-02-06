/**
 * Agent Confirmation Routes
 * Handles human-in-the-loop confirmation responses
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// Get pending confirmations for current user
router.get('/pending', auth, async (req, res) => {
    try {
        const agentOrchestrator = require('../utils/agentOrchestrator');
        const pending = agentOrchestrator.hitlGates.getPendingConfirmations(req.user._id.toString());
        
        res.json({
            success: true,
            confirmations: pending
        });
    } catch (error) {
        console.error('Error fetching pending confirmations:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Respond to confirmation request
router.post('/respond', auth, async (req, res) => {
    try {
        const { confirmationId, approved, reason } = req.body;
        
        if (!confirmationId) {
            return res.status(400).json({
                success: false,
                error: 'confirmationId is required'
            });
        }
        
        const agentOrchestrator = require('../utils/agentOrchestrator');
        const result = agentOrchestrator.hitlGates.handleConfirmationResponse(
            confirmationId,
            approved === true,
            reason
        );
        
        res.json(result);
    } catch (error) {
        console.error('Error responding to confirmation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
