/**
 * Template for adding Swagger documentation to endpoints
 * Copy and adapt for each endpoint missing @swagger documentation
 */

// ============================================
// NOTION API TEMPLATES
// ============================================

/**
 * @swagger
 * /api/notion/databases:
 *   get:
 *     summary: Get all Notion databases
 *     tags:
 *       - Notion API
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Databases retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 databases:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/notion/databases/{databaseId}:
 *   get:
 *     summary: Get specific Notion database
 *     tags:
 *       - Notion API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: databaseId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Database retrieved successfully
 *       404:
 *         description: Database not found
 *       401:
 *         description: Unauthorized
 */

// ============================================
// FIGMA API TEMPLATES
// ============================================

/**
 * @swagger
 * /api/figma/files:
 *   get:
 *     summary: Get user's Figma files
 *     tags:
 *       - Figma API
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Files retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 files:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/figma/files/{fileKey}:
 *   get:
 *     summary: Get Figma file details
 *     tags:
 *       - Figma API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: fileKey
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File details retrieved
 *       404:
 *         description: File not found
 *       401:
 *         description: Unauthorized
 */

// ============================================
// LSP API TEMPLATES
// ============================================

/**
 * @swagger
 * /api/lsp/completions:
 *   post:
 *     summary: Get code completions
 *     tags:
 *       - LSP
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documentUri
 *               - position
 *               - content
 *               - language
 *             properties:
 *               documentUri:
 *                 type: string
 *               position:
 *                 type: object
 *               content:
 *                 type: string
 *               language:
 *                 type: string
 *     responses:
 *       200:
 *         description: Completions retrieved
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 */

// ============================================
// VFS API TEMPLATES
// ============================================

/**
 * @swagger
 * /api/vfs/file/{fileId}:
 *   get:
 *     summary: Read file content
 *     tags:
 *       - Virtual File System
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: fileId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: workspaceId
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File content retrieved
 *       404:
 *         description: File not found
 *       401:
 *         description: Unauthorized
 */

// ============================================
// GIT API TEMPLATES
// ============================================

/**
 * @swagger
 * /api/git/status/{workspaceId}:
 *   get:
 *     summary: Get repository status
 *     tags:
 *       - Git
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: workspaceId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repository status retrieved
 *       404:
 *         description: Repository not found
 *       401:
 *         description: Unauthorized
 */

// ============================================
// INSTRUCTIONS
// ============================================

console.log(`
🎯 INSTRUCTIONS FOR ADDING MISSING SWAGGER DOCUMENTATION:

1. For each endpoint missing @swagger documentation:
   - Copy the appropriate template above
   - Paste it ABOVE the router.METHOD() call
   - Adjust the path, summary, and parameters as needed

2. Files needing documentation:
   - notion-api.js (10 endpoints)
   - figma-api.js (12 endpoints)
   - lsp.js (8 endpoints)
   - vfs.js (12 endpoints)
   - terminal.js (2 endpoints)
   - git.js (19 endpoints)
   - github-advanced.js (13 endpoints)

3. Total endpoints needing documentation: ~75

4. After adding documentation:
   - Test Swagger UI at /api-docs
   - Verify all endpoints appear
   - Test with Postman collection

5. Quick test command:
   bash check-specific-apis.sh
`);