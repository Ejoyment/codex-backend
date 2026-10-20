// Shared MongoDB connection options (audit finding #6).
//
// Fail-fast policy:
//   bufferCommands:false — without it, every query issued while the connection
//     is down/connecting sits in mongoose's buffer for 10s (bufferTimeoutMS)
//     before erroring. High traffic during an Atlas blip stacks thousands of
//     held requests (each holding a socket + memory), then all fail together.
//     With buffering disabled, queries reject immediately and callers surface
//     a clean error while the driver reconnects in the background.
//   serverSelectionTimeoutMS 10000 — bounds both boot (startServer awaits the
//     first connect before listening) and per-operation server selection.
//   socketTimeoutMS 45000 — bounds a hung socket mid-operation.
//   family 4 — skip IPv6 attempts (Render/Atlas resolution quirk).

const mongooseOptions = {
    bufferCommands: false,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    family: 4,
};

module.exports = mongooseOptions;
