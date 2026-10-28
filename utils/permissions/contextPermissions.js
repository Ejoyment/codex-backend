/**
 * Context Permissions Helper
 * Ensures only accessible data is included in agent context
 */

const Company = require('../../models/Company');
const Channel = require('../../models/Channel');
const MeetingRoom = require('../../models/MeetingRoom');

class ContextPermissions {
    async isCompanyMember(userId, companyId) {
        if (!userId || !companyId) return false;
        try {
            const company = await Company.findById(companyId)
                .select('owner members')
                .lean();
            if (!company) return false;
            if (company.owner?.toString() === userId.toString()) return true;
            return company.members?.some(m => (m.user?.toString() || m.toString()) === userId.toString()) || false;
        } catch (error) {
            console.error('Error checking company membership:', error);
            return false;
        }
    }

    async canAccessChannel(userId, channelId, companyId) {
        if (!userId || !channelId) return false;
        try {
            const channel = await Channel.findById(channelId)
                .select('company members type isPrivate')
                .lean();
            if (!channel) return false;
            if (companyId && channel.company?.toString() !== companyId.toString()) return false;
            if (!(await this.isCompanyMember(userId, channel.company))) return false;
            if (!channel.isPrivate) return true;
            return channel.members?.some(m => (m.user?.toString() || m.toString()) === userId.toString()) || false;
        } catch (error) {
            console.error('Error checking channel access:', error);
            return false;
        }
    }

    async canAccessDM(userId, otherUserId, companyId) {
        if (!userId || !otherUserId || userId.toString() === otherUserId.toString()) return false;
        try {
            const [userInCompany, otherInCompany] = await Promise.all([
                this.isCompanyMember(userId, companyId),
                this.isCompanyMember(otherUserId, companyId)
            ]);
            return userInCompany && otherInCompany;
        } catch (error) {
            console.error('Error checking DM access:', error);
            return false;
        }
    }

    async canAccessMeeting(userId, meetingId, companyId) {
        if (!userId || !meetingId) return false;
        try {
            const meeting = await MeetingRoom.findById(meetingId)
                .select('company host participants')
                .lean();
            if (!meeting) return false;
            if (companyId && meeting.company?.toString() !== companyId.toString()) return false;
            if (!(await this.isCompanyMember(userId, meeting.company))) return false;
            if (meeting.host?.toString() === userId.toString()) return true;
            return meeting.participants?.some(p => p.user?.toString() === userId.toString()) || false;
        } catch (error) {
            console.error('Error checking meeting access:', error);
            return false;
        }
    }

    async getAccessibleChannelIds(userId, companyId) {
        if (!userId || !companyId) return [];
        try {
            if (!(await this.isCompanyMember(userId, companyId))) return [];
            const channels = await Channel.find({ company: companyId })
                .select('_id members isPrivate')
                .lean();
            const accessible = [];
            for (const channel of channels) {
                if (!channel.isPrivate) {
                    accessible.push(channel._id);
                } else if (channel.members?.some(m => (m.user?.toString() || m.toString()) === userId.toString())) {
                    accessible.push(channel._id);
                }
            }
            return accessible;
        } catch (error) {
            console.error('Error getting accessible channels:', error);
            return [];
        }
    }
}

module.exports = new ContextPermissions();
