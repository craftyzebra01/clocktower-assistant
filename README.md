# Clocktower Assistant

A lightweight web app to run a **Blood on the Clocktower** game virtually.

## Features

- Host a game and generate an invite code/link
- Friends join using room code
- Select and edit the role pool
- Randomly generate a role pool for a chosen player count
- Assign roles to players
- Randomly assign roles to all players
- Track alive/dead status
- Run phase flow (night/day progression)
- Keep storyteller notes in a game log

## Run with Docker (no local Node/npm install needed)

### Option 1: Docker Compose

```bash
docker compose up --build
```

### Option 2: Plain Docker

```bash
docker build -t clocktower-assistant .
docker run --rm -p 3000:3000 --name clocktower-assistant clocktower-assistant
```

Then visit: `http://localhost:3000`

## Run locally (without Docker)

```bash
npm install
npm start
```
