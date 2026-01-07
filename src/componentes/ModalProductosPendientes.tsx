import { useState, useEffect } from 'react'
import { X, DollarSign, CheckCircle2, ArrowLeft, AlertCircle } from 'lucide-react'
import './ModalProductosPendientes.css'

interface PropsModalProductosPendientes {
  idCliente: number
  nombreCliente: string
  saldoPendiente: number
  alCerrar: () => void
  onActualizar: () => void
}

interface ProductoPendiente {
  id_venta: number
  fecha_venta: string
  folio_producto: string
  nombre_producto: string
  cantidad_vendida: number
  talla: string
  precio_unitario_real: number
  descuento_aplicado: number
  tipo_salida: string
  estado_producto: string
  monto_total: number
  monto_abonado: number
  monto_faltante: number
  notas: string | null
}

export function ModalProductosPendientes({
  idCliente,
  nombreCliente,
  saldoPendiente,
  alCerrar,
  onActualizar
}: PropsModalProductosPendientes) {
  const [productos, setProductos] = useState<ProductoPendiente[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mostrarAbono, setMostrarAbono] = useState<number | null>(null)
  const [mostrarAbonoGeneral, setMostrarAbonoGeneral] = useState(false)
  const [montoAbono, setMontoAbono] = useState('')
  const [responsable, setResponsable] = useState('')
  const [guardando, setGuardando] = useState(false)
  // Estado local para el saldo que se actualiza en tiempo real
  const [saldoActual, setSaldoActual] = useState(saldoPendiente)
  // Responsables list
  const [responsables, setResponsables] = useState<{ id_responsable: number, nombre: string }[]>([])

  useEffect(() => {
    cargarProductos()
    cargarResponsables()
  }, [idCliente])

  const cargarResponsables = async () => {
    try {
      const datos = await window.ipcRenderer.getResponsables()
      setResponsables(datos)
    } catch (err) {
      console.error('Error cargando responsables:', err)
    }
  }

  const cargarProductos = async () => {
    setCargando(true)
    try {
      const datos = await window.ipcRenderer.getProductosPendientesCliente(idCliente)
      setProductos(datos)
    } catch (err: any) {
      setError(err?.message || 'Error al cargar productos pendientes')
    } finally {
      setCargando(false)
    }
  }

  const formatearFecha = (fecha: string) => {
    try {
      const d = new Date(fecha)
      return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return fecha
    }
  }

  const formatearMoneda = (monto: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(monto)
  }



  const manejarAbonar = async (producto: ProductoPendiente) => {
    setError(null)
    const monto = parseFloat(montoAbono)

    if (isNaN(monto) || monto <= 0) {
      setError('El monto debe ser mayor a 0.')
      return
    }

    // Validar contra el monto faltante del producto específico
    if (monto > producto.monto_faltante) {
      setError(`El abono no puede ser mayor al monto faltante de este producto (${formatearMoneda(producto.monto_faltante)}).`)
      return
    }

    // También validar contra el saldo pendiente total del cliente
    if (monto > saldoActual) {
      setError(`El abono no puede ser mayor al saldo pendiente total (${formatearMoneda(saldoActual)}).`)
      return
    }

    if (!responsable.trim()) {
      setError('Debes indicar el responsable.')
      return
    }

    setGuardando(true)
    try {
      await window.ipcRenderer.registrarAbonoCliente({
        id_cliente: idCliente,
        monto,
        id_venta: producto.id_venta,
        responsable: responsable.trim(),
        notas: undefined
      })

      setMontoAbono('')
      setResponsable('')
      setMostrarAbono(null)
      setSaldoActual(prev => prev - monto) // Actualizar saldo en tiempo real
      await cargarProductos()
      onActualizar()
      window.dispatchEvent(new CustomEvent('ventas-actualizadas'))
    } catch (err: any) {
      setError(err?.message || 'Error al registrar el abono')
    } finally {
      setGuardando(false)
    }
  }

  const manejarAbonoGeneral = async () => {
    setError(null)
    const monto = parseFloat(montoAbono)

    if (isNaN(monto) || monto <= 0) {
      setError('El monto debe ser mayor a 0.')
      return
    }

    if (monto > saldoActual) {
      setError(`El abono no puede ser mayor al saldo pendiente total (${formatearMoneda(saldoActual)}).`)
      return
    }

    if (!responsable.trim()) {
      setError('Debes indicar el responsable.')
      return
    }

    setGuardando(true)
    try {
      await window.ipcRenderer.registrarAbonoCliente({
        id_cliente: idCliente,
        monto,
        id_venta: undefined, // Sin venta específica
        responsable: responsable.trim(),
        notas: 'Abono a saldo general'
      })

      setMontoAbono('')
      setResponsable('')
      setMostrarAbonoGeneral(false)
      setSaldoActual(prev => prev - monto) // Actualizar saldo en tiempo real
      await cargarProductos()
      onActualizar()
      window.dispatchEvent(new CustomEvent('ventas-actualizadas'))
    } catch (err: any) {
      setError(err?.message || 'Error al registrar el abono general')
    } finally {
      setGuardando(false)
    }
  }

  const manejarDevolverPrestado = async (producto: ProductoPendiente) => {
    if (!confirm(`¿Marcar el producto "${producto.nombre_producto}" (${producto.folio_producto}) como devuelto?`)) {
      return
    }

    setGuardando(true)
    try {
      await window.ipcRenderer.marcarPrestadoDevuelto({
        id_venta: producto.id_venta,
        responsable: responsable.trim() || undefined,
        notas: undefined
      })

      await cargarProductos()
      onActualizar()
    } catch (err: any) {
      setError(err?.message || 'Error al marcar producto como devuelto')
    } finally {
      setGuardando(false)
    }
  }

  const getBadgeColor = (tipo: string) => {
    switch (tipo) {
      case 'Crédito':
        return 'badge-credito'
      case 'Apartado':
        return 'badge-apartado'
      case 'Prestado':
        return 'badge-prestado'
      default:
        return ''
    }
  }

  // Calcular deuda total de productos mostrados
  const totalDeudaProductos = productos.reduce((acc, p) => acc + p.monto_faltante, 0)
  // Calcular saldo "huérfano" (no atribuible a productos específicos)
  // Usamos un pequeño margen de error por decimales
  const saldoHuerfano = Math.max(0, saldoActual - totalDeudaProductos)

  return (
    <div className="modal-overlay" onClick={alCerrar}>
      <div className="modal-contenido-productos-pendientes" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h3>Productos Pendientes</h3>
            <p className="folio-modal">{nombreCliente}</p>
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#94a3b8' }}>
              Saldo Total: <strong style={{ color: '#fbbf24' }}>{formatearMoneda(saldoActual)}</strong>
            </p>
          </div>
          <button className="boton-cerrar-modal" onClick={alCerrar}>
            <X size={20} />
          </button>
        </header>

        {error && (
          <div className="mensaje-error-modal">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}



        <div className="contenido-productos-pendientes">
          {cargando ? (
            <div className="cargando">Cargando productos pendientes...</div>
          ) : productos.length === 0 && saldoHuerfano <= 0.01 ? (
            <div className="sin-productos">
              <CheckCircle2 size={48} strokeWidth={1} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <p>No hay productos pendientes para este cliente.</p>
            </div>
          ) : (
            <div className="lista-productos-pendientes">
              {/* Saldo Huérfano como tarjeta */}
              {saldoHuerfano > 0.01 && (
                <div className="producto-pendiente-card saldo-huerfano-card">
                  <div className="producto-pendiente-header-compacto">
                    <div className="producto-info-compacta">
                      <h4 className="nombre-producto-compacto" style={{ color: '#fbbf24' }}>
                        💰 Saldo Inicial de Cuenta
                      </h4>
                      <div className="detalles-inline">
                        <span className="detalle-inline">
                          <span className="detalle-label-inline">Pendiente:</span>
                          <span style={{ fontWeight: 700, color: '#fbbf24' }}>
                            {formatearMoneda(saldoHuerfano)}
                          </span>
                        </span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                        Este saldo no está vinculado a ningún producto específico
                      </p>
                    </div>
                    <div className="acciones-compactas">
                      <span className="badge-tipo-compacto badge-saldo-huerfano">
                        Saldo Inicial
                      </span>
                      <button
                        className="btn-abonar-compacto"
                        onClick={() => {
                          setMostrarAbonoGeneral(!mostrarAbonoGeneral)
                          setMostrarAbono(null)
                          setMontoAbono('')
                          setResponsable('')
                          setError(null)
                        }}
                        disabled={guardando}
                      >
                        <DollarSign size={14} />
                        <span>{mostrarAbonoGeneral ? 'Cancelar' : 'Abonar'}</span>
                      </button>
                    </div>
                  </div>

                  {mostrarAbonoGeneral && (
                    <div className="formulario-abono-compacto">
                      <div className="fila-abono">
                        <div className="input-abono-compacto">
                          <label className="label-abono">
                            Monto
                            <span className="hint-abono">
                              (Máx: {formatearMoneda(saldoHuerfano)})
                            </span>
                          </label>
                          <input
                            type="number"
                            step="50"
                            min="0.01"
                            max={saldoHuerfano}
                            value={montoAbono}
                            onChange={(e) => setMontoAbono(e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="input-abono-compacto">
                          <label className="label-abono">Responsable</label>
                          <select
                            value={responsable}
                            onChange={(e) => setResponsable(e.target.value)}
                          >
                            <option value="">Seleccionar...</option>
                            {responsables.map((r) => (
                              <option key={r.id_responsable} value={r.nombre}>{r.nombre}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          className="btn-confirmar-abono-compacto"
                          onClick={manejarAbonoGeneral}
                          disabled={guardando || !montoAbono || !responsable.trim()}
                        >
                          {guardando ? '...' : 'Confirmar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {productos.map((producto) => (
                <div key={producto.id_venta} className="producto-pendiente-card">
                  <div className="producto-pendiente-header-compacto">
                    <div className="producto-info-compacta">
                      <h4 className="nombre-producto-compacto">{producto.nombre_producto || 'Sin nombre'}</h4>
                      <div className="detalles-inline">
                        <span className="detalle-inline">
                          <span className="detalle-label-inline">Fecha:</span>
                          <span>{formatearFecha(producto.fecha_venta)}</span>
                        </span>
                        <span className="detalle-inline">
                          <span className="detalle-label-inline">Cantidad:</span>
                          <span>{producto.cantidad_vendida} {producto.talla}</span>
                        </span>
                        <span className="detalle-inline">
                          <span className="detalle-label-inline">Total:</span>
                          <span style={{ fontWeight: 600, color: '#94a3b8' }}>
                            {formatearMoneda(producto.monto_total)}
                          </span>
                        </span>
                        <span className="detalle-inline">
                          <span className="detalle-label-inline">Abonado:</span>
                          <span style={{ fontWeight: 600, color: '#22c55e' }}>
                            {formatearMoneda(producto.monto_abonado)}
                          </span>
                        </span>
                        <span className="detalle-inline">
                          <span className="detalle-label-inline">Faltante:</span>
                          <span style={{ fontWeight: 700, color: producto.monto_faltante > 0 ? '#fbbf24' : '#22c55e' }}>
                            {formatearMoneda(producto.monto_faltante)}
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="acciones-compactas">
                      <span className={`badge-tipo-compacto ${getBadgeColor(producto.tipo_salida)}`}>
                        {producto.tipo_salida}
                      </span>
                      {producto.tipo_salida === 'Prestado' ? (
                        <button
                          className="btn-devolver-compacto"
                          onClick={() => manejarDevolverPrestado(producto)}
                          disabled={guardando}
                        >
                          <ArrowLeft size={14} />
                          <span>Devolver</span>
                        </button>
                      ) : (
                        <button
                          className="btn-abonar-compacto"
                          onClick={() => setMostrarAbono(mostrarAbono === producto.id_venta ? null : producto.id_venta)}
                          disabled={guardando}
                        >
                          <DollarSign size={14} />
                          <span>{mostrarAbono === producto.id_venta ? 'Cancelar' : 'Abonar'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {mostrarAbono === producto.id_venta && producto.tipo_salida !== 'Prestado' && (
                    <div className="formulario-abono-compacto">
                      <div className="fila-abono">
                        <div className="input-abono-compacto">
                          <label htmlFor={`monto-${producto.id_venta}`} className="label-abono">
                            Monto
                            <span className="hint-abono">
                              (Máx: {formatearMoneda(Math.min(producto.monto_faltante, saldoActual))})
                            </span>
                          </label>
                          <input
                            id={`monto-${producto.id_venta}`}
                            type="number"
                            step="50"
                            min="0.01"
                            max={Math.min(producto.monto_faltante, saldoActual)}
                            value={montoAbono}
                            onChange={(e) => setMontoAbono(e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="input-abono-compacto">
                          <label htmlFor={`responsable-${producto.id_venta}`} className="label-abono">
                            Responsable
                          </label>
                          <select
                            id={`responsable-${producto.id_venta}`}
                            value={responsable}
                            onChange={(e) => setResponsable(e.target.value)}
                          >
                            <option value="">Seleccionar...</option>
                            {responsables.map((r) => (
                              <option key={r.id_responsable} value={r.nombre}>{r.nombre}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          className="btn-confirmar-abono-compacto"
                          onClick={() => manejarAbonar(producto)}
                          disabled={guardando || !montoAbono || !responsable.trim()}
                        >
                          {guardando ? '...' : 'Confirmar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

