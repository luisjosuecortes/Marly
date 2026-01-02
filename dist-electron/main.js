import { app, BrowserWindow } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
createRequire(import.meta.url);
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let ventanaPrincipal;
function crearVentana() {
  ventanaPrincipal = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
  ventanaPrincipal.webContents.on("did-finish-load", () => {
    ventanaPrincipal == null ? void 0 : ventanaPrincipal.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString("es-ES"));
  });
  if (VITE_DEV_SERVER_URL) {
    ventanaPrincipal.loadURL(VITE_DEV_SERVER_URL);
  } else {
    ventanaPrincipal.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    ventanaPrincipal = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    crearVentana();
  }
});
app.whenReady().then(crearVentana);
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
