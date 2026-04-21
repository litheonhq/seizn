# @seizn/cli

Command-line tools for Seizn replay, export, audit, benchmark, and Canon Lock workflows.

## Install

```bash
npm install -g @seizn/cli
```

Run without installing:

```bash
npx @seizn/cli --version
```

## Login

```bash
seizn login
```

The login command opens `/cli-auth` and stores credentials in:

```text
~/.config/seizn/credentials.json
```

The credentials file is written with `0600` permissions when the platform supports it. You can also avoid local storage:

```bash
SEIZN_API_KEY=szn_... seizn canon list
```

## Project Config

```bash
seizn init --project my-game --namespace default
```

Creates `seizn.config.json`:

```json
{
  "baseUrl": "https://www.seizn.com",
  "project": "my-game",
  "defaultNamespace": "default"
}
```

## Commands

```bash
seizn replay <trace-id>
seizn export --entity memories --format json
seizn export --entity canon --format csv
seizn audit --limit 50
seizn bench --requests 20
seizn canon list
seizn canon pull > canon.yml
seizn canon push canon.yml
```

`canon pull` emits a stable YAML file. `canon push` skips unchanged locks, so a pull followed by push does not mutate `updatedAt` timestamps.

## Environment

| Variable | Purpose |
| --- | --- |
| `SEIZN_API_KEY` | API key override |
| `SEIZN_BASE_URL` | API base URL override |
