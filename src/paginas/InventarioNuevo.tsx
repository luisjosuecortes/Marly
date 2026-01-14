import { useState, useEffect, useMemo } from 'react'
import { Package, TrendingUp, DollarSign, AlertTriangle, Search, Filter, ChevronDown, ChevronUp, History, Edit2, BoxIcon, Clock, Calendar, ArrowDownCircle, ArrowUpCircle, RefreshCw } from 'lucide-react'
import { ModalAjuste } from '../componentes/ModalAjuste'
import { ModalHistorialInventario } from '../componentes/ModalHistorialInventario'
import './InventarioNuevo.css'

interface InventarioKpis {
    valorInventarioCosto: number
    valorInventarioVenta: number
    gananciaProyectada: number
    totalProductos: number
    totalUnidades: number
    totalCategorias: number
    productosBajoStock: number
    productosSinStock: number
}

interface CategoriaStats {
    categoria: string
    numProductos: number
    totalUnidades: number
    valorCosto: number
    valorVenta: number
    gananciaProyectada: number
}

interface Producto {
    folio_producto: string
    nombre_producto: string
    categoria: string
    genero_destino: string
    estado_producto: string
    stock_actual: number
    stock_minimo: number
    proveedor: string | null
    fecha_ultima_actualizacion: string
    tallas_detalle: { talla: string; cantidad: number }[]
    ultimo_precio?: number
    ultimo_costo?: number
}

interface MovimientoInventario {
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
}

// Iconos para categorías
const iconosCategorias: Record<string, string> = {
    'Playera': '👕',
    'Camisa': '👔',
    'Pantalon': '👖',
    'Blusa': '👚',
    'Chamarra': '🧥',
    'Sudadera': '🧤',
    'Gorra': '🧢',
    'Cinturon': '🎗️',
    'Sueter': '🧶',
    'Leggin': '🩱',
    'Vestido': '👗',
    'Falda': '👗',
    'Pans': '🏃',
    'Short': '🩳'
}

