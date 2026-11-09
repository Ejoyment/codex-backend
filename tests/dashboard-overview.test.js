const LocalProject = require('../models/LocalProject');
const LocalTask = require('../models/LocalTask');
const AgentExecution = require('../models/AgentExecution');
const Deployment = require('../models/Deployment');
const CollaborationSession = require('../models/CollaborationSession');
const CodeChange = require('../models/CodeChange');
const AuditLog = require('../models/AuditLog');
const TeamActivity = require('../models/TeamActivity');
const Company = require('../models/Company');
const McpServer = require('../models/McpServer');
const Integration = require('../models/Integration');
const { computeOverview } = require('../utils/dashboardOverview');

const USER = '507f1f77bcf86cd799439011';

function chain(value) {
    const c = {
        sort: () => c,
        limit: () => c,
        select: () => c,
        lean: async () => value,
    };
    return c;
}

describe('computeOverview', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(Company, 'find').mockReturnValue(chain([]));
        jest.spyOn(LocalProject, 'find').mockReturnValue(chain([]));
        jest.spyOn(LocalTask, 'find').mockReturnValue(chain([]));
        jest.spyOn(AgentExecution, 'find').mockReturnValue(chain([]));
        jest.spyOn(Deployment, 'find').mockReturnValue(chain([]));
        jest.spyOn(CollaborationSession, 'find').mockReturnValue(chain([]));
        jest.spyOn(CodeChange, 'find').mockReturnValue(chain([]));
        jest.spyOn(TeamActivity, 'find').mockReturnValue(chain([]));
        jest.spyOn(AuditLog, 'find').mockReturnValue(chain([]));
        jest.spyOn(McpServer, 'find').mockReturnValue(chain([]));
        jest.spyOn(Integration, 'find').mockReturnValue(chain([]));
    });

    afterEach(() => jest.restoreAllMocks());

    test('exposes repo + technologies for the overview hero', async () => {
        jest.spyOn(LocalProject, 'find').mockReturnValue(chain([{
            _id: 'p1',
            name: 'builder-web',
            githubRepoName: 'buildrshq/builder-web',
            technologies: ['React', 'TypeScript'],
            updatedAt: new Date(),
        }]));

        const overview = await computeOverview(USER);

        expect(overview.workspace.name).toBe('builder-web');
        expect(overview.workspace.repoFullName).toBe('buildrshq/builder-web');
        expect(overview.workspace.technologies).toEqual(['React', 'TypeScript']);
    });

    test('failed deployments link to the Deploy page', async () => {
        jest.spyOn(Deployment, 'find').mockReturnValue(chain([{
            _id: 'd1',
            status: 'failed',
            errorMessage: 'Build failed',
            subdomain: 'my-app',
            createdAt: new Date(),
        }]));

        const overview = await computeOverview(USER);
        const item = overview.needsAttention.find((i) => i.type === 'deployment');

        expect(item).toBeDefined();
        expect(item.href).toBe('/deploy');
    });

    test('debug rooms carry their context ref and participant names', async () => {
        jest.spyOn(CollaborationSession, 'find').mockReturnValue(chain([{
            _id: 's1',
            contextRef: 'auth-callback',
            type: 'debug',
            participants: [{ name: 'Jamie' }, { name: 'Priya' }],
        }]));

        const overview = await computeOverview(USER);

        expect(overview.debugRooms).toHaveLength(1);
        expect(overview.debugRooms[0].title).toBe('Debug Room: auth-callback');
        expect(overview.debugRooms[0].contextRef).toBe('auth-callback');
        expect(overview.debugRooms[0].participantNames).toEqual(['Jamie', 'Priya']);
        expect(overview.debugRooms[0].participants).toEqual(['JA', 'PR']);
    });
});
