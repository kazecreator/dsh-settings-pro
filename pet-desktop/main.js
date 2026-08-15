const { app, BrowserWindow } = require("electron");

// Harness serves the draggable pet page at /pet (same-origin fetch of
// /settings-pro/pets, so no CORS). Override with DSH_PET_URL if needed.
const PET_URL = process.env.DSH_PET_URL || "http://127.0.0.1:3080/pet";

function createWindow() {
  const win = new BrowserWindow({
    width: 220,
    height: 130,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

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
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
