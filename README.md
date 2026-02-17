# Clocktower Assistant

A lightweight web app to run a **Blood on the Clocktower** game virtually.

## Features

- Host a game and generate an invite code/link
- Friends join using room code
- Select and edit the role pool
- Assign roles to players
- Track alive/dead status
- Run phase flow (night/day progression)
- Keep storyteller notes in a game log
- View role descriptions loaded from YAML

## Role definitions (YAML in codebase)

Roles, teams, and descriptions are loaded from:

- `data/roles.yaml`

To add/modify role metadata globally, edit that file and restart the server.

Each role entry supports:
- `name`
- `team` (`Townsfolk`, `Outsider`, `Minion`, or `Demon`)
- `description`

Supported file structure:

```yaml
roles:
  - name: Washerwoman
    team: Townsfolk
    description: "You start knowing that 1 of 2 players is a particular Townsfolk."
  - name: Librarian
    team: Townsfolk
    description: "You start knowing that 1 of 2 players is a particular Outsider."
```

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
