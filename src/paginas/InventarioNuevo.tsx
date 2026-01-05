import { useState, useEffect, useMemo } from 'react'
import { Package, TrendingUp, DollarSign, AlertTriangle, Search, Filter, ChevronDown, ChevronUp, History, Edit2, RefreshCw, BoxIcon, Clock, Calendar, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
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
    'Falda': '🩳',
    'Pans': '🩲',
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

    // Modales
    const [productoAEditar, setProductoAEditar] = useState<Producto | null>(null)
    const [productoHistorial, setProductoHistorial] = useState<Producto | null>(null)

    const cargarDatos = async () => {
        setCargando(true)
        try {
            const [kpisData, categoriasData, movimientosData] = await Promise.all([
                window.ipcRenderer.getInventarioKpis(),
                window.ipcRenderer.getInventarioPorCategoria(),
                window.ipcRenderer.getMovimientosInventarioRecientes(15)
            ])
            setKpis(kpisData)
            setCategorias(categoriasData)
            setMovimientos(movimientosData)
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
                    <button className="btn-refresh" onClick={cargarDatos} disabled={cargando}>
                        <RefreshCw size={16} className={cargando ? 'spinning' : ''} />
                    </button>
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
                            <div key={cat.categoria} className={`categoria-card ${categoriaExpandida === cat.categoria ? 'expandida' : ''}`}>
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
                                                        <p>No se encontraron productos</p>
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
                    <div className="timeline-container">
                        {movimientos.length === 0 ? (
                            <div className="sin-movimientos">
                                <Package size={40} strokeWidth={1} />
                                <p>No hay movimientos registrados</p>
                            </div>
                        ) : (
                            <div className="timeline-lista">
                                {movimientos.map((mov) => (
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
        </div>
    )
}
