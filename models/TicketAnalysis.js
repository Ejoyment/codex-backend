const mongoose = require('mongoose');

const ticketAnalysisSchema = new mongoose.Schema({
    ticketId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SupportTicket',
        required: true
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        default: null
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    analysisStatus: {
        type: String,
        enum: ['pending', 'analyzing', 'completed', 'failed'],
        default: 'pending'
    },
    extractedContext: {
        errorType: String,
        affectedComponent: String,
        probableFile: String,
        probableLine: Number,
        stackTrace: String,
        keywords: [String],
        summary: String
    },
    linkedFiles: [{
        filePath: String,
        repository: String,
        branch: String,
        commitSha: String,
        relevanceScore: Number
    }],
    suggestedFix: {
        description: String,
        patch: String,
        testCase: String,
        confidence: Number,
        references: [String]
    },
    sandboxState: {
        url: String,
        expiresAt: Date,
        branch: String,
        commitSha: String
    },
    analyzedAt: {
        type: Date,
        default: null
    },
    analyzedBy: {
        type: String,
        enum: ['ai', 'human'],
        default: 'ai'
    }
}, {
    timestamps: true
});

ticketAnalysisSchema.index({ ticketId: 1 });
ticketAnalysisSchema.index({ userId: 1, analysisStatus: 1 });

module.exports = mongoose.model('TicketAnalysis', ticketAnalysisSchema);
