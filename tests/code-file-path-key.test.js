const mongoose = require('mongoose');
const CodeFile = require('../models/CodeFile');

const WORKSPACE = new mongoose.Types.ObjectId();
const USER = new mongoose.Types.ObjectId();

function build(overrides = {}) {
    return new CodeFile({
        name: 'app.js',
        language: 'javascript',
        company: WORKSPACE,
        createdBy: USER,
        path: '/src',
        ...overrides,
    });
}

describe('CodeFile path identity', () => {
    test('directory + name and full-path shapes share one normalized key', async () => {
        const directoryShape = build({ name: ' app.js ', path: '/src/' });
        const fullPathShape = build({ path: '/src/app.js' });

        await directoryShape.validate();
        await fullPathShape.validate();

        expect(directoryShape.name).toBe('app.js');
        expect(directoryShape.path).toBe('/src');
        expect(CodeFile.fullPathFor(directoryShape)).toBe('/src/app.js');
        expect(CodeFile.fullPathFor(fullPathShape)).toBe('/src/app.js');
        expect(directoryShape.pathKey).toBe(fullPathShape.pathKey);
    });

    test('the same path in another workspace is a different identity', async () => {
        const first = build();
        const second = build({ company: new mongoose.Types.ObjectId() });

        await first.validate();
        await second.validate();

        expect(first.pathKey).not.toBe(second.pathKey);
    });
});
