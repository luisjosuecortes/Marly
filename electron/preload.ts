import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // Base de datos
  getProductos: () => ipcRenderer.invoke('get-productos'),
  getProductoDetalle: (folio: string) => ipcRenderer.invoke('get-producto-detalle', folio),
  registrarNuevoProducto: (datos: any) => ipcRenderer.invoke('registrar-nuevo-producto', datos),
  registrarEntradaExistente: (entrada: any) => ipcRenderer.invoke('registrar-entrada-existente', entrada),
  actualizarStock: (datos: any) => ipcRenderer.invoke('actualizar-stock', datos),
  getHistorialEntradas: (folio: string) => ipcRenderer.invoke('get-historial-entradas', folio),
  getProveedores: () => ipcRenderer.invoke('get-proveedores'),
  agregarProveedor: (nombre: string) => ipcRenderer.invoke('agregar-proveedor', nombre),
  eliminarProveedor: (nombre: string) => ipcRenderer.invoke('eliminar-proveedor', nombre),
  getUltimaEntrada: (folio: string) => ipcRenderer.invoke('get-ultima-entrada', folio),
  eliminarEntrada: (id_entrada: number) => ipcRenderer.invoke('eliminar-entrada', id_entrada),
})
