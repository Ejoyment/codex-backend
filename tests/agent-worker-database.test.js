jest.mock('mongoose', () => ({
  connection: { readyState: 0 },
  connect: jest.fn(),
}));

const mongoose = require('mongoose');
const { connectWorkerDatabase } = require('../utils/agentWorkerDatabase');

describe('agent worker database setup', () => {
  const originalMongoUri = process.env.MONGODB_URI;

  afterEach(() => {
    jest.clearAllMocks();
    mongoose.connection.readyState = 0;
    if (originalMongoUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalMongoUri;
  });

  test('opens an independent worker-thread connection with shared fail-fast options', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/agent-worker-test';
    mongoose.connect.mockResolvedValue(mongoose);

    await connectWorkerDatabase();

    expect(mongoose.connect).toHaveBeenCalledWith(
      process.env.MONGODB_URI,
      expect.objectContaining({
        bufferCommands: false,
        serverSelectionTimeoutMS: 10000,
      })
    );
  });

  test('fails with a clear setup error when the worker has no database URI', async () => {
    delete process.env.MONGODB_URI;

    await expect(connectWorkerDatabase()).rejects.toThrow(
      'Agent worker cannot start because MONGODB_URI is not configured'
    );
    expect(mongoose.connect).not.toHaveBeenCalled();
  });

  test('reuses an already connected worker database', async () => {
    mongoose.connection.readyState = 1;

    await connectWorkerDatabase();

    expect(mongoose.connect).not.toHaveBeenCalled();
  });
});
