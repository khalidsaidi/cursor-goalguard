# Cursor UI in GitHub Codespaces (Docker)

This is a pragmatic way to run the **Cursor desktop UI** inside a GitHub Codespace and use it to manually test GoalGuard against a real project.

Notes:
- This uses a **community Docker image** (unofficial). Expect occasional breakage.
- Codespaces gives you a real Linux VM with Docker, and we stream a Linux desktop via noVNC/KasmVNC.

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
  -e CURSOR_UI_PASSWORD="$CURSOR_UI_PASSWORD" \
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

## 5) Forward Ports and Open in Browser

In the Codespace UI, open the **Ports** tab and forward:
- `8080` (recommended)
- `8443` (optional)

Set visibility to **Private** and open in browser.

## 6) Log Into Cursor (inside the streamed UI)

To use Agent/chat/subagents, you must sign into Cursor inside the UI.

If the embedded login flow is awkward, Cursor commonly allows "copy a link" login flows. Copy/paste the link into your local browser to finish auth.

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

