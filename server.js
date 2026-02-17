const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ROLES_FILE = path.join(__dirname, 'data', 'roles.yaml');

function normalizeYamlScalar(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function parseRolesYaml(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const roleInfo = {};
  const roles = [];

  let currentName = '';

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed === '---' || trimmed === '...') return;
    if (trimmed === 'roles:' || trimmed === 'roles: []') return;

    const nameMatch = trimmed.match(/^-\s*name\s*:\s*(.+)$/i) || trimmed.match(/^name\s*:\s*(.+)$/i);
    if (nameMatch) {
      currentName = normalizeYamlScalar(nameMatch[1]);
      if (currentName && !roles.includes(currentName)) roles.push(currentName);
      if (currentName && !roleInfo[currentName]) roleInfo[currentName] = { team: '', description: '' };
      return;
    }

    const teamMatch = trimmed.match(/^team\s*:\s*(.+)$/i);
    if (teamMatch && currentName) {
      roleInfo[currentName] = {
        ...roleInfo[currentName],
        team: normalizeYamlScalar(teamMatch[1])
      };
      return;
    }

    const descriptionMatch = trimmed.match(/^description\s*:\s*(.+)$/i);
    if (descriptionMatch && currentName) {
      roleInfo[currentName] = {
        ...roleInfo[currentName],
        description: normalizeYamlScalar(descriptionMatch[1])
      };
      return;
    }
  });

  for (const roleName of Object.keys(roleInfo)) {
    const entry = roleInfo[roleName] || {};
    const team = String(entry.team || '').trim();
    const description = String(entry.description || '').trim();
    if (!team && !description) {
      delete roleInfo[roleName];
    }
  }

  return { roles, roleInfo };
}

function loadRoleCatalog() {
  const fallbackRoles = ['Washerwoman', 'Librarian', 'Investigator', 'Chef', 'Empath', 'Fortune Teller', 'Undertaker', 'Monk', 'Ravenkeeper', 'Slayer', 'Soldier', 'Mayor', 'Poisoner', 'Spy', 'Scarlet Woman', 'Baron', 'Imp'];

  try {
    const raw = fs.readFileSync(ROLES_FILE, 'utf8');
    const parsed = parseRolesYaml(raw);
    if (!parsed.roles.length) {
      return { roles: fallbackRoles, roleInfo: {} };
    }
    return parsed;
  } catch (error) {
    console.warn(`Failed to load ${ROLES_FILE}: ${error.message}`);
    return { roles: fallbackRoles, roleInfo: {} };
  }
}

const ROLE_CATALOG = loadRoleCatalog();
const DEFAULT_ROLES = ROLE_CATALOG.roles;
const DEFAULT_ROLE_INFO = ROLE_CATALOG.roleInfo;

const games = new Map();

