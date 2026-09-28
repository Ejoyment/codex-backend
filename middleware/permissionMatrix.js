/**
 * Permission Matrix - Zero Trust IAM
 * Enforces tier-based access control for all IDE operations.
 * Canonical tiers: developer, pro, pro_plus, team_standard, team_premium, enterprise
 * (legacy tier names are normalized via utils/tierNames).
 */

const User = require('../models/User');
const CodeFile = require('../models/CodeFile');
const Company = require('../models/Company');
const { TIERS, LEGACY_TIER_MAP, canonicalTier } = require('../utils/tierNames');

const ALL_TIERS = [...TIERS];
const PAID_TIERS = TIERS.filter((t) => t !== 'developer');
const ENTERPRISE_TIERS = ['enterprise'];

class PermissionMatrix {
  constructor() {
    // Permission scopes by canonical tier.
    // The free developer tier gets the full local IDE (files, terminal, git,
    // run, agents via local execution) — cloud/monetized surfaces stay paid.
    this.scopes = {
      // File operations (blueprint: developers code on every tier)
      'file:read': ALL_TIERS,
      'file:write': ALL_TIERS,
      'file:delete': ALL_TIERS,
      'file:create': ALL_TIERS,

      // Terminal access (every tier gets a shell)
      'terminal:access': ALL_TIERS,
      'terminal:create': ALL_TIERS,
      'terminal:execute': ALL_TIERS,

      // Code execution (editor Run button)
      'ide:run': ALL_TIERS,

      // Git operations
      'git:read': ALL_TIERS,
      'git:commit': ALL_TIERS,
      'git:push': ALL_TIERS,
      'git:pull': ALL_TIERS,
      'git:branch': ALL_TIERS,

      // Collaboration (joining is open; shared editing is paid)
      'collab:join': ALL_TIERS,
      'collab:edit': PAID_TIERS,

      // LSP features (local tooling)
      'lsp:completions': ALL_TIERS,
      'lsp:hover': ALL_TIERS,
      'lsp:definition': ALL_TIERS,
      'lsp:references': ALL_TIERS,

      // VFS operations
      'vfs:read': ALL_TIERS,
      'vfs:write': ALL_TIERS,
      'vfs:search': ALL_TIERS,
      'vfs:index': ALL_TIERS,

      // Agent operations (developer: local agent only; cloud autonomy is paid)
      'agent:basic': ALL_TIERS,
      'agent:autonomous': PAID_TIERS,
      'agent:deploy': PAID_TIERS,

      // Company operations
      'company:create': PAID_TIERS,
      'company:read': ALL_TIERS,
      'company:update': PAID_TIERS,
      'company:delete': ENTERPRISE_TIERS,
      'company:invite': PAID_TIERS
    };

    // Resource limits by pricing group (developer / paid / enterprise)
    this.limits = {
      developer: {
        maxFiles: 100,
        maxFileSize: 1024 * 1024, // 1MB
        maxTerminals: 1,
        maxCollaborators: 1,
        maxWorkspaces: 1
      },
      pro: {
        maxFiles: 10000,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxTerminals: 3,
        maxCollaborators: 10,
        maxWorkspaces: 10
      },
      enterprise: {
        maxFiles: Infinity,
        maxFileSize: 100 * 1024 * 1024, // 100MB
        maxTerminals: Infinity,
        maxCollaborators: Infinity,
        maxWorkspaces: Infinity
      }
    };
  }

  normalizeTier(tier) {
    return canonicalTier(tier);
  }

  // Map any canonical tier onto the three limit groups above.
  limitKey(tier) {
    const normalized = canonicalTier(tier);
    if (normalized === 'developer' || normalized === 'enterprise') return normalized;
    return 'pro';
  }

  isTierAllowed(tier, allowedTiers, scope) {
    const normalizedTier = canonicalTier(tier);
    const normalizedAllowed = (allowedTiers || []).map((value) => canonicalTier(value));

    // Fail closed: no scope (undefined/null) means no fallback.
    return normalizedAllowed.includes(normalizedTier);
  }

  /**
   * Check if user has permission for action on resource
   */
  async checkPermission(userId, action, resource, resourceId = null) {
    try {
      // Get user with subscription
      const user = await User.findById(userId).populate('subscription');

      if (!user) {
        throw new Error('User not found');
      }

      const tier = this.normalizeTier(user.subscription?.tier || 'developer');
      const scope = `${resource}:${action}`;
      const allowedTiers = this.scopes[scope];

      // Check if scope exists
      if (!allowedTiers) {
        console.warn(`Unknown scope: ${scope}`);
        return {
          allowed: false,
          reason: 'Unknown permission scope',
          tier,
          scope
        };
      }

      // Check tier permission
      if (!this.isTierAllowed(tier, allowedTiers, scope)) {
        return {
          allowed: false,
          reason: `Permission denied: ${scope} requires ${allowedTiers.join(' or ')} tier`,
          tier,
          scope,
          requiredTiers: allowedTiers
        };
      }

      // Check resource-specific permissions
      if (resourceId) {
        const resourceCheck = await this.checkResourceAccess(
          user,
          resource,
          resourceId
        );
        
        if (!resourceCheck.allowed) {
          return resourceCheck;
        }
      }

      return {
        allowed: true,
        tier,
        scope
      };
    } catch (error) {
      console.error('Permission check error:', error);
      return {
        allowed: false,
        reason: error.message,
        error: true
      };
    }
  }

