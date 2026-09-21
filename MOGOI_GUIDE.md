# MOGOI — Owner's Guide

**Understand it. Install it. Run it anywhere. Reshape it into your vision — without breaking it.**

This guide is written against the actual code in `mogoi-installer-v0.1.2/` (brain `0.13.7`, sidecar `0.9.6`, installer `0.1.2`).
Where this guide and an older doc file disagree, trust this guide and `config.example.yaml` — some shipped docs
(`QUICKSTART.md`, parts of `docs/LLM_PROVIDERS.md`) describe an older config style (noted where relevant).

How to use this document:

- **§1–§3** — the idea and the machine. Read once.
- **§4–§5** — install on your OS and get it running today.
- **§6–§7** — configure and operate it day to day.
- **§8–§11** — make it yours: safe change zones, your rebrand checklist, hard guardrails, and the change workflow.
- **§12** — when something breaks, start here.

---

## 1. The idea behind MOGOI

Most AI assistants are **request/response tools**: you ask, they answer, they forget. MOGOI is built on the opposite premise —
a **persistent agent** that is always on, remembers, and acts on your behalf within limits you define.

Three design decisions shape everything:

1. **Brain / hands split.** One central **daemon** (the brain: LLM connections, memory, decisions) plus any number of
   lightweight **sidecars** (the hands: screen, keyboard, browser, files on each machine). Run the brain 24/7 on a server;
   give it eyes on your laptop via a sidecar. This is the entire architecture diagram in `README.md` (§ Architecture).
2. **Memory is infrastructure, not a feature.** Every conversation is mined by the Vault Extractor into a SQLite knowledge
   graph (entities, facts, relationships, commitments), and relevant knowledge is injected into the system prompt on every
   turn. The agent genuinely remembers — that is why the database matters as much as the model.
3. **Authority is enforced at runtime, not suggested in a prompt.** A dedicated authority engine gates tool execution
   (levels 0–5), delivers approval requests over chat/Telegram/Discord, keeps a full audit trail, and has emergency
   pause/kill. You do not "hope" the agent behaves; the runtime constrains it.

Concretely, one installation gives you: multi-provider chat with streaming, 14+ tools with deep agent loops, desktop
awareness (screen capture every 5–10 s with OCR + struggle detection), native app control, a 9-role multi-agent hierarchy,
a visual n8n-style workflow builder (50+ nodes), voice (wake word + TTS/STT), OKR goal tracking, and cron/webhook triggers.

---

## 2. System map — what lives where

### 2.1 Repository layout

