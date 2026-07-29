#!/usr/bin/env node
/**
 * VOX Plan B hub — a local WebSocket relay that needs no internet.
 *
 *   npm run hub
 *
 * Run it on the laptop or phone hosting the WiFi hotspot. Every VOX client
 * that joins the hotspot connects here, and packets fan out to everyone else.
 * Nothing leaves the local network; nothing is written to disk.
 *
 * This is WarpChat's approach, which is the one that actually worked during
 * the July 2024 blackout — see docs/FALLBACKS.md.
 */

'use strict';

const {WebSocketServer} = require('ws');
const os = require('os');
const {HubCore} = require('./hubCore');

const PORT = Number(process.env.VOX_WIFI_HUB_PORT || 8787);

const hub = new HubCore();
const server = new WebSocketServer({port: PORT});

server.on('connection', socket => {
  const id = hub.add({
    send: data => {
      if (socket.readyState === socket.OPEN) socket.send(data);
    },
  });

  if (id === null) {
    socket.close(1013, 'Hub is full');
    return;
  }

  log(`+ ${id} connected (${hub.clientCount} online)`);

  socket.on('message', raw => {
    // Frames are logged by size only. The hub cannot read them — they are
    // signed and it holds nobody's keys — and it should not try.
    const delivered = hub.broadcast(id, raw.toString());
    if (delivered > 0) {
      log(`  ${id} → ${delivered} peer(s), ${raw.length}B`);
    }
  });

  socket.on('close', () => {
    hub.remove(id);
    log(`- ${id} disconnected (${hub.clientCount} online)`);
  });

  socket.on('error', () => {
    hub.remove(id);
  });
});

function log(message) {
  const time = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${time}] ${message}\n`);
}

function localAddresses() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
}

log(`VOX hub listening on port ${PORT}`);
const addresses = localAddresses();
if (addresses.length === 0) {
  log('No local network address found — is the hotspot on?');
} else {
  log('Set VOX_WIFI_HUB_URL in .env on each phone to one of:');
  for (const address of addresses) {
    log(`    ws://${address}:${PORT}`);
  }
}

const shutdown = () => {
  log('Shutting down');
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
