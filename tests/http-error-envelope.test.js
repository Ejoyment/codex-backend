const { classifyError, sendError, sendInternalError } = require('../utils/httpErrors');

function fakeRes() {
    const res = {
        headersSent: false,
        statusCode: null,
        body: null,
        setHeader: jest.fn(),
        status(code) { res.statusCode = code; return res; },
        json(payload) { res.body = payload; return res; },
    };
    return res;
}

const req = { id: 'req-abc12345', method: 'POST', originalUrl: '/api/thing' };

describe('error classification', () => {
    test('maps mongoose validation errors to a safe 400', () => {
        const error = new Error('thing validation failed');
        error.name = 'ValidationError';
        error.errors = { email: { message: 'Email is required' } };

        expect(classifyError(error)).toEqual({
            status: 400,
            message: 'Email is required',
            code: 'VALIDATION_ERROR',
        });
    });

    test('maps cast errors and duplicate keys without leaking them', () => {
        const cast = new Error('Cast to ObjectId failed for value "x" at path "_id"');
        cast.name = 'CastError';
        expect(classifyError(cast).status).toBe(400);
        expect(classifyError(cast).message).not.toContain('ObjectId');

        const duplicate = new Error('E11000 duplicate key error collection: users');
        duplicate.code = 11000;
        expect(classifyError(duplicate)).toEqual({
            status: 409,
            message: 'That value is already in use.',
            code: 'DUPLICATE_KEY',
        });
    });

    test('keeps authored 4xx messages and hides 5xx details', () => {
        const notFound = new Error('Project not found');
        notFound.statusCode = 404;
        expect(classifyError(notFound)).toMatchObject({ status: 404, message: 'Project not found' });

        const boom = new Error('connect ECONNREFUSED 10.0.0.4:5432');
        expect(classifyError(boom)).toMatchObject({ status: 500, message: 'Something went wrong. Please try again.' });
    });
});

describe('sendError', () => {
    let errorSpy;
    beforeEach(() => {
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => errorSpy.mockRestore());

    test('returns a generic 500 with the request id and no diagnostic', () => {
        const res = fakeRes();
        sendError(req, res, new Error('ssh: connect to host 10.0.0.4 port 22: Connection refused'));

        expect(res.statusCode).toBe(500);
        expect(res.body).toEqual({
            success: false,
            message: 'Something went wrong. Please try again.',
            code: 'INTERNAL_ERROR',
            requestId: 'req-abc12345',
        });
        expect(JSON.stringify(res.body)).not.toContain('10.0.0.4');
    });

    test('supports an explicit upstream status and copy', () => {
        const res = fakeRes();
        sendInternalError(req, res, new Error('GitHub API said 403: bad token'), {
            status: 502,
            message: 'GitHub request failed. Please try again.',
        });

        expect(res.statusCode).toBe(502);
        expect(res.body.message).toBe('GitHub request failed. Please try again.');
    });

    test('never writes a body after headers were sent', () => {
        const res = fakeRes();
        res.headersSent = true;
        expect(sendError(req, res, new Error('late failure'))).toBeUndefined();
        expect(res.statusCode).toBeNull();
    });
});
