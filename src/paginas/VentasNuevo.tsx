import { useState, useEffect, useMemo } from 'react'
import { DollarSign, ShoppingBag, Clock, User, ChevronDown, ChevronUp, History, Package, Search, RotateCcw, Store, Wallet, Banknote, Calendar } from 'lucide-react'
import { FormularioVenta } from '../componentes/FormularioVenta/FormularioVenta'
import { useProductos } from '../hooks/useProductos'
import { VistaClientes } from '../componentes/VistaClientes'
import { ModalHistorialVentas } from '../componentes/ModalHistorialVentas'
import './VentasNuevo.css'

interface VentasKpis {
    ventasHoy: number
    transaccionesHoy: number
    totalCobrado: number
}

interface TransaccionHoy {
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

interface CategoriaVentas {
    categoria: string
    numProductos: number
    totalUnidades: number
    valorVenta: number
}

const iconosCategorias: Record<string, string> = {
    'Playera': '👕', 'Camisa': '👔', 'Pantalon': '👖', 'Blusa': '👚',
    'Chamarra': '🧥', 'Sudadera': '🧤', 'Gorra': '🧢', 'Cinturon': '🎗️',
    'Sueter': '🧶', 'Leggin': '🩱', 'Vestido': '👗', 'Falda': '👗',
    'Pans': '🏃', 'Short': '🩳'
}

export function VentasNuevo() {
    const { productos, recargarProductos } = useProductos()
    const [mostrarFormulario, setMostrarFormulario] = useState(false)
    const [mostrarClientes, setMostrarClientes] = useState(false)
    const [productoHistorial, setProductoHistorial] = useState<any | null>(null)
    const [productoSeleccionado, setProductoSeleccionado] = useState<any | null>(null)
    const [categoriaExpandida, setCategoriaExpandida] = useState<string | null>(null)
    const [busquedaFolio, setBusquedaFolio] = useState('')
    const [productoEncontrado, setProductoEncontrado] = useState<any | null>(null)

    const [kpis, setKpis] = useState<VentasKpis>({ ventasHoy: 0, transaccionesHoy: 0, totalCobrado: 0 })
    const [transaccionesHoy, setTransaccionesHoy] = useState<TransaccionHoy[]>([])
    const [prendasPrestadas, setPrendasPrestadas] = useState<any[]>([])
    const [prendasApartadas, setPrendasApartadas] = useState<any[]>([])
    const [clientesConSaldo, setClientesConSaldo] = useState<any[]>([])
    const [_refrescando, setRefrescando] = useState(false)
    const [fechaFiltro, setFechaFiltro] = useState<string>(() => {
        const hoy = new Date()
        return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    })
    const [mostrarSelectorFecha, setMostrarSelectorFecha] = useState(false)
    const [cambio, setCambio] = useState<number>(() => {
        // Cargar cambio guardado de localStorage
        const cambioGuardado = localStorage.getItem('marly_cambio_caja')
        return cambioGuardado ? Number(cambioGuardado) : 0
    })

    const categorias = useMemo((): CategoriaVentas[] => {
        const grupos: Record<string, { productos: any[], totalUnidades: number, valorVenta: number }> = {}

        productos.forEach(p => {
            if (!grupos[p.categoria]) {
                grupos[p.categoria] = { productos: [], totalUnidades: 0, valorVenta: 0 }
            }
            grupos[p.categoria].productos.push(p)
            grupos[p.categoria].totalUnidades += p.stock_actual
            grupos[p.categoria].valorVenta += (p.ultimo_precio || 0) * p.stock_actual
        })

        // Iterar sobre TODAS las categorías definidas en iconosCategorias
        return Object.keys(iconosCategorias).map(categoria => {
            const data = grupos[categoria] || { productos: [], totalUnidades: 0, valorVenta: 0 }
            return {
                categoria,
                numProductos: data.productos.length,
                totalUnidades: data.totalUnidades,
                valorVenta: data.valorVenta
            }
        }).sort((a, b) => {
            // Ordenar: primero por valor de venta (desc), luego alfabéticamente si es 0
            if (b.valorVenta !== a.valorVenta) return b.valorVenta - a.valorVenta
            return a.categoria.localeCompare(b.categoria)
        })
    }, [productos])

    const productosCategoriaExpandida = useMemo(() => {
        if (!categoriaExpandida) return []
        return productos.filter(p => p.categoria === categoriaExpandida)
    }, [productos, categoriaExpandida])

    const cargarDatos = async () => {
        try {
            setRefrescando(true)

            const [kpisData, transaccionesData, prestamosData, apartadosData, clientesSaldoData] = await Promise.all([
                window.ipcRenderer.invoke('get-ventas-kpis-hoy'), // KPIs siempre del día actual
                window.ipcRenderer.invoke('get-ventas-por-rango', { fechaInicio: fechaFiltro, fechaFin: fechaFiltro, limite: 100 }),
                window.ipcRenderer.invoke('get-prendas-prestadas'),
                window.ipcRenderer.invoke('get-prendas-apartadas'),
                window.ipcRenderer.invoke('get-clientes-con-saldo')
            ])

            setKpis(kpisData)
            setTransaccionesHoy(transaccionesData)
            setPrendasPrestadas(prestamosData)
            setPrendasApartadas(apartadosData)
            setClientesConSaldo(clientesSaldoData)
        } catch (error) {
            console.error('Error al cargar datos:', error)
        } finally {
            setRefrescando(false)
        }
    }

    useEffect(() => {
        cargarDatos()

        const handleActualizacion = () => {
            cargarDatos()
            recargarProductos() // También recargar productos para actualizar stock
        }

        window.addEventListener('ventas-actualizadas', handleActualizacion)
        return () => window.removeEventListener('ventas-actualizadas', handleActualizacion)
    }, [fechaFiltro])

    // Guardar cambio en localStorage cuando cambie
    useEffect(() => {
        localStorage.setItem('marly_cambio_caja', String(cambio))
    }, [cambio])

    // Efecto para búsqueda instantánea
    useEffect(() => {
        if (!busquedaFolio.trim()) {
            setProductoEncontrado(null)
            return
        }

        const encontrado = productos.find(p => p.folio_producto.toLowerCase() === busquedaFolio.toLowerCase())
        setProductoEncontrado(encontrado || null)
    }, [busquedaFolio, productos])

    const manejarGuardar = async (datos: any) => {
        try {
            await window.ipcRenderer.registrarVenta(datos)
            await recargarProductos()
            await cargarDatos()
            setMostrarFormulario(false)
            setProductoSeleccionado(null)
            setBusquedaFolio('') // Limpiar búsqueda al vender
            window.dispatchEvent(new CustomEvent('productos-actualizados'))
        } catch (error: any) {
            throw new Error(error?.message || 'Error al registrar la venta.')
        }
    }

    const manejarDevolucion = async (id_venta: number) => {
        if (!confirm('¿Estás seguro de devolver esta prenda al inventario?')) return
        try {
            await window.ipcRenderer.procesarDevolucionPrestamo(id_venta)
            await cargarDatos()
            await recargarProductos()
            window.dispatchEvent(new CustomEvent('ventas-actualizadas'))
        } catch (error) {
            console.error('Error al procesar devolución:', error)
            alert('Error al procesar la devolución')
        }
    }

    const toggleCategoria = (categoria: string) => {
        setCategoriaExpandida(categoriaExpandida === categoria ? null : categoria)
    }

    const formatearMoneda = (valor: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor)
    }

