const fs = require('fs');
const path = require('path');

const SOUND_PATH = path.resolve(__dirname, '../buildrs-frontend/lib/notificationSound.js');
const STORE_PATH = path.resolve(__dirname, '../buildrs-frontend/store/notificationStore.js');
const BELL_PATH = path.resolve(__dirname, '../buildrs-frontend/components/NotificationBell.js');
const PROVIDER_PATH = path.resolve(__dirname, '../buildrs-frontend/components/NotificationProvider.js');
const SOCKET_PATH = path.resolve(__dirname, '../utils/notificationSocket.js');
const SERVER_PATH = path.resolve(__dirname, '../server.js');
const APP_PATH = path.resolve(__dirname, '../buildrs-frontend/pages/_app.js');
const SIDEBAR_PATH = path.resolve(__dirname, '../buildrs-frontend/components/Sidebar.js');
const NOTIF_PAGE = path.resolve(__dirname, '../buildrs-frontend/pages/notifications.js');

const { loadEsmModule } = require('./helpers/loadFrontendModule');

const read = (p) => fs.readFileSync(p, 'utf8');

// Minimal Web Audio + DOM doubles so the sound module can be exercised for real.
function makeAudioEnv() {
    const created = { oscillators: 0, gains: 0, started: [], freq: [], ramp: [] };
    const ctx = {
        state: 'running',
        currentTime: 1,
        destination: {},
        createOscillator() {
            created.oscillators += 1;
            const osc = {
                type: 'sine',
                frequency: {
                    setValueAtTime: (v, t) => created.freq.push(['set', v, t]),
                    exponentialRampToValueAtTime: (v, t) => created.ramp.push([v, t]),
                },
                connect: () => {},
                start: (t) => created.started.push(t),
                stop: () => {},
            };
            return osc;
        },
        createGain() {
            created.gains += 1;
            const gain = {
                gain: {
                    setValueAtTime: () => {},
                    exponentialRampToValueAtTime: (v, t) => created.ramp.push(['gain', v, t]),
                },
                connect: () => {},
            };
            return gain;
        },
        resume: async () => {
            ctx.state = 'running';
        },
    };
    return { ctx, created };
}

async function loadSoundModule({ muted = false, visibility = 'hidden' } = {}) {
    const env = makeAudioEnv();
    const storage = {
        getItem: (k) => (k === 'buildrs:notification-sound' && muted ? 'off' : null),
        setItem: () => {},
        removeItem: () => {},
    };
    const sound = loadEsmModule(SOUND_PATH, {
        globals: {
            window: {
                AudioContext: function AudioContext() { return env.ctx; },
                addEventListener: () => {},
                removeEventListener: () => {},
            },
            document: { visibilityState: visibility },
            localStorage: storage,
        },
    });
    return { sound, env };
}

afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.localStorage;
    jest.resetModules();
});

