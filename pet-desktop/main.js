const { app, BrowserWindow, ipcMain, screen, shell } = require("electron");
const { execFile } = require("child_process");
const path = require("path");

// Harness serves the draggable pet page at /pet (same-origin fetch of
// /settings-pro/pets, so no CORS). Override with DSH_PET_URL if needed.
const PET_URL = process.env.DSH_PET_URL || "http://127.0.0.1:3080/pet";
// The main DSH web GUI — opened when the pet is clicked.
const DSH_URL = process.env.DSH_URL || "http://127.0.0.1:3080";
// The Chrome-generated app name (PWA) the user runs DSH as. Override with
// DSH_APP_NAME if it differs.
const DSH_APP_NAME = process.env.DSH_APP_NAME || "DeepSeek Harness";
// How the pet opens the DSH GUI on click:
//   "browser" (default) — open the web GUI in the default browser
//   "app" / "pwa"      — bring the Chrome PWA to front (macOS), fall back to browser
const DSH_OPEN_MODE = String(process.env.DSH_OPEN_MODE || "browser").toLowerCase();

let petWindow = null;
let dragState = null;
let dragTimer = null;

// Open the DSH GUI in the user's preferred way. `mode` is the pet-setting value
// ("browser"/"app") passed from the renderer; it overrides the DSH_OPEN_MODE
// env var (which now acts only as the initial default).
function openDsh(mode) {
  const m = String(mode || DSH_OPEN_MODE).toLowerCase();
  const useApp = m === "app" || m === "pwa";
  if (!useApp || process.platform !== "darwin") {
    shell.openExternal(DSH_URL).catch(() => {});
    return;
  }
  execFile("open", ["-a", DSH_APP_NAME], (err) => {
    if (err) shell.openExternal(DSH_URL).catch(() => {});
  });
}

// Smooth drag: track the absolute cursor position via `screen`, so the window
// keeps following the pointer even when it briefly leaves the small pet window.
function startDrag() {
  if (petWindow == null || petWindow.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const [wx, wy] = petWindow.getPosition();
  dragState = { sx: cursor.x, sy: cursor.y, wx, wy };
  if (dragTimer == null) {
    dragTimer = setInterval(() => {
      if (dragState == null || petWindow == null || petWindow.isDestroyed()) return;
      const c = screen.getCursorScreenPoint();
      petWindow.setPosition(
        dragState.wx + (c.x - dragState.sx),
        dragState.wy + (c.y - dragState.sy),
      );
    }, 16);
  }
}

function endDrag() {
  dragState = null;
}

function createPetWindow() {
  const win = new BrowserWindow({
    width: 220,
    height: 170,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  petWindow = win;

  // "floating" keeps it above normal windows on macOS; spread across spaces.
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const load = () => {
    win.loadURL(PET_URL).catch(() => {
      setTimeout(load, 3000);
    });
  };
  load();
}

app.whenReady().then(() => {
  ipcMain.on("open-dsh", (_event, mode) => openDsh(mode));
  ipcMain.on("pet-drag-start", () => startDrag());
  ipcMain.on("pet-drag-end", () => endDrag());
  // The /pet page measures its own (scaled) bounding box and asks the window to
  // resize so the bubble is never clipped. Keep the horizontal center (the pet
  // is centered under the bubble) and the bottom fixed on screen, so the pet
  // never jumps when the bubble grows/shrinks.
  ipcMain.on("pet-resize", (_event, w, h) => {
    if (petWindow == null || petWindow.isDestroyed()) return;
    const nw = Math.max(60, Math.round(Number(w) || 0));
    const nh = Math.max(60, Math.round(Number(h) || 0));
    if (!nw || !nh) return;
    const [cw, ch] = petWindow.getSize();
    if (nw === cw && nh === ch) return;
    const [x, y] = petWindow.getPosition();
    petWindow.setBounds({ x: x + Math.round((cw - nw) / 2), y: y + (ch - nh), width: nw, height: nh });
  });

  createPetWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