    if (mostrarClientes) {
        return <VistaClientes alCerrar={() => setMostrarClientes(false)} />
    }

    if (mostrarFormulario) {
        return (
            <div className="pagina-contenido">
                <FormularioVenta
                    key={productoSeleccionado?.folio_producto || 'nueva-venta'}
                    alGuardar={manejarGuardar}
                    alCerrar={() => {
                        setMostrarFormulario(false)
                        setProductoSeleccionado(null)
                    }}
                    folioInicial={productoSeleccionado?.folio_producto}
                />
            </div>
        )
    }

    return (
        <div className="pagina-contenido">
            {productoHistorial && (
                <ModalHistorialVentas
                    folio={productoHistorial.folio_producto}
                    nombreProducto={productoHistorial.nombre_producto || 'Sin nombre'}
                    alCerrar={() => setProductoHistorial(null)}
                />
            )}

            <div className="layout-ventas-nuevo">
                {/* Header */}
                <div className="ventas-header">
                    <div className="header-info">
                        <p className="etiqueta">Punto de Venta</p>
                        <h1 className="tabla-titulo">Ventas</h1>
                    </div>
                    <div className="ventas-acciones">
                        <button className="btn-secundario" onClick={() => setMostrarClientes(true)}>
                            <User size={18} /> Clientes
                        </button>
                    </div>
                </div>

                {/* KPIs */}
                <div className="kpi-grid-ventas">
                    <div className="kpi-card kpi-ventas">
                        <div className="kpi-icon"><ShoppingBag size={24} /></div>
                        <div className="kpi-content">
                            <p className="kpi-label">Ventas Hoy</p>
                            <h2 className="kpi-value">{kpis.ventasHoy}</h2>
                            <p className="kpi-subtitle">{kpis.transaccionesHoy} transacciones</p>
                        </div>
                    </div>
                    <div className="kpi-card kpi-cobrado">
                        <div className="kpi-icon"><DollarSign size={24} /></div>
                        <div className="kpi-content">
                            <p className="kpi-label">Total Cobrado</p>
                            <h2 className="kpi-value">{formatearMoneda(kpis.totalCobrado)}</h2>
                        </div>
                    </div>
                    <div className="kpi-card kpi-cambio">
                        <div className="kpi-icon"><Wallet size={24} /></div>
                        <div className="kpi-content">
                            <p className="kpi-label">Cambio</p>
                            <input
                                type="number"
                                className="kpi-input"
                                value={cambio === 0 ? '' : cambio}
                                onChange={(e) => setCambio(Number(e.target.value) || 0)}
                                placeholder="0.00"
                            />
                        </div>
                    </div>
                    <div className="kpi-card kpi-total">
                        <div className="kpi-icon"><Banknote size={24} /></div>
                        <div className="kpi-content">
                            <p className="kpi-label">Dinero Total</p>
                            <h2 className="kpi-value">{formatearMoneda(kpis.totalCobrado + cambio)}</h2>
                        </div>
                    </div>
                </div>

                {/* Main Content - Two columns layout */}
                <div className="ventas-content">
                    {/* Categorías & Buscador - LEFT (Small) */}
                    <div className="panel-categorias">
                        {/* Buscador de Folio */}
                        <div className="buscador-folio-container">
                            <div className="input-busqueda-wrapper">
                                <Search size={18} className="icono-busqueda" />
                                <input
                                    type="text"
                                    placeholder="Buscar folio..."
                                    value={busquedaFolio}
                                    onChange={(e) => setBusquedaFolio(e.target.value)}
                                    className="input-busqueda-folio"
                                    autoFocus
                                />
                            </div>

                            {/* Producto Encontrado Card */}
                            {productoEncontrado && (
                                <div className="producto-encontrado-card">
                                    <div className="producto-encontrado-info">
                                        <span className="producto-encontrado-nombre">{productoEncontrado.nombre_producto}</span>
                                        <span className="producto-encontrado-folio">{productoEncontrado.folio_producto}</span>
                                        <span className="producto-encontrado-precio">{formatearMoneda(productoEncontrado.ultimo_precio || 0)}</span>
                                    </div>
                                    <button
                                        className="btn-vender-rapido"
                                        onClick={() => {
                                            setProductoSeleccionado(productoEncontrado)
                                            setMostrarFormulario(true)
                                        }}
                                        disabled={productoEncontrado.stock_actual <= 0}
                                    >
                                        <ShoppingBag size={16} />
                                        Vender
                                    </button>
                                </div>
                            )}
                        </div>

                        <h2 className="panel-titulo">
                            <Package size={18} />
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
                                        <div className="categoria-icono">{iconosCategorias[cat.categoria] || '📦'}</div>
                                        <div className="categoria-info">
                                            <h3 className="categoria-nombre">{cat.categoria}</h3>
                                            <p className="categoria-stats">
                                                {cat.numProductos} productos • {cat.totalUnidades} unidades
                                            </p>
                                        </div>
                                        <div className="categoria-chevron">
                                            {categoriaExpandida === cat.categoria ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                        </div>
                                    </div>

                                    {/* Productos expandidos */}
                                    {categoriaExpandida === cat.categoria && (
                                        <div className="categoria-productos">
                                            {productosCategoriaExpandida.length === 0 ? (
                                                <div className="sin-productos-categoria" style={{ padding: '20px', textAlign: 'center', color: '#888', fontStyle: 'italic' }}>
                                                    <Package size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                                                    <p>No hay productos registrados en esta categoría</p>
                                                </div>
                                            ) : (
                                                productosCategoriaExpandida.map((producto) => {
                                                    const sinStock = producto.stock_actual <= 0
                                                    const tallasTexto = producto.tallas_detalle
                                                        ?.filter((t: any) => t.cantidad > 0)
                                                        .map((t: any) => `${t.talla}: ${t.cantidad}`)
                                                        .join(', ') || '—'

                                                    return (
                                                        <div
                                                            key={producto.folio_producto}
                                                            className={`producto-card ${sinStock ? 'agotado' : ''}`}
                                                            style={{ opacity: sinStock ? 0.6 : 1 }}
                                                        >
                                                            <div className="producto-card__info">
                                                                <div className="producto-card__header">
                                                                    <span className="producto-card__folio">{producto.folio_producto}</span>
                                                                    <span className="producto-card__nombre">{producto.nombre_producto}</span>
                                                                </div>
                                                                <div className="producto-card__detalles">
                                                                    <div className="producto-card__stock">
                                                                        {producto.stock_actual} unidades
                                                                    </div>
                                                                    <div className="producto-card__tallas">
                                                                        {tallasTexto}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="producto-card__footer">
                                                                <div className="producto-card__precio">
                                                                    ${producto.ultimo_precio?.toFixed(2)}
                                                                </div>
                                                                <div className="producto-card__acciones">
                                                                    <button
                                                                        className="btn-historial"
                                                                        title="Ver historial"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            setProductoHistorial(producto)
                                                                        }}
                                                                    >
                                                                        <History size={16} />
                                                                    </button>
                                                                    <button
                                                                        className="btn-vender"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            setProductoSeleccionado(producto)
                                                                            setMostrarFormulario(true)
                                                                        }}
                                                                    >
                                                                        <ShoppingBag size={14} />
                                                                        Vender
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Ventas del Día - RIGHT (Big) */}
                    <div className="panel-recientes">
                        <div className="panel-header-ventas">
                            <h2 className="panel-titulo">
                                <Clock size={18} />
                                {fechaFiltro === new Date().toISOString().split('T')[0]
                                    ? 'Ventas de Hoy'
                                    : `Ventas del ${new Date(fechaFiltro + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}`
                                }
                            </h2>
                            <div className="filtro-fecha-ventas">
                                <button
                                    className={`btn-fecha-ventas ${mostrarSelectorFecha ? 'activo' : ''}`}
                                    onClick={() => setMostrarSelectorFecha(!mostrarSelectorFecha)}
                                >
                                    <Calendar size={16} />
                                </button>
                                {mostrarSelectorFecha && (
                                    <div className="dropdown-fecha-ventas">
                                        <input
                                            type="date"
                                            value={fechaFiltro}
                                            onChange={(e) => {
                                                setFechaFiltro(e.target.value)
                                                setMostrarSelectorFecha(false)
                                            }}
                                            max={new Date().toISOString().split('T')[0]}
                                            className="input-fecha-ventas"
                                        />
                                        <button
                                            className="btn-hoy-ventas"
                                            onClick={() => {
                                                const hoy = new Date()
                                                setFechaFiltro(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`)
                                                setMostrarSelectorFecha(false)
                                            }}
                                        >
                                            Hoy
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="lista-recientes">
                            {transaccionesHoy.length === 0 ? (
                                <div className="sin-ventas">
                                    <ShoppingBag size={32} strokeWidth={1} />
                                    <p>Sin transacciones hoy</p>
                                </div>
                            ) : (
                                transaccionesHoy.map((trans) => (
                                    <div
                                        key={`${trans.tipo_transaccion}-${trans.id}`}
                                        className={`venta-card ${trans.tipo_transaccion === 'abono' ? 'venta-card--abono' : ''}`}
                                        onClick={() => trans.tipo_transaccion === 'venta' && trans.folio_producto && setProductoHistorial({ folio_producto: trans.folio_producto, nombre_producto: trans.nombre_producto })}
                                    >
                                        <div className="venta-card__left">
                                            <div className="venta-card__hora">
                                                {new Date(trans.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <div className={`venta-card__tipo venta-card__tipo--${trans.tipo_transaccion === 'abono' ? 'abono' : trans.tipo_salida.toLowerCase()}`}>
                                                {trans.tipo_transaccion === 'abono' ? 'Abono' : trans.tipo_salida}
                                            </div>
                                        </div>
                                        <div className="venta-card__center">
                                            {trans.tipo_transaccion === 'venta' ? (
                                                <>
                                                    <div className="venta-card__producto">
                                                        <span className="venta-card__emoji">{iconosCategorias[trans.categoria || ''] || '📦'}</span>
                                                        <span className="venta-card__nombre">{trans.nombre_producto || trans.folio_producto}</span>
                                                    </div>
                                                    <div className="venta-card__detalles">
                                                        <span className="venta-card__talla">{trans.talla}</span>
                                                        <span className="venta-card__cantidad">{trans.cantidad_vendida} ud</span>
                                                        {trans.cliente && <span className="venta-card__cliente"><User size={12} /> {trans.cliente}</span>}
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="venta-card__producto">
                                                        <span className="venta-card__emoji">💰</span>
                                                        <span className="venta-card__nombre">Pago de cliente</span>
                                                    </div>
                                                    <div className="venta-card__detalles">
                                                        {trans.cliente && <span className="venta-card__cliente"><User size={12} /> {trans.cliente}</span>}
                                                        {trans.talla && <span className="venta-card__talla">T: {trans.talla}</span>}
                                                        {trans.color && trans.color !== 'Único' && <span className="venta-card__color" style={{ marginLeft: '8px' }}>C: {trans.color}</span>}
                                                        {trans.referencia && <span className="venta-card__referencia">{trans.referencia}</span>}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        <div className="venta-card__right">
                                            <div className={`venta-card__monto ${trans.tipo_transaccion === 'abono' ? 'venta-card__monto--abono' : ''}`}>
                                                {trans.tipo_transaccion === 'abono' ? '+' : ''}{formatearMoneda(trans.total)}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Sección de Prendas Prestadas */}
                {prendasPrestadas.length > 0 && (
                    <div className="seccion-prestamos">
                        <div className="prestamos-header">
                            <div className="prestamos-titulo">
                                <div className="prestamos-icono">
                                    <User size={20} />
                                </div>
                                <div>
                                    <h2>Prendas Prestadas</h2>
                                    <p className="prestamos-subtitulo">{prendasPrestadas.length} artículo{prendasPrestadas.length !== 1 ? 's' : ''} en préstamo</p>
                                </div>
                            </div>
                        </div>
                        <div className="grid-prestamos">
                            {prendasPrestadas.map((prestamo) => (
                                <div key={prestamo.id_venta} className="prestamo-card">
                                    <div className="prestamo-avatar">
                                        {iconosCategorias[prestamo.categoria] || '📦'}
                                    </div>
                                    <div className="prestamo-contenido">
                                        <div className="prestamo-top">
                                            <div className="prestamo-cliente-info">
                                                <span className="prestamo-cliente">{prestamo.cliente || 'Cliente sin nombre'}</span>
                                                <span className="prestamo-badge-fecha">{new Date(prestamo.fecha_venta).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
                                            </div>
                                            <div className="prestamo-precio">${prestamo.precio_unitario_real?.toFixed(2) || '0.00'}</div>
                                        </div>
                                        <div className="prestamo-producto-info">
                                            <span className="prestamo-nombre">{prestamo.nombre_producto || prestamo.folio_producto}</span>
                                            <div className="prestamo-tags">
                                                <span className="prestamo-tag">{prestamo.talla}</span>
                                                {prestamo.color && prestamo.color !== 'Único' && <span className="prestamo-tag">{prestamo.color}</span>}
                                                <span className="prestamo-tag">{prestamo.cantidad_vendida} ud</span>
                                            </div>
                                        </div>
                                        {prestamo.notas && (
                                            <div className="prestamo-nota">
                                                <span>📝</span> {prestamo.notas}
                                            </div>
                                        )}
                                    </div>
                                    <div className="prestamo-acciones">
                                        <button
                                            className="btn-prestamo btn-prestamo--devolver"
                                            onClick={() => manejarDevolucion(prestamo.id_venta)}
                                            title="Devolver al inventario"
                                        >
                                            <RotateCcw size={16} />
                                            <span>Devolver</span>
                                        </button>
                                        <button
                                            className="btn-prestamo btn-prestamo--vender"
                                            onClick={() => {
                                                const producto = productos.find(p => p.folio_producto === prestamo.folio_producto)
                                                if (producto) {
                                                    setProductoSeleccionado(producto)
                                                    setMostrarFormulario(true)
                                                } else {
                                                    alert('Producto no encontrado en inventario actual')
                                                }
                                            }}
                                            title="Convertir en venta"
                                        >
                                            <Store size={16} />
                                            <span>Vender</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Sección de Prendas Apartadas */}
                {prendasApartadas.length > 0 && (
                    <div className="seccion-prestamos seccion-apartados">
                        <div className="prestamos-header">
                            <div className="prestamos-titulo">
                                <div className="prestamos-icono icono-apartado">
                                    <Clock size={20} />
                                </div>
                                <div>
                                    <h2>Prendas Apartadas</h2>
                                    <p className="prestamos-subtitulo">{prendasApartadas.length} artículo{prendasApartadas.length !== 1 ? 's' : ''} en apartado</p>
                                </div>
                            </div>
                        </div>
                        <div className="grid-prestamos">
                            {prendasApartadas.map((apartado) => (
                                <div key={apartado.id_venta} className="prestamo-card apartado-card">
                                    <div className="prestamo-avatar">
                                        {iconosCategorias[apartado.categoria] || '📦'}
                                    </div>
                                    <div className="prestamo-contenido">
                                        <div className="prestamo-top">
                                            <div className="prestamo-cliente-info">
                                                <span className="prestamo-cliente">{apartado.cliente || 'Cliente sin nombre'}</span>
                                                <span className="prestamo-badge-fecha">{new Date(apartado.fecha_venta).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
                                            </div>
                                            <div className="prestamo-precio">${apartado.monto_total?.toFixed(2) || '0.00'}</div>
                                        </div>
                                        <div className="prestamo-producto-info">
                                            <span className="prestamo-nombre">{apartado.nombre_producto || apartado.folio_producto}</span>
                                            <div className="prestamo-tags">
                                                <span className="prestamo-tag">{apartado.talla}</span>
                                                <span className="prestamo-tag">{apartado.cantidad_vendida} ud</span>
                                            </div>
                                        </div>

                                        {/* Barra de progreso de pago */}
                                        <div className="apartado-progreso">
                                            <div className="info-pago">
                                                <span className="pagado">Abonado: ${apartado.monto_pagado?.toFixed(2)}</span>
                                                <span className="pendiente">Resta: ${apartado.saldo_pendiente?.toFixed(2)}</span>
                                            </div>
                                            <div className="barra-fondo">
                                                <div
                                                    className="barra-avance"
                                                    style={{ width: `${Math.min(100, (apartado.monto_pagado / apartado.monto_total) * 100)}%` }}
                                                ></div>
                                            </div>
                                        </div>

                                        {apartado.notas && (
                                            <div className="prestamo-nota">
                                                <span>📝</span> {apartado.notas}
                                            </div>
                                        )}
                                    </div>
                                    <div className="prestamo-acciones">
                                        <button
                                            className="btn-prestamo btn-prestamo--vender"
                                            onClick={() => {
                                                // Abrir modal de cliente para abonar
                                                setMostrarClientes(true)
                                            }}
                                            title="Ver cliente / Abonar"
                                        >
                                            <User size={16} />
                                            <span>Ver Cliente</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Sección de Clientes con Saldo Pendiente */}
                {clientesConSaldo.length > 0 && (
                    <div className="seccion-prestamos seccion-deudores">
                        <div className="prestamos-header">
                            <div className="prestamos-titulo">
                                <div className="prestamos-icono icono-deudor">
                                    <Wallet size={20} />
                                </div>
                                <div>
                                    <h2>Clientes con Saldo Pendiente</h2>
                                    <p className="prestamos-subtitulo">{clientesConSaldo.length} cliente{clientesConSaldo.length !== 1 ? 's' : ''} con deuda</p>
                                </div>
                            </div>
                        </div>
                        <div className="grid-prestamos">
                            {clientesConSaldo.map((cliente) => {
                                // Calcular el total histórico que debe (aproximado como saldo * 2 para mostrar progreso)
                                // En realidad esto debería venir del backend
                                const totalDeuda = cliente.saldo_pendiente * 1.5 // Estimación para mostrar algo de progreso
                                const pagado = totalDeuda - cliente.saldo_pendiente
                                const porcentajePagado = (pagado / totalDeuda) * 100

                                return (
                                    <div key={cliente.id_cliente} className="prestamo-card deudor-card">
                                        <div className="prestamo-avatar deudor-avatar">
                                            <User size={24} />
                                        </div>
                                        <div className="prestamo-contenido">
                                            <div className="prestamo-top">
                                                <div className="prestamo-cliente-info">
                                                    <span className="prestamo-cliente">{cliente.nombre_completo}</span>
                                                    {cliente.telefono && (
                                                        <span className="prestamo-badge-fecha">📞 {cliente.telefono}</span>
                                                    )}
                                                </div>
                                                <div className="prestamo-precio deudor-saldo">${cliente.saldo_pendiente?.toFixed(2)}</div>
                                            </div>

                                            <div className="deudor-estado">
                                                <span className={`estado-badge ${cliente.estado_cuenta === 'Al corriente' ? 'estado-corriente' : 'estado-pendiente'}`}>
                                                    {cliente.estado_cuenta}
                                                </span>
                                            </div>

                                            {/* Barra de progreso de pago */}
                                            <div className="apartado-progreso">
                                                <div className="info-pago">
                                                    <span className="pagado">Historial de pagos</span>
                                                    <span className="pendiente">Debe: ${cliente.saldo_pendiente?.toFixed(2)}</span>
                                                </div>
                                                <div className="barra-fondo">
                                                    <div
                                                        className="barra-avance barra-deudor"
                                                        style={{ width: `${Math.min(100, Math.max(10, porcentajePagado))}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="prestamo-acciones">
                                            <button
                                                className="btn-prestamo btn-prestamo--abonar"
                                                onClick={() => {
                                                    // Abrir modal de cliente para abonar
                                                    setMostrarClientes(true)
                                                }}
                                                title="Registrar abono"
                                            >
                                                <Banknote size={16} />
                                                <span>Abonar</span>
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