  /**
   * Check resource-specific access
   */
  async checkResourceAccess(user, resource, resourceId) {
    try {
      switch (resource) {
        case 'file':
          const file = await CodeFile.findById(resourceId);
          if (!file) {
            return { allowed: false, reason: 'File not found' };
          }
          
          // Check if file belongs to user's workspace
          const fc = file.companyId ? String(file.companyId) : null;
          const uc = user.currentCompany ? String(user.currentCompany) : null;
          if (!fc || !uc || fc !== uc) {
            return {
              allowed: false,
              reason: 'Access denied: File not in your workspace'
            };
          }
          break;

        case 'workspace':
          const company = await Company.findById(resourceId);
          if (!company) {
            return { allowed: false, reason: 'Workspace not found' };
          }
          
          // Check if user is member (Company schema uses members[].user; handle legacy members[].userId defensively)
          const isMember = company.members.some(m => {
            try {
              const id = m?.user || m?.userId;
              return id && String(id) === String(user._id);
            } catch (e) {
              return false;
            }
          });
          
          if (!isMember) {
            return {
              allowed: false,
              reason: 'Access denied: Not a workspace member'
            };
          }
          break;

        default:
          // No specific resource check needed
          break;
      }

      return { allowed: true };
    } catch (error) {
      console.error('Resource access check error:', error);
      return {
        allowed: false,
        reason: error.message,
        error: true
      };
    }
  }

  /**
   * Check resource limits
   */
  async checkLimit(userId, limitType) {
    try {
      const user = await User.findById(userId).populate('subscription');
      const tier = this.normalizeTier(user.subscription?.tier || 'developer');
      const limits = this.limits[this.limitKey(tier)];

      if (!limits) {
        return {
          allowed: false,
          reason: 'Invalid tier'
        };
      }

      const limit = limits[limitType];
      
      if (limit === undefined) {
        return {
          allowed: true,
          limit: Infinity
        };
      }

      // Get current usage
      let currentUsage = 0;

      switch (limitType) {
        case 'maxFiles':
          currentUsage = await CodeFile.countDocuments({
            companyId: user.currentCompany
          });
          break;

        case 'maxWorkspaces':
          currentUsage = await Company.countDocuments({
            'members.userId': user._id
          });
          break;

        // Add more usage checks as needed
      }

      const allowed = currentUsage < limit;

      return {
        allowed,
        limit,
        currentUsage,
        remaining: limit - currentUsage,
        tier,
        reason: allowed ? null : `Limit exceeded: ${limitType} (${currentUsage}/${limit})`
      };
    } catch (error) {
      console.error('Limit check error:', error);
      return {
        allowed: false,
        reason: error.message,
        error: true
      };
    }
  }

  /**
   * Get user permissions summary
   */
  async getUserPermissions(userId) {
    try {
      const user = await User.findById(userId).populate('subscription');
      const tier = this.normalizeTier(user.subscription?.tier || 'developer');

      const permissions = {};
      
      // Check all scopes
      for (const [scope, allowedTiers] of Object.entries(this.scopes)) {
        permissions[scope] = this.isTierAllowed(tier, allowedTiers, scope);
      }

      return {
        tier,
        permissions,
        limits: this.limits[this.limitKey(tier)]
      };
    } catch (error) {
      console.error('Get permissions error:', error);
      return null;
    }
  }

  /**
   * Middleware factory for route protection
   */
  requirePermission(resource, action) {
    return async (req, res, next) => {
      try {
        const userId = req.userId || req.user?._id || req.user?.userId;
        
        if (!userId) {
          return res.status(401).json({
            error: 'Authentication required'
          });
        }

        const resourceId = req.params.id || req.params.companyId || req.params.workspaceId || req.params.fileId || req.params.channelId || req.body.resourceId || req.body.companyId || req.body.workspaceId || null;
        
        const result = await this.checkPermission(
          userId,
          action,
          resource,
          resourceId
        );

        if (!result.allowed) {
          return res.status(403).json({
            error: 'Permission denied',
            reason: result.reason,
            tier: result.tier,
            requiredTiers: result.requiredTiers
          });
        }

        // Attach permission info to request
        req.permission = result;
        next();
      } catch (error) {
        console.error('Permission middleware error:', error);
        res.status(500).json({
          error: 'Permission check failed'
        });
      }
    };
  }

  /**
   * Middleware for limit checking
   */
  requireLimit(limitType) {
    return async (req, res, next) => {
      try {
        const userId = req.userId || req.user?._id || req.user?.userId;
        
        if (!userId) {
          return res.status(401).json({
            error: 'Authentication required'
          });
        }

        const result = await this.checkLimit(userId, limitType);

        if (!result.allowed) {
          return res.status(403).json({
            error: 'Limit exceeded',
            reason: result.reason,
            limit: result.limit,
            currentUsage: result.currentUsage,
            tier: result.tier
          });
        }

        // Attach limit info to request
        req.limit = result;
        next();
      } catch (error) {
        console.error('Limit middleware error:', error);
        res.status(500).json({
          error: 'Limit check failed'
        });
      }
    };
  }
}

// Singleton instance
const permissionMatrix = new PermissionMatrix();

module.exports = permissionMatrix;
