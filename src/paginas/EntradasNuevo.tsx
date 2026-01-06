import { useState, useEffect, useMemo } from 'react'
import { Package, TrendingUp, DollarSign, Plus, Building2, Search, Filter, ChevronDown, ChevronUp, History, RefreshCw, BoxIcon, Clock, Calendar, ArrowDownCircle, X, Save, AlertCircle, Trash2 } from 'lucide-react'
import { ModalProveedores } from '../componentes/ModalProveedores'
import { ModalHistorialEntradas } from '../componentes/ModalHistorialEntradas'
import './EntradasNuevo.css'

interface EntradasKpis {
    mes: { numEntradas: number, totalUnidades: number, inversionTotal: number, valorVenta: number, gananciaProyectada: number }
    anio: { numEntradas: number, totalUnidades: number, inversionTotal: number, valorVenta: number, gananciaProyectada: number }
    todo: { numEntradas: number, totalUnidades: number, inversionTotal: number, valorVenta: number, gananciaProyectada: number }
    productosNuevosMes: number
    proveedoresActivosMes: number
    totalProductos: number
    totalProveedores: number
}

interface CategoriaEntradas {
    categoria: string
    num_entradas: number
    total_unidades: number
    inversion_total: number
    valor_venta: number
}

interface Producto {
    folio_producto: string
    nombre_producto: string
    categoria: string
    genero_destino: string
    stock_actual: number
    proveedor: string | null
    tallas_detalle: { talla: string; cantidad: number }[]
    ultimo_precio?: number
    ultimo_costo?: number
}

interface EntradaReciente {
    id_entrada: number
    fecha_entrada: string
    folio_producto: string
    cantidad_recibida: number
    talla: string
    costo_unitario_proveedor: number
    precio_unitario_base: number
    tipo_movimiento: string
    nombre_producto: string | null
    categoria: string
    proveedor: string | null
}

interface TallaEntrada {
    talla: string
    cantidad: number
    costo: number
    precio: number
}

const CATEGORIAS = [
    'Playera', 'Camisa', 'Pantalon', 'Blusa', 'Chamarra',
    'Sudadera', 'Gorra', 'Cinturon', 'Sueter', 'Leggin',
    'Vestido', 'Falda', 'Pans', 'Short'
]

const GENEROS = ['Hombre', 'Mujer', 'Niño', 'Niña']

const TALLAS = [
    'CH', 'M', 'G', 'XL', 'XXL',
    '2', '3', '4', '6', '8', '10', '12', '14', '16',
    '24/3', '26/5', '28/7', '30/9', '31', '32 (11)', '33', '34 (13)', '35', '36 (15)', '38 (17)',
    '40', '42', '44', '46', '48', 'Unitalla'
]

const iconosCategorias: Record<string, string> = {
    'Playera': '👕', 'Camisa': '👔', 'Pantalon': '👖', 'Blusa': '👚',
    'Chamarra': '🧥', 'Sudadera': '🧤', 'Gorra': '🧢', 'Cinturon': '🎗️',
    'Sueter': '🧶', 'Leggin': '🩱', 'Vestido': '👗', 'Falda': '👗',
    'Pans': '🏃', 'Short': '🩳'
}

