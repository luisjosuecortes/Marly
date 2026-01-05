import { useState, useEffect } from 'react'
import { Package, TrendingUp, DollarSign, Plus, Building2, Calendar, Clock, ArrowDownCircle, Trash2, RefreshCw, X, Save, AlertCircle } from 'lucide-react'
import { ModalProveedores } from '../componentes/ModalProveedores'
import './EntradasNuevo.css'

interface EntradasKpis {
    mes: { numEntradas: number, totalUnidades: number, inversionTotal: number, valorVenta: number, gananciaProyectada: number }
    anio: { numEntradas: number, totalUnidades: number, inversionTotal: number, valorVenta: number, gananciaProyectada: number }
    productosNuevosMes: number
    proveedoresActivosMes: number
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

export function EntradasNuevo() {
    const [kpis, setKpis] = useState<EntradasKpis | null>(null)
    const [entradasRecientes, setEntradasRecientes] = useState<EntradaReciente[]>([])
    const [cargando, setCargando] = useState(true)
    const [mostrarFormulario, setMostrarFormulario] = useState(false)
    const [mostrarProveedores, setMostrarProveedores] = useState(false)
    const [periodoKpi, setPeriodoKpi] = useState<'mes' | 'anio'>('mes')

    // Estado del formulario
    const [buscandoProducto, setBuscandoProducto] = useState(false)
    const [esExistente, setEsExistente] = useState(false)
    const [proveedores, setProveedores] = useState<string[]>([])
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
            const [kpisData, recientesData, proveedoresData] = await Promise.all([
                window.ipcRenderer.getEntradasKpis(),
                window.ipcRenderer.getEntradasRecientes(15),
                window.ipcRenderer.getProveedores()
            ])
            setKpis(kpisData)
            setEntradasRecientes(recientesData)
            setProveedores(proveedoresData)
        } catch (error) {
            console.error('Error cargando datos:', error)
        } finally {
            setCargando(false)
        }
    }

    useEffect(() => {
        cargarDatos()
    }, [])

    // Buscar producto al cambiar folio
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
                        proveedor: existente.proveedor || '',
                        observaciones: existente.observaciones || ''
                    }))

                    const ultimaEntrada = await window.ipcRenderer.getUltimaEntrada(producto.folio_producto)
                    if (ultimaEntrada) {
                        setTallasEntrada([{
                            talla: TALLAS[0],
                            cantidad: 1,
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

        const timeoutId = setTimeout(buscarProducto, 500)
        return () => clearTimeout(timeoutId)
    }, [producto.folio_producto])

    const agregarTalla = () => {
        const ultimaTalla = tallasEntrada[tallasEntrada.length - 1]
        setTallasEntrada([...tallasEntrada, {
            talla: TALLAS[0],
            cantidad: 1,
            costo: ultimaTalla?.costo || 0,
            precio: ultimaTalla?.precio || 0
        }])
    }

    const quitarTalla = (index: number) => {
        if (tallasEntrada.length > 1) {
            setTallasEntrada(tallasEntrada.filter((_, i) => i !== index))
        }
    }

    const actualizarTalla = (index: number, campo: keyof TallaEntrada, valor: string | number) => {
        setTallasEntrada(tallasEntrada.map((t, i) =>
            i === index ? { ...t, [campo]: valor } : t
        ))
    }

    const manejarGuardar = async () => {
        setError(null)

        if (!producto.folio_producto.trim()) {
            setError('El folio es obligatorio.')
            return
        }

        if (!producto.nombre_producto.trim()) {
            setError('La descripción del producto es obligatoria.')
            return
        }

        if (!producto.proveedor) {
            setError('El proveedor es obligatorio.')
            return
        }

        const tallasValidas = tallasEntrada.filter(t => t.cantidad > 0)
        if (tallasValidas.length === 0) {
            setError('Debe agregar al menos una talla con cantidad mayor a 0.')
            return
        }

        const tallaSinPrecios = tallasValidas.find(t => t.costo <= 0 || t.precio <= 0)
        if (tallaSinPrecios) {
            setError('Todas las tallas deben tener costo y precio mayor a 0.')
            return
        }

        try {
            setGuardando(true)
            await window.ipcRenderer.registrarEntradaMultipleTallas({
                folio_producto: producto.folio_producto,
                esNuevo: !esExistente,
                producto: !esExistente ? producto : undefined,
                tallas: tallasValidas,
                responsable: 'Admin',
                observaciones: ''
            })

            // Reset formulario
            setProducto({
                folio_producto: '',
                nombre_producto: '',
                categoria: CATEGORIAS[0],
                genero_destino: GENEROS[1],
                proveedor: '',
                observaciones: ''
            })
            setTallasEntrada([{ talla: TALLAS[0], cantidad: 1, costo: 0, precio: 0 }])
            setEsExistente(false)
            setMostrarFormulario(false)
            setExito(true)
            setTimeout(() => setExito(false), 3000)

            await cargarDatos()
        } catch (err: any) {
            setError(err?.message || 'Error al guardar la entrada')
        } finally {
            setGuardando(false)
        }
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

    const kpiActual = kpis ? kpis[periodoKpi] : null

    if (cargando) {
        return <div className="pagina-contenido">Cargando entradas...</div>
    }

    return (
        <div className="pagina-contenido">
            {exito && (
                <div className="notificacion-exito">
                    <ArrowDownCircle size={24} />
                    <div>
                        <strong>¡Entrada registrada!</strong>
                        <p>La mercancía se agregó correctamente.</p>
                    </div>
                </div>
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
                            <Building2 size={18} />
                            Proveedores
                        </button>
                        <button className="accion-primaria" onClick={() => setMostrarFormulario(true)}>
                            <Plus size={18} />
                            Nueva Entrada
                        </button>
                        <button className="btn-refresh" onClick={cargarDatos} disabled={cargando}>
                            <RefreshCw size={16} className={cargando ? 'spinning' : ''} />
                        </button>
                    </div>
                </div>

                {/* Toggle período KPIs */}
                <div className="periodo-toggle">
                    <button
                        className={`btn-periodo ${periodoKpi === 'mes' ? 'activo' : ''}`}
                        onClick={() => setPeriodoKpi('mes')}
                    >
                        Este Mes
                    </button>
                    <button
                        className={`btn-periodo ${periodoKpi === 'anio' ? 'activo' : ''}`}
                        onClick={() => setPeriodoKpi('anio')}
                    >
                        Este Año
                    </button>
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

                {/* Timeline de entradas */}
                <div className="timeline-section">
                    <h2 className="seccion-titulo">
                        <Clock size={20} />
                        Entradas Recientes
                    </h2>
                    <div className="timeline-container">
                        {entradasRecientes.length === 0 ? (
                            <div className="sin-entradas">
                                <Package size={40} strokeWidth={1} />
                                <p>No hay entradas registradas</p>
                            </div>
                        ) : (
                            <div className="timeline-lista">
                                {entradasRecientes.map((entrada) => (
                                    <div key={entrada.id_entrada} className="timeline-item">
                                        <div className="timeline-fecha">
                                            <Calendar size={14} />
                                            {formatearFecha(entrada.fecha_entrada)}
                                        </div>
                                        <div className="timeline-contenido">
                                            <div className="timeline-producto">
                                                <span className="folio">{entrada.folio_producto}</span>
                                                <span className="nombre">{entrada.nombre_producto || '—'}</span>
                                            </div>
                                            <div className="timeline-detalles">
                                                <span className="talla">{entrada.talla}</span>
                                                <span className="cantidad">×{entrada.cantidad_recibida}</span>
                                                <span className="costo">{formatearMoneda(entrada.costo_unitario_proveedor)}</span>
                                                <span className="precio">→ {formatearMoneda(entrada.precio_unitario_base)}</span>
                                            </div>
                                            <div className="timeline-meta">
                                                <span className="categoria">{entrada.categoria}</span>
                                                <span className="proveedor">{entrada.proveedor || '—'}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
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
                                <p className="etiqueta">
                                    {esExistente ? 'Reabastecimiento' : 'Nuevo Producto'}
                                </p>
                                <h2>Registrar Entrada</h2>
                            </div>
                            <button className="btn-cerrar" onClick={() => setMostrarFormulario(false)}>
                                <X size={20} />
                            </button>
                        </header>

                        <div className="formulario-contenido">
                            {error && (
                                <div className="mensaje-error">
                                    <AlertCircle size={16} />
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Datos del producto */}
                            <div className="seccion-form">
                                <h3>Producto</h3>
                                <div className="fila-form">
                                    <div className="campo">
                                        <label>Folio {buscandoProducto && <span className="buscando">(Buscando...)</span>}</label>
                                        <input
                                            type="text"
                                            placeholder="321-01"
                                            value={producto.folio_producto}
                                            onChange={(e) => setProducto({ ...producto, folio_producto: e.target.value })}
                                        />
                                    </div>
                                    <div className="campo flex-2">
                                        <label>Descripción</label>
                                        <input
                                            type="text"
                                            placeholder="Blusa Sophia verde"
                                            value={producto.nombre_producto}
                                            onChange={(e) => setProducto({ ...producto, nombre_producto: e.target.value })}
                                            disabled={esExistente}
                                        />
                                    </div>
                                </div>
                                <div className="fila-form">
                                    <div className="campo">
                                        <label>Categoría</label>
                                        <select
                                            value={producto.categoria}
                                            onChange={(e) => setProducto({ ...producto, categoria: e.target.value })}
                                            disabled={esExistente}
                                        >
                                            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="campo">
                                        <label>Género</label>
                                        <select
                                            value={producto.genero_destino}
                                            onChange={(e) => setProducto({ ...producto, genero_destino: e.target.value })}
                                            disabled={esExistente}
                                        >
                                            {GENEROS.map(g => <option key={g} value={g}>{g}</option>)}
                                        </select>
                                    </div>
                                    <div className="campo">
                                        <label>Proveedor</label>
                                        <select
                                            value={producto.proveedor}
                                            onChange={(e) => setProducto({ ...producto, proveedor: e.target.value })}
                                            disabled={esExistente}
                                        >
                                            <option value="">Seleccionar...</option>
                                            {proveedores.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Tallas */}
                            <div className="seccion-form">
                                <div className="seccion-header">
                                    <h3>Tallas y Precios</h3>
                                    <button type="button" className="btn-agregar-talla" onClick={agregarTalla}>
                                        <Plus size={16} /> Agregar Talla
                                    </button>
                                </div>
                                <div className="tallas-lista">
                                    {tallasEntrada.map((t, i) => (
                                        <div key={i} className="talla-row">
                                            <select
                                                value={t.talla}
                                                onChange={(e) => actualizarTalla(i, 'talla', e.target.value)}
                                            >
                                                {TALLAS.map(talla => <option key={talla} value={talla}>{talla}</option>)}
                                            </select>
                                            <input
                                                type="number"
                                                min="1"
                                                placeholder="Cant."
                                                value={t.cantidad}
                                                onChange={(e) => actualizarTalla(i, 'cantidad', parseInt(e.target.value) || 0)}
                                            />
                                            <div className="input-moneda">
                                                <span>$</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.50"
                                                    placeholder="Costo"
                                                    value={t.costo}
                                                    onChange={(e) => actualizarTalla(i, 'costo', parseFloat(e.target.value) || 0)}
                                                />
                                            </div>
                                            <div className="input-moneda">
                                                <span>$</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.50"
                                                    placeholder="Precio"
                                                    value={t.precio}
                                                    onChange={(e) => actualizarTalla(i, 'precio', parseFloat(e.target.value) || 0)}
                                                />
                                            </div>
                                            {tallasEntrada.length > 1 && (
                                                <button type="button" className="btn-quitar" onClick={() => quitarTalla(i)}>
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <footer className="modal-footer">
                            <button className="btn-cancelar" onClick={() => setMostrarFormulario(false)}>
                                Cancelar
                            </button>
                            <button className="btn-guardar" onClick={manejarGuardar} disabled={guardando}>
                                {guardando ? 'Guardando...' : (
                                    <>
                                        <Save size={18} />
                                        {esExistente ? 'Agregar Stock' : 'Registrar Producto'}
                                    </>
                                )}
                            </button>
                        </footer>
                    </div>
                </div>
            )}

            {mostrarProveedores && (
                <ModalProveedores alCerrar={() => {
                    setMostrarProveedores(false)
                    cargarDatos()
                }} />
            )}
        </div>
    )
}
