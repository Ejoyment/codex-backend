/**
 * Permission Matrix - Zero Trust IAM
 * Enforces tier-based access control for all IDE operations
 */

const User = require('../models/User');
const CodeFile = require('../models/CodeFile');
const Company = require('../models/Company');

class PermissionMatrix {
  constructor() {
    // Define permission scopes by tier
    this.scopes = {
      // File operations
      'file:read': ['freebie', 'professional', 'enterprise'],
      'file:write': ['professional', 'enterprise'],
      'file:delete': ['enterprise'],
      'file:create': ['professional', 'enterprise'],
      
      // Terminal access
      'terminal:access': ['professional', 'enterprise'],
      'terminal:create': ['professional', 'enterprise'],
      'terminal:execute': ['professional', 'enterprise'],
      
      // Git operations
      'git:read': ['professional', 'enterprise'],
      'git:commit': ['professional', 'enterprise'],
      'git:push': ['enterprise'],
      'git:pull': ['enterprise'],
      'git:branch': ['enterprise'],
      
      // Collaboration
      'collab:join': ['professional', 'enterprise'],
      'collab:edit': ['professional', 'enterprise'],
      
      // LSP features
      'lsp:completions': ['freebie', 'professional', 'enterprise'],
      'lsp:hover': ['freebie', 'professional', 'enterprise'],
      'lsp:definition': ['professional', 'enterprise'],
      'lsp:references': ['enterprise'],
      
      // VFS operations
      'vfs:read': ['freebie', 'professional', 'enterprise'],
      'vfs:search': ['professional', 'enterprise'],
      'vfs:index': ['enterprise'],
      
      // Agent operations
      'agent:basic': ['professional', 'enterprise'],
      'agent:autonomous': ['enterprise'],
      'agent:deploy': ['enterprise']
    };

    // Resource limits by tier
    this.limits = {
      freebie: {
        maxFiles: 100,
        maxFileSize: 1024 * 1024, // 1MB
        maxTerminals: 0,
        maxCollaborators: 1,
        maxWorkspaces: 1
      },
      professional: {
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

      const tier = user.subscription?.tier || 'freebie';
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
      if (!allowedTiers.includes(tier)) {
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
          if (!file.companyId.equals(user.currentCompany)) {
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
          
          // Check if user is member
          const isMember = company.members.some(m => 
            m.userId.equals(user._id)
          );
          
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
      const tier = user.subscription?.tier || 'freebie';
      const limits = this.limits[tier];

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
      const tier = user.subscription?.tier || 'freebie';

      const permissions = {};
      
      // Check all scopes
      for (const [scope, allowedTiers] of Object.entries(this.scopes)) {
        permissions[scope] = allowedTiers.includes(tier);
      }

      return {
        tier,
        permissions,
        limits: this.limits[tier]
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
        const userId = req.user?.userId;
        
        if (!userId) {
          return res.status(401).json({
            error: 'Authentication required'
          });
        }

        const resourceId = req.params.id || req.body.resourceId || null;
        
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
        const userId = req.user?.userId;
        
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