| Path | What it is |
|---|---|
| `bin/mogoi.ts` | The `mogoi` CLI (start/stop/status/logs/doctor/enroll/…). Thin launcher over `src/cli/`. |
| `src/daemon/` | The brain process: boot, services, HTTP+WebSocket API (`Bun.serve`), shutdown/drain. Entry: `src/daemon/index.ts`. |
| `src/llm/` | Provider abstraction (`manager.ts`, `provider.ts`, `tiers.ts`): Anthropic, OpenAI, Gemini, Groq, Ollama, OpenRouter, OmniRoute, LiteLLM, Nvidia, `motius.ts`. Fallback chains, streaming, tool calling, usage accounting. |
| `src/vault/` | SQLite memory layer: `schema.ts`, `entities/facts/relationships/commitments/conversations`, `extractor.ts`, `keychain.ts` (encrypted secrets). |
| `src/agents/` | Agent loop + `AgentTaskManager` (multi-agent delegation). |
| `src/roles/` | Role engine (`loader.ts`, `prompt-builder.ts`, `authority.ts`). Role *content* lives in top-level `roles/*.yaml`. |
| `src/authority/` | Runtime permission gating: `engine.ts`, `approval.ts`, `approval-delivery.ts`, `audit.ts`, `emergency.ts`, `learning.ts`. |
| `src/workflows/` | Visual automation runtime: `runner/`, `runtime/`, `mogoi-pieces/` (native pieces), `pieces-library/`, vendored `activepieces/` (MIT-only subtree), `sandbox-api/`, `queue/`, `credentials/`, `db/`. |
| `src/sidecar/` | Brain-side manager for sidecar connections: `manager.ts`, `protocol.ts`, `rpc.ts`, `enrollment.ts`, `compat.ts` (version floors). |
| `src/cli/` | CLI implementation: `daemon-control.ts`, `autostart.ts` (systemd/launchd units), `doctor.ts`, `update.ts`, `uninstall.ts`, `backup.ts`, `devices.ts`. |
| `src/config/` | Config loading/validation: `loader.ts`, `types.ts`. `~` expansion, env overrides, listen-spec resolution. |
| `src/personality/` | Adaptive personality model (traits, learned preferences, trust, channel overrides). |
| `src/awareness/`, `src/observers/` | Screen-activity pipeline (mostly fed by sidecars now). |
| `src/voice/`, `src/comms/`, `src/integrations/` | TTS/STT, messaging channels (Telegram/Discord), third-party integrations. |
| `src/goals/`, `src/telemetry/`, `src/user/` | OKR tracking, anonymous metrics, user profile. |
| `src/actions/browser/`, `src/sites/` | Local Chromium control via CDP; site fixtures. |
| `src/lib/`, `src/util/`, `src/scripts/` | Shared code (cron scheduler, etc.). |
| `ui/` | React 19 + Tailwind 4 dashboard (`index.html`, `pebble.html`, `overlay.html`, `src/`). Built to `ui/dist/` — never hand-edit `dist/`. |
| `sidecar/` | Go desktop agent: screen/browser/terminal/clipboard automation, WebSocket RPC to the brain, `installer/` (Setup wizard), `npm/*` (published platform binaries), `VERSION`. |
| `roles/` | Role definitions (`personal-assistant.yaml` default + specialists). Safe to edit — see §8. |
| `scripts/` | Build + guard scripts (`build-*.ts`, `check-*.ts`, `sync-*.ts`, `setup-config.ts`, `realtime-smoke.ts`, …). |
| `examples/` | Runnable demos (`llm-integration.ts`, `personality-demo.ts`, …). |
| `docs/` | Deep dives per subsystem (see §13). |
| `config.example.yaml` | **Authoritative config reference.** Copy to `~/.mogoi/config.yaml`. |
| `install.sh`, `Dockerfile` | Scripted install and container build. |

### 2.2 Runtime architecture (how the pieces talk)

```
  ┌────────────────────────── MOGOI daemon (Bun + TypeScript) ──────────────────────────┐
  │  LLM Router │ Vault Memory │ Agent Manager │ Workflow Engine │ Authority │ Goals …   │
  │  Bun.serve() — HTTP API + WebSocket + React dashboard (port 1846)                   │
  └───────────────┬──────────────────────────────────────────────┬────────────────────────┘
                  │ JWT-auth WebSocket (binary protocol)         │
        ┌─────────┴─────────┐                          ┌─────────┴─────────┐
        │  Sidecar #1 (Go)  │                          │  Sidecar #2 (Go)  │
        │  laptop: screen,  │                          │  server: terminal,│
        │  browser, keys    │                          │  files, screenshots│
        └───────────────────┘                          └───────────────────┘
```

- The **daemon** holds *all* state and decisions. It serves plain HTTP (no TLS — a reverse proxy adds HTTPS in
  self-hosted setups) plus WebSockets for sidecars and live dashboard updates.
- **Sidecars** are stateless-ish hands: they authenticate with JWT enrollment tokens and stream capabilities
  (screenshots, clipboard, files, processes). The brain refuses outdated sidecars based on compatibility floors
  (`src/sidecar/compat.ts`) — local `dev` builds are never blocked.
- **Data flow of one message:** dashboard/chat → daemon API → Vault injects relevant memories → role prompt +
  personality applied → LLM Router picks provider (with fallback chain) → agent loop runs tools (each gated by the
  authority engine) → response streamed back → Vault Extractor mines the turn into the knowledge graph → audit logged.

### 2.3 Boot sequence (`src/daemon/index.ts` → `startDaemon`)

1. Parse `~/.mogoi/config.yaml` (`loadConfig`), apply env overrides; resolve the listen spec **first** (a bad
   `daemon.listen` fails fast before anything is persisted).
