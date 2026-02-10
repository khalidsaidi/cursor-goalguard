# Cursor UI in GitHub Codespaces (Docker)

This is a pragmatic way to run the **Cursor desktop UI** inside a GitHub Codespace and use it to manually test GoalGuard against a real project.

Notes:
- This uses a **community Docker image** (unofficial). Expect occasional breakage.
- Codespaces gives you a real Linux VM with Docker, and we stream a Linux desktop via noVNC/KasmVNC.
- In GitHub Codespaces, `https://auth.cursor.sh` may be unreachable (TCP timeout). If so, Cursor in-app **Sign Up / Log In** can appear to do nothing, and Cloud Agents / subagent delegation may not work. You can still validate GoalGuard scaffolding + slash commands + protocol tests.

## 1) Create a Codespace

Create a Codespace on this repo (`khalidsaidi/cursor-goalguard`).

## 2) Build the VSIX (in the Codespace)

In the Codespace terminal:

```bash
npm ci
npm run package
ls -1 *.vsix
```

## 3) Create a Real Test Project (React + shadcn + Tailwind)

In the Codespace terminal:

```bash
cd /workspaces
rm -rf gg-react-shadcn
npx shadcn@latest create gg-react-shadcn -t vite -y
cd gg-react-shadcn
npm run build
```

You should now have a working Vite+React+Tailwind+shadcn project under `/workspaces/gg-react-shadcn`.

## 4) Run Cursor UI Container (in the Codespace)

In the Codespace terminal:

```bash
docker pull arfodublo/cursor-in-browser:latest-x64
docker volume create cursor-ui-config

export CURSOR_UI_PASSWORD="$(openssl rand -hex 12)"
echo "Cursor UI password: $CURSOR_UI_PASSWORD"

docker rm -f cursor-ui 2>/dev/null || true
docker run -d --name cursor-ui \
  -e PASSWORD="$CURSOR_UI_PASSWORD" \
  -p 8080:8080 \
  -p 8443:8443 \
  -v cursor-ui-config:/config \
  -v /workspaces:/workspaces \
  --shm-size=1g \
  arfodublo/cursor-in-browser:latest-x64
```

The web UI is protected by basic auth:
- Username: `abc`
- Password: `$CURSOR_UI_PASSWORD`

If you forgot the password for the currently-running container:

```bash
docker inspect cursor-ui --format "{{range .Config.Env}}{{println .}}{{end}}" | grep '^PASSWORD='
```

If you want to reset it, restart the container with a new `CURSOR_UI_PASSWORD` (see the run command above).

## 4.1) If Cursor Says "Update required"

Some `cursor-in-browser` images ship with an old Cursor build and Cursor will block usage with **"Update required"**.

You can update the AppImage inside the container like this:

```bash
docker exec cursor-ui bash -lc '
set -e
cd /
mv -f Cursor.AppImage "Cursor.AppImage.bak.$(date +%s)" || true
curl -L -o Cursor.AppImage https://api2.cursor.sh/updates/download/golden/linux-x64/cursor/2.4
chmod +x Cursor.AppImage
'
docker restart cursor-ui
```

If Cursor still blocks, re-check `https://cursor.com/download` and adjust the `.../cursor/2.4` segment to the latest major/minor.

## 5) Forward Ports and Open in Browser

In the Codespace UI, open the **Ports** tab and forward:
- `8080` (recommended)
- `8443` (optional)

Set visibility to **Private** and open in browser.

## 6) Log Into Cursor (inside the streamed UI)

To use Agent/chat/subagents, you must sign into Cursor inside the UI.

If the embedded login flow is awkward, Cursor commonly allows "copy a link" login flows. Copy/paste the link into your local browser to finish auth.

If clicking **Log In** does nothing, first check Codespaces connectivity:

```bash
curl -I --max-time 10 https://auth.cursor.sh || true
```

If that times out, you likely cannot complete Cursor login from a Codespace. In that case:
- You can still test **GoalGuard scaffolding** + `/goalguard-start` flow.
- For strict regression testing, use `npm run test:protocol` (Cursor CLI) instead.

## 7) Install GoalGuard VSIX in Cursor UI

In Cursor:
1. Open Extensions
2. "Install from VSIX..."
3. Select the VSIX from `/workspaces/cursor-goalguard/*.vsix`

Restart Cursor (inside the streamed UI) if needed.

## 8) Run the GoalGuard Two-Layer Flow (Manual UI Test)

Open the test project folder: `/workspaces/gg-react-shadcn`.

1. Run: `GoalGuard: Enable in Workspace`
   - Verify the workspace now contains:
     - `.cursor/rules/100-goalguard-two-layer.mdc`
     - `.cursor/agents/goalguard-worker.md`
     - `.cursor/agents/goalguard-verifier.md`
     - `.ai/goal.md`, `.ai/plan.md`, `.ai/task-ledger.md`
2. Run: `GoalGuard: Start Supervisor Session`
   - If your Cursor build doesn't support direct prompt injection, GoalGuard will copy the Supervisor bootstrap prompt to clipboard.
   - Paste into Agent chat and press Enter once (or type `/goalguard-start`).

### Subagents in Codespaces (Reality Check)

GoalGuard scaffolds the subagent definitions under `.cursor/agents/`, but whether Cursor can **delegate** to those subagents is Cursor-build dependent.

In some Cursor-in-Codespaces setups, the Agent runtime does not expose any "delegate/invoke subagent" capability, and a Supervisor prompt will reply with:

```
SUBAGENTS_UNAVAILABLE
```

If your Cursor build supports subagents, you should also be able to explicitly invoke them via slash commands in the chat input, e.g.:
- `/goalguard-worker ...`
- `/goalguard-verifier ...`
- `/goalguard-repo-searcher ...`

If that happens, GoalGuard still works in its **single-chat fallback**: the Supervisor runs an explicit "Worker mode" step, then a "Verifier mode" step, and posts a checkpoint update.

## Optional: Headless UI Smoke Test (xdotool + xclip)

If you're debugging automation inside the container (not required for normal use):

```bash
docker exec cursor-ui apt-get update -y
docker exec cursor-ui apt-get install -y xdotool xclip
```

Then you can trigger command palette actions and verify clipboard content from the container.

## Cleanup

```bash
docker rm -f cursor-ui
```