function makeId(size = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < size; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function shuffle(input) {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function rolePoolForCount(playerCount, availableRoles) {
  const count = Math.max(1, Math.min(Number(playerCount) || 1, 20));
  const source = availableRoles?.length ? availableRoles : DEFAULT_ROLES;

  if (source.length >= count) return shuffle(source).slice(0, count);

  const out = [];
  while (out.length < count) {
    out.push(...shuffle(source));
  }
  return out.slice(0, count);
}

function createGame(hostSocket, hostName, selectedRoles) {
  let id = makeId();
  while (games.has(id)) id = makeId();

  const game = {
    id,
    hostSocketId: hostSocket.id,
    hostName,
    createdAt: Date.now(),
    status: 'lobby',
    phase: 'setup',
    day: 0,
    selectedRoles: selectedRoles?.length ? selectedRoles : DEFAULT_ROLES.slice(0, 10),
    players: [],
    roleInfo: { ...DEFAULT_ROLE_INFO },
    log: [{ ts: Date.now(), text: `${hostName} hosted the game.` }]
  };

  games.set(id, game);
  return game;
}

function serializeGame(game, viewerSocketId) {
  const viewerIsHost = game.hostSocketId === viewerSocketId;

  return {
    id: game.id,
    hostSocketId: game.hostSocketId,
    hostName: game.hostName,
    status: game.status,
    phase: game.phase,
    day: game.day,
    selectedRoles: game.selectedRoles,
    players: game.players,
    roleInfo: game.roleInfo,
    log: viewerIsHost ? game.log : []
  };
}

function addPlayer(game, socketId, name) {
  const existing = game.players.find((p) => p.socketId === socketId);
  if (existing) {
    existing.connected = true;
    existing.name = name;
    return existing;
  }

  const player = {
    id: makeId(4),
    socketId,
    name,
    alive: true,
    connected: true,
    role: null
  };
  game.players.push(player);
  return player;
}

function broadcastState(game) {
  game.players.forEach((player) => {
    if (!player.socketId) return;
    io.to(player.socketId).emit('game:state', serializeGame(game, player.socketId));
  });
}

function hostOnly(socket, game) {
  return game.hostSocketId === socket.id;
}

io.on('connection', (socket) => {
  socket.on('game:create', ({ hostName, selectedRoles }, cb) => {
    const safeName = (hostName || '').trim() || 'Host';
    const roles = Array.isArray(selectedRoles)
      ? selectedRoles.map((r) => String(r).trim()).filter(Boolean).slice(0, 25)
      : [];

    const game = createGame(socket, safeName, roles);
    socket.join(game.id);
    addPlayer(game, socket.id, safeName);

    cb?.({ ok: true, gameId: game.id, defaults: DEFAULT_ROLES });
    broadcastState(game);
  });

  socket.on('game:join', ({ gameId, name }, cb) => {
    const id = String(gameId || '').toUpperCase().trim();
    const game = games.get(id);
    if (!game) {
      cb?.({ ok: false, message: 'Game not found.' });
      return;
    }

    const safeName = (name || '').trim() || `Player ${game.players.length + 1}`;
    socket.join(game.id);
    const player = addPlayer(game, socket.id, safeName);
    game.log.push({ ts: Date.now(), text: `${player.name} joined the game.` });

    cb?.({ ok: true, gameId: game.id });
    broadcastState(game);
  });

  socket.on('game:updateRoles', ({ gameId, selectedRoles }, cb) => {
    const game = games.get(String(gameId || '').toUpperCase().trim());
    if (!game) return cb?.({ ok: false, message: 'Game not found.' });
    if (!hostOnly(socket, game)) return cb?.({ ok: false, message: 'Host only action.' });

    const roles = Array.isArray(selectedRoles)
      ? selectedRoles.map((r) => String(r).trim()).filter(Boolean).slice(0, 25)
      : [];

    game.selectedRoles = roles;
    game.log.push({ ts: Date.now(), text: `Roles updated (${roles.length} selected).` });
    broadcastState(game);
    cb?.({ ok: true });
  });

  socket.on('game:randomizeRolePool', ({ gameId, playerCount }, cb) => {
    const game = games.get(String(gameId || '').toUpperCase().trim());
    if (!game) return cb?.({ ok: false, message: 'Game not found.' });
    if (!hostOnly(socket, game)) return cb?.({ ok: false, message: 'Host only action.' });

    const requestedCount = Number(playerCount) || game.players.length || 1;
    const roles = rolePoolForCount(requestedCount, DEFAULT_ROLES);

    game.selectedRoles = roles;
    game.log.push({ ts: Date.now(), text: `Randomized role pool for ${requestedCount} players.` });
    broadcastState(game);
    cb?.({ ok: true, selectedRoles: roles });
  });

  socket.on('game:randomAssignRoles', ({ gameId }, cb) => {
    const game = games.get(String(gameId || '').toUpperCase().trim());
    if (!game) return cb?.({ ok: false, message: 'Game not found.' });
    if (!hostOnly(socket, game)) return cb?.({ ok: false, message: 'Host only action.' });

    if (!game.players.length) return cb?.({ ok: false, message: 'No players to assign roles.' });

    const roles = rolePoolForCount(game.players.length, game.selectedRoles);
    const shuffledRoles = shuffle(roles);

    game.players.forEach((player, index) => {
      player.role = shuffledRoles[index] || null;
    });

    game.log.push({ ts: Date.now(), text: `Randomly assigned roles to ${game.players.length} players.` });
    broadcastState(game);
    cb?.({ ok: true });
  });

  socket.on('game:start', ({ gameId }, cb) => {
    const game = games.get(String(gameId || '').toUpperCase().trim());
    if (!game) return cb?.({ ok: false, message: 'Game not found.' });
    if (!hostOnly(socket, game)) return cb?.({ ok: false, message: 'Host only action.' });

    game.status = 'in-progress';
    game.phase = 'night';
    game.day = 1;
    game.log.push({ ts: Date.now(), text: 'Game started: Night 1 begins.' });
    broadcastState(game);
    cb?.({ ok: true });
  });

  socket.on('game:nextPhase', ({ gameId }, cb) => {
    const game = games.get(String(gameId || '').toUpperCase().trim());
    if (!game) return cb?.({ ok: false, message: 'Game not found.' });
    if (!hostOnly(socket, game)) return cb?.({ ok: false, message: 'Host only action.' });

    if (game.phase === 'night') {
      game.phase = 'day';
      game.log.push({ ts: Date.now(), text: `Day ${game.day} begins.` });
    } else {
      game.phase = 'night';
      game.day += 1;
      game.log.push({ ts: Date.now(), text: `Night ${game.day} begins.` });
    }

    broadcastState(game);
    cb?.({ ok: true });
  });

  socket.on('game:toggleAlive', ({ gameId, playerId }, cb) => {
    const game = games.get(String(gameId || '').toUpperCase().trim());
    if (!game) return cb?.({ ok: false, message: 'Game not found.' });
    if (!hostOnly(socket, game)) return cb?.({ ok: false, message: 'Host only action.' });

    const player = game.players.find((p) => p.id === playerId);
    if (!player) return cb?.({ ok: false, message: 'Player not found.' });

    player.alive = !player.alive;
    game.log.push({ ts: Date.now(), text: `${player.name} is now ${player.alive ? 'alive' : 'dead'}.` });
    broadcastState(game);
    cb?.({ ok: true });
  });

  socket.on('game:assignRole', ({ gameId, playerId, role }, cb) => {
    const game = games.get(String(gameId || '').toUpperCase().trim());
    if (!game) return cb?.({ ok: false, message: 'Game not found.' });
    if (!hostOnly(socket, game)) return cb?.({ ok: false, message: 'Host only action.' });

    const player = game.players.find((p) => p.id === playerId);
    if (!player) return cb?.({ ok: false, message: 'Player not found.' });

    player.role = role ? String(role).trim() : null;
    game.log.push({ ts: Date.now(), text: `${player.name} role ${player.role ? `set to ${player.role}` : 'cleared'}.` });
    broadcastState(game);
    cb?.({ ok: true });
  });

  socket.on('game:addLog', ({ gameId, text }, cb) => {
    const game = games.get(String(gameId || '').toUpperCase().trim());
    if (!game) return cb?.({ ok: false, message: 'Game not found.' });
    if (!hostOnly(socket, game)) return cb?.({ ok: false, message: 'Host only action.' });

    const entry = String(text || '').trim();
    if (!entry) return cb?.({ ok: false, message: 'Log entry cannot be empty.' });

    game.log.push({ ts: Date.now(), text: entry });
    broadcastState(game);
    cb?.({ ok: true });
  });

  socket.on('disconnect', () => {
    for (const game of games.values()) {
      const player = game.players.find((p) => p.socketId === socket.id);
      if (!player) continue;

      player.connected = false;
      game.log.push({ ts: Date.now(), text: `${player.name} disconnected.` });

      if (game.hostSocketId === socket.id) {
        const replacement = game.players.find((p) => p.connected && p.socketId !== socket.id);
        if (replacement) {
          game.hostSocketId = replacement.socketId;
          game.hostName = replacement.name;
          game.log.push({ ts: Date.now(), text: `${replacement.name} is now host.` });
        }
      }

      broadcastState(game);
    }
  });
});

app.use(express.static('public'));

server.listen(PORT, () => {
  console.log(`Clocktower Assistant running at http://localhost:${PORT}`);
});
