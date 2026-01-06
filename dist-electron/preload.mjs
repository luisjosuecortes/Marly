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
  getHistorialVentas: (folio) => electron.ipcRenderer.invoke("get-historial-ventas", folio),
  getHistorialMovimientos: (folio) => electron.ipcRenderer.invoke("get-historial-movimientos", folio),
  getProveedores: () => electron.ipcRenderer.invoke("get-proveedores"),
  agregarProveedor: (nombre) => electron.ipcRenderer.invoke("agregar-proveedor", nombre),
  eliminarProveedor: (nombre) => electron.ipcRenderer.invoke("eliminar-proveedor", nombre),
  getUltimaEntrada: (folio) => electron.ipcRenderer.invoke("get-ultima-entrada", folio),
  eliminarEntrada: (id_entrada) => electron.ipcRenderer.invoke("eliminar-entrada", id_entrada),
  getPrecioVenta: (datos) => electron.ipcRenderer.invoke("get-precio-venta", datos),
  // Clientes
  getClientes: () => electron.ipcRenderer.invoke("get-clientes"),
  agregarCliente: (datos) => electron.ipcRenderer.invoke("agregar-cliente", datos),
  eliminarCliente: (id_cliente) => electron.ipcRenderer.invoke("eliminar-cliente", id_cliente),
  getHistorialCliente: (id_cliente) => electron.ipcRenderer.invoke("get-historial-cliente", id_cliente),
  getProductosPendientesCliente: (id_cliente) => electron.ipcRenderer.invoke("get-productos-pendientes-cliente", id_cliente),
  registrarAbonoCliente: (datos) => electron.ipcRenderer.invoke("registrar-abono-cliente", datos),
  marcarPrestadoDevuelto: (datos) => electron.ipcRenderer.invoke("marcar-prestado-devuelto", datos),
  // Ventas
  getProductosDisponibles: () => electron.ipcRenderer.invoke("get-productos-disponibles"),
  registrarVenta: (datos) => electron.ipcRenderer.invoke("registrar-venta", datos),
  getPrecioVentaPorTalla: (datos) => electron.ipcRenderer.invoke("get-precio-venta-por-talla", datos),
  eliminarVenta: (id_venta) => electron.ipcRenderer.invoke("eliminar-venta", id_venta),
  eliminarMovimientoCliente: (id_movimiento) => electron.ipcRenderer.invoke("eliminar-movimiento-cliente", id_movimiento),
  // Estadísticas
  getEstadisticasResumen: (filtro) => electron.ipcRenderer.invoke("get-estadisticas-resumen", filtro || {}),
  getVentasPorPeriodo: (filtro) => electron.ipcRenderer.invoke("get-ventas-por-periodo", filtro),
  getProductosMasVendidos: (filtro) => electron.ipcRenderer.invoke("get-productos-mas-vendidos", filtro || {}),
  getVentasPorCategoria: (filtro) => electron.ipcRenderer.invoke("get-ventas-por-categoria", filtro || {}),
  getVentasPorTipo: (filtro) => electron.ipcRenderer.invoke("get-ventas-por-tipo", filtro || {}),
  getVentasKpisHoy: () => electron.ipcRenderer.invoke("get-ventas-kpis-hoy"),
  getVentasRecientes: (limite) => electron.ipcRenderer.invoke("get-ventas-recientes", limite || 15),
  getVentasComparativas: (params) => electron.ipcRenderer.invoke("get-ventas-comparativas", params),
  getVentasProductosComparativas: (params) => electron.ipcRenderer.invoke("get-ventas-productos-comparativas", params),
  getTopProductosVendidos: (limit) => electron.ipcRenderer.invoke("get-top-productos-vendidos", limit || 5),
  getVentasProveedoresComparativas: (params) => electron.ipcRenderer.invoke("get-ventas-proveedores-comparativas", params),
  getTopProveedoresVendidos: (limit) => electron.ipcRenderer.invoke("get-top-proveedores-vendidos", limit || 5),
  getClientesConSaldo: () => electron.ipcRenderer.invoke("get-clientes-con-saldo"),
  // Inventario - KPIs y Categorías
  getInventarioKpis: () => electron.ipcRenderer.invoke("get-inventario-kpis"),
  getInventarioPorCategoria: () => electron.ipcRenderer.invoke("get-inventario-por-categoria"),
  getProductosPorCategoria: (categoria) => electron.ipcRenderer.invoke("get-productos-por-categoria", categoria),
  getProductosBajoStock: () => electron.ipcRenderer.invoke("get-productos-bajo-stock"),
  updateStockMinimo: (data) => electron.ipcRenderer.invoke("update-stock-minimo", data),
  // Entradas - KPIs y Timeline
  getEntradasKpis: () => electron.ipcRenderer.invoke("get-entradas-kpis"),
  getEntradasRecientes: (limite = 20) => electron.ipcRenderer.invoke("get-entradas-recientes", limite),
  getEntradasPorProveedor: () => electron.ipcRenderer.invoke("get-entradas-por-proveedor"),
  getEntradasPorCategoria: () => electron.ipcRenderer.invoke("get-entradas-por-categoria"),
  registrarEntradaMultipleTallas: (datos) => electron.ipcRenderer.invoke("registrar-entrada-multiple-tallas", datos),
  // Inventario - Movimientos Timeline
  getMovimientosInventarioRecientes: (limite = 20) => electron.ipcRenderer.invoke("get-movimientos-inventario-recientes", limite)
});