describe('notification sound', () => {
    test('plays a bubble for a normal-priority notification', async () => {
        const { sound, env } = await loadSoundModule();

        const played = sound.playNotificationSound({ hiddenOnly: false });

        expect(played).toBe(true);
        expect(env.created.oscillators).toBe(1);
        expect(env.created.started).toHaveLength(1);
    });

    test('high priority gets a two-note chime so it is distinguishable', async () => {
        const { sound, env } = await loadSoundModule();

        sound.playNotificationSound({ hiddenOnly: false, priority: 'high' });

        expect(env.created.oscillators).toBe(2);
    });

    test('low priority is quieter and shorter than normal', async () => {
        const normal = (await loadSoundModule()).sound;
        normal.playNotificationSound({ hiddenOnly: false, priority: 'normal' });
        const low = await loadSoundModule();
        low.sound.playNotificationSound({ hiddenOnly: false, priority: 'low' });

        // Same single blip, but the low-priority ramp peaks lower.
        const normalPeaks = normal.__peaks || null;
        expect(low.env.created.oscillators).toBe(1);
        expect(normalPeaks).toBeNull();
        const lowPeaks = low.env.created.ramp.filter((r) => r[0] === 'gain').map((r) => r[1]);
        expect(Math.max(...lowPeaks)).toBeLessThan(0.05);
    });

    test('stays silent when the tab is visible, by default', async () => {
        const { sound, env } = await loadSoundModule({ visibility: 'visible' });

        expect(sound.playNotificationSound({ hiddenOnly: true })).toBe(false);
        expect(env.created.oscillators).toBe(0);
    });

    test('plays on a visible tab when hiddenOnly is turned off', async () => {
        const { sound, env } = await loadSoundModule({ visibility: 'visible' });

        expect(sound.playNotificationSound({ hiddenOnly: false })).toBe(true);
        expect(env.created.oscillators).toBe(1);
    });

    test('server-side mute silences the sound', async () => {
        const { sound, env } = await loadSoundModule();

        expect(sound.playNotificationSound({ hiddenOnly: false, muted: true })).toBe(false);
        expect(env.created.oscillators).toBe(0);
    });

    test('a locally persisted mute also silences it', async () => {
        const { sound, env } = await loadSoundModule({ muted: true });

        expect(sound.isSoundMuted()).toBe(true);
        expect(sound.playNotificationSound({ hiddenOnly: false })).toBe(false);
        expect(env.created.oscillators).toBe(0);
    });

    test('never resumes a suspended context outside a user gesture', async () => {
        const { sound, env } = await loadSoundModule();
        env.ctx.state = 'suspended';

        // Autoplay policy: without a gesture this must fail quietly.
        expect(sound.playNotificationSound({ hiddenOnly: false })).toBe(false);
        expect(env.created.oscillators).toBe(0);
    });

    test('unlockAudio lets a suspended context play after a gesture', async () => {
        const { sound, env } = await loadSoundModule();
        env.ctx.state = 'suspended';

        expect(sound.unlockAudio()).toBe(true);
        expect(env.ctx.state).toBe('running');
        expect(sound.playNotificationSound({ hiddenOnly: false })).toBe(true);
    });

    test('no AudioContext support is a graceful no-op', () => {
        const sound = loadEsmModule(SOUND_PATH, {
            globals: {
                // Deliberately no AudioContext: old browsers, or a hardened env.
                window: { addEventListener: () => {}, removeEventListener: () => {} },
                document: { visibilityState: 'hidden' },
                localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
            },
        });

        expect(sound.playNotificationSound({ hiddenOnly: false })).toBe(false);
    });
});

