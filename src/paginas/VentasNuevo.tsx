import { useState, useEffect, useMemo } from 'react'
import { DollarSign, ShoppingBag, Clock, User, ChevronDown, ChevronUp, History, Package } from 'lucide-react'
import { FormularioVenta } from '../componentes/FormularioVenta/FormularioVenta'
import { useProductos } from '../hooks/useProductos'
import { VistaClientes } from '../componentes/VistaClientes'
import { ModalHistorialVentas } from '../componentes/ModalHistorialVentas'
import './VentasNuevo.css'

interface VentasKpis {
    ventasHoy: number
    totalCobrado: number
}

interface VentaReciente {
    id_venta: number
    fecha_venta: string
    folio_producto: string
    cantidad_vendida: number
    talla: string
    precio_unitario_real: number
    descuento_aplicado: number
    tipo_salida: string
    nombre_producto: string | null
    categoria: string | null
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


    const [kpis, setKpis] = useState<VentasKpis>({ ventasHoy: 0, totalCobrado: 0 })
    const [ventasRecientes, setVentasRecientes] = useState<VentaReciente[]>([])



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
            const [kpisData, recientesData] = await Promise.all([
                window.ipcRenderer.getVentasKpisHoy(),
                window.ipcRenderer.getVentasRecientes(5)
            ])
            setKpis({ ventasHoy: kpisData.ventasHoy, totalCobrado: kpisData.totalCobrado })
            setVentasRecientes(recientesData)
        } catch (error) {
            console.error('Error cargando datos:', error)
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
    }, [])

    const manejarGuardar = async (datos: any) => {
        try {
            await window.ipcRenderer.registrarVenta(datos)
            await recargarProductos()
            await cargarDatos()
            setMostrarFormulario(false)
            setProductoSeleccionado(null)
            window.dispatchEvent(new CustomEvent('productos-actualizados'))
        } catch (error: any) {
            throw new Error(error?.message || 'Error al registrar la venta.')
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
                        </div>
                    </div>
                    <div className="kpi-card kpi-cobrado">
                        <div className="kpi-icon"><DollarSign size={24} /></div>
                        <div className="kpi-content">
                            <p className="kpi-label">Total Cobrado</p>
                            <h2 className="kpi-value">{formatearMoneda(kpis.totalCobrado)}</h2>
                        </div>
                    </div>
                </div>

                {/* Main Content - Two columns layout */}
                <div className="ventas-content">
                    {/* Ventas Recientes - LEFT */}
                    <div className="panel-recientes">
                        <h2 className="panel-titulo">
                            <Clock size={18} />
                            Ventas Recientes
                        </h2>
                        <div className="lista-recientes">
                            {ventasRecientes.length === 0 ? (
                                <div className="sin-ventas">
                                    <ShoppingBag size={32} strokeWidth={1} />
                                    <p>Sin ventas hoy</p>
                                </div>
                            ) : (
                                ventasRecientes.map((venta) => (
                                    <div
                                        key={venta.id_venta}
                                        className="venta-reciente-item clickable"
                                        onClick={() => setProductoHistorial({ folio_producto: venta.folio_producto, nombre_producto: venta.nombre_producto })}
                                    >
                                        <div className="venta-reciente-info">
                                            <span className="venta-reciente-producto">{venta.nombre_producto || venta.folio_producto}</span>
                                            <span className="venta-reciente-detalle">
                                                {venta.categoria && <span className="venta-reciente-categoria">{iconosCategorias[venta.categoria] || '📦'} {venta.categoria}</span>}
                                                <span className="venta-reciente-meta">{venta.talla} • {venta.cantidad_vendida} ud • {venta.tipo_salida}</span>
                                            </span>
                                        </div>
                                        <div className="venta-reciente-monto">{formatearMoneda(venta.total)}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Categorías - RIGHT */}
                    <div className="panel-categorias">
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
                                                                    <span className="producto-card__nombre">{producto.nombre_producto || 'Sin nombre'}</span>
                                                                    {sinStock && <span className="badge-agotado" style={{ marginLeft: '8px', fontSize: '0.7em', background: '#e74c3c', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>AGOTADO</span>}
                                                                </div>
                                                                <div className="producto-card__detalles">
                                                                    <span className="producto-card__stock">{producto.stock_actual} unidades</span>
                                                                    <span className="producto-card__tallas">{tallasTexto}</span>
                                                                </div>
                                                            </div>
                                                            <div className="producto-card__precio">
                                                                {formatearMoneda(producto.ultimo_precio || 0)}
                                                            </div>
                                                            <div className="producto-card__acciones">
                                                                <button
                                                                    className="btn-vender"
                                                                    disabled={sinStock}
                                                                    style={{ opacity: sinStock ? 0.5 : 1, cursor: sinStock ? 'not-allowed' : 'pointer' }}
                                                                    onClick={() => {
                                                                        if (!sinStock) {
                                                                            setProductoSeleccionado(producto)
                                                                            setMostrarFormulario(true)
                                                                        }
                                                                    }}
                                                                >
                                                                    <ShoppingBag size={16} />
                                                                    Vender
                                                                </button>
                                                                <button
                                                                    className="btn-historial"
                                                                    onClick={() => setProductoHistorial(producto)}
                                                                >
                                                                    <History size={16} />
                                                                </button>
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
                </div>
            </div>
        </div>
    )
}
