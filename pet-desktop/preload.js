const { contextBridge, ipcRenderer } = require("electron");

// Expose a tiny bridge to the harness-served /pet page: start/end a smooth
// window drag (main polls the absolute cursor) and open the DSH GUI on click.
contextBridge.exposeInMainWorld("dshPet", {
  dragStart: () => ipcRenderer.send("pet-drag-start"),
  dragEnd: () => ipcRenderer.send("pet-drag-end"),
  openDsh: (mode) => ipcRenderer.send("open-dsh", mode),
  resize: (w, h) => ipcRenderer.send("pet-resize", w, h),
});
