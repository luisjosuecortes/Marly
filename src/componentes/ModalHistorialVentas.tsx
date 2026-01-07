import { useState, useEffect } from 'react'
import { X, DollarSign, Package, ShoppingBag, User, RotateCcw } from 'lucide-react'
import './ModalHistorialVentas.css'

interface PropsModalHistorialVentas {
  folio: string
  nombreProducto: string
  alCerrar: () => void
}

interface Venta {
  id_venta: number
  fecha_venta: string
  cantidad_vendida: number
  talla: string
  precio_unitario_real: number
  descuento_aplicado: number
  tipo_salida: string
  nombre_cliente: string | null
  responsable_caja: string | null
  notas: string | null
  monto_total: number
  monto_vendido: number
  saldo_pendiente: number
}

export function ModalHistorialVentas({ folio, nombreProducto, alCerrar }: PropsModalHistorialVentas) {
  const [ventas, setVentas] = useState<Venta[]>([])
  const [cargando, setCargando] = useState(true)
  const [eliminando, setEliminando] = useState<number | null>(null)

  const cargarHistorial = async () => {
    setCargando(true)
    try {
      const datos = await window.ipcRenderer.getHistorialVentas(folio)
      setVentas(datos)
    } catch (error) {
      console.error('Error cargando historial de ventas:', error)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargarHistorial()
  }, [folio])

  const formatearFecha = (fecha: string) => {
    try {
      const d = new Date(fecha)
      return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return fecha
    }
  }

  const manejarDevolucion = async (idVenta: number) => {
    if (!confirm('¿Estás seguro de procesar esta devolución? El producto regresará al inventario y los abonos se convertirán en reembolsos.')) {
      return
    }

    setEliminando(idVenta)
    try {
      await window.ipcRenderer.devolverVenta(idVenta)
      await cargarHistorial()
      window.dispatchEvent(new CustomEvent('ventas-actualizadas'))
    } catch (error: any) {
      alert(error?.message || 'Error al procesar la devolución')
    } finally {
      setEliminando(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={alCerrar}>
      <div className="modal-contenido-historial" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h3>Historial de Ventas</h3>
            <p className="folio-modal">{folio} - {nombreProducto}</p>
          </div>
          <button className="boton-cerrar-modal" onClick={alCerrar}>
            <X size={20} />
          </button>
        </header>

        <div className="contenido-historial">
          {cargando ? (
            <div className="cargando">Cargando historial...</div>
          ) : ventas.length === 0 ? (
            <div className="sin-entradas">
              <ShoppingBag size={48} strokeWidth={1} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <p>No hay ventas registradas para este producto.</p>
            </div>
          ) : (
            <div className="tabla-historial">
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center' }}>Fecha</th>
                    <th style={{ textAlign: 'center' }}>Cantidad</th>
                    <th style={{ textAlign: 'center' }}>Talla</th>
                    <th style={{ textAlign: 'center' }}>Precio Unit.</th>
                    <th style={{ textAlign: 'center' }}>Vendido</th>
                    <th style={{ textAlign: 'center' }}>Pendiente</th>
                    <th style={{ textAlign: 'center' }}>Tipo</th>
                    <th style={{ textAlign: 'center' }}>Cliente</th>
                    <th style={{ textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((venta) => {
                    return (
                      <tr key={venta.id_venta}>
                        <td>{formatearFecha(venta.fecha_venta)}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>
                          <Package size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />
                          {venta.cantidad_vendida}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge-talla">{venta.talla}</span>
                        </td>
                        <td style={{ color: '#34d399', fontWeight: 600 }}>
                          <DollarSign size={12} style={{ display: 'inline' }} />
                          {venta.precio_unitario_real.toFixed(2)}
                        </td>
                        <td style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.9rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                            <span>
                              <DollarSign size={12} style={{ display: 'inline' }} />
                              {venta.monto_vendido.toFixed(2)}
                            </span>
                            {venta.descuento_aplicado > 0 && (
                              <span style={{ fontSize: '0.7rem', color: '#f87171', fontWeight: 400 }}>
                                Desc: <DollarSign size={10} style={{ display: 'inline' }} />
                                {venta.descuento_aplicado.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ color: venta.saldo_pendiente > 0 ? '#fbbf24' : '#94a3b8', fontSize: '0.85rem' }}>
                          <DollarSign size={12} style={{ display: 'inline' }} />
                          {venta.saldo_pendiente.toFixed(2)}
                        </td>
                        <td>
                          <span className={`badge-tipo badge-${venta.tipo_salida.toLowerCase()}`}>
                            {venta.tipo_salida}
                          </span>
                        </td>
                        <td style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                          {venta.nombre_cliente ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <User size={12} />
                              {venta.nombre_cliente}
                            </span>
                          ) : (
                            <span style={{ color: '#64748b', fontStyle: 'italic' }}>
                              Público General
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {venta.tipo_salida !== 'Devolución' && (
                            <button
                              className="btn-eliminar-venta"
                              onClick={() => manejarDevolucion(venta.id_venta)}
                              disabled={eliminando === venta.id_venta}
                              title="Devolución"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

