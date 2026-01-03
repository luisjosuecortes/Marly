// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer & {
    getProductos: () => Promise<any[]>
    getProductoDetalle: (folio: string) => Promise<any | null>
    registrarNuevoProducto: (datos: { producto: any, entrada: any }) => Promise<{ success: true }>
    registrarEntradaExistente: (entrada: any) => Promise<{ success: true }>
    actualizarStock: (datos: { folio_producto: string, nuevo_stock: number, motivo?: string, responsable?: string }) => Promise<{ success: true }>
    getHistorialEntradas: (folio: string) => Promise<any[]>
    getHistorialVentas: (folio: string) => Promise<any[]>
    getHistorialMovimientos: (folio: string) => Promise<any[]>
    getProveedores: () => Promise<string[]>
    agregarProveedor: (nombre: string) => Promise<{ success: true }>
    eliminarProveedor: (nombre: string) => Promise<{ success: true }>
    getUltimaEntrada: (folio: string) => Promise<{ costo_unitario_proveedor: number, precio_unitario_base: number } | null>
    eliminarEntrada: (id_entrada: number) => Promise<{ success: true }>
    getPrecioVenta: (datos: { folio_producto: string, talla: string }) => Promise<{ precio_unitario_base: number }>
    // Clientes
    getClientes: () => Promise<any[]>
    agregarCliente: (datos: { nombre_completo: string, telefono: string | null, saldo_pendiente?: number }) => Promise<{ success: true }>
    eliminarCliente: (id_cliente: number) => Promise<{ success: true }>
    getHistorialCliente: (id_cliente: number) => Promise<{ movimientos: any[], saldoActual: number }>
    getProductosPendientesCliente: (id_cliente: number) => Promise<any[]>
    registrarAbonoCliente: (datos: { id_cliente: number, monto: number, id_venta?: number, responsable?: string, notas?: string }) => Promise<{ success: boolean, nuevoSaldo: number }>
    marcarPrestadoDevuelto: (datos: { id_venta: number, responsable?: string, notas?: string }) => Promise<{ success: boolean }>
    // Ventas
    getProductosDisponibles: () => Promise<any[]>
    registrarVenta: (datos: any) => Promise<{ success: true }>
    getPrecioVentaPorTalla: (datos: { folio_producto: string, talla: string }) => Promise<{ precio_unitario_base: number }>
    eliminarVenta: (id_venta: number) => Promise<{ success: boolean }>
  }
}