2. Acquire the single-instance lock (`~/.mogoi/mogoi.pid`, format `PID\nPORT`).
3. Print banner → `initDatabase(dbPath)` → merge LLM/user settings from DB+keychain into runtime config.
4. Construct `ServiceRegistry` (agent, background agent, commitments, awareness, triggers, health, telemetry…).
   **Note:** background services are built at boot and gated on setup completion — after first-time dashboard setup
   you must `mogoi restart` once (the dashboard reminds you; stated in `README.md`).
5. Serve HTTP+WebSocket on the port (default **1846**) or unix socket.

Shutdown is graceful: stop services → drain in-flight agent turns (default 75 s budget) → stop registry → close DB.
`mogoi stop` / `restart` also coordinate with systemd/launchd supervisors so they don't fight the restart.

---

## 3. Why it is built this way (the stack, and why you should keep it)

| Choice | Reason | Keep-or-change guidance |
|---|---|---|
| **Bun runtime (not Node.js)** | Single binary, fast startup, built-in SQLite (`bun:sqlite`), `Bun.serve`, direct TS execution — no build step for the daemon. `engines: bun >= 1.0`. | **Do not port to Node.** Large parts (`bun:sqlite`, `Bun.serve`, `bun:ffi`/TinyCC `flock.c` locking) are Bun-only. |
| **TypeScript ESM, strict** | `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, path alias `@/* → src/*`. Catches whole bug classes in agent/tool code. | Keep strictness on. New files go under `src/` so they are type-checked and covered by `include`. |
| **SQLite via `bun:sqlite`** | One file (`~/.mogoi/mogoi.db`), zero ops, single-backup-unit, WAL-friendly. Replaces Postgres/Redis from the vendored workflow engine. | Do not swap the DB engine casually — migrations, keychain, vault, and workflow tables all assume it. |
| **Go sidecar** | Needs Win32/X11/Cocoa APIs, tiny binaries, CGO system trays and hotkeys — wrong tool in TS. Ships per-OS via npm (`@motius/sidecar-*`) + installers. | Edit Go only with the Makefile matrix (§4.5); never hand-place binaries. |
| **React dashboard built with `bun build`** | `bun run build:ui` bundles `ui/index.html` (+ `pebble.html`) to `ui/dist/`. ONNX wake-word + TTS models are copied to `ui/public/` by `copy:models`. | Always rebuild UI after editing `ui/`; never edit `ui/dist/` by hand. |
| **Vendored Activepieces (MIT-only)** | Workflow node ecosystem without reinventing it. Pinned (`UPSTREAM.md`: tag `0.82.1`, SHA `d04e6807…`), EE paths excluded by law and by CI guard. | Sync only via `scripts/sync-activepieces.ts`; never vendor `ee/` paths (§10). |
| **Roles as YAML, character in config** | Behavior is data: `roles/*.yaml` (tools, responsibilities, approval lists) + `config.personality` (character). Prompt builder composes them at runtime. | This is your main creative surface — see §8. No code changes needed to reshape behavior. |

---

## 4. Installation

### 4.1 Requirements per OS

| | Linux | macOS | Windows |
|---|---|---|---|
| **Daemon (brain)** | ✅ Native. Needs `curl`, `make`, `git`, C headers (`libc6-dev` / `glibc-headers` / `musl-dev` — Bun compiles `src/daemon/flock.c` at runtime) | ✅ Native. Xcode CLT for `make`/headers | ❌ **Not supported natively.** Use **WSL2** (then follow the Linux column) or **Docker** |
| **Sidecar (hands)** | ✅ Binary / npm | ✅ Binary / npm (+ `Mogoi.app`) | ✅ `Mogoi-Setup.exe` / npm |
| **Docker path** | ✅ | ✅ (Docker Desktop) | ✅ (Docker Desktop) |
| Bun | Auto-installed by `install.sh`, or `curl -fsSL https://bun.sh/install \| bash` | Same | Inside WSL2 |
| LLM key | At least one: Anthropic, OpenAI, Gemini, or local Ollama | Same | Same |

Default port **1846**, dashboard at `http://localhost:1846`. (Ignore the `7777` in `QUICKSTART.md` — stale.)

### 4.2 Method A — Bun global (recommended for macOS / Linux / WSL2)

```bash
bun install -g @motius/brain
mogoi start
```

### 4.3 Method B — One-liner (macOS / Linux / WSL only)

```bash
curl -fsSL https://raw.githubusercontent.com/Motius/mogoi/main/install.sh | bash
# open a NEW terminal afterwards so PATH picks up ~/.bun/bin, then:
mogoi start
```

What `install.sh` actually does (3 stages): detects OS (refuses native Windows and unknown OS) → ensures
`curl/make/git/unzip` + C headers → installs Bun → clones the latest `vX.Y.Z` tag to `~/.mogoi/daemon` →
`bun install` → writes a `mogoi` wrapper into `~/.bun/bin` and adds it to your shell rc.
What it does **not** do: no sidecar, no `config.yaml`, no autostart — those are separate steps below.

### 4.4 Method C — Manual clone (best for owners who will modify code)

```bash
git clone https://github.com/Motius/mogoi.git ~/.mogoi/daemon
cd ~/.mogoi/daemon
bun install
bun run build:ui
bun link
mogoi start
```

### 4.5 Method D — Docker (any OS, including native Windows)

```bash
docker run -d --name mogoi -p 1846:1846 -v mogoi-data:/data ghcr.io/Motius/mogoi:latest
```

Notes: the container runs as user `mogoi` with `MOGOI_HOME=/data`; the entrypoint is `mogoi start --no-open
--data-dir /data --no-local-tools`. Inside Docker the daemon has **no host desktop access** — you still install a
sidecar per machine you want it to see (§5.4). `mogoi update`/`uninstall` refuse inside Docker; update with
`docker pull … && docker rm -f mogoi && docker run …`.

### 4.6 Verify the install

```bash
mogoi doctor     # Bun version, config parse, LLM providers, install-method detection
mogoi status     # is the daemon running?
mogoi logs -f    # follow live logs
```

`mogoi doctor` also tells you exactly which update/uninstall commands apply to your install method.

---

## 5. First run and setup

1. **Start:** `mogoi start` (foreground) or `mogoi start -d` (background; logs to `~/.mogoi/logs/mogoi.log`).
   Options: `--port 1846`, `--data-dir <path>`, `--no-open`, `--no-local-tools`.
2. **Open** `http://localhost:1846`. First boot is setup mode: LLM provider → voice → profile interview → tour.
3. **Configure LLM providers in the dashboard** (Settings → LLM). Current truth per `config.example.yaml`:
   providers/keys/routing live in the **database + encrypted keychain**, *not* in `config.yaml` — any `llm:` block
   you add to the YAML is ignored. (`QUICKSTART.md`'s `llm:` YAML editing is the old way; follow the dashboard.)
4. **Restart once:** `mogoi restart` — background services only activate on a boot that happens *after* setup.
5. **Enroll this machine** (dashboard access is JWT-only by default):
   ```bash
   mogoi enroll "my-desktop"     # prints a one-time enrollment token
   ```
   Paste it into the sidecar, or temporarily set `auth: { insecure_open_access: true }` in `config.yaml` for
   first-time setup only — then **remove it** (the daemon logs a loud warning while it is on).
6. **Sidecar per machine you want it to see/control:**
   ```bash
   bun install -g @motius/sidecar   # or fetch the binary from GitHub Releases
   mogoi                               # setup window → paste enrollment token (saved to ~/.mogoi/sidecar.yaml)
   mogoi --token <token>               # headless alternative; later runs are just `mogoi`
   ```
   Capabilities (terminal, filesystem, desktop, browser, clipboard, screenshots, …) are toggled in
   Settings → Sidecar. The brain shows OK / Update available / **Update required** (refuses too-old sidecars).
7. **Ambient mode** (Windows sidecar hosts): a cursor-following pebble UI is on by default; opt out anywhere with
   `MOGOI_AMBIENT_UI=0`. The web dashboard always remains as fallback/debug surface.

---

## 6. Configuration reference

### 6.1 Where things live

| What | Location | Notes |
|---|---|---|
| System config | `~/.mogoi/config.yaml` (copy from `config.example.yaml`) | Daemon, auth, TTS/STT, cron, personality traits, authority, `active_role`. `chmod 600`. |
| Brain database | `~/.mogoi/mogoi.db` | Vault memory, LLM provider creds (keychain-encrypted), settings. Back this up. |
| Sidecar token | `~/.mogoi/sidecar.yaml` | Per-machine enrollment. |
| Lock + logs | `~/.mogoi/mogoi.pid`, `~/.mogoi/logs/mogoi.log` | |
| Override root | `MOGOI_HOME` env | Moves data dir + db (`<MOGOI_HOME>/mogoi.db`). Docker sets `/data`. |
| Projects | `~/.mogoi/projects` | |

### 6.2 Settings that matter most

- `daemon.port` (default `1846`), `daemon.listen` (`unix:/run/mogoi/mogoi.sock` for reverse-proxy setups — then **no TCP**),
  `daemon.public_url` (canonical HTTPS origin for callbacks/enrollment; never localhost when remote sidecars exist).
- `auth.insecure_open_access` — escape hatch only; remove after enrollment.
- `authority.default_level` 0–5 (0 ask-everything … 3 standard … 5 full control).
- `personality.core_traits` + `assistant_name`; `active_role` must match a file in `roles/` (no extension).
- `telemetry.enabled: false` (or `MOGOI_TELEMETRY=0` / `DO_NOT_TRACK=1`) to opt out of anonymous pings.
- `tts` / `stt`, `cron` triggers (`morning/evening/hourly`), `timezone` (set when server clock ≠ your wall clock),
  `browser.local: false` on headless servers (browser work routes to a sidecar), `workflows.engine_dir/pieces_dir`
  (optional prebuilt artifacts with `${version}` expansion).
- Log ring: `daemon.log_file_path` + `log_file_max_bytes` (default 1 MiB, clamped 4 KiB–64 MiB; doubles as RSS budget).

### 6.3 Environment variables you will actually use

`MOGOI_HOME`, `MOGOI_PORT`, `MOGOI_PUBLIC_URL` (legacy `MOGOI_BRAIN_DOMAIN`), `MOGOI_TELEMETRY` / `DO_NOT_TRACK`,
`MOGOI_AMBIENT_UI`, `MOGOI_WAKE_ENGINE`, `MOGOI_REALTIME_VOICE`, `MOGOI_API_KEY` (Docker), `MOGOI_INSTALL_METHOD`,
`MOGOI_VERSION`, `MOGOI_SECRETS_DIR`, `MOGOI_WORKFLOW_ENCRYPTION_KEY` (+ `_FILE`), `MOGOI_PIECES_DIR` /
`MOGOI_SHARED_PIECES_DIR` / `MOGOI_PIECE_METADATA_CACHE`, `MOGOI_ENGINE_CACHE_ROOT`, `MOGOI_DIR`, `MOGOI_BIN`.
Secrets and LLM keys: prefer dashboard/keychain or a secrets manager over env files; never commit keys
(`chmod 600 ~/.mogoi/config.yaml`).

### 6.4 Roles, personality, authority (your behavior stack)

- **Role** (`roles/<name>.yaml`): `description`, `responsibilities`, `autonomous_actions` (free), `approval_required`
  (gated), `tools` (allow-list). Nine ship: personal-assistant (default), ceo-founder, chief-of-staff, dev-lead,
  executive-assistant, marketing-director, system-admin, activity-observer, research-specialist, plus `specialists/`.
- **Character** (`config.personality`): traits live here, *not* in role files — the prompt builder injects them separately.
- **Learning:** the personality engine adapts verbosity/formality/humor, trust level, and per-channel overrides from
  interaction (SQLite-backed, see `docs/PERSONALITY_ENGINE.md`).
- **Enforcement:** `src/authority/` gates every tool call at runtime with approvals + audit + emergency pause/kill.
  Sub-agents are denied governed actions — authority stays top-level.

---

## 7. Operating it day to day

### 7.1 CLI essentials

| Command | Effect |
|---|---|
| `mogoi start [-d] [--port N] [--data-dir P] [--no-open] [--no-local-tools]` | Foreground / background daemon |
| `mogoi stop [--port N]`, `drain`, `restart`, `status` | Lifecycle (drain waits for in-flight turns) |
| `mogoi logs -f`, `mogoi logs -n N` | Follow / tail logs |
| `mogoi doctor` | Environment + connectivity diagnosis |
| `mogoi enroll "<device>" [--rotate]` | Mint enrollment token |
| `mogoi sidecars list [--json]`, `mogoi revoke <sid>` | Manage hands |
| `mogoi export` / `restore` | Backup / restore |
| `mogoi update` / `upgrade` | Self-update per install method (refuses in Docker/dev checkouts) |
| `mogoi uninstall` | Stop, remove autostart, delete `~/.mogoi`, package-manager uninstall (never touches sidecars) |
| `mogoi version`, `mogoi help` | |

### 7.2 Autostart (starts on login/boot)

- **Linux:** systemd user service `~/.config/systemd/user/mogoi.service` (`mogoi` CLI manages enable/start; needs lingering on servers: `loginctl enable-linger`).
- **macOS:** launchd agent `~/Library/LaunchAgents/ai.mogoi.daemon.plist` (`RunAtLoad`, `KeepAlive`).
- **Sidecars:** Windows = HKCU `Run` value; macOS = `com.mogoi.sidecar.plist`; Linux = `~/.config/autostart/mogoi-sidecar.desktop`.

### 7.3 Self-hosting notes

The daemon never terminates TLS: put Caddy/nginx/traefik in front for anything beyond one machine, or bind a unix
socket (`daemon.listen`) for a same-host proxy. Set `public_url` to the real HTTPS origin for OAuth callbacks and
remote-sidecar enrollment. Full scenarios (single machine / LAN / VPS): `docs/SELF_HOSTING.md`. Only
`/health`, `/sidecar/connect`, the JWKS endpoint, and `/api/webhooks/*` are unauthenticated — everything else is
session/JWT.

---

## 8. Making it yours — safe change zones (in order of safety)

**Zone 1 — pure configuration (zero code risk).** `~/.mogoi/config.yaml` (traits, authority level, cron, TTS/STT,
`active_role`), dashboard Settings (LLM routing, channels, sidecar capabilities). Validate with
`mogoi doctor` + `mogoi restart`.

**Zone 2 — roles (the highest-leverage file type).** Copy `roles/personal-assistant.yaml` → `roles/<yours>.yaml`,
edit `description/responsibilities/autonomous_actions/approval_required/tools`, set `active_role: "<yours>"`,
restart. Rules: keep `approval_required` conservative (sending/deleting/paying/system changes stay gated), only list
tools the role truly needs, keep character prose in `config.personality` (role files stay behavioral).

**Zone 3 — dashboard text/UI.** Edit `ui/src/`, then `bun run build:ui` (runs `copy:models` first via `prebuild:ui`).
Never hand-edit `ui/dist/`. If you add webapp templates, run `bun run lint:templates`.

**Zone 4 — workflow pieces.** Native pieces live in `src/workflows/mogoi-pieces/`; community curation in
`src/workflows/pieces-library/`. Mandatory reading order: `docs/WORKFLOW_AUTOMATION.md` →
`docs/PIECE_VERIFICATION.md` (8-stage end-to-end checklist, required before adding/editing any piece). After edits:
`bun run build:workflows` (rebuilds pieces + engine bundle) and restart the daemon (catalog cache re-extracts on boot).

**Zone 5 — TypeScript behavior.** Agent loop (`src/agents/`), tools, daemon services, LLM providers
(copy `ollama.ts`-style provider + register in manager; add tests mirroring `*.test.ts`). Keep imports path-aliased
(`@/*`), ESM extensions (`.ts`), strict-safe (no unchecked indexing without guards).

**Zone 6 — Go sidecar.** Only via `sidecar/Makefile` matrix builds; test on the target OS; bump `sidecar/VERSION`
when behavior changes so the brain's compatibility floors stay meaningful.

Verify every change with §11's checklist before calling it done.

---

## 9. Your ownership checklist (rebrand phase 2 — what is left)

Already completed in this checkout: `Jarvis→Mogoi` / `JARVIS→MOGOI` / `J.A.R.V.I.S.→M.O.G.O.I.` across all text,
all 27 file/dir names, the tagline (`Motius-ke labs ,your Co-Founder AI with no emotions`), the ASCII banners
(regenerated in-font), and `LICENSE`. Still referencing the old identity (111 files) — work through these:

- [ ] **Code registries:** `package.json` (`@motius/brain`, repo URL), `sidecar/npm/*/package.json`
      (`@motius/sidecar-*`), `bun.lock`. Renaming the npm scope means republishing + updating every install
      reference (`README.md`, `install.sh`, workflows).
- [ ] **Hosted endpoints:** `motius_ai.base_url` (`https://llm.motius.host`), `MOGOI_*` provider prefixes,
      JWKS/issuer strings, `ghcr.io/Motius/mogoi`, `github.com/Motius/mogoi` URLs in `install.sh`/`Dockerfile`/docs.
