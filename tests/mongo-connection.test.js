/**
 * Regression: boot-time index creation must not race the initial Mongo
 * connection.
 *
 * Render deploy 2026-11-03 crashed with:
 *   Cannot call `billingschedules.createIndex()` before initial connection is
 *   complete if `bufferCommands = false`
 * because startServer() called mongoose.connect() again while the module-level
 * connect was still in flight; openUri() returns immediately in that state.
 * These tests pin the wait/retry behavior that prevents it.
 */
const mockMongoose = {
    connection: { readyState: 0 },
    connect: jest.fn(),
};

jest.mock('mongoose', () => mockMongoose);

describe('mongoConnection.ensureConnected', () => {
    beforeEach(() => {
        jest.resetModules();
        mockMongoose.connection.readyState = 0;
        mockMongoose.connect.mockReset();
    });

    test('returns immediately when the connection is already open', async () => {
        mockMongoose.connection.readyState = 1;
        const mongoConnection = require('../utils/mongoConnection');

        await expect(mongoConnection.ensureConnected()).resolves.toBe(mockMongoose.connection);
        expect(mockMongoose.connect).not.toHaveBeenCalled();
    });

    test('waits for an in-flight initial connection instead of connecting again', async () => {
        let resolveConnect;
        const inFlight = new Promise((resolve) => {
            resolveConnect = resolve;
        });
        mockMongoose.connect.mockImplementation(() => {
            mockMongoose.connection.readyState = 2; // connecting
            return inFlight;
        });

        const mongoConnection = require('../utils/mongoConnection');
        mongoConnection.startInitialConnection();
        const ready = mongoConnection.ensureConnected();

        // Let ensureConnected() reach the await before the driver comes up.
        await Promise.resolve();
        mockMongoose.connection.readyState = 1;
        resolveConnect(mockMongoose.connection);

        await expect(ready).resolves.toBe(mockMongoose.connection);
        expect(mockMongoose.connect).toHaveBeenCalledTimes(1);
    });

    test('retries once when the initial connection failed', async () => {
        mockMongoose.connect
            .mockRejectedValueOnce(new Error('dial failed'))
            .mockImplementationOnce(async () => {
                mockMongoose.connection.readyState = 1;
                return mockMongoose.connection;
            });

        const mongoConnection = require('../utils/mongoConnection');
        mongoConnection.startInitialConnection().catch(() => {});
        await Promise.resolve(); // let the first attempt settle

        await expect(mongoConnection.ensureConnected()).resolves.toBe(mockMongoose.connection);
        expect(mockMongoose.connect).toHaveBeenCalledTimes(2);
    });

    test('throws instead of returning while the connection is still not open', async () => {
        mockMongoose.connect.mockImplementation(async () => mockMongoose.connection);

        const mongoConnection = require('../utils/mongoConnection');
        await expect(mongoConnection.ensureConnected()).rejects.toThrow(/not ready/i);
    });
});
