/**
 * The VFS service must scope by workspace as well as file id.
 *
 * Routes check that the caller is a member of the workspaceId they supply, so
 * passing a foreign fileId was enough to read it. These tests pin the service
 * queries themselves so every caller inherits the same isolation.
 */

jest.mock('../models/CodeFile', () => ({
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
    create: jest.fn(),
}));

const CodeFile = require('../models/CodeFile');
const vfs = require('../utils/virtualFileSystem');

const WORKSPACE = 'companyA';
const FOREIGN_FILE = '507f1f77bcf86cd799439011';

function leanQuery(result) {
    const query = {
        select: () => query,
        lean: () => query,
        exec: async () => result,
    };
    return query;
}

beforeEach(() => {
    jest.clearAllMocks();
    vfs.clearCache(WORKSPACE);
});

describe('VFS service workspace scoping', () => {
    test('readFile filters by company', async () => {
        CodeFile.findOne.mockReturnValue(leanQuery(null));

        await expect(vfs.readFile(FOREIGN_FILE, WORKSPACE)).rejects.toThrow('File not found');
        expect(CodeFile.findOne).toHaveBeenCalledWith({
            _id: FOREIGN_FILE,
            company: WORKSPACE,
        });
    });

    test('writeFile filters by company', async () => {
        CodeFile.findOneAndUpdate.mockReturnValue({ lean: async () => null });

        await expect(vfs.writeFile(FOREIGN_FILE, 'pwned', WORKSPACE)).rejects.toThrow('File not found');
        expect(CodeFile.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: FOREIGN_FILE, company: WORKSPACE },
            expect.objectContaining({ content: 'pwned' }),
            { new: true }
        );
    });

    test('deleteFile filters by company and does not delete a foreign file', async () => {
        CodeFile.findOne.mockResolvedValue(null);

        await expect(vfs.deleteFile(FOREIGN_FILE, WORKSPACE)).rejects.toThrow('File not found');
        expect(CodeFile.findOne).toHaveBeenCalledWith({
            _id: FOREIGN_FILE,
            company: WORKSPACE,
        });
        expect(CodeFile.deleteOne).not.toHaveBeenCalled();
    });

    test('getMetadata filters by company', async () => {
        CodeFile.findOne.mockReturnValue(leanQuery(null));

        await expect(vfs.getMetadata(FOREIGN_FILE, WORKSPACE)).resolves.toBeNull();
        expect(CodeFile.findOne).toHaveBeenCalledWith({
            _id: FOREIGN_FILE,
            company: WORKSPACE,
        });
    });

    test('createFile rejects a document belonging to another workspace', async () => {
        await expect(
            vfs.createFile({ name: 'x.js', company: 'companyB' }, WORKSPACE)
        ).rejects.toThrow('File does not belong to this workspace');
        expect(CodeFile.create).not.toHaveBeenCalled();
    });
});