describe('store: dedupe and read bookkeeping', () => {
    // Minimal zustand stand-in: create( fn ) -> hook exposing getState/setState.
    function loadStore() {
        const makeZustand = (factory) => {
            let state;
            const set = (partial) => {
                const next = typeof partial === 'function' ? partial(state) : partial;
                state = { ...state, ...next };
            };
            state = factory(set, () => state);
            const hook = (selector) => (selector ? selector(state) : state);
            hook.getState = () => state;
            hook.setState = set;
            return hook;
        };
        const toastStub = { getState: () => ({ addToast: () => {} }) };
        return loadEsmModule(STORE_PATH, {
            deps: {
                zustand: { create: makeZustand },
                'socket.io-client': { io: () => ({ on: () => {}, emit: () => {}, disconnect: () => {} }) },
                '../lib/api': { apiFetch: async () => ({ success: true, notifications: [] }) },
                '../store/toastStore': { default: toastStub },
                '../lib/notificationSound': {
                    playNotificationSound: () => true,
                    unlockAudio: () => true,
                    isSoundMuted: () => false,
                    setSoundMuted: () => false,
                },
            },
            globals: { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } },
        });
    }

    test('prepend ignores a notification already in the list', () => {
        const { useNotificationStore } = loadStore();
        const n = { _id: 'n1', read: false };

        useNotificationStore.getState().prepend(n);
        useNotificationStore.getState().prepend(n);

        expect(useNotificationStore.getState().items).toHaveLength(1);
        expect(useNotificationStore.getState().count).toBe(1);
    });

    test('a read notification does not inflate the badge', () => {
        const { useNotificationStore } = loadStore();

        useNotificationStore.getState().prepend({ _id: 'n1', read: true });

        expect(useNotificationStore.getState().count).toBe(0);
    });

    test('markRead decrements the badge exactly once', () => {
        const { useNotificationStore } = loadStore();
        useNotificationStore.getState().prepend({ _id: 'n1', read: false });
        useNotificationStore.getState().prepend({ _id: 'n2', read: false });
        expect(useNotificationStore.getState().count).toBe(2);

        useNotificationStore.getState().markRead('n1');
        useNotificationStore.getState().markRead('n1');

        expect(useNotificationStore.getState().count).toBe(1);
    });

    test('markAllRead zeroes the badge and flags every row', () => {
        const { useNotificationStore } = loadStore();
        useNotificationStore.getState().prepend({ _id: 'n1', read: false });
        useNotificationStore.getState().prepend({ _id: 'n2', read: false });

        useNotificationStore.getState().markAllRead();

        const state = useNotificationStore.getState();
        expect(state.count).toBe(0);
        expect(state.items.every((n) => n.read)).toBe(true);
    });

    test('clearRead keeps unread rows', () => {
        const { useNotificationStore } = loadStore();
        useNotificationStore.getState().prepend({ _id: 'n1', read: false });
        useNotificationStore.getState().prepend({ _id: 'n2', read: true });

        useNotificationStore.getState().clearRead();

        const items = useNotificationStore.getState().items;
        expect(items).toHaveLength(1);
        expect(items[0]._id).toBe('n1');
    });

    test('the visible list is capped', () => {
        const { useNotificationStore } = loadStore();
        for (let i = 0; i < 50; i += 1) {
            useNotificationStore.getState().prepend({ _id: `n${i}`, read: true });
        }
        expect(useNotificationStore.getState().items.length).toBeLessThanOrEqual(30);
    });

});

describe('wiring', () => {
    test('the server mounts the /notifications namespace', () => {
        const server = read(SERVER_PATH);
        expect(server).toContain("require('./utils/notificationSocket')");
        expect(server).toMatch(/notificationSocket\(socket\)/);
        // realtimeBus.setIO must happen before anything emits.
        expect(server.indexOf('realtimeBus.setIO')).toBeLessThan(
            server.indexOf("require('./utils/notificationSocket')")
        );
    });

    test('the socket namespace authenticates and joins the user room', () => {
        const socket = read(SOCKET_PATH);
        expect(socket).toContain("io.of('/notifications')");
        expect(socket).toContain('jwt.verify(token, process.env.JWT_SECRET)');
        expect(socket).toContain('socket.join(`user:${socket.userId}`)');
    });

    test('the provider is mounted once at the app root', () => {
        const app = read(APP_PATH);
        expect(app).toContain('NotificationProvider');
        expect((app.match(/<NotificationProvider>/g) || []).length).toBe(1);
    });

    // The bell is mounted in the dashboard header. It is intentionally not in
    // the shared Sidebar — it only appears on the dashboard.
    test('the bell is mounted in the dashboard header', () => {
        const dashboard = read(path.resolve(__dirname, '../buildrs-frontend/pages/dashboard.js'));
        expect(dashboard).toMatch(/import NotificationBell from/);
        expect(dashboard).toContain('<NotificationBell look="header" />');
    });

    test('the sidebar does not mount the bell', () => {
        expect(read(SIDEBAR_PATH)).not.toContain('NotificationBell');
    });

    test('a history page exists and is reachable from the bell', () => {
        expect(fs.existsSync(NOTIF_PAGE)).toBe(true);
        expect(read(BELL_PATH)).toContain("router.push('/notifications')");
    });
});
