import { useState, useEffect, useMemo } from 'react'
import { TrendingUp, DollarSign, Package, Users, Calendar, Clock } from 'lucide-react'
import Plot from 'react-plotly.js'
import './Estadisticas.css'

interface Resumen {
  ventasTotales: number
  costosTotales: number
  gananciaNeta: number
  totalCobrado: number
  saldoPendiente: number
  valorInventario: number
  numVentas: number
}

interface VentaPeriodo {
  periodo: string
  total_ventas: number
  num_ventas: number
}

interface ProductoVendido {
  folio_producto: string
  nombre_producto: string
  unidades_vendidas: number
  monto_total: number
}

interface VentaCategoria {
  categoria: string
  unidades_vendidas: number
  monto_total: number
}

interface VentaTipo {
  tipo_salida: string
  cantidad: number
  monto_total: number
}

interface ClienteSaldo {
  id_cliente: number
  nombre_completo: string
  telefono: string | null
  saldo_pendiente: number
  estado_cuenta: string
}

interface TransaccionPeriodo {
  id: number
  fecha: string
  tipo_transaccion: 'venta' | 'abono'
  folio_producto: string | null
  nombre_producto: string | null
  cantidad_vendida: number | null
  talla: string | null
  color: string | null
  precio_unitario_real: number | null
  descuento_aplicado: number | null
  tipo_salida: string
  categoria: string | null
  cliente: string | null
  referencia?: string
  total: number
}

