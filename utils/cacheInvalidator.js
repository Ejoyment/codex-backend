/**
 * Cache Invalidator for Agent Context
 * Invalidates context cache when data changes
 */

const agentContextService = require('./agentContextService');

class CacheInvalidator {
    constructor() {
        this.service = agentContextService;
    }

    invalidateForCompany(companyId) {
        if (!companyId) return;
        for (const [key, value] of this.service.cache.entries()) {
            if (key.includes(companyId.toString())) {
                this.service.cache.delete(key);
            }
        }
    }

    invalidateForUser(userId) {
        if (!userId) return;
        for (const [key, value] of this.service.cache.entries()) {
            if (key.includes(userId.toString())) {
                this.service.cache.delete(key);
            }
        }
    }

    invalidateForTask(taskId) {
        if (!taskId) return;
        for (const [key, value] of this.service.cache.entries()) {
            if (key.includes(taskId.toString())) {
                this.service.cache.delete(key);
            }
        }
    }

    invalidateForProject(projectId) {
        if (!projectId) return;
        for (const [key, value] of this.service.cache.entries()) {
            if (key.includes(projectId.toString())) {
                this.service.cache.delete(key);
            }
        }
    }

    invalidateAll() {
        this.service.cache.clear();
    }
}

module.exports = new CacheInvalidator();
