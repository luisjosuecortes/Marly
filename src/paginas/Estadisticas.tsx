import { useState, useEffect, useMemo } from 'react'
import { TrendingUp, DollarSign, Package, Users, Calendar, RefreshCw } from 'lucide-react'
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

export function Estadisticas() {
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState<'hoy' | 'semana' | 'mes' | 'anio'>('mes')
  const [cargando, setCargando] = useState(true)

  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [ventasPeriodo, setVentasPeriodo] = useState<VentaPeriodo[]>([])
  const [productosMasVendidos, setProductosMasVendidos] = useState<ProductoVendido[]>([])
  const [ventasCategoria, setVentasCategoria] = useState<VentaCategoria[]>([])
  const [ventasTipo, setVentasTipo] = useState<VentaTipo[]>([])
  const [clientesConSaldo, setClientesConSaldo] = useState<ClienteSaldo[]>([])

  const { fechaInicio, fechaFin } = useMemo(() => {
    const hoy = new Date()
    let inicio: Date

    switch (periodoSeleccionado) {
      case 'hoy':
        inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
        break
      case 'semana':
        inicio = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'mes':
        inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
        break
      case 'anio':
        inicio = new Date(hoy.getFullYear(), 0, 1)
        break
      default:
        inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    }

    // Formatear fechas en zona horaria local (YYYY-MM-DD)
    const formatearFecha = (fecha: Date) => {
      const year = fecha.getFullYear()
      const month = String(fecha.getMonth() + 1).padStart(2, '0')
      const day = String(fecha.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    return {
      fechaInicio: formatearFecha(inicio),
      fechaFin: formatearFecha(hoy)
    }
  }, [periodoSeleccionado])

  const cargarDatos = async () => {
    setCargando(true)
    try {
      // Determinar la agrupación según el período
      let agrupacion: string
      switch (periodoSeleccionado) {
        case 'hoy':
          agrupacion = 'hora'
          break
        case 'semana':
          agrupacion = 'dia_semana'
          break
        case 'mes':
          agrupacion = 'dia_mes'
          break
        case 'anio':
          agrupacion = 'mes'
          break
        default:
          agrupacion = 'dia'
      }

      const [
        resumenData,
        ventasData,
        productosData,
        categoriasData,
        tiposData,
        clientesData
      ] = await Promise.all([
        window.ipcRenderer.getEstadisticasResumen({ fechaInicio, fechaFin }),
        window.ipcRenderer.getVentasPorPeriodo({ fechaInicio, fechaFin, agrupacion }),
        window.ipcRenderer.getProductosMasVendidos({ fechaInicio, fechaFin, limite: 5 }),
        window.ipcRenderer.getVentasPorCategoria({ fechaInicio, fechaFin }),
        window.ipcRenderer.getVentasPorTipo({ fechaInicio, fechaFin }),
        window.ipcRenderer.getClientesConSaldo()
      ])

      setResumen(resumenData)
      setVentasPeriodo(ventasData)
      setProductosMasVendidos(productosData)
      setVentasCategoria(categoriasData)
      setVentasTipo(tiposData)
      setClientesConSaldo(clientesData)
    } catch (error) {
      console.error('Error cargando estadísticas:', error)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargarDatos()
  }, [fechaInicio, fechaFin])

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

  const colores = {
    primario: '#22c55e',
    secundario: '#3b82f6',
    terciario: '#f59e0b',
    cuaternario: '#8b5cf6',
    quinto: '#ef4444',
    fondo: 'rgba(15, 23, 42, 0.95)',
    texto: '#e2e8f0',
    grid: 'rgba(148, 163, 184, 0.1)'
  }

  const layoutBase = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: colores.texto, family: 'Inter, sans-serif' },
    margin: { t: 40, r: 20, b: 40, l: 60 },
    xaxis: { gridcolor: colores.grid, zerolinecolor: colores.grid },
    yaxis: { gridcolor: colores.grid, zerolinecolor: colores.grid }
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
                onClick={() => setPeriodoSeleccionado(periodo)}
              >
                {periodo === 'anio' ? 'Año' : periodo.charAt(0).toUpperCase() + periodo.slice(1)}
              </button>
            ))}
            <button className="btn-refresh" onClick={cargarDatos} disabled={cargando}>
              <RefreshCw size={16} className={cargando ? 'spinning' : ''} />
            </button>
          </div>
        </div>

        <div className="kpi-grid">
          <div className="kpi-card kpi-ventas">
            <div className="kpi-icon"><DollarSign size={24} /></div>
            <div className="kpi-content">
              <p className="kpi-label">Ventas</p>
              <h2 className="kpi-value">{formatearMoneda(resumen?.ventasTotales || 0)}</h2>
              <p className="kpi-subtitle">{resumen?.numVentas || 0} transacciones</p>
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

          <div className="kpi-card kpi-ganancia">
            <div className="kpi-icon"><TrendingUp size={24} /></div>
            <div className="kpi-content">
              <p className="kpi-label">Ganancia Proyectada</p>
              <h2 className="kpi-value">{formatearMoneda(resumen?.gananciaNeta || 0)}</h2>
              <p className="kpi-subtitle">
                {resumen && resumen.ventasTotales > 0
                  ? `${((resumen.gananciaNeta / resumen.ventasTotales) * 100).toFixed(1)}% margen`
                  : '0% margen'}
              </p>
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
                      mode: 'lines+markers',
                      fill: 'tozeroy',
                      line: { color: colores.primario, width: 2 },
                      marker: { color: colores.primario, size: 6 },
                      fillcolor: 'rgba(34, 197, 94, 0.1)'
                    }]}
                    layout={{
                      ...layoutBase,
                      height: 280,
                      showlegend: false,
                      xaxis: {
                        ...layoutBase.xaxis,
                        tickangle: periodoSeleccionado === 'mes' ? -45 : 0,
                        type: 'category'
                      },
                      yaxis: { ...layoutBase.yaxis, title: { text: 'Ventas ($)' } }
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
                    hole: 0.5,
                    marker: { colors: [colores.primario, colores.secundario, colores.terciario, colores.cuaternario, colores.quinto] },
                    textinfo: 'percent',
                    textposition: 'outside',
                    textfont: { color: colores.texto }
                  }]}
                  layout={{ ...layoutBase, height: 280, showlegend: true, legend: { orientation: 'h', y: -0.1, font: { size: 10 } } }}
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
                    marker: { color: productosMasVendidos.map((_, i) => [colores.primario, colores.secundario, colores.terciario, colores.cuaternario, colores.quinto][i % 5]).reverse() }
                  }]}
                  layout={{ ...layoutBase, height: 280, showlegend: false, xaxis: { ...layoutBase.xaxis, title: { text: 'Ventas ($)' } }, yaxis: { ...layoutBase.yaxis, tickfont: { size: 10 } }, margin: { ...layoutBase.margin, l: 120 } }}
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
                    hole: 0.5,
                    marker: { colors: [colores.primario, colores.terciario, colores.cuaternario, colores.secundario] },
                    textinfo: 'percent',
                    textposition: 'outside',
                    textfont: { color: colores.texto }
                  }]}
                  layout={{ ...layoutBase, height: 280, showlegend: true, legend: { orientation: 'h', y: -0.1, font: { size: 10 } } }}
                  config={{ responsive: true, displayModeBar: false }}
                  style={{ width: '100%', height: '100%' }}
                />
              ) : (<div className="sin-datos">Sin datos</div>)}
            </div>
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
      </div>
    </div>
  )
}