- [ ] **OS identities:** launchd label `ai.mogoi.daemon`, sidecar plist `com.mogoi.sidecar`, Windows registry value,
      `.desktop` file, `Mogoi.app` / `Mogoi-Setup.exe` names, `sidecar/VERSION` + `installer/VERSION` bumps.
- [ ] **Voice + brand assets:** wake-word model `hey_mogoi_v0.1.onnx` (+ `copy:models` line), `ui/favicon.svg`,
      `overlay.html`/`pebble.html` copy, email/Discord/website links (`discord.gg/…`, `motius.dev`, `opencove.host`).
- [ ] **Rebuild the Windows binary resource:** `sidecar/rsrc_windows_amd64.syso` still embeds the old manifest string —
      regenerate from `sidecar/mogoi.manifest` + `mogoi.rc` (never hex-edit the `.syso`).
- [ ] **Versions + docs sweep:** bump versions coherently, update `README.md` badges/links, re-run §11 fully.

Find candidates anytime with:
`grep -rli "motius\|Motius\|opencove\|motius.dev" --include='*.ts' --include='*.json' --include='*.yaml' --include='*.md' --include='*.go' --include='*.sh' .`

---

## 10. Guardrails — what you must not break

1. **License boundaries.** `src/workflows/activepieces/` must never contain `ee/` paths or imports — CI
   (`check-no-ee-imports`, also a pre-commit hook) fails the push. Distribution license is Mogoi Source Available
   License 2.0; third-party pieces keep their own licenses (`THIRD_PARTY_NOTICES.md`).