export function Estadisticas() {
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState<'hoy' | 'semana' | 'mes' | 'anio' | 'personalizado'>('mes')
  const [_cargando, setCargando] = useState(true)

  // Custom date selection
  const [mostrarSelectorFecha, setMostrarSelectorFecha] = useState(false)
  const [tipoPersonalizado, setTipoPersonalizado] = useState<'dia' | 'mes' | 'anio'>('mes')
  const [fechaPersonalizada, setFechaPersonalizada] = useState({
    dia: new Date().getDate(),
    mes: new Date().getMonth(),
    anio: new Date().getFullYear()
  })

  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [ventasPeriodo, setVentasPeriodo] = useState<VentaPeriodo[]>([])
  const [productosMasVendidos, setProductosMasVendidos] = useState<ProductoVendido[]>([])
  const [ventasCategoria, setVentasCategoria] = useState<VentaCategoria[]>([])
  const [ventasTipo, setVentasTipo] = useState<VentaTipo[]>([])
  const [clientesConSaldo, setClientesConSaldo] = useState<ClienteSaldo[]>([])
  const [transaccionesPeriodo, setTransaccionesPeriodo] = useState<TransaccionPeriodo[]>([])

  // Comparison chart state
  const getCurrentMonth = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  const getCurrentYear = () => {
    return String(new Date().getFullYear())
  }

  const getCurrentWeek = () => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
    const week1 = new Date(d.getFullYear(), 0, 4)
    const weekNumber = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
    return `${d.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`
  }

  const [modoComparacion, setModoComparacion] = useState<'mes' | 'semana' | 'anio'>('mes')
  const [periodosSeleccionados, setPeriodosSeleccionados] = useState<string[]>([getCurrentMonth()])
  const [datosComparacion, setDatosComparacion] = useState<Record<string, { puntos: Array<{ x: number | string, y: number }>, total: number }>>({})
  const [cargandoComparacion, setCargandoComparacion] = useState(false)

  // Product comparison state
  const [productosDisponibles, setProductosDisponibles] = useState<{ folio: string, nombre: string }[]>([])
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [productosSeleccionados, setProductosSeleccionados] = useState<string[]>([])
  const [modoComparacionProducto, setModoComparacionProducto] = useState<'mes' | 'semana' | 'anio'>('mes')
  const [datosComparacionProductos, setDatosComparacionProductos] = useState<Record<string, { nombre: string, puntos: Array<{ x: number | string, y: number }>, total: number }>>({})
  const [cargandoComparacionProductos, setCargandoComparacionProductos] = useState(false)
  const [mostrarResultados, setMostrarResultados] = useState(false)

  // Supplier comparison state
  const [proveedoresSeleccionados, setProveedoresSeleccionados] = useState<string[]>([])
  const [modoComparacionProveedor, setModoComparacionProveedor] = useState<'mes' | 'semana' | 'anio'>('mes')
  const [datosComparacionProveedores, setDatosComparacionProveedores] = useState<Record<string, { puntos: Array<{ x: number | string, y: number }>, total: number }>>({})
  const [cargandoComparacionProveedores, setCargandoComparacionProveedores] = useState(false)

  const { fechaInicio, fechaFin, agrupacionActual } = useMemo(() => {
    const hoy = new Date()
    let inicio: Date
    let fin: Date = hoy
    let agrupacion: string = 'dia'

    // Formatear fechas en zona horaria local (YYYY-MM-DD)
    const formatearFecha = (fecha: Date) => {
      const year = fecha.getFullYear()
      const month = String(fecha.getMonth() + 1).padStart(2, '0')
      const day = String(fecha.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    if (periodoSeleccionado === 'personalizado') {
      const { dia, mes, anio } = fechaPersonalizada
      switch (tipoPersonalizado) {
        case 'dia':
          inicio = new Date(anio, mes, dia)
          fin = new Date(anio, mes, dia)
          agrupacion = 'hora'
          break
        case 'mes':
          inicio = new Date(anio, mes, 1)
          fin = new Date(anio, mes + 1, 0) // Last day of month
          agrupacion = 'dia_mes'
          break
        case 'anio':
          inicio = new Date(anio, 0, 1)
          fin = new Date(anio, 11, 31)
          agrupacion = 'mes'
          break
        default:
          inicio = new Date(anio, mes, 1)
          fin = new Date(anio, mes + 1, 0)
          agrupacion = 'dia_mes'
      }
    } else {
      switch (periodoSeleccionado) {
        case 'hoy':
          inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
          agrupacion = 'hora'
          break
        case 'semana':
          inicio = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000)
          agrupacion = 'dia_semana'
          break
        case 'mes':
          inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
          agrupacion = 'dia_mes'
          break
        case 'anio':
          inicio = new Date(hoy.getFullYear(), 0, 1)
          agrupacion = 'mes'
          break
        default:
          inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
          agrupacion = 'dia_mes'
      }
    }

    return {
      fechaInicio: formatearFecha(inicio),
      fechaFin: formatearFecha(fin),
      agrupacionActual: agrupacion
    }
  }, [periodoSeleccionado, fechaPersonalizada, tipoPersonalizado])

  const cargarDatos = async () => {
    setCargando(true)
    try {
      const [
        resumenData,
        ventasData,
        productosData,
        categoriasData,
        tiposData,
        clientesData,
        transaccionesData
      ] = await Promise.all([
        window.ipcRenderer.getEstadisticasResumen({ fechaInicio, fechaFin }),
        window.ipcRenderer.getVentasPorPeriodo({ fechaInicio, fechaFin, agrupacion: agrupacionActual }),
        window.ipcRenderer.getProductosMasVendidos({ fechaInicio, fechaFin, limite: 5 }),
        window.ipcRenderer.getVentasPorCategoria({ fechaInicio, fechaFin }),
        window.ipcRenderer.getVentasPorTipo({ fechaInicio, fechaFin }),
        window.ipcRenderer.getClientesConSaldo(),
        window.ipcRenderer.getVentasPorRango({ fechaInicio, fechaFin, limite: 50 })
      ])

      setResumen(resumenData)
      setVentasPeriodo(ventasData)
      setProductosMasVendidos(productosData)
      setVentasCategoria(categoriasData)
      setVentasTipo(tiposData)
      setClientesConSaldo(clientesData)
      setTransaccionesPeriodo(transaccionesData)
    } catch (error) {
      console.error('Error cargando estadísticas:', error)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargarDatos()
  }, [fechaInicio, fechaFin])

  // Cargar datos comparativos
  const cargarDatosComparacion = async () => {
    if (periodosSeleccionados.length === 0) {
      setDatosComparacion({})
      return
    }
    setCargandoComparacion(true)
    try {
      const datos = await window.ipcRenderer.getVentasComparativas({
        tipo: modoComparacion,
        periodos: periodosSeleccionados
      })
      setDatosComparacion(datos)
    } catch (error) {
      console.error('Error cargando comparación:', error)
    } finally {
      setCargandoComparacion(false)
    }
  }

  useEffect(() => {
    cargarDatosComparacion()
  }, [modoComparacion, periodosSeleccionados])

  // Load products for search
  const cargarProductosParaComparar = async () => {
    try {
      const productos = await window.ipcRenderer.getProductos()
      setProductosDisponibles(productos.map((p: any) => ({
        folio: p.folio_producto,
        nombre: p.nombre_producto || p.folio_producto
      })))
    } catch (error) {
      console.error('Error cargando productos:', error)
    }
  }

  useEffect(() => {
    cargarProductosParaComparar()
    cargarTopProductos()
    cargarTopProveedores()
  }, [])

  // Load top 5 products as default selection
  const cargarTopProductos = async () => {
    try {
      const topProds = await window.ipcRenderer.getTopProductosVendidos(5)
      if (topProds.length > 0) {
        setProductosSeleccionados(topProds.map((p: any) => p.folio_producto))
      }
    } catch (error) {
      console.error('Error cargando top productos:', error)
    }
  }

  // Load top 5 suppliers
  const cargarTopProveedores = async () => {
    try {
      const topProvs = await window.ipcRenderer.getTopProveedoresVendidos(5)
      if (topProvs.length > 0) {
        setProveedoresSeleccionados(topProvs.map((p: any) => p.proveedor))
      }
    } catch (error) {
      console.error('Error cargando top proveedores:', error)
    }
  }

  // Load product comparison data
  const cargarDatosComparacionProductos = async () => {
    if (productosSeleccionados.length === 0) {
      setDatosComparacionProductos({})
      return
    }
    setCargandoComparacionProductos(true)
    try {
      const datos = await window.ipcRenderer.getVentasProductosComparativas({
        productos: productosSeleccionados,
        tipo: modoComparacionProducto
      })
      setDatosComparacionProductos(datos)
    } catch (error) {
      console.error('Error cargando comparación productos:', error)
    } finally {
      setCargandoComparacionProductos(false)
    }
  }

  useEffect(() => {
    cargarDatosComparacionProductos()
  }, [modoComparacionProducto, productosSeleccionados])

  // Load supplier comparison data
  const cargarDatosComparacionProveedores = async () => {
    if (proveedoresSeleccionados.length === 0) {
      setDatosComparacionProveedores({})
      return
    }
    setCargandoComparacionProveedores(true)
    try {
      const datos = await window.ipcRenderer.getVentasProveedoresComparativas({
        proveedores: proveedoresSeleccionados,
        tipo: modoComparacionProveedor
      })
      setDatosComparacionProveedores(datos)
    } catch (error) {
      console.error('Error cargando comparación proveedores:', error)
    } finally {
      setCargandoComparacionProveedores(false)
    }
  }

  useEffect(() => {
    cargarDatosComparacionProveedores()
  }, [modoComparacionProveedor, proveedoresSeleccionados])

  // Transformar etiquetas del período según el tipo de agrupación
  const transformarEtiqueta = (periodo: string): string => {
    const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

    switch (periodoSeleccionado) {
      case 'hoy':
        // periodo = '14' (hora) -> '14:00'
        return `${periodo}:00`
      case 'semana':
        // periodo = '0' (domingo) -> 'Dom'
        return diasSemana[parseInt(periodo)] || periodo
      case 'mes':
        // periodo = '01' (día 1) -> '1'
        return String(parseInt(periodo))
      case 'anio':
        // periodo = '01' (enero) -> 'Ene'
        return meses[parseInt(periodo) - 1] || periodo
      default:
        return periodo
    }
  }

  // Generar eje X completo según el período
  const generarEjeCompleto = (): { labels: string[], ventasMap: Map<string, number> } => {
    const ventasMap = new Map(ventasPeriodo.map(v => [v.periodo, v.total_ventas]))
    let labels: string[] = []

    switch (periodoSeleccionado) {
      case 'hoy':
        // Horas de 14 a 20 (2pm a 8pm)
        labels = ['14', '15', '16', '17', '18', '19', '20']
        break
      case 'semana':
        // Días de la semana (empezando en Lunes)
        labels = ['1', '2', '3', '4', '5', '6', '0'] // Lun-Dom
        break
      case 'mes':
        // Días del mes (1-31)
        const diasEnMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
        labels = Array.from({ length: diasEnMes }, (_, i) => String(i + 1).padStart(2, '0'))
        break
      case 'anio':
        // Meses del año (01-12)
        labels = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
        break
      default:
        labels = ventasPeriodo.map(v => v.periodo)
    }

    return { labels, ventasMap }
  }

  const formatearMoneda = (valor: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(valor)
  }

  const formatearFechaTimeline = (fecha: string) => {
    try {
      return new Date(fecha).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return fecha
    }
  }

  const colores = {
    primario: '#38bdf8', // Sky blue
    secundario: '#818cf8', // Indigo
    terciario: '#34d399', // Emerald
    cuaternario: '#f472b6', // Pink
    quinto: '#fbbf24', // Amber
    fondo: 'transparent',
    texto: '#94a3b8',
    grid: 'rgba(255, 255, 255, 0.03)',
    tooltip: '#1e293b'
  }

  const layoutBase = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: colores.texto, family: 'Inter, system-ui, sans-serif', size: 11 },
    margin: { t: 30, r: 20, b: 40, l: 60 },
    xaxis: {
      gridcolor: colores.grid,
      zerolinecolor: colores.grid,
      tickfont: { color: colores.texto },
      showgrid: false
    },
    yaxis: {
      gridcolor: colores.grid,
      zerolinecolor: colores.grid,
      tickfont: { color: colores.texto }
    },
    hoverlabel: {
      bgcolor: colores.tooltip,
      bordercolor: 'rgba(255,255,255,0.1)',
      font: { color: '#f8fafc', family: 'Inter, sans-serif' }
    },
    hovermode: 'x unified' as const
  }

  return (
    <div className="pagina-contenido">
      <div className="layout-estadisticas">
        <div className="estadisticas-header">
          <div className="header-info">
            <p className="etiqueta">Análisis</p>
            <h1 className="tabla-titulo">Estadísticas</h1>
          </div>
          <div className="filtros-periodo">
            {(['hoy', 'semana', 'mes', 'anio'] as const).map((periodo) => (
              <button
                key={periodo}
                className={`btn-periodo ${periodoSeleccionado === periodo ? 'activo' : ''}`}
                onClick={() => { setPeriodoSeleccionado(periodo); setMostrarSelectorFecha(false) }}
              >
                {periodo === 'anio' ? 'Año' : periodo.charAt(0).toUpperCase() + periodo.slice(1)}
              </button>
            ))}
            <div className="selector-personalizado">
              <button
                className={`btn-periodo ${periodoSeleccionado === 'personalizado' ? 'activo' : ''}`}
                onClick={() => setMostrarSelectorFecha(!mostrarSelectorFecha)}
              >
                Personalizado ▼
              </button>
              {mostrarSelectorFecha && (
                <div className="dropdown-fecha">
                  <div className="dropdown-grupo">
                    <label>Tipo</label>
                    <select value={tipoPersonalizado} onChange={(e) => setTipoPersonalizado(e.target.value as 'dia' | 'mes' | 'anio')}>
                      <option value="dia">Día específico</option>
                      <option value="mes">Mes específico</option>
                      <option value="anio">Año específico</option>
                    </select>
                  </div>
                  {tipoPersonalizado === 'dia' && (
                    <div className="dropdown-grupo">
                      <label>Día</label>
                      <input
                        type="number" min="1" max="31"
                        value={fechaPersonalizada.dia}
                        onChange={(e) => setFechaPersonalizada(prev => ({ ...prev, dia: Number(e.target.value) }))}
                      />
                    </div>
                  )}
                  {(tipoPersonalizado === 'dia' || tipoPersonalizado === 'mes') && (
                    <div className="dropdown-grupo">
                      <label>Mes</label>
                      <select
                        value={fechaPersonalizada.mes}
                        onChange={(e) => setFechaPersonalizada(prev => ({ ...prev, mes: Number(e.target.value) }))}
                      >
                        {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((m, i) => (
                          <option key={i} value={i}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="dropdown-grupo">
                    <label>Año</label>
                    <select
                      value={fechaPersonalizada.anio}
                      onChange={(e) => setFechaPersonalizada(prev => ({ ...prev, anio: Number(e.target.value) }))}
                    >
                      {Array.from({ length: new Date().getFullYear() - 2026 + 1 }, (_, i) => 2026 + i).map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="btn-aplicar-fecha"
                    onClick={() => { setPeriodoSeleccionado('personalizado'); setMostrarSelectorFecha(false) }}
                  >
                    Aplicar
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        <div className="kpi-grid">
          <div className="kpi-card kpi-ventas">
            <div className="kpi-icon"><DollarSign size={24} /></div>
            <div className="kpi-content">
              <p className="kpi-label">Ventas</p>
              <h2 className="kpi-value">{formatearMoneda(resumen?.ventasTotales || 0)}</h2>
              <p className="kpi-subtitle">{resumen?.numVentas || 0} transacciones • Inversión: {formatearMoneda(resumen?.costosTotales || 0)}</p>
            </div>
          </div>

          <div className="kpi-card kpi-ganancia">
            <div className="kpi-icon"><TrendingUp size={24} /></div>
            <div className="kpi-content">
              <p className="kpi-label">Ganancia Proyectada</p>
              <h2 className="kpi-value">{formatearMoneda(resumen?.gananciaNeta || 0)}</h2>
              <p className="kpi-subtitle">
                {resumen && resumen.ventasTotales > 0
                  ? `${((resumen.gananciaNeta / resumen.ventasTotales) * 100).toFixed(1)}% margen • De ventas realizadas`
                  : '0% margen'}
              </p>
            </div>
          </div>

          <div className="kpi-card kpi-inventario">
            <div className="kpi-icon"><DollarSign size={24} /></div>
            <div className="kpi-content">
              <p className="kpi-label">Cobrado</p>
              <h2 className="kpi-value">{formatearMoneda(resumen?.totalCobrado || 0)}</h2>
              <p className="kpi-subtitle">Ingresos reales</p>
            </div>
          </div>

          <div className="kpi-card kpi-pendiente">
            <div className="kpi-icon"><Users size={24} /></div>
            <div className="kpi-content">
              <p className="kpi-label">Por Cobrar</p>
              <h2 className="kpi-value">{formatearMoneda(resumen?.saldoPendiente || 0)}</h2>
              <p className="kpi-subtitle">{clientesConSaldo.length} clientes con saldo</p>
            </div>
          </div>
        </div>

        <div className="graficas-row">
          <div className="grafica-card grafica-grande">
            <h3 className="grafica-titulo">
              <Calendar size={18} />
              {periodoSeleccionado === 'hoy' ? 'Ventas por Hora' :
                periodoSeleccionado === 'semana' ? 'Ventas por Día de la Semana' :
                  periodoSeleccionado === 'mes' ? 'Ventas por Día del Mes' : 'Ventas por Mes'}
            </h3>
            <div className="grafica-contenedor">
              {(() => {
                const { labels, ventasMap } = generarEjeCompleto()
                const xLabels = labels.map(transformarEtiqueta)
                const yValues = labels.map(l => ventasMap.get(l) || 0)
                const hasData = yValues.some(v => v > 0)

                return hasData || labels.length > 0 ? (
                  <Plot
                    data={[{
                      x: xLabels,
                      y: yValues,
                      type: 'scatter',
                      mode: 'lines',
                      fill: 'tozeroy',
                      line: { color: colores.primario, width: 3 },
                      marker: { color: colores.primario, size: 6 },
                      fillcolor: 'rgba(56, 189, 248, 0.1)',
                      hovertemplate: '<b>%{x}</b><br>Ventas: $%{y:,.2f}<extra></extra>'
                    }]}
                    layout={{
                      ...layoutBase,
                      height: 280,
                      showlegend: false,
                      xaxis: {
                        ...layoutBase.xaxis,
                        tickangle: periodoSeleccionado === 'mes' ? -45 : 0,
                        type: 'category',
                        showgrid: false
                      },
                      yaxis: {
                        ...layoutBase.yaxis,
                        showgrid: true,
                        gridcolor: 'rgba(255,255,255,0.03)',
                        title: { text: '' }
                      }
                    }}
                    config={{ responsive: true, displayModeBar: false }}
                    style={{ width: '100%', height: '100%' }}
                  />
                ) : (<div className="sin-datos">Sin datos para este período</div>)
              })()}
            </div>
          </div>
          <div className="grafica-card">
            <h3 className="grafica-titulo"><Package size={18} /> Por Categoría</h3>
            <div className="grafica-contenedor">
              {ventasCategoria.length > 0 ? (
                <Plot
                  data={[{
                    labels: ventasCategoria.map(c => c.categoria),
                    values: ventasCategoria.map(c => c.monto_total),
                    type: 'pie',
                    hole: 0.7,
                    marker: {
                      colors: [colores.primario, colores.secundario, colores.terciario, colores.cuaternario, colores.quinto],
                      line: { color: '#0f172a', width: 2 }
                    },
                    textinfo: 'percent',
                    textposition: 'outside',
                    textfont: { color: colores.texto },
                    hovertemplate: '<b>%{label}</b><br>$%{value:,.2f}<br>%{percent}<extra></extra>'
                  }]}
                  layout={{
                    ...layoutBase,
                    height: 280,
                    showlegend: true,
                    legend: { orientation: 'h', y: -0.2, font: { size: 10, color: colores.texto } },
                    margin: { t: 20, r: 20, b: 60, l: 20 }
                  }}
                  config={{ responsive: true, displayModeBar: false }}
                  style={{ width: '100%', height: '100%' }}
                />
              ) : (<div className="sin-datos">Sin datos</div>)}
            </div>
          </div>
        </div>

        <div className="graficas-row">
          <div className="grafica-card">
            <h3 className="grafica-titulo"><TrendingUp size={18} /> Top 5 Productos</h3>
            <div className="grafica-contenedor">
              {productosMasVendidos.length > 0 ? (
                <Plot
                  data={[{
                    y: productosMasVendidos.map(p => p.nombre_producto || p.folio_producto).reverse(),
                    x: productosMasVendidos.map(p => p.monto_total).reverse(),
                    type: 'bar',
                    orientation: 'h',
                    marker: {
                      color: productosMasVendidos.map((_, i) => [colores.primario, colores.secundario, colores.terciario, colores.cuaternario, colores.quinto][i % 5]).reverse(),
                      line: { width: 0 },
                      opacity: 0.9
                    },
                    hovertemplate: '<b>%{y}</b><br>Ventas: $%{x:,.2f}<extra></extra>'
                  }]}
                  layout={{
                    ...layoutBase,
                    height: 280,
                    showlegend: false,
                    xaxis: { ...layoutBase.xaxis, showgrid: true, gridcolor: 'rgba(255,255,255,0.03)' },
                    yaxis: { ...layoutBase.yaxis, tickfont: { size: 10 } },
                    margin: { ...layoutBase.margin, l: 140, r: 20 },
                    hovermode: 'closest'
                  }}
                  config={{ responsive: true, displayModeBar: false }}
                  style={{ width: '100%', height: '100%' }}
                />
              ) : (<div className="sin-datos">Sin datos</div>)}
            </div>
          </div>
          <div className="grafica-card">
            <h3 className="grafica-titulo"><DollarSign size={18} /> Por Tipo de Venta</h3>
            <div className="grafica-contenedor">
              {ventasTipo.length > 0 ? (
                <Plot
                  data={[{
                    labels: ventasTipo.map(t => t.tipo_salida),
                    values: ventasTipo.map(t => t.monto_total),
                    type: 'pie',
                    hole: 0.7,
                    marker: {
                      colors: [colores.primario, colores.terciario, colores.cuaternario, colores.secundario],
                      line: { color: '#0f172a', width: 2 }
                    },
                    textinfo: 'percent',
                    textposition: 'outside',
                    textfont: { color: colores.texto },
                    hovertemplate: '<b>%{label}</b><br>$%{value:,.2f}<br>%{percent}<extra></extra>'
                  }]}
                  layout={{
                    ...layoutBase,
                    height: 280,
                    showlegend: true,
                    legend: { orientation: 'h', y: -0.2, font: { size: 10, color: colores.texto } },
                    margin: { t: 20, r: 20, b: 60, l: 20 }
                  }}
                  config={{ responsive: true, displayModeBar: false }}
                  style={{ width: '100%', height: '100%' }}
                />
              ) : (<div className="sin-datos">Sin datos</div>)}
            </div>
          </div>
        </div>

        {/* Timeline de transacciones del período */}
        <div className="timeline-section">
          <h2 className="seccion-titulo"><Clock size={20} /> Historial de Transacciones del Período</h2>
          <div className="timeline-container">
            {transaccionesPeriodo.length === 0 ? (
              <div className="sin-entradas">
                <Package size={40} strokeWidth={1} />
                <p>No hay transacciones en este período</p>
              </div>
            ) : (
              <div className="timeline-lista">
                {transaccionesPeriodo.map((t) => (
                  <div key={`${t.tipo_transaccion}-${t.id}`} className={`timeline-item ${t.tipo_transaccion === 'abono' ? 'timeline-abono' : ''}`}>
                    <div className="timeline-fecha">
                      <Calendar size={14} /> {formatearFechaTimeline(t.fecha)}
                    </div>
                    <div className="timeline-contenido">
                      <div className="timeline-producto">
                        {t.tipo_transaccion === 'venta' ? (
                          <>
                            <span className="folio">{t.folio_producto}</span>
                            <span className="nombre">{t.nombre_producto || '—'}</span>
                          </>
                        ) : (
                          <span className="nombre">Abono de Cliente</span>
                        )}
                      </div>
                      <div className="timeline-detalles">
                        {t.tipo_transaccion === 'venta' ? (
                          <>
                            <span className="talla">{t.talla}{t.color && t.color !== 'Único' ? ` - ${t.color}` : ''}</span>
                            <span className="cantidad">×{t.cantidad_vendida}</span>
                            <span className="tipo-venta">{t.tipo_salida}</span>
                          </>
                        ) : (
                          <span className="referencia">{t.referencia || 'Pago a cuenta'}</span>
                        )}
                        <span className={`total ${t.tipo_transaccion === 'abono' ? 'abono' : ''}`}>
                          {formatearMoneda(t.total)}
                        </span>
                      </div>
                      <div className="timeline-meta">
                        {t.categoria && <span className="categoria">{t.categoria}</span>}
                        {t.cliente && <span className="cliente">{t.cliente}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="tabla-clientes-saldo">
          <h3 className="grafica-titulo"><Users size={18} /> Clientes con Saldo Pendiente</h3>
          <div className="tabla-contenedor-stats">
            {clientesConSaldo.length > 0 ? (
              <table className="tabla-stats">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Teléfono</th>
                    <th>Saldo Pendiente</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesConSaldo.slice(0, 10).map((cliente) => (
                    <tr key={cliente.id_cliente}>
                      <td>{cliente.nombre_completo}</td>
                      <td style={{ color: '#94a3b8' }}>{cliente.telefono || '—'}</td>
                      <td style={{ color: '#fbbf24', fontWeight: 600 }}>{formatearMoneda(cliente.saldo_pendiente)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (<div className="sin-datos">No hay clientes con saldo pendiente</div>)}
          </div>
        </div>

        {/* Comparative Chart Section */}
        <div className="seccion-comparacion">
          <div className="seccion-header">
            <h2 className="seccion-titulo"><Calendar size={20} /> Comparar Períodos de Ventas</h2>
            <div className="modo-comparacion">
              <button
                className={`btn-modo ${modoComparacion === 'mes' ? 'activo' : ''}`}
                onClick={() => { setModoComparacion('mes'); setPeriodosSeleccionados([getCurrentMonth()]) }}
              >
                Meses
              </button>
              <button
                className={`btn-modo ${modoComparacion === 'anio' ? 'activo' : ''}`}
                onClick={() => { setModoComparacion('anio'); setPeriodosSeleccionados([getCurrentYear()]) }}
              >
                Años
              </button>
              <button
                className={`btn-modo ${modoComparacion === 'semana' ? 'activo' : ''}`}
                onClick={() => { setModoComparacion('semana'); setPeriodosSeleccionados([getCurrentWeek()]) }}
              >
                Semanas
              </button>
            </div>
          </div>

          <div className="selector-periodos">
            <span className="selector-label">Selecciona los períodos a comparar:</span>
            <div className="periodos-disponibles">
              {modoComparacion === 'mes' &&
                Array.from({ length: 12 }, (_, i) => {
                  const fecha = new Date(2026, i, 1)
                  const valor = `2026-${String(i + 1).padStart(2, '0')}`
                  const nombre = fecha.toLocaleDateString('es-MX', { month: 'short' })
                  const seleccionado = periodosSeleccionados.includes(valor)
                  return (
                    <button
                      key={valor}
                      className={`chip-periodo ${seleccionado ? 'seleccionado' : ''}`}
                      onClick={() => {
                        if (seleccionado) {
                          setPeriodosSeleccionados(prev => prev.filter(p => p !== valor))
                        } else {
                          setPeriodosSeleccionados(prev => [...prev, valor])
                        }
                      }}
                    >
                      {nombre.charAt(0).toUpperCase() + nombre.slice(1)}
                    </button>
                  )
                })
              }
              {modoComparacion === 'semana' &&
                Array.from({ length: 52 }, (_, i) => {
                  const valor = `2026-W${String(i + 1).padStart(2, '0')}`
                  const seleccionado = periodosSeleccionados.includes(valor)
                  // Calculate week start date
                  const jan4 = new Date(2026, 0, 4)
                  const dayOfWeek = jan4.getDay() || 7
                  const firstMonday = new Date(jan4)
                  firstMonday.setDate(jan4.getDate() - dayOfWeek + 1)
                  const weekStart = new Date(firstMonday)
                  weekStart.setDate(firstMonday.getDate() + i * 7)
                  const weekEnd = new Date(weekStart)
                  weekEnd.setDate(weekStart.getDate() + 6)
                  const formatDate = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`
                  return (
                    <button
                      key={valor}
                      className={`chip-periodo chip-semana ${seleccionado ? 'seleccionado' : ''}`}
                      onClick={() => {
                        if (seleccionado) {
                          setPeriodosSeleccionados(prev => prev.filter(p => p !== valor))
                        } else {
                          setPeriodosSeleccionados(prev => [...prev, valor])
                        }
                      }}
                    >
                      <span className="semana-num">S{i + 1}</span>
                      <span className="semana-fechas">{formatDate(weekStart)}-{formatDate(weekEnd)}</span>
                    </button>
                  )
                })
              }
              {modoComparacion === 'anio' &&
                Array.from({ length: new Date().getFullYear() - 2026 + 1 }, (_, i) => {
                  const valor = String(2026 + i)
                  const seleccionado = periodosSeleccionados.includes(valor)
                  return (
                    <button
                      key={valor}
                      className={`chip-periodo ${seleccionado ? 'seleccionado' : ''}`}
                      onClick={() => {
                        if (seleccionado) {
                          setPeriodosSeleccionados(prev => prev.filter(p => p !== valor))
                        } else {
                          setPeriodosSeleccionados(prev => [...prev, valor])
                        }
                      }}
                    >
                      {valor}
                    </button>
                  )
                })
              }
            </div>
          </div>

          {cargandoComparacion && <div className="cargando-comparacion">Cargando datos...</div>}

          {Object.keys(datosComparacion).length > 0 && (
            <div className="grafico-comparacion">
              <Plot
                data={Object.entries(datosComparacion).map(([periodo, data]) => ({
                  x: data.puntos.map(p => p.x),
                  y: data.puntos.map(p => p.y),
                  type: 'scatter' as const,
                  mode: 'lines+markers' as const,
                  name: modoComparacion === 'mes'
                    ? new Date(parseInt(periodo.split('-')[0]), parseInt(periodo.split('-')[1]) - 1).toLocaleDateString('es-MX', { month: 'long' })
                    : modoComparacion === 'semana'
                      ? `Semana ${periodo.split('-W')[1]}`
                      : periodo,
                  line: { width: 2 },
                  marker: { size: 6 }
                }))}
                layout={{
                  ...layoutBase,
                  title: {
                    text: modoComparacion === 'mes'
                      ? 'Ganancias por Día del Mes'
                      : modoComparacion === 'semana'
                        ? 'Ganancias por Día de la Semana'
                        : 'Ganancias por Mes del Año',
                    font: { color: '#f8fafc' }
                  },
                  xaxis: {
                    ...layoutBase.xaxis,
                    title: { text: modoComparacion === 'mes' ? 'Día' : modoComparacion === 'semana' ? 'Día' : 'Mes', font: { color: '#94a3b8' } }
                  },
                  yaxis: { ...layoutBase.yaxis, title: { text: 'Ganancias ($)', font: { color: '#94a3b8' } } },
                  showlegend: true,
                  legend: {
                    orientation: 'h' as const,
                    y: -0.2,
                    font: { color: '#94a3b8' }
                  }
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%', height: '400px' }}
              />

              {/* Summary */}
              <div className="resumen-comparacion">
                {Object.entries(datosComparacion)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([periodo, data], index) => (
                    <div key={periodo} className={`resumen-item ${index === 0 ? 'mejor' : ''}`}>
                      <span className="resumen-periodo">
                        {modoComparacion === 'mes'
                          ? new Date(parseInt(periodo.split('-')[0]), parseInt(periodo.split('-')[1]) - 1).toLocaleDateString('es-MX', { month: 'long' })
                          : modoComparacion === 'semana'
                            ? `Semana ${periodo.split('-W')[1]}`
                            : periodo}
                      </span>
                      <span className="resumen-total">{formatearMoneda(data.total)}</span>
                      {index === 0 && <span className="badge-mejor">Mejor</span>}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {periodosSeleccionados.length === 0 && !cargandoComparacion && (
            <div className="sin-datos-comparacion">
              Selecciona períodos para comparar
            </div>
          )}
        </div>

        {/* Product Comparison Chart Section */}
        <div className="seccion-comparacion seccion-comparacion-productos">
          <div className="seccion-header">
            <h2 className="seccion-titulo"><Package size={20} /> Comparar Ventas por Producto</h2>
            <div className="modo-comparacion">
              <button
                className={`btn-modo ${modoComparacionProducto === 'semana' ? 'activo' : ''}`}
                onClick={() => setModoComparacionProducto('semana')}
              >
                Esta Semana
              </button>
              <button
                className={`btn-modo ${modoComparacionProducto === 'mes' ? 'activo' : ''}`}
                onClick={() => setModoComparacionProducto('mes')}
              >
                Este Mes
              </button>
              <button
                className={`btn-modo ${modoComparacionProducto === 'anio' ? 'activo' : ''}`}
                onClick={() => setModoComparacionProducto('anio')}
              >
                Este Año
              </button>
            </div>
          </div>

          {/* Product Search */}
          <div className="selector-productos">
            <span className="selector-label">Buscar y seleccionar productos (máx. 5):</span>
            <div className="busqueda-producto-container">
              <input
                type="text"
                placeholder="Buscar por folio o nombre..."
                value={busquedaProducto}
                onChange={(e) => {
                  setBusquedaProducto(e.target.value)
                  setMostrarResultados(true)
                }}
                onFocus={() => setMostrarResultados(true)}
                className="input-busqueda-producto"
              />
              {mostrarResultados && busquedaProducto.trim() && (
                <div className="resultados-productos">
                  {productosDisponibles
                    .filter(p =>
                      (p.folio.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
                        p.nombre.toLowerCase().includes(busquedaProducto.toLowerCase())) &&
                      !productosSeleccionados.includes(p.folio)
                    )
                    .slice(0, 8)
                    .map(p => (
                      <div
                        key={p.folio}
                        className="producto-resultado"
                        onClick={() => {
                          if (productosSeleccionados.length < 5) {
                            setProductosSeleccionados([...productosSeleccionados, p.folio])
                          }
                          setBusquedaProducto('')
                          setMostrarResultados(false)
                        }}
                      >
                        <span className="resultado-folio">{p.folio}</span>
                        <span className="resultado-nombre">{p.nombre}</span>
                      </div>
                    ))}
                  {productosDisponibles.filter(p =>
                    (p.folio.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
                      p.nombre.toLowerCase().includes(busquedaProducto.toLowerCase())) &&
                    !productosSeleccionados.includes(p.folio)
                  ).length === 0 && (
                      <div className="sin-resultados">No se encontraron productos</div>
                    )}
                </div>
              )}
            </div>
          </div>

          {/* Selected Products Chips */}
          {productosSeleccionados.length > 0 && (
            <div className="productos-seleccionados">
              {productosSeleccionados.map(folio => {
                const prod = productosDisponibles.find(p => p.folio === folio)
                return (
                  <div key={folio} className="producto-chip">
                    <span>{prod?.nombre || folio}</span>
                    <button
                      onClick={() => setProductosSeleccionados(productosSeleccionados.filter(f => f !== folio))}
                      className="chip-remove"
                    >×</button>
                  </div>
                )
              })}
            </div>
          )}

          {cargandoComparacionProductos && <div className="cargando-comparacion">Cargando datos...</div>}

          {Object.keys(datosComparacionProductos).length > 0 && (
            <div className="grafico-comparacion">
              <Plot
                data={Object.entries(datosComparacionProductos).map(([_folio, data]) => ({
                  x: data.puntos.map(p => p.x),
                  y: data.puntos.map(p => p.y),
                  type: 'scatter' as const,
                  mode: 'lines+markers' as const,
                  name: data.nombre,
                  line: { width: 2 },
                  marker: { size: 6 }
                }))}
                layout={{
                  ...layoutBase,
                  title: {
                    text: modoComparacionProducto === 'semana'
                      ? 'Ganancias por Día de la Semana'
                      : modoComparacionProducto === 'mes'
                        ? 'Ganancias por Día del Mes'
                        : 'Ganancias por Mes del Año',
                    font: { color: '#f8fafc' }
                  },
                  xaxis: {
                    ...layoutBase.xaxis,
                    title: { text: modoComparacionProducto === 'anio' ? 'Mes' : 'Día', font: { color: '#94a3b8' } }
                  },
                  yaxis: { ...layoutBase.yaxis, title: { text: 'Ganancias ($)', font: { color: '#94a3b8' } } },
                  showlegend: true,
                  legend: {
                    orientation: 'h' as const,
                    y: -0.2,
                    font: { color: '#94a3b8' }
                  }
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%', height: '400px' }}
              />

              {/* Summary */}
              <div className="resumen-comparacion">
                {Object.entries(datosComparacionProductos)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([folio, data], index) => (
                    <div key={folio} className={`resumen-item ${index === 0 ? 'mejor' : ''}`}>
                      <span className="resumen-periodo">{data.nombre}</span>
                      <span className="resumen-total">{formatearMoneda(data.total)}</span>
                      {index === 0 && <span className="badge-mejor">Mejor</span>}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {productosSeleccionados.length === 0 && !cargandoComparacionProductos && (
            <div className="sin-datos-comparacion">
              Busca y selecciona productos para comparar
            </div>
          )}
        </div>

        {/* Supplier Comparison Chart Section */}
        <div className="seccion-comparacion seccion-comparacion-proveedores">
          <div className="seccion-header">
            <h2 className="seccion-titulo"><Users size={20} /> Comparar Ventas por Proveedor</h2>
            <div className="modo-comparacion">
              <button
                className={`btn-modo ${modoComparacionProveedor === 'semana' ? 'activo' : ''}`}
                onClick={() => setModoComparacionProveedor('semana')}
              >
                Esta Semana
              </button>
              <button
                className={`btn-modo ${modoComparacionProveedor === 'mes' ? 'activo' : ''}`}
                onClick={() => setModoComparacionProveedor('mes')}
              >
                Este Mes
              </button>
              <button
                className={`btn-modo ${modoComparacionProveedor === 'anio' ? 'activo' : ''}`}
                onClick={() => setModoComparacionProveedor('anio')}
              >
                Este Año
              </button>
            </div>
          </div>

          {/* Selected Suppliers Chips */}
          {proveedoresSeleccionados.length > 0 && (
            <div className="productos-seleccionados" style={{ marginTop: '1rem' }}>
              {proveedoresSeleccionados.map(prov => (
                <div key={prov} className="producto-chip">
                  <span>{prov}</span>
                  <button
                    onClick={() => setProveedoresSeleccionados(proveedoresSeleccionados.filter(p => p !== prov))}
                    className="chip-remove"
                  >×</button>
                </div>
              ))}
            </div>
          )}

          {cargandoComparacionProveedores && <div className="cargando-comparacion">Cargando datos...</div>}

          {Object.keys(datosComparacionProveedores).length > 0 && (
            <div className="grafico-comparacion">
              <Plot
                data={Object.entries(datosComparacionProveedores).map(([proveedor, data]) => ({
                  x: data.puntos.map(p => p.x),
                  y: data.puntos.map(p => p.y),
                  type: 'scatter' as const,
                  mode: 'lines+markers' as const,
                  name: proveedor,
                  line: { width: 2 },
                  marker: { size: 6 }
                }))}
                layout={{
                  ...layoutBase,
                  title: {
                    text: modoComparacionProveedor === 'semana'
                      ? 'Ganancias por Día de la Semana'
                      : modoComparacionProveedor === 'mes'
                        ? 'Ganancias por Día del Mes'
                        : 'Ganancias por Mes del Año',
                    font: { color: '#f8fafc' }
                  },
                  xaxis: {
                    ...layoutBase.xaxis,
                    title: { text: modoComparacionProveedor === 'anio' ? 'Mes' : 'Día', font: { color: '#94a3b8' } }
                  },
                  yaxis: { ...layoutBase.yaxis, title: { text: 'Ganancias ($)', font: { color: '#94a3b8' } } },
                  showlegend: true,
                  legend: {
                    orientation: 'h' as const,
                    y: -0.2,
                    font: { color: '#94a3b8' }
                  }
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%', height: '400px' }}
              />

              {/* Summary */}
              <div className="resumen-comparacion">
                {Object.entries(datosComparacionProveedores)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([proveedor, data], index) => (
                    <div key={proveedor} className={`resumen-item ${index === 0 ? 'mejor' : ''}`}>
                      <span className="resumen-periodo">{proveedor}</span>
                      <span className="resumen-total">{formatearMoneda(data.total)}</span>
                      {index === 0 && <span className="badge-mejor">Mejor</span>}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {proveedoresSeleccionados.length === 0 && !cargandoComparacionProveedores && (
            <div className="sin-datos-comparacion">
              No hay proveedores seleccionados
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
