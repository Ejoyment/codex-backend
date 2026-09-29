// Notification sounds, synthesised with the Web Audio API.
//
// No audio assets to ship, no network request, and no licensing questions.
// A "bubble" is a short sine blip whose pitch rises and decays quickly; higher
// priority events get a two-note variant so they are distinguishable without
// being obnoxious.

const STORAGE_KEY = 'buildrs:notification-sound';

let ctx = null;
let unlocked = false;

function isBrowser() {
    return typeof window !== 'undefined' && typeof window.AudioContext !== 'undefined';
}

function readMuted() {
    if (typeof localStorage === 'undefined') return false;
    try {
        return localStorage.getItem(STORAGE_KEY) === 'off';
    } catch {
        return false;
    }
}

function writeMuted(muted) {
    if (typeof localStorage === 'undefined') return;
    try {
        if (muted) localStorage.setItem(STORAGE_KEY, 'off');
        else localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* storage disabled; sound preference is session-only */
    }
}

export function isSoundMuted() {
    return readMuted();
}

export function setSoundMuted(muted) {
    writeMuted(Boolean(muted));
    return readMuted();
}

export function toggleSoundMuted() {
    return setSoundMuted(!readMuted());
}

function getContext() {
    if (!isBrowser()) return null;
    if (!ctx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        try {
            ctx = new Ctor();
        } catch {
            return null;
        }
    }
    return ctx;
}

/**
 * Browsers block audio until the user interacts with the page. Call this from a
 * real user gesture (click/keydown) so later sounds are actually audible.
 */
export function unlockAudio() {
    const audio = getContext();
    if (!audio) return false;
    if (audio.state === 'suspended' && typeof audio.resume === 'function') {
        audio.resume().catch(() => {});
    }
    unlocked = audio.state === 'running';
    return unlocked;
}

/** One short "bubble": sine with a fast upward pitch sweep and soft decay. */
function bubble(audio, { startAt, from, to, duration, peak }) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, startAt);
    osc.frequency.exponentialRampToValueAtTime(to, startAt + duration * 0.6);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.02);
}

/**
 * Play the notification sound.
 *
 * @param {object}  options
 * @param {boolean} [options.muted]        server-side preference
 * @param {boolean} [options.hiddenOnly]   only play when the tab is backgrounded
 * @param {string}  [options.priority]     low | normal | high
 * @returns {boolean} whether a sound was actually scheduled
 */
export function playNotificationSound({
    muted,
    hiddenOnly = true,
    priority = 'normal',
} = {}) {
    if (muted || readMuted()) return false;

    if (typeof document !== 'undefined' && hiddenOnly) {
        if (document.visibilityState === 'visible') return false;
    }

    const audio = getContext();
    if (!audio) return false;
    if (audio.state === 'suspended' && !unlocked) {
        // Never try to resume outside a user gesture; just stay quiet.
        return false;
    }

    try {
        const now = audio.currentTime + 0.01;
        if (priority === 'high') {
            bubble(audio, { startAt: now, from: 520, to: 900, duration: 0.16, peak: 0.14 });
            bubble(audio, { startAt: now + 0.11, from: 780, to: 1250, duration: 0.22, peak: 0.11 });
        } else if (priority === 'low') {
            // Quieter and shorter so background chatter stays unobtrusive.
            bubble(audio, { startAt: now, from: 620, to: 700, duration: 0.08, peak: 0.045 });
        } else {
            bubble(audio, { startAt: now, from: 600, to: 950, duration: 0.14, peak: 0.1 });
        }
        return true;
    } catch {
        return false;
    }
}

/** Short confirmation used by the "test sound" button in settings. */
export function playTestSound() {
    const audio = getContext();
    if (!audio) return false;
    if (audio.state === 'suspended') audio.resume?.().catch(() => {});
    try {
        const now = audio.currentTime + 0.01;
        bubble(audio, { startAt: now, from: 600, to: 950, duration: 0.14, peak: 0.1 });
        bubble(audio, { startAt: now + 0.11, from: 780, to: 1250, duration: 0.22, peak: 0.1 });
        return true;
    } catch {
        return false;
    }
}
