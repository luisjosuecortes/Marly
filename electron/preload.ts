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
  getHistorialVentas: (folio: string) => ipcRenderer.invoke('get-historial-ventas', folio),
  getHistorialMovimientos: (folio: string) => ipcRenderer.invoke('get-historial-movimientos', folio),
  getProveedores: () => ipcRenderer.invoke('get-proveedores'),
  agregarProveedor: (nombre: string) => ipcRenderer.invoke('agregar-proveedor', nombre),
  eliminarProveedor: (nombre: string) => ipcRenderer.invoke('eliminar-proveedor', nombre),
  getUltimaEntrada: (folio: string) => ipcRenderer.invoke('get-ultima-entrada', folio),
  eliminarEntrada: (id_entrada: number) => ipcRenderer.invoke('eliminar-entrada', id_entrada),
  getPrecioVenta: (datos: { folio_producto: string, talla: string }) => ipcRenderer.invoke('get-precio-venta', datos),
  // Clientes
  getClientes: () => ipcRenderer.invoke('get-clientes'),
  agregarCliente: (datos: { nombre_completo: string, telefono: string | null, saldo_pendiente?: number }) => ipcRenderer.invoke('agregar-cliente', datos),
  eliminarCliente: (id_cliente: number) => ipcRenderer.invoke('eliminar-cliente', id_cliente),
  getHistorialCliente: (id_cliente: number) => ipcRenderer.invoke('get-historial-cliente', id_cliente),
  getProductosPendientesCliente: (id_cliente: number) => ipcRenderer.invoke('get-productos-pendientes-cliente', id_cliente),
  registrarAbonoCliente: (datos: any) => ipcRenderer.invoke('registrar-abono-cliente', datos),
  marcarPrestadoDevuelto: (datos: any) => ipcRenderer.invoke('marcar-prestado-devuelto', datos),
  // Ventas
  getProductosDisponibles: () => ipcRenderer.invoke('get-productos-disponibles'),
  registrarVenta: (datos: any) => ipcRenderer.invoke('registrar-venta', datos),
  getPrecioVentaPorTalla: (datos: { folio_producto: string, talla: string }) => ipcRenderer.invoke('get-precio-venta-por-talla', datos),
  eliminarVenta: (id_venta: number) => ipcRenderer.invoke('eliminar-venta', id_venta),
  eliminarMovimientoCliente: (id_movimiento: number) => ipcRenderer.invoke('eliminar-movimiento-cliente', id_movimiento),
})
