/**
 * Tenant-isolation tests for utils/supportSocket.js (audit rec 7).
 *
 * Real socket.io server + real client sockets on the /support namespace;
 * only the database is stubbed. The namespace previously had NO auth —
 * these prove: connections require a token, ticket joins follow REST
 * ownership (agent any / user own / guest email capability), spoofed
 * senders are replaced with server identity, and status/assign are
 * agent-only with the agent id taken from the token.
 */
const http = require('http');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { io: ioClient } = require(path.resolve(__dirname, '../buildrs-frontend/node_modules/socket.io-client'));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';

jest.mock('../models/SupportTicket', () => ({ findOne: jest.fn() }));
jest.mock('../models/SupportAgent', () => ({ findById: jest.fn() }));
jest.mock('../models/User', () => ({ findById: jest.fn() }));

const SupportTicket = require('../models/SupportTicket');
const SupportAgent = require('../models/SupportAgent');
const User = require('../models/User');
const supportSocket = require('../utils/supportSocket');

let server;
let io;
let port;

const USER_A = '507f1f77bcf86cd799439011';
const USER_B = '507f1f77bcf86cd799439012';

const ticketDoc = (over = {}) => ({
  _id: 't1', ticketId: 'TKT-1', userId: USER_A, guestEmail: null, guestName: null,
  status: 'open', messages: [],
  save: jest.fn(async function () { return this; }),
  ...over,
});
let tickets = {};

