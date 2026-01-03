// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer & {
    getProductos: () => Promise<any[]>
    getProductoDetalle: (folio: string) => Promise<any | null>
    registrarNuevoProducto: (datos: { producto: any, entrada: any }) => Promise<{ success: true }>
    registrarEntradaExistente: (entrada: any) => Promise<{ success: true }>
    actualizarStock: (datos: { folio_producto: string, nuevo_stock: number, motivo?: string, responsable?: string }) => Promise<{ success: true }>
    getHistorialEntradas: (folio: string) => Promise<any[]>
    getProveedores: () => Promise<string[]>
    agregarProveedor: (nombre: string) => Promise<{ success: true }>
    eliminarProveedor: (nombre: string) => Promise<{ success: true }>
    getUltimaEntrada: (folio: string) => Promise<{ costo_unitario_proveedor: number, precio_unitario_base: number } | null>
    eliminarEntrada: (id_entrada: number) => Promise<{ success: true }>
  }
}
