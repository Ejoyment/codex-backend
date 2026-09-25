/**
 * Phase 3 — Ordered terminal stream mirror (browser side).
 * The host owns the stream; guests keep an ordered buffer keyed by sequence
 * number and resync-from-sequence-number on reconnect.
 */
export class TerminalMirror {
  constructor({ socket, roomId, onUpdate }) {
    this.socket = socket;
    this.roomId = roomId;
    this.onUpdate = onUpdate || (() => {});
    this.expectedSeq = 0;
    this.chunks = []; // [{ seq, chunk }]
    this._onChunk = this._onChunk.bind(this);
    this._onResync = this._onResync.bind(this);
    socket?.on?.('room:terminal-chunk', this._onChunk);
    socket?.on?.('room:terminal-resync', this._onResync);
  }

  _onChunk({ roomId, seq, chunk }) {
    if (roomId !== this.roomId) return;
    if (seq <= this.expectedSeq) return; // duplicate / stale
    if (seq === this.expectedSeq + 1) {
      this.chunks.push({ seq, chunk });
      this.expectedSeq = seq;
      this.onUpdate(this.chunks);
    } else {
      // Gap detected — ask host to resend from last good seq.
      this.requestResync();
      // Buffer out-of-order chunk; resync response will reconcile.
      this.chunks.push({ seq, chunk });
      this.chunks.sort((a, b) => a.seq - b.seq);
      this.onUpdate(this.chunks);
    }
  }

  _onResync({ roomId, seq, chunks }) {
    if (roomId !== this.roomId) return;
    const known = new Set(this.chunks.map((c) => c.seq));
    for (const c of chunks || []) {
      if (!known.has(c.seq)) {
        this.chunks.push(c);
        known.add(c.seq);
      }
    }
    this.chunks.sort((a, b) => a.seq - b.seq);
    if (seq > this.expectedSeq) this.expectedSeq = seq;
    // Fill expectedSeq forward over contiguous prefix.
    let next = this.expectedSeq;
    for (const c of this.chunks) {
      if (c.seq === next + 1) next = c.seq;
      else if (c.seq > next + 1) break;
    }
    this.expectedSeq = Math.max(this.expectedSeq, next);
    this.onUpdate(this.chunks);
  }

  requestResync() {
    this.socket?.emit?.('room:terminal-resync', { roomId: this.roomId, fromSeq: this.expectedSeq });
  }

  reconnect() {
    // Simulated dropped connection: resync cleanly from last seq.
    this.requestResync();
  }

  getText() {
    return this.chunks.map((c) => c.chunk).join('');
  }

  destroy() {
    this.socket?.off?.('room:terminal-chunk', this._onChunk);
    this.socket?.off?.('room:terminal-resync', this._onResync);
  }
}