const connect = (token) =>
  new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${port}/support`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });

const userSocket = (userId) => connect(jwt.sign({ userId }, process.env.JWT_SECRET));
const agentSocket = (agentId) => connect(jwt.sign({ agentId, role: 'agent' }, process.env.JWT_SECRET));

const once = (socket, event, timeout = 4000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const received = (socket, event, ms = 600) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    socket.once(event, () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

beforeAll(async () => {
  server = http.createServer();
  io = new Server(server, { cors: { origin: '*' } });
  supportSocket(io);
  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
});

afterAll(async () => {
  await new Promise((resolve) => io.close(resolve));
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  jest.clearAllMocks();
  tickets = {
    'TKT-1': ticketDoc(),
    'TKT-2': ticketDoc({ _id: 't2', ticketId: 'TKT-2', userId: USER_B }),
    'TKT-G': ticketDoc({ _id: 'tg', ticketId: 'TKT-G', userId: null, guestEmail: 'guest@x.io', guestName: 'Guesty' }),
  };
  SupportTicket.findOne.mockImplementation(async (q) => tickets[q?.ticketId] || null);
  SupportAgent.findById.mockImplementation(async (id) =>
    String(id) === 'ag1' ? { _id: 'ag1', name: 'Alice A.' } : null
  );
  User.findById.mockImplementation(async (id) =>
    String(id) === USER_A ? { fullName: 'Real User A' } : { fullName: 'Real User B' }
  );
});

afterEach(() => {
  io.of('/support').sockets.forEach((s) => s.disconnect(true));
});

describe('authentication', () => {
  test('connection without a token is rejected', async () => {
    await expect(connect(undefined)).rejects.toThrow(/auth/i);
  });

  test('agent token with unknown agent is rejected', async () => {
    await expect(agentSocket('ag-ghost')).rejects.toThrow(/auth/i);
  });

  test('token with neither userId nor agentId is rejected', async () => {
    await expect(connect(jwt.sign({ hello: 'world' }, process.env.JWT_SECRET)))
      .rejects.toThrow(/auth/i);
  });
});

describe('join-ticket ownership (REST parity)', () => {
  test('owner joins their ticket', async () => {
    const s = await userSocket(USER_A);
    s.emit('join-ticket', { ticketId: 'TKT-1' });
    const joined = await once(s, 'ticket:joined');
    expect(joined.ticketId).toBe('TKT-1');
    s.disconnect();
  });

  test('stranger cannot join another user\'s ticket', async () => {
    const s = await userSocket(USER_B);
    s.emit('join-ticket', { ticketId: 'TKT-1' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/denied/i);
    s.disconnect();
  });

  test('unknown ticket → Ticket not found', async () => {
    const s = await userSocket(USER_A);
    s.emit('join-ticket', { ticketId: 'TKT-404' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/not found/i);
    s.disconnect();
  });

  test('guest ticket requires the guestEmail capability', async () => {
    const noEmail = await userSocket(USER_A);
    noEmail.emit('join-ticket', { ticketId: 'TKT-G' });
    const err = await once(noEmail, 'error');
    expect(err.message).toMatch(/denied/i);
    noEmail.disconnect();

    const withEmail = await userSocket(USER_A);
    withEmail.emit('join-ticket', { ticketId: 'TKT-G', guestEmail: 'guest@x.io' });
    await once(withEmail, 'ticket:joined');
    withEmail.disconnect();
  });

  test('agent joins any ticket and the room is notified', async () => {
    const owner = await userSocket(USER_B); // TKT-2's owner
    owner.emit('join-ticket', { ticketId: 'TKT-2' });
    await once(owner, 'ticket:joined');

    const agent = await agentSocket('ag1');
    const notified = once(owner, 'system-message');
    agent.emit('join-ticket', { ticketId: 'TKT-2' });
    await once(agent, 'ticket:joined');
    const msg = await notified;
    expect(msg.message).toMatch(/Alice A\./);
    owner.disconnect();
    agent.disconnect();
  });
});

describe('cross-ticket spoof guard', () => {
  test('send-message for a non-joined ticket is dropped', async () => {
    const victim = await userSocket(USER_A);
    victim.emit('join-ticket', { ticketId: 'TKT-1' });
    await once(victim, 'ticket:joined');

    const attacker = await userSocket(USER_B);
    attacker.emit('send-message', { ticketId: 'TKT-1', message: 'spoofed' });
    const err = await once(attacker, 'error');
    expect(err.message).toMatch(/not in this ticket/i);
    expect(await received(victim, 'new-message')).toBe(false);
    expect(tickets['TKT-1'].save).not.toHaveBeenCalled();
    victim.disconnect();
    attacker.disconnect();
  });

  test('update-status for a non-joined ticket is dropped', async () => {
    const agent = await agentSocket('ag1');
    agent.emit('update-status', { ticketId: 'TKT-1', status: 'closed' });
    const err = await once(agent, 'error');
    expect(err.message).toMatch(/not in this ticket/i);
    expect(tickets['TKT-1'].save).not.toHaveBeenCalled();
    agent.disconnect();
  });
});

describe('send-message identity (server-derived)', () => {
  test('user message: senderName from profile, client spoof ignored', async () => {
    const s = await userSocket(USER_A);
    s.emit('join-ticket', { ticketId: 'TKT-1' });
    await once(s, 'ticket:joined');

    const got = once(s, 'new-message');
    s.emit('send-message', { ticketId: 'TKT-1', message: 'hello', senderType: 'agent', senderName: 'Fake Admin' });
    const msg = await got;
    expect(msg.sender).toBe('user');
    expect(msg.senderName).toBe('Real User A');
    expect(tickets['TKT-1'].save).toHaveBeenCalled();
    s.disconnect();
  });

  test('agent message: sender is agent with agent name', async () => {
    const s = await agentSocket('ag1');
    s.emit('join-ticket', { ticketId: 'TKT-1' });
    await once(s, 'ticket:joined');

    const got = once(s, 'new-message');
    s.emit('send-message', { ticketId: 'TKT-1', message: 'hi there' });
    const msg = await got;
    expect(msg.sender).toBe('agent');
    expect(msg.senderName).toBe('Alice A.');
    s.disconnect();
  });

  test('empty message is rejected', async () => {
    const s = await userSocket(USER_A);
    s.emit('join-ticket', { ticketId: 'TKT-1' });
    await once(s, 'ticket:joined');
    s.emit('send-message', { ticketId: 'TKT-1', message: '   ' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/content/i);
    expect(tickets['TKT-1'].save).not.toHaveBeenCalled();
    s.disconnect();
  });
});

describe('agent-only operations', () => {
  test('user cannot update status even on their own joined ticket', async () => {
    const s = await userSocket(USER_A);
    s.emit('join-ticket', { ticketId: 'TKT-1' });
    await once(s, 'ticket:joined');
    s.emit('update-status', { ticketId: 'TKT-1', status: 'resolved' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/agents only/i);
    expect(tickets['TKT-1'].save).not.toHaveBeenCalled();
    s.disconnect();
  });

  test('agent updates status; invalid status rejected', async () => {
    const s = await agentSocket('ag1');
    s.emit('join-ticket', { ticketId: 'TKT-1' });
    await once(s, 'ticket:joined');

    s.emit('update-status', { ticketId: 'TKT-1', status: 'hacked' });
    const err = await once(s, 'error');
    expect(err.message).toMatch(/invalid status/i);

    const updated = once(s, 'status-updated');
    s.emit('update-status', { ticketId: 'TKT-1', status: 'resolved' });
    const payload = await updated;
    expect(payload.status).toBe('resolved');
    expect(tickets['TKT-1'].status).toBe('resolved');
    s.disconnect();
  });

  test('user cannot assign; agent assign uses token agent id, not client payload', async () => {
    const user = await userSocket(USER_A);
    user.emit('join-ticket', { ticketId: 'TKT-1' });
    await once(user, 'ticket:joined');
    user.emit('assign-ticket', { ticketId: 'TKT-1', agentId: 'evil', agentName: 'Evil' });
    const err = await once(user, 'error');
    expect(err.message).toMatch(/agents only/i);
    user.disconnect();

    const agent = await agentSocket('ag1');
    agent.emit('join-ticket', { ticketId: 'TKT-1' });
    await once(agent, 'ticket:joined');
    const assigned = once(agent, 'ticket-assigned');
    agent.emit('assign-ticket', { ticketId: 'TKT-1', agentId: 'evil', agentName: 'Evil' });
    const payload = await assigned;
    expect(tickets['TKT-1'].assignedTo).toBe('ag1'); // from token, client 'evil' ignored
    expect(tickets['TKT-1'].status).toBe('in-progress');
    expect(payload.agentName).toBe('Alice A.'); // not 'Evil'
    agent.disconnect();
  });
});

describe('retention (rec 11): thread cap', () => {
  test('send-message on a 1000-message thread is rejected (REST parity)', async () => {
    tickets['TKT-FULL'] = ticketDoc({
      _id: 'tfull',
      ticketId: 'TKT-FULL',
      messages: Array.from({ length: 1000 }, (_, i) => ({ sender: 'user', message: `m${i}` })),
    });
    const s = await userSocket(USER_A);
    s.emit('join-ticket', { ticketId: 'TKT-FULL' });
    await once(s, 'ticket:joined');
    const err = once(s, 'ticket:error');
    s.emit('send-message', { ticketId: 'TKT-FULL', message: 'one too many' });
    const payload = await err;
    expect(payload.message).toMatch(/follow-up ticket/i);
    expect(tickets['TKT-FULL'].messages.length).toBe(1000);
    s.disconnect();
  });
});