export function InventarioNuevo() {
    const [kpis, setKpis] = useState<InventarioKpis | null>(null)
    const [categorias, setCategorias] = useState<CategoriaStats[]>([])
    const [categoriaExpandida, setCategoriaExpandida] = useState<string | null>(null)
    const [productosCategoria, setProductosCategoria] = useState<Producto[]>([])
    const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])
    const [cargando, setCargando] = useState(true)
    const [cargandoProductos, setCargandoProductos] = useState(false)

    // Filtros para productos
    const [busqueda, setBusqueda] = useState('')
    const [filtroGenero, setFiltroGenero] = useState('Todos')
    const [filtroTalla, setFiltroTalla] = useState('Todas')

    // Período de visualización
    const [periodoVista, setPeriodoVista] = useState<'actual' | 'mes' | 'anio' | 'personalizado'>('actual')
    const [mostrarSelectorFecha, setMostrarSelectorFecha] = useState(false)
    const [tipoPersonalizado, setTipoPersonalizado] = useState<'mes' | 'anio'>('mes')
    const [fechaPersonalizada, setFechaPersonalizada] = useState({
        mes: new Date().getMonth(),
        anio: new Date().getFullYear()
    })
    const [refrescando, setRefrescando] = useState(false)

    // Modales
    const [productoAEditar, setProductoAEditar] = useState<Producto | null>(null)
    const [productoHistorial, setProductoHistorial] = useState<Producto | null>(null)

    // Filtro de categorías para timeline
    const [categoriasActivas, setCategoriasActivas] = useState<Set<string>>(new Set(Object.keys(iconosCategorias)))

    // Edición de stock mínimo en alertas


    const [productosAlerta, setProductosAlerta] = useState<any[]>([])

    const cargarDatos = async () => {
        setCargando(true)
        try {
            const [kpisData, categoriasData, movimientosData, alertasData] = await Promise.all([
                window.ipcRenderer.getInventarioKpis(),
                window.ipcRenderer.getInventarioPorCategoria(),
                window.ipcRenderer.getMovimientosInventarioRecientes(15),
                window.ipcRenderer.getProductosBajoStock()
            ])
            setKpis(kpisData)

            // Combinar categorías obtenidas con la lista completa para asegurar que se muestren todas
            const categoriasMap = new Map(categoriasData.map((c: any) => [c.categoria, c]))
            const categoriasCompletas = Object.keys(iconosCategorias).map(nombreCategoria => {
                const datosExistentes = categoriasMap.get(nombreCategoria)
                if (datosExistentes) return datosExistentes

                // Si no hay datos, retornar objeto vacío con valores en 0
                return {
                    categoria: nombreCategoria,
                    numProductos: 0,
                    totalUnidades: 0,
                    valorCosto: 0,
                    valorVenta: 0,
                    gananciaProyectada: 0
                }
            })

            setCategorias(categoriasCompletas)
            setMovimientos(movimientosData)
            setProductosAlerta(alertasData)
        } catch (error) {
            console.error('Error cargando datos de inventario:', error)
        } finally {
            setCargando(false)
        }
    }

    const cargarProductosCategoria = async (categoria: string) => {
        setCargandoProductos(true)
        try {
            const productos = await window.ipcRenderer.getProductosPorCategoria(categoria)
            setProductosCategoria(productos)
        } catch (error) {
            console.error('Error cargando productos:', error)
        } finally {
            setCargandoProductos(false)
        }
    }

    useEffect(() => {
        cargarDatos()
    }, [])

    const toggleCategoria = async (categoria: string) => {
        if (categoriaExpandida === categoria) {
            setCategoriaExpandida(null)
            setProductosCategoria([])
        } else {
            setCategoriaExpandida(categoria)
            await cargarProductosCategoria(categoria)
        }
    }

    // Filtrar productos
    const productosFiltrados = useMemo(() => {
        return productosCategoria.filter(p => {
            const coincideBusqueda =
                p.folio_producto.toLowerCase().includes(busqueda.toLowerCase()) ||
                (p.nombre_producto || '').toLowerCase().includes(busqueda.toLowerCase())

            const coincideGenero = filtroGenero === 'Todos' || p.genero_destino === filtroGenero

            const coincideTalla = filtroTalla === 'Todas' ||
                (p.tallas_detalle && p.tallas_detalle.some(t => t.talla === filtroTalla))

            return coincideBusqueda && coincideGenero && coincideTalla
        })
    }, [productosCategoria, busqueda, filtroGenero, filtroTalla])

    // Géneros y tallas disponibles
    const generosDisponibles = ['Todos', ...Array.from(new Set(productosCategoria.map(p => p.genero_destino)))]
    const tallasDisponibles = ['Todas', ...Array.from(new Set(productosCategoria.flatMap(p => p.tallas_detalle?.map(t => t.talla) || []))).sort()]

    // Filtrar movimientos por categorías activas
    const movimientosFiltrados = useMemo(() => {
        return movimientos.filter(m => categoriasActivas.has(m.categoria))
    }, [movimientos, categoriasActivas])

    const toggleCategoriaFiltro = (cat: string) => {
        setCategoriasActivas(prev => {
            const next = new Set(prev)
            if (next.has(cat)) next.delete(cat)
            else next.add(cat)
            return next
        })
    }

    const formatearMoneda = (valor: number) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(valor)
    }

    const formatearFecha = (fecha: string) => {
        try {
            const d = new Date(fecha)
            return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
        } catch {
            return fecha
        }
    }

    const manejarGuardarAjuste = async (nuevoStock: number, motivo: string, talla: string) => {
        if (!productoAEditar) return

        await window.ipcRenderer.actualizarStock({
            folio_producto: productoAEditar.folio_producto,
            nuevo_stock: nuevoStock,
            talla,
            motivo,
            responsable: 'Admin'
        })

        // Recargar datos
        await cargarDatos()
        if (categoriaExpandida) {
            await cargarProductosCategoria(categoriaExpandida)
        }
    }

    if (cargando) {
        return <div className="pagina-contenido">Cargando inventario...</div>
    }

    return (
        <div className="pagina-contenido">
            {productoAEditar && (
                <ModalAjuste
                    producto={productoAEditar}
                    alCerrar={() => setProductoAEditar(null)}
                    alGuardar={manejarGuardarAjuste}
                />
            )}

            {productoHistorial && (
                <ModalHistorialInventario
                    folio={productoHistorial.folio_producto}
                    nombreProducto={productoHistorial.nombre_producto || 'Sin nombre'}
                    alCerrar={() => setProductoHistorial(null)}
                />
            )}

            <div className="layout-inventario-nuevo">
                {/* Header */}
                <div className="inventario-header">
                    <div className="header-info">
                        <p className="etiqueta">Gestión</p>
                        <h1 className="tabla-titulo">Inventario por Categorías</h1>
                    </div>
                    <div className="header-acciones">

                    </div>
                </div>

                {/* Toggle período */}
                <div className="periodo-toggle">
                    <button
                        className={`btn-periodo ${periodoVista === 'actual' ? 'activo' : ''}`}
                        onClick={() => { setPeriodoVista('actual'); setMostrarSelectorFecha(false) }}
                    >
                        Actual
                    </button>
                    <button
                        className={`btn-periodo ${periodoVista === 'mes' ? 'activo' : ''}`}
                        onClick={() => { setPeriodoVista('mes'); setMostrarSelectorFecha(false) }}
                    >
                        Este Mes
                    </button>
                    <button
                        className={`btn-periodo ${periodoVista === 'anio' ? 'activo' : ''}`}
                        onClick={() => { setPeriodoVista('anio'); setMostrarSelectorFecha(false) }}
                    >
                        Este Año
                    </button>
                    <div className="selector-personalizado">
                        <button
                            className={`btn-periodo ${periodoVista === 'personalizado' ? 'activo' : ''}`}
                            onClick={() => setMostrarSelectorFecha(!mostrarSelectorFecha)}
                        >
                            <Calendar size={16} /> Personalizado ▼
                        </button>
                        {mostrarSelectorFecha && (
                            <div className="dropdown-fecha">
                                <div className="dropdown-grupo">
                                    <label>Tipo</label>
                                    <select value={tipoPersonalizado} onChange={(e) => setTipoPersonalizado(e.target.value as 'mes' | 'anio')}>
                                        <option value="mes">Mes específico</option>
                                        <option value="anio">Año específico</option>
                                    </select>
                                </div>
                                {tipoPersonalizado === 'mes' && (
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
                                        {Array.from({ length: new Date().getFullYear() - 2020 + 1 }, (_, i) => 2020 + i).map(y => (
                                            <option key={y} value={y}>{y}</option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    className="btn-aplicar-fecha"
                                    onClick={() => {
                                        setPeriodoVista('personalizado')
                                        setMostrarSelectorFecha(false)
                                        cargarDatos()
                                    }}
                                >
                                    Aplicar
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* KPIs Generales */}
                <div className="kpi-grid-inventario">
                    <div className="kpi-card kpi-valor">
                        <div className="kpi-icon"><DollarSign size={24} /></div>
                        <div className="kpi-content">
                            <p className="kpi-label">Valor del Inventario</p>
                            <h2 className="kpi-value">{formatearMoneda(kpis?.valorInventarioVenta || 0)}</h2>
                            <p className="kpi-subtitle">Costo: {formatearMoneda(kpis?.valorInventarioCosto || 0)}</p>
                        </div>
                    </div>

                    <div className="kpi-card kpi-ganancia">
                        <div className="kpi-icon"><TrendingUp size={24} /></div>
                        <div className="kpi-content">
                            <p className="kpi-label">Ganancia Proyectada</p>
                            <h2 className="kpi-value">{formatearMoneda(kpis?.gananciaProyectada || 0)}</h2>
                            <p className="kpi-subtitle">
                                {kpis && kpis.valorInventarioVenta > 0
                                    ? `${((kpis.gananciaProyectada / kpis.valorInventarioVenta) * 100).toFixed(1)}% margen`
                                    : '0% margen'}
                            </p>
                        </div>
                    </div>

                    <div className="kpi-card kpi-productos">
                        <div className="kpi-icon"><Package size={24} /></div>
                        <div className="kpi-content">
                            <p className="kpi-label">Productos / Unidades</p>
                            <h2 className="kpi-value">{kpis?.totalProductos || 0}</h2>
                            <p className="kpi-subtitle">{kpis?.totalUnidades || 0} unidades en stock</p>
                        </div>
                    </div>

                    <div className="kpi-card kpi-alerta">
                        <div className="kpi-icon"><AlertTriangle size={24} /></div>
                        <div className="kpi-content">
                            <p className="kpi-label">Alertas de Stock</p>
                            <h2 className="kpi-value">{(kpis?.productosBajoStock || 0) + (kpis?.productosSinStock || 0)}</h2>
                            <p className="kpi-subtitle">{kpis?.productosSinStock || 0} sin stock, {kpis?.productosBajoStock || 0} bajo</p>
                        </div>
                    </div>
                </div>

                {/* Grid de Tarjetas de Categoría */}
                <div className="categorias-section">
                    <h2 className="seccion-titulo">
                        <BoxIcon size={20} />
                        Categorías ({categorias.length})
                    </h2>
                    <div className="categorias-grid">
                        {categorias.map((cat) => (
                            <div
                                key={cat.categoria}
                                className={`categoria-card ${categoriaExpandida === cat.categoria ? 'expandida' : ''} ${cat.numProductos === 0 ? 'vacia' : ''}`}
                                style={{ opacity: cat.numProductos === 0 ? 0.6 : 1 }}
                            >
                                <div className="categoria-header" onClick={() => toggleCategoria(cat.categoria)}>
                                    <div className="categoria-icono">
                                        {iconosCategorias[cat.categoria] || '📦'}
                                    </div>
                                    <div className="categoria-info">
                                        <h3 className="categoria-nombre">{cat.categoria}</h3>
                                        <p className="categoria-stats">
                                            {cat.numProductos} productos • {cat.totalUnidades} unidades
                                        </p>
                                    </div>
                                    <div className="categoria-valores">
                                        <span className="categoria-valor-venta">{formatearMoneda(cat.valorVenta)}</span>
                                        <span className="categoria-ganancia">+{formatearMoneda(cat.gananciaProyectada)}</span>
                                    </div>
                                    <div className="categoria-chevron">
                                        {categoriaExpandida === cat.categoria ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                    </div>
                                </div>

                                {/* Panel expandible con productos */}
                                {categoriaExpandida === cat.categoria && (
                                    <div className="productos-panel">
                                        {cargandoProductos ? (
                                            <div className="cargando-productos">Cargando productos...</div>
                                        ) : (
                                            <>
                                                {/* Filtros */}
                                                <div className="filtros-productos">
                                                    <div className="input-busqueda-inventario">
                                                        <Search size={18} className="icono-busqueda" />
                                                        <input
                                                            type="text"
                                                            placeholder="Buscar por folio o nombre..."
                                                            value={busqueda}
                                                            onChange={(e) => setBusqueda(e.target.value)}
                                                        />
                                                    </div>

                                                    <div className="grupo-filtro">
                                                        <Filter size={16} />
                                                        <select value={filtroGenero} onChange={(e) => setFiltroGenero(e.target.value)}>
                                                            {generosDisponibles.map(g => <option key={g} value={g}>{g}</option>)}
                                                        </select>
                                                    </div>

                                                    <div className="grupo-filtro">
                                                        <span className="etiqueta-filtro">Talla:</span>
                                                        <select value={filtroTalla} onChange={(e) => setFiltroTalla(e.target.value)}>
                                                            {tallasDisponibles.map(t => <option key={t} value={t}>{t}</option>)}
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* Tabla de productos */}
                                                {productosFiltrados.length === 0 ? (
                                                    <div className="sin-productos">
                                                        <Search size={32} strokeWidth={1} style={{ opacity: 0.5 }} />
                                                        <p>{cat.numProductos === 0 ? 'Sin historial de productos' : 'No se encontraron productos'}</p>
                                                    </div>
                                                ) : (
                                                    <div className="tabla-scroll">
                                                        <table className="tabla-inventario">
                                                            <thead>
                                                                <tr>
                                                                    <th>Folio</th>
                                                                    <th>Producto</th>
                                                                    <th>Género</th>
                                                                    <th>Tallas</th>
                                                                    <th>Stock</th>
                                                                    <th>Precio</th>
                                                                    <th>Acciones</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {productosFiltrados.map((producto) => (
                                                                    <tr key={producto.folio_producto}>
                                                                        <td className="celda-folio">{producto.folio_producto}</td>
                                                                        <td>{producto.nombre_producto || '—'}</td>
                                                                        <td>{producto.genero_destino}</td>
                                                                        <td className="celda-tallas">
                                                                            {producto.tallas_detalle?.map(t => `${t.talla}: ${t.cantidad}`).join(', ') || '—'}
                                                                        </td>
                                                                        <td className="celda-stock">{producto.stock_actual}</td>
                                                                        <td className="celda-precio">{formatearMoneda(producto.ultimo_precio || 0)}</td>
                                                                        <td>
                                                                            <div className="acciones-row">
                                                                                <button
                                                                                    className="btn-accion"
                                                                                    title="Ver Historial"
                                                                                    onClick={() => setProductoHistorial(producto)}
                                                                                >
                                                                                    <History size={16} />
                                                                                </button>
                                                                                <button
                                                                                    className="btn-accion"
                                                                                    title="Ajustar Stock"
                                                                                    onClick={() => setProductoAEditar(producto)}
                                                                                >
                                                                                    <Edit2 size={16} />
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Timeline de Movimientos */}
                <div className="timeline-section">
                    <h2 className="seccion-titulo">
                        <Clock size={20} />
                        Movimientos Recientes
                    </h2>
                    {/* Filtros de categoría */}
                    <div className="filtros-categoria">
                        {Object.entries(iconosCategorias).map(([cat, emoji]) => (
                            <button
                                key={cat}
                                className={`btn-cat-filtro ${categoriasActivas.has(cat) ? 'activo' : ''}`}
                                onClick={() => toggleCategoriaFiltro(cat)}
                                title={cat}
                            >
                                <span className="emoji">{emoji}</span>
                                <span className="nombre">{cat}</span>
                            </button>
                        ))}
                    </div>
                    <div className="timeline-container">
                        {movimientosFiltrados.length === 0 ? (
                            <div className="sin-movimientos">
                                <Package size={40} strokeWidth={1} />
                                <p>No hay movimientos en las categorías seleccionadas</p>
                            </div>
                        ) : (
                            <div className="timeline-lista">
                                {movimientosFiltrados.map((mov) => (
                                    <div key={`${mov.tipo}-${mov.id}`} className={`timeline-item ${mov.tipo}`}>
                                        <div className="timeline-fecha">
                                            <Calendar size={14} />
                                            {formatearFecha(mov.fecha)}
                                        </div>
                                        <div className="timeline-tipo">
                                            {mov.tipo === 'entrada' ? (
                                                <ArrowDownCircle size={18} className="icono-entrada" />
                                            ) : (
                                                <ArrowUpCircle size={18} className="icono-venta" />
                                            )}
                                        </div>
                                        <div className="timeline-contenido">
                                            <div className="timeline-producto">
                                                <span className="folio">{mov.folio_producto}</span>
                                                <span className="nombre">{mov.nombre_producto || '—'}</span>
                                            </div>
                                            <div className="timeline-detalles">
                                                <span className="talla">{mov.talla}</span>
                                                <span className={`cantidad ${mov.tipo}`}>
                                                    {mov.tipo === 'entrada' ? '+' : '-'}{mov.cantidad}
                                                </span>
                                                <span className="precio">{formatearMoneda(mov.precio)}</span>
                                                {mov.tipo === 'venta' && mov.cliente && (
                                                    <span className="cliente">→ {mov.cliente}</span>
                                                )}
                                            </div>
                                            <div className="timeline-meta">
                                                <span className="categoria">{mov.categoria}</span>
                                                <span className="tipo-mov">{mov.tipo_movimiento}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Alertas de Stock Bajo */}
            {productosAlerta.length > 0 && (
                <div className="alerta-section">
                    <div className="seccion-titulo alerta-titulo">
                        <AlertTriangle size={20} className="icono-alerta" />
                        <h2>Alertas de Stock Bajo</h2>
                        <span className="badge-alerta">{productosAlerta.length}</span>
                    </div>

                    <div className="alertas-container">
                        {productosAlerta.map((cat: any) => (
                            <div key={cat.categoria} className="alerta-card">
                                <div className="alerta-icon">
                                    {iconosCategorias[cat.categoria] || '📦'}
                                </div>
                                <div className="alerta-info">
                                    <h4>{cat.categoria}</h4>
                                    <span className="alerta-subtitulo">{cat.total_productos} productos</span>
                                    <div className="alerta-stats">
                                        <div className="stat-item peligro">
                                            <span className="label">Actual</span>
                                            <span className="value">{cat.stock_actual}</span>
                                        </div>
                                        <div className="stat-divider">/</div>
                                        <div className="stat-item meta">
                                            <span className="label">Mínimo</span>
                                            <span className="value">{cat.stock_minimo}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
