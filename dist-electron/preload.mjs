"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return electron.ipcRenderer.on(channel, (event, ...args2) => listener(event, ...args2));
  },
  off(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.invoke(channel, ...omit);
  },
  // Base de datos
  getProductos: () => electron.ipcRenderer.invoke("get-productos"),
  getProductoDetalle: (folio) => electron.ipcRenderer.invoke("get-producto-detalle", folio),
  registrarNuevoProducto: (datos) => electron.ipcRenderer.invoke("registrar-nuevo-producto", datos),
  registrarEntradaExistente: (entrada) => electron.ipcRenderer.invoke("registrar-entrada-existente", entrada),
  actualizarStock: (datos) => electron.ipcRenderer.invoke("actualizar-stock", datos),
  getHistorialEntradas: (folio) => electron.ipcRenderer.invoke("get-historial-entradas", folio),
  getProveedores: () => electron.ipcRenderer.invoke("get-proveedores"),
  agregarProveedor: (nombre) => electron.ipcRenderer.invoke("agregar-proveedor", nombre),
  eliminarProveedor: (nombre) => electron.ipcRenderer.invoke("eliminar-proveedor", nombre),
  getUltimaEntrada: (folio) => electron.ipcRenderer.invoke("get-ultima-entrada", folio),
  eliminarEntrada: (id_entrada) => electron.ipcRenderer.invoke("eliminar-entrada", id_entrada)
});