2. **Migrations are expand/contract.** `scripts/check-migrations.ts` enforces rollback-safe SQLite migrations.
   Never rewrite a shipped migration; add a new one.
3. **Pre-commit hooks are mandatory** (`.githooks/`, wired by `prepare`): no-EE check → migration check →
   template lint → package-files check → `bun test --bail` (240 s timeout). Do not bypass with `--no-verify`
   except to diagnose the hook itself.
4. **Lockfile + published files.** `bun install --frozen-lockfile` is what CI/install use — commit `bun.lock`
   changes with dependency changes. `package.json#files` controls the published tarball; `check:package` verifies it.
5. **Auth defaults.** JWT-only is the security model. Never ship `insecure_open_access: true` as a default, never
   widen the four public routes, never log tokens (log pipeline redacts credentials for a reason).
6. **Single-instance + native deps.** `mogoi.pid` locking and runtime TinyCC compile of `flock.c` need POSIX headers
   on Linux (`install.sh` installs them — don't remove that step) and are why native Windows is unsupported.
7. **Catalog/version coherence.** After framework edits run `build:workflows` (stale engine = stale catalog);
   on piece changes the drift test vs the committed snapshot will fail until you regenerate fixtures deliberately.
   Keep the three versions (`package.json`, `sidecar/VERSION`, `sidecar/installer/VERSION`) coherent.
8. ** vendored webview patch.** `scripts/vendor-webview.sh` pins `webview_go` + `mogoi.patch`; don't upgrade the
   dependency without re-applying and re-asserting the patch markers.

---

## 11. The change workflow (use it every time)

```bash
# 0. Start clean
git status && git pull --ff-only
# 1. Edit (config → roles → ui → pieces → ts → go, per §8)
# 2. Rebuild what you touched
bun run build:ui            # if ui/ changed
bun run build:workflows     # if workflow framework/pieces changed
# 3. Verify — all green before restart
bun test
bun run check:no-ee && bun run check:migrations && bun run lint:templates && bun run check:package
bun run check:pieces        # if pieces/catalog changed
mogoi doctor
# 4. Restart and watch
mogoi restart && mogoi logs -f
```

Small, reversible steps; one concern per change; restart the daemon after anything it caches at boot
(services, piece catalog, LLM/user settings merges). If the daemon won't start: `mogoi status`, then
`~/.mogoi/mogoi.pid` staleness, then `config.yaml` YAML syntax (`mogoi doctor` reports parse failures), then §12.

---

## 12. Troubleshooting (verified failure points)

| Symptom | Cause → fix |
|---|---|
| `install.sh` exits: no `curl/make/git/unzip`, unknown OS, native Windows | Install the tool / use WSL2 / Docker; script only supports macOS, Linux, WSL |
| `sys/file.h not found` / lock errors on Linux | Missing C headers → `libc6-dev` (apt) / `glibc-headers` (dnf) / `musl-dev` (apk); re-run install |
| `mogoi start` dies on native Windows | By design — WSL2 or Docker only |
| Dashboard setup worked but nothing runs in background | Expected once: `mogoi restart` after first setup (§5, step 4) |
| "No providers configured" | Configure in dashboard Settings → LLM (YAML `llm:` blocks are ignored now) |
| "Ollama not available" | `ollama serve` + `ollama pull llama3` |
| Sidecar "Update required", connection refused | Sidecar below brain's floor → `bun update -g @motius/sidecar` or new binary; `dev` builds never blocked |
| `mogoi update/uninstall` refused | Docker or dev checkout — follow the manual commands in §7.1 / `mogoi doctor` |
| `logs -f` reprints ~1 MiB windows | Inherent to the capped ring file + `tail -F`, not a bug; tune `log_file_max_bytes` |
| Pre-commit hangs on tests | 240 s timeout kills it; a leaked engine child is the known suspect — find it, don't `--no-verify` forever |
| Piece changes fail tests | Catalog drift fixture — regenerate deliberately per `docs/WORKFLOW_AUTOMATION.md`, don't hand-edit snapshots |
| Daemon unreachable remotely | Reverse proxy / `public_url` / enrollment across machines — see `docs/SELF_HOSTING.md` |

---

## 13. Glossary + doc index

**Daemon (brain)** — always-on TS/Bun process: decisions, memory, API. **Sidecar** — Go agent on a machine the brain
can see/touch. **Vault** — SQLite knowledge graph + encrypted keychain. **Role** — YAML behavior contract.
**Authority level** — 0–5 runtime permission gate. **Piece** — one workflow node type. **Catalog** — extracted piece
metadata cache. **Pebble** — cursor-following ambient UI (Windows sidecar hosts). **Enrollment** — JWT device onboarding.

Read next, in order: `config.example.yaml` → `docs/SELF_HOSTING.md` → `docs/LLM_PROVIDERS.md` →
`docs/VAULT_EXTRACTOR.md` → `docs/PERSONALITY_ENGINE.md` → `docs/WORKFLOW_AUTOMATION.md` →
`docs/PIECE_VERIFICATION.md` → `src/workflows/activepieces/UPSTREAM.md` →
`src/workflows/pieces-library/README.md` → `docs/TELEMETRY.md` → `docs/GPT_REALTIME_2_INTEGRATION.md`.

---

*Your vision, safely: change behavior through roles and config first, UI and pieces second, core code last —
and let §10's guards and §11's checklist catch everything else. The machine is built to be reshaped; just reshape
it in the order it was designed to bend.*