export function EntradasNuevo() {
    const [kpis, setKpis] = useState<EntradasKpis | null>(null)
    const [categorias, setCategorias] = useState<CategoriaEntradas[]>([])
    const [categoriaExpandida, setCategoriaExpandida] = useState<string | null>(null)
    const [productosCategoria, setProductosCategoria] = useState<Producto[]>([])
    const [entradasRecientes, setEntradasRecientes] = useState<EntradaReciente[]>([])
    const [cargando, setCargando] = useState(true)
    const [cargandoProductos, setCargandoProductos] = useState(false)
    const [periodoKpi, setPeriodoKpi] = useState<'mes' | 'anio' | 'todo' | 'personalizado'>('mes')

    // Custom date selection
    const [mostrarSelectorFecha, setMostrarSelectorFecha] = useState(false)
    const [tipoPersonalizado, setTipoPersonalizado] = useState<'mes' | 'anio'>('mes')
    const [fechaPersonalizada, setFechaPersonalizada] = useState({
        mes: new Date().getMonth(),
        anio: new Date().getFullYear()
    })

    // Filtros
    const [busqueda, setBusqueda] = useState('')
    const [filtroGenero, setFiltroGenero] = useState('Todos')

    // Modales
    const [mostrarFormulario, setMostrarFormulario] = useState(false)
    const [mostrarProveedores, setMostrarProveedores] = useState(false)
    const [productoHistorial, setProductoHistorial] = useState<Producto | null>(null)

    // Filtro de categorías para timeline
    const [categoriasActivas, setCategoriasActivas] = useState<Set<string>>(new Set(Object.keys(iconosCategorias)))

    // Estado del formulario
    const [proveedores, setProveedores] = useState<string[]>([])
    const [buscandoProducto, setBuscandoProducto] = useState(false)
    const [esExistente, setEsExistente] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [exito, setExito] = useState(false)

    const [producto, setProducto] = useState({
        folio_producto: '',
        nombre_producto: '',
        categoria: CATEGORIAS[0],
        genero_destino: GENEROS[1],
        proveedor: '',
        observaciones: ''
    })

    const [tallasEntrada, setTallasEntrada] = useState<TallaEntrada[]>([
        { talla: TALLAS[0], cantidad: 1, costo: 0, precio: 0 }
    ])

    const cargarDatos = async () => {
        setCargando(true)
        try {
            const [kpisData, categoriasData, recientesData, proveedoresData] = await Promise.all([
                window.ipcRenderer.getEntradasKpis(),
                window.ipcRenderer.getEntradasPorCategoria(),
                window.ipcRenderer.getEntradasRecientes(15),
                window.ipcRenderer.getProveedores()
            ])
            setKpis(kpisData)
            setCategorias(categoriasData)
            setEntradasRecientes(recientesData)
            setProveedores(proveedoresData)
        } catch (error) {
            console.error('Error cargando datos:', error)
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

        const handleUpdate = () => cargarDatos()
        window.addEventListener('productos-actualizados', handleUpdate)
        return () => window.removeEventListener('productos-actualizados', handleUpdate)
    }, [])

    // Buscar producto por folio
    useEffect(() => {
        const buscarProducto = async () => {
            if (!producto.folio_producto.trim()) {
                setEsExistente(false)
                return
            }
            setBuscandoProducto(true)
            try {
                const existente = await window.ipcRenderer.getProductoDetalle(producto.folio_producto)
                if (existente) {
                    setEsExistente(true)
                    setProducto(prev => ({
                        ...prev,
                        nombre_producto: existente.nombre_producto || '',
                        categoria: existente.categoria || CATEGORIAS[0],
                        genero_destino: existente.genero_destino || GENEROS[1],
                        proveedor: existente.proveedor || ''
                    }))
                    const ultimaEntrada = await window.ipcRenderer.getUltimaEntrada(producto.folio_producto)
                    if (ultimaEntrada) {
                        setTallasEntrada([{
                            talla: TALLAS[0], cantidad: 1,
                            costo: ultimaEntrada.costo_unitario_proveedor,
                            precio: ultimaEntrada.precio_unitario_base
                        }])
                    }
                } else {
                    setEsExistente(false)
                }
            } catch (err) {
                console.error('Error buscando producto:', err)
            } finally {
                setBuscandoProducto(false)
            }
        }
        const timeout = setTimeout(buscarProducto, 500)
        return () => clearTimeout(timeout)
    }, [producto.folio_producto])

    const toggleCategoria = async (categoria: string) => {
        if (categoriaExpandida === categoria) {
            setCategoriaExpandida(null)
            setProductosCategoria([])
        } else {
            setCategoriaExpandida(categoria)
            await cargarProductosCategoria(categoria)
        }
    }

    const productosFiltrados = useMemo(() => {
        return productosCategoria.filter(p => {
            const coincideBusqueda =
                p.folio_producto.toLowerCase().includes(busqueda.toLowerCase()) ||
                (p.nombre_producto || '').toLowerCase().includes(busqueda.toLowerCase())
            const coincideGenero = filtroGenero === 'Todos' || p.genero_destino === filtroGenero
            return coincideBusqueda && coincideGenero
        })
    }, [productosCategoria, busqueda, filtroGenero])

    const generosDisponibles = ['Todos', ...Array.from(new Set(productosCategoria.map(p => p.genero_destino)))]

    // Filtrar entradas por categorías activas
    const entradasFiltradas = useMemo(() => {
        return entradasRecientes.filter(e => categoriasActivas.has(e.categoria))
    }, [entradasRecientes, categoriasActivas])

    const toggleCategoriaFiltro = (cat: string) => {
        setCategoriasActivas(prev => {
            const next = new Set(prev)
            if (next.has(cat)) next.delete(cat)
            else next.add(cat)
            return next
        })
    }

    const formatearMoneda = (valor: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor)
    const formatearFecha = (fecha: string) => {
        try { return new Date(fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) }
        catch { return fecha }
    }

    const agregarTalla = () => {
        const ultima = tallasEntrada[tallasEntrada.length - 1]
        setTallasEntrada([...tallasEntrada, { talla: TALLAS[0], cantidad: 1, costo: ultima?.costo || 0, precio: ultima?.precio || 0 }])
    }

    const quitarTalla = (index: number) => {
        if (tallasEntrada.length > 1) setTallasEntrada(tallasEntrada.filter((_, i) => i !== index))
    }

    const actualizarTalla = (index: number, campo: keyof TallaEntrada, valor: string | number) => {
        setTallasEntrada(tallasEntrada.map((t, i) => i === index ? { ...t, [campo]: valor } : t))
    }

    const manejarGuardar = async () => {
        setError(null)
        if (!producto.folio_producto.trim()) return setError('El folio es obligatorio.')
        if (!producto.nombre_producto.trim()) return setError('La descripción es obligatoria.')
        if (!producto.proveedor) return setError('El proveedor es obligatorio.')
        const tallasValidas = tallasEntrada.filter(t => t.cantidad > 0)
        if (tallasValidas.length === 0) return setError('Agregue al menos una talla.')
        if (tallasValidas.some(t => t.costo <= 0 || t.precio <= 0)) return setError('Costo y precio deben ser mayor a 0.')

        try {
            setGuardando(true)
            await window.ipcRenderer.registrarEntradaMultipleTallas({
                folio_producto: producto.folio_producto,
                esNuevo: !esExistente,
                producto: !esExistente ? producto : undefined,
                tallas: tallasValidas,
                responsable: 'Admin'
            })
            setProducto({ folio_producto: '', nombre_producto: '', categoria: CATEGORIAS[0], genero_destino: GENEROS[1], proveedor: '', observaciones: '' })
            setTallasEntrada([{ talla: TALLAS[0], cantidad: 1, costo: 0, precio: 0 }])
            setEsExistente(false)
            setMostrarFormulario(false)
            setExito(true)
            setTimeout(() => setExito(false), 3000)
            await cargarDatos()
            if (categoriaExpandida) await cargarProductosCategoria(categoriaExpandida)
        } catch (err: any) {
            setError(err?.message || 'Error al guardar')
        } finally {
            setGuardando(false)
        }
    }

    const kpiActual = kpis ? kpis[periodoKpi === 'personalizado' ? 'todo' : periodoKpi] : null

    if (cargando) return <div className="pagina-contenido">Cargando entradas...</div>

    return (
        <div className="pagina-contenido">
            {exito && (
                <div className="notificacion-exito">
                    <ArrowDownCircle size={24} />
                    <div><strong>¡Entrada registrada!</strong><p>La mercancía se agregó correctamente.</p></div>
                </div>
            )}

            {productoHistorial && (
                <ModalHistorialEntradas
                    folio={productoHistorial.folio_producto}
                    nombreProducto={productoHistorial.nombre_producto || 'Sin nombre'}
                    alCerrar={() => { setProductoHistorial(null); cargarDatos() }}
                />
            )}

            <div className="layout-entradas-nuevo">
                {/* Header */}
                <div className="entradas-header">
                    <div className="header-info">
                        <p className="etiqueta">Registro</p>
                        <h1 className="tabla-titulo">Entradas de Mercancía</h1>
                    </div>
                    <div className="header-acciones">
                        <button className="accion-secundaria" onClick={() => setMostrarProveedores(true)}>
                            <Building2 size={18} /> Proveedores
                        </button>
                        <button className="accion-primaria" onClick={() => setMostrarFormulario(true)}>
                            <Plus size={18} /> Nueva Entrada
                        </button>
                        <button className="btn-refresh" onClick={cargarDatos} disabled={cargando}>
                            <RefreshCw size={16} className={cargando ? 'spinning' : ''} />
                        </button>
                    </div>
                </div>

                {/* Toggle período */}
                <div className="periodo-toggle">
                    <button className={`btn-periodo ${periodoKpi === 'mes' ? 'activo' : ''}`} onClick={() => { setPeriodoKpi('mes'); setMostrarSelectorFecha(false) }}>Este Mes</button>
                    <button className={`btn-periodo ${periodoKpi === 'anio' ? 'activo' : ''}`} onClick={() => { setPeriodoKpi('anio'); setMostrarSelectorFecha(false) }}>Este Año</button>
                    <button className={`btn-periodo ${periodoKpi === 'todo' ? 'activo' : ''}`} onClick={() => { setPeriodoKpi('todo'); setMostrarSelectorFecha(false) }}>Todo el Tiempo</button>
                    <div className="selector-personalizado">
                        <button
                            className={`btn-periodo ${periodoKpi === 'personalizado' ? 'activo' : ''}`}
                            onClick={() => setMostrarSelectorFecha(!mostrarSelectorFecha)}
                        >
                            Personalizado ▼
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
                                        {Array.from({ length: new Date().getFullYear() - 2026 + 1 }, (_, i) => 2026 + i).map(y => (
                                            <option key={y} value={y}>{y}</option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    className="btn-aplicar-fecha"
                                    onClick={() => { setPeriodoKpi('personalizado'); setMostrarSelectorFecha(false) }}
                                >
                                    Aplicar
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* KPIs */}
                <div className="kpi-grid-entradas">
                    <div className="kpi-card kpi-inversion">
                        <div className="kpi-icon"><DollarSign size={24} /></div>
                        <div className="kpi-content">
                            <p className="kpi-label">Inversión Total</p>
                            <h2 className="kpi-value">{formatearMoneda(kpiActual?.inversionTotal || 0)}</h2>
                            <p className="kpi-subtitle">{kpiActual?.numEntradas || 0} entradas</p>
                        </div>
                    </div>
                    <div className="kpi-card kpi-ganancia">
                        <div className="kpi-icon"><TrendingUp size={24} /></div>
                        <div className="kpi-content">
                            <p className="kpi-label">Ganancia Proyectada</p>
                            <h2 className="kpi-value">{formatearMoneda(kpiActual?.gananciaProyectada || 0)}</h2>
                            <p className="kpi-subtitle">Valor venta: {formatearMoneda(kpiActual?.valorVenta || 0)}</p>
                        </div>
                    </div>
                    <div className="kpi-card kpi-unidades">
                        <div className="kpi-icon"><Package size={24} /></div>
                        <div className="kpi-content">
                            <p className="kpi-label">Unidades Recibidas</p>
                            <h2 className="kpi-value">{kpiActual?.totalUnidades || 0}</h2>
                            <p className="kpi-subtitle">{kpis?.productosNuevosMes || 0} productos nuevos</p>
                        </div>
                    </div>
                    <div className="kpi-card kpi-proveedores">
                        <div className="kpi-icon"><Building2 size={24} /></div>
                        <div className="kpi-content">
                            <p className="kpi-label">Proveedores Activos</p>
                            <h2 className="kpi-value">{kpis?.proveedoresActivosMes || 0}</h2>
                            <p className="kpi-subtitle">Este mes</p>
                        </div>
                    </div>
                </div>

                {/* Entradas por categoría */}
                <div className="categorias-section">
                    <h2 className="seccion-titulo"><BoxIcon size={20} /> Entradas por Categoría ({categorias.length})</h2>
                    <div className="categorias-grid">
                        {categorias.map((cat) => (
                            <div key={cat.categoria} className={`categoria-card ${categoriaExpandida === cat.categoria ? 'expandida' : ''}`}>
                                <div className="categoria-header" onClick={() => toggleCategoria(cat.categoria)}>
                                    <div className="categoria-icono">{iconosCategorias[cat.categoria] || '📦'}</div>
                                    <div className="categoria-info">
                                        <h3 className="categoria-nombre">{cat.categoria}</h3>
                                        <p className="categoria-stats">{cat.num_entradas} entradas • {cat.total_unidades} unidades</p>
                                    </div>
                                    <div className="categoria-valores">
                                        <span className="categoria-valor-venta">{formatearMoneda(cat.inversion_total)}</span>
                                        <span className="categoria-ganancia">+{formatearMoneda(cat.valor_venta - cat.inversion_total)}</span>
                                    </div>
                                    <div className="categoria-chevron">
                                        {categoriaExpandida === cat.categoria ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                    </div>
                                </div>

                                {categoriaExpandida === cat.categoria && (
                                    <div className="productos-panel">
                                        {cargandoProductos ? <div className="cargando-productos">Cargando productos...</div> : (
                                            <>
                                                <div className="filtros-productos">
                                                    <div className="input-busqueda-inventario">
                                                        <Search size={18} className="icono-busqueda" />
                                                        <input type="text" placeholder="Buscar por folio o nombre..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                                                    </div>
                                                    <div className="grupo-filtro">
                                                        <Filter size={16} />
                                                        <select value={filtroGenero} onChange={(e) => setFiltroGenero(e.target.value)}>
                                                            {generosDisponibles.map(g => <option key={g} value={g}>{g}</option>)}
                                                        </select>
                                                    </div>
                                                </div>

                                                {productosFiltrados.length === 0 ? (
                                                    <div className="sin-productos"><Search size={32} strokeWidth={1} /><p>No se encontraron productos</p></div>
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
                                                                    <th>Costo</th>
                                                                    <th>Historial</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {productosFiltrados.map((p) => (
                                                                    <tr key={p.folio_producto}>
                                                                        <td className="celda-folio">{p.folio_producto}</td>
                                                                        <td>{p.nombre_producto || '—'}</td>
                                                                        <td>{p.genero_destino}</td>
                                                                        <td className="celda-tallas">{p.tallas_detalle?.map(t => `${t.talla}: ${t.cantidad}`).join(', ') || '—'}</td>
                                                                        <td className="celda-stock">{p.stock_actual}</td>
                                                                        <td className="celda-precio">{formatearMoneda(p.ultimo_precio || 0)}</td>
                                                                        <td className="celda-costo">{formatearMoneda(p.ultimo_costo || 0)}</td>
                                                                        <td>
                                                                            <button className="btn-accion" title="Ver Historial de Entradas" onClick={() => setProductoHistorial(p)}>
                                                                                <History size={16} />
                                                                            </button>
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

                {/* Timeline de entradas recientes */}
                <div className="timeline-section">
                    <h2 className="seccion-titulo"><Clock size={20} /> Entradas Recientes</h2>
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
                        {entradasFiltradas.length === 0 ? (
                            <div className="sin-entradas"><Package size={40} strokeWidth={1} /><p>No hay entradas en las categorías seleccionadas</p></div>
                        ) : (
                            <div className="timeline-lista">
                                {entradasFiltradas.map((e) => (
                                    <div key={e.id_entrada} className="timeline-item">
                                        <div className="timeline-fecha"><Calendar size={14} /> {formatearFecha(e.fecha_entrada)}</div>
                                        <div className="timeline-contenido">
                                            <div className="timeline-producto">
                                                <span className="folio">{e.folio_producto}</span>
                                                <span className="nombre">{e.nombre_producto || '—'}</span>
                                            </div>
                                            <div className="timeline-detalles">
                                                <span className="talla">{e.talla}</span>
                                                <span className="cantidad">×{e.cantidad_recibida}</span>
                                                <span className="costo">{formatearMoneda(e.costo_unitario_proveedor)}</span>
                                                <span className="precio">→ {formatearMoneda(e.precio_unitario_base)}</span>
                                            </div>
                                            <div className="timeline-meta">
                                                <span className="categoria">{e.categoria}</span>
                                                <span className="proveedor">{e.proveedor || '—'}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Proveedores Registrados */}
                <div className="proveedores-section">
                    <h2 className="seccion-titulo">
                        <Building2 size={20} /> Proveedores Registrados ({proveedores.length})
                        <button className="btn-gestionar-proveedores" onClick={() => setMostrarProveedores(true)}>
                            Gestionar
                        </button>
                    </h2>
                    <div className="proveedores-lista">
                        {proveedores.length === 0 ? (
                            <div className="sin-proveedores">
                                <Building2 size={32} strokeWidth={1} />
                                <p>No hay proveedores registrados</p>
                                <button className="btn-agregar-proveedor" onClick={() => setMostrarProveedores(true)}>
                                    <Plus size={16} /> Agregar Proveedor
                                </button>
                            </div>
                        ) : (
                            proveedores.map((prov) => (
                                <div key={prov} className="proveedor-chip">
                                    <Building2 size={14} />
                                    <span>{prov}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Modal Formulario */}
            {mostrarFormulario && (
                <div className="modal-overlay" onClick={() => setMostrarFormulario(false)}>
                    <div className="modal-formulario" onClick={(e) => e.stopPropagation()}>
                        <header className="modal-header">
                            <div>
                                <p className="etiqueta">{esExistente ? 'Reabastecimiento' : 'Nuevo Producto'}</p>
                                <h2>Registrar Entrada</h2>
                            </div>
                            <button className="btn-cerrar" onClick={() => setMostrarFormulario(false)}><X size={20} /></button>
                        </header>

                        <div className="formulario-contenido">
                            {error && <div className="mensaje-error"><AlertCircle size={16} /><span>{error}</span></div>}

                            <div className="seccion-form">
                                <h3>Producto</h3>
                                <div className="fila-form">
                                    <div className="campo">
                                        <label>Folio {buscandoProducto && <span className="buscando">(Buscando...)</span>}</label>
                                        <input type="text" placeholder="321-01" value={producto.folio_producto} onChange={(e) => setProducto({ ...producto, folio_producto: e.target.value })} />
                                    </div>
                                    <div className="campo flex-2">
                                        <label>Descripción</label>
                                        <input type="text" placeholder="Blusa Sophia verde" value={producto.nombre_producto} onChange={(e) => setProducto({ ...producto, nombre_producto: e.target.value })} disabled={esExistente} />
                                    </div>
                                </div>
                                <div className="fila-form">
                                    <div className="campo">
                                        <label>Categoría</label>
                                        <select value={producto.categoria} onChange={(e) => setProducto({ ...producto, categoria: e.target.value })} disabled={esExistente}>
                                            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="campo">
                                        <label>Género</label>
                                        <select value={producto.genero_destino} onChange={(e) => setProducto({ ...producto, genero_destino: e.target.value })} disabled={esExistente}>
                                            {GENEROS.map(g => <option key={g} value={g}>{g}</option>)}
                                        </select>
                                    </div>
                                    <div className="campo">
                                        <label>Proveedor</label>
                                        <select value={producto.proveedor} onChange={(e) => setProducto({ ...producto, proveedor: e.target.value })} disabled={esExistente}>
                                            <option value="">Seleccionar...</option>
                                            {proveedores.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="seccion-form">
                                <div className="seccion-header">
                                    <h3>Tallas y Precios</h3>
                                    <button type="button" className="btn-agregar-talla" onClick={agregarTalla}><Plus size={16} /> Agregar Talla</button>
                                </div>
                                <div className="tallas-lista">
                                    {tallasEntrada.map((t, i) => (
                                        <div key={i} className="talla-row">
                                            <select value={t.talla} onChange={(e) => actualizarTalla(i, 'talla', e.target.value)}>
                                                {TALLAS.map(talla => <option key={talla} value={talla}>{talla}</option>)}
                                            </select>
                                            <input type="number" min="1" value={t.cantidad} onChange={(e) => actualizarTalla(i, 'cantidad', parseInt(e.target.value) || 0)} />
                                            <div className="input-moneda"><span>$</span><input type="number" min="0" step="0.50" value={t.costo} onChange={(e) => actualizarTalla(i, 'costo', parseFloat(e.target.value) || 0)} /></div>
                                            <div className="input-moneda"><span>$</span><input type="number" min="0" step="0.50" value={t.precio} onChange={(e) => actualizarTalla(i, 'precio', parseFloat(e.target.value) || 0)} /></div>
                                            {tallasEntrada.length > 1 && <button type="button" className="btn-quitar" onClick={() => quitarTalla(i)}><Trash2 size={16} /></button>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <footer className="modal-footer">
                            <button className="btn-cancelar" onClick={() => setMostrarFormulario(false)}>Cancelar</button>
                            <button className="btn-guardar" onClick={manejarGuardar} disabled={guardando}>
                                {guardando ? 'Guardando...' : <><Save size={18} /> {esExistente ? 'Agregar Stock' : 'Registrar Producto'}</>}
                            </button>
                        </footer>
                    </div>
                </div>
            )}

            {mostrarProveedores && <ModalProveedores alCerrar={() => { setMostrarProveedores(false); cargarDatos() }} />}
        </div>
    )
}
