const socket = io();

const state = {
  game: null,
  selfId: null
};

const $ = (id) => document.getElementById(id);
const statusEl = $('status');

const els = {
  connectCard: $('connect-card'),
  gameCard: $('game-card'),
  hostName: $('host-name'),
  joinName: $('join-name'),
  joinCode: $('join-code'),
  createGame: $('create-game'),
  joinGame: $('join-game'),
  gameId: $('game-id'),
  host: $('host'),
  gameStatus: $('game-status'),
  gamePhase: $('game-phase'),
  roles: $('roles'),
  players: $('players'),
  log: $('log'),
  copyLink: $('copy-link'),
  startGame: $('start-game'),
  nextPhase: $('next-phase'),
  saveRoles: $('save-roles'),
  logInput: $('log-input'),
  addLog: $('add-log')
};

const DEFAULT_ROLES = [
  'Washerwoman, Librarian, Investigator, Chef, Empath, Fortune Teller, Undertaker, Monk, Ravenkeeper, Slayer, Soldier, Mayor, Poisoner, Spy, Scarlet Woman, Baron, Imp'
];

function setStatus(message) {
  statusEl.textContent = message;
}

function callbackStatus(result) {
  if (result?.ok) {
    setStatus('');
  } else {
    setStatus(result?.message || 'Something went wrong.');
  }
}

function isHost() {
  return state.game && state.game.hostSocketId === socket.id;
}

function render() {
  const game = state.game;
  if (!game) return;

  els.connectCard.classList.add('hidden');
  els.gameCard.classList.remove('hidden');

  els.gameId.textContent = game.id;
  els.host.textContent = game.hostName;
  els.gameStatus.textContent = game.status;
  els.gamePhase.textContent = `${game.phase} (Day ${game.day || '-'})`;
  els.roles.value = game.selectedRoles.join(', ');

  document.querySelectorAll('.host-only').forEach((node) => {
    node.style.display = isHost() ? '' : 'none';
  });

  els.players.innerHTML = '';
  game.players.forEach((player) => {
    const wrapper = document.createElement('div');
    wrapper.className = `player ${player.alive ? '' : 'dead'}`;

    const roleOptions = ['<option value="">-- no role --</option>', ...game.selectedRoles.map((r) => `<option value="${r}" ${player.role === r ? 'selected' : ''}>${r}</option>`)].join('');

    wrapper.innerHTML = `
      <strong>${player.name}</strong>
      <small>${player.connected ? 'Connected' : 'Disconnected'} • ${player.alive ? 'Alive' : 'Dead'}</small>
      <small>Assigned role: ${player.role || 'None'}</small>
      ${
        isHost()
          ? `<div class="controls"><button data-action="toggle" data-player="${player.id}">${player.alive ? 'Mark Dead' : 'Revive'}</button>
             <select data-action="role" data-player="${player.id}">${roleOptions}</select></div>`
          : ''
      }
    `;

    els.players.appendChild(wrapper);
  });

  els.log.innerHTML = '';
  [...game.log].reverse().slice(0, 60).forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = `${new Date(entry.ts).toLocaleTimeString()} - ${entry.text}`;
    els.log.appendChild(li);
  });
}

function joinByUrl() {
  const params = new URLSearchParams(window.location.search);
  const game = params.get('game');
  if (game) {
    els.joinCode.value = game;
    setStatus(`Invite detected for game ${game}. Enter your name and click Join.`);
  }
}

els.createGame.addEventListener('click', () => {
  socket.emit(
    'game:create',
    {
      hostName: els.hostName.value,
      selectedRoles: DEFAULT_ROLES[0].split(',').map((r) => r.trim())
    },
    (result) => {
      callbackStatus(result);
      if (result?.ok) {
        state.selfId = socket.id;
      }
    }
  );
});

els.joinGame.addEventListener('click', () => {
  socket.emit(
    'game:join',
    {
      gameId: els.joinCode.value,
      name: els.joinName.value
    },
    (result) => {
      callbackStatus(result);
      if (result?.ok) {
        state.selfId = socket.id;
      }
    }
  );
});

els.copyLink.addEventListener('click', async () => {
  if (!state.game) return;
  const link = `${window.location.origin}?game=${state.game.id}`;
  await navigator.clipboard.writeText(link);
  setStatus('Invite link copied.');
});

els.saveRoles.addEventListener('click', () => {
  if (!state.game) return;
  const selectedRoles = els.roles.value
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  socket.emit('game:updateRoles', { gameId: state.game.id, selectedRoles }, callbackStatus);
});

els.startGame.addEventListener('click', () => {
  if (!state.game) return;
  socket.emit('game:start', { gameId: state.game.id }, callbackStatus);
});

els.nextPhase.addEventListener('click', () => {
  if (!state.game) return;
  socket.emit('game:nextPhase', { gameId: state.game.id }, callbackStatus);
});

els.players.addEventListener('click', (event) => {
  const action = event.target.dataset.action;
  if (action !== 'toggle') return;

  const playerId = event.target.dataset.player;
  socket.emit('game:toggleAlive', { gameId: state.game.id, playerId }, callbackStatus);
});

els.players.addEventListener('change', (event) => {
  const action = event.target.dataset.action;
  if (action !== 'role') return;

  const playerId = event.target.dataset.player;
  socket.emit(
    'game:assignRole',
    { gameId: state.game.id, playerId, role: event.target.value },
    callbackStatus
  );
});

els.addLog.addEventListener('click', () => {
  if (!state.game) return;
  socket.emit('game:addLog', { gameId: state.game.id, text: els.logInput.value }, (result) => {
    callbackStatus(result);
    if (result?.ok) els.logInput.value = '';
  });
});

socket.on('game:state', (game) => {
  state.game = game;
  render();
});

joinByUrl();
