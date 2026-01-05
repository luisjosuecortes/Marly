// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer & {
    getProductos: () => Promise<any[]>
    getProductoDetalle: (folio: string) => Promise<any | null>
    registrarNuevoProducto: (datos: { producto: any, entrada: any }) => Promise<{ success: true }>
    registrarEntradaExistente: (entrada: any) => Promise<{ success: true }>
    actualizarStock: (datos: { folio_producto: string, nuevo_stock: number, talla: string, motivo?: string, responsable?: string }) => Promise<{ success: true }>
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
    eliminarMovimientoCliente: (id_movimiento: number) => Promise<{ success: boolean }>
    // Estadísticas
    getEstadisticasResumen: (filtro: { fechaInicio: string, fechaFin: string }) => Promise<{ ventasTotales: number, costosTotales: number, gananciaNeta: number, totalCobrado: number, saldoPendiente: number, valorInventario: number, numVentas: number }>
    getVentasPorPeriodo: (filtro: { fechaInicio: string, fechaFin: string, agrupacion?: string }) => Promise<Array<{
      periodo: string
      total_ventas: number
      num_ventas: number
    }>>
    getProductosMasVendidos: (filtro?: { fechaInicio?: string, fechaFin?: string, limite?: number }) => Promise<Array<{
      folio_producto: string
      nombre_producto: string
      unidades_vendidas: number
      monto_total: number
    }>>
    getVentasPorCategoria: (filtro?: { fechaInicio?: string, fechaFin?: string }) => Promise<Array<{
      categoria: string
      unidades_vendidas: number
      monto_total: number
    }>>
    getVentasPorTipo: (filtro?: { fechaInicio?: string, fechaFin?: string }) => Promise<Array<{
      tipo_salida: string
      cantidad: number
      monto_total: number
    }>>
    getClientesConSaldo: () => Promise<Array<{
      id_cliente: number
      nombre_completo: string
      telefono: string | null
      saldo_pendiente: number
      estado_cuenta: string
    }>>
    // Inventario - KPIs y Categorías
    getInventarioKpis: () => Promise<{
      valorInventarioCosto: number
      valorInventarioVenta: number
      gananciaProyectada: number
      totalProductos: number
      totalUnidades: number
      totalCategorias: number
      productosBajoStock: number
      productosSinStock: number
    }>
    getInventarioPorCategoria: () => Promise<Array<{
      categoria: string
      numProductos: number
      totalUnidades: number
      valorCosto: number
      valorVenta: number
      gananciaProyectada: number
    }>>
    getProductosPorCategoria: (categoria: string) => Promise<any[]>
    getMovimientosInventarioRecientes: (limite: number) => Promise<any[]>
    getProductosBajoStock: () => Promise<any[]>
    updateStockMinimo: (data: { folio_producto: string, stock_minimo: number }) => Promise<{ success: boolean }>
    // Entradas - KPIs y Timeline
    getEntradasKpis: () => Promise<{
      mes: { numEntradas: number, totalUnidades: number, inversionTotal: number, valorVenta: number, gananciaProyectada: number }
      anio: { numEntradas: number, totalUnidades: number, inversionTotal: number, valorVenta: number, gananciaProyectada: number }
      todo: { numEntradas: number, totalUnidades: number, inversionTotal: number, valorVenta: number, gananciaProyectada: number }
      productosNuevosMes: number
      proveedoresActivosMes: number
      totalProductos: number
      totalProveedores: number
    }>
    getEntradasRecientes: (limite?: number) => Promise<Array<{
      id_entrada: number
      fecha_entrada: string
      folio_producto: string
      cantidad_recibida: number
      talla: string
      costo_unitario_proveedor: number
      precio_unitario_base: number
      tipo_movimiento: string
      responsable_recepcion: string | null
      observaciones_entrada: string | null
      nombre_producto: string | null
      categoria: string
      proveedor: string | null
    }>>
    getEntradasPorProveedor: () => Promise<Array<{
      proveedor: string
      num_entradas: number
      total_unidades: number
      inversion_total: number
      num_productos: number
      ultima_entrada: string
    }>>
    getEntradasPorCategoria: () => Promise<Array<{
      categoria: string
      num_entradas: number
      total_unidades: number
      inversion_total: number
      valor_venta: number
    }>>
    registrarEntradaMultipleTallas: (datos: {
      folio_producto: string
      esNuevo: boolean
      producto?: any
      tallas: Array<{ talla: string, cantidad: number, costo: number, precio: number }>
      responsable?: string
      observaciones?: string
    }) => Promise<{ success: true }>
    // Inventario - Movimientos Timeline
    getMovimientosInventarioRecientes: (limite?: number) => Promise<Array<{
      tipo: 'entrada' | 'venta'
      id: number
      fecha: string
      folio_producto: string
      cantidad: number
      talla: string
      costo: number | null
      precio: number
      tipo_movimiento: string
      nombre_producto: string | null
      categoria: string
      proveedor: string | null
      cliente: string | null
    }>>
  }
}
