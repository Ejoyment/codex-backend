/**
 * Conversation Indexer
 * Embeds messages and meetings into vector memory for semantic search
 */

const vectorMemory = require('./vectorMemory');
const Message = require('../models/Message');
const MeetingRoom = require('../models/MeetingRoom');

class ConversationIndexer {
    /**
     * Index a single message
     */
    async indexMessage(message) {
        try {
            if (!message || message.deleted) return;
            
            // Build content for embedding
            let content = `[Message from ${message.sender?.name || 'user'}]: ${message.content}`;
            
            // Add thread context if exists
            if (message.parentMessage) {
                content = `[Thread Reply] ${content}`;
            }
            
            const metadata = {
                type: 'message',
                companyId: message.company?.toString(),
                channelId: message.channel?.toString(),
                messageId: message._id?.toString(),
                senderId: message.sender?.toString(),
                recipientId: message.recipient?.toString(),
                mentions: message.mentions?.map(m => m.toString()) || [],
                createdAt: message.createdAt || new Date(),
                projectId: message.projectId?.toString() || null
            };

            await vectorMemory.store(
                content,
                metadata,
                message.sender,
                message.company
            );
        } catch (error) {
            console.error('Error indexing message:', error.message);
        }
    }

    /**
     * Index a meeting
     */
    async indexMeeting(meeting) {
        try {
            if (!meeting) return;
            
            // Build distilled content
            let content = `[Meeting: ${meeting.title}]\n`;
            if (meeting.notes) {
                content += `Notes: ${meeting.notes}\n`;
            }
            if (meeting.transcript) {
                // Truncate long transcripts
                const transcript = meeting.transcript.length > 2000 
                    ? meeting.transcript.substring(0, 2000) + '...'
                    : meeting.transcript;
                content += `Transcript: ${transcript}\n`;
            }
            if (meeting.summary) {
                content += `Summary: ${meeting.summary}\n`;
            }

            const metadata = {
                type: 'meeting',
                companyId: meeting.company?.toString(),
                meetingId: meeting._id?.toString(),
                hostId: meeting.host?.toString(),
                participants: meeting.participants?.map(p => p.user?.toString()) || [],
                linkedTaskIds: meeting.linkedTaskIds?.map(id => id.toString()) || [],
                projectId: meeting.projectId?.toString() || null,
                scheduledAt: meeting.scheduledAt,
                status: meeting.status
            };

            await vectorMemory.store(
                content,
                metadata,
                meeting.host,
                meeting.company
            );
        } catch (error) {
            console.error('Error indexing meeting:', error.message);
        }
    }

    /**
     * Backfill messages from last N days
     */
    async backfillMessages(companyId, days = 90) {
        try {
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            const messages = await Message.find({
                company: companyId,
                createdAt: { $gte: since },
                deleted: { $ne: true }
            })
                .populate('sender', 'name')
                .limit(1000)
                .lean();

            console.log(`Backfilling ${messages.length} messages...`);
            for (const msg of messages) {
                await this.indexMessage(msg);
            }
            console.log('Backfill complete');
        } catch (error) {
            console.error('Error backfilling messages:', error);
        }
    }
}

module.exports = new ConversationIndexer();
