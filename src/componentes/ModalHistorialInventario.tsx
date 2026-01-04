import { useState, useEffect } from 'react'
import { X, DollarSign, Package, ArrowDown, ArrowUp, TrendingUp } from 'lucide-react'
import './ModalHistorialInventario.css'

interface PropsModalHistorialInventario {
  folio: string
  nombreProducto: string
  alCerrar: () => void
}

interface Movimiento {
  tipo: 'entrada' | 'venta'
  id: number
  fecha: string
  cantidad: number
  talla: string
  precio_unitario?: number
  costo_unitario?: number
  tipo_movimiento?: string
  responsable?: string | null
  cliente?: string | null
  saldo_pendiente?: number
}

export function ModalHistorialInventario({ folio, nombreProducto, alCerrar }: PropsModalHistorialInventario) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [cargando, setCargando] = useState(true)

  const cargarHistorial = async () => {
    setCargando(true)
    try {
      const datos = await window.ipcRenderer.getHistorialMovimientos(folio)
      setMovimientos(datos)
    } catch (error) {
      console.error('Error cargando historial de movimientos:', error)
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

  return (
    <div className="modal-overlay" onClick={alCerrar}>
      <div className="modal-contenido-historial" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h3>Historial de Movimientos</h3>
            <p className="folio-modal">{folio} - {nombreProducto}</p>
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#94a3b8' }}>
              Movimientos de inventario (entradas y ventas)
            </p>
          </div>
          <button className="boton-cerrar-modal" onClick={alCerrar}>
            <X size={20} />
          </button>
        </header>

        <div className="contenido-historial">
          {cargando ? (
            <div className="cargando">Cargando historial...</div>
          ) : movimientos.length === 0 ? (
            <div className="sin-entradas">
              <TrendingUp size={48} strokeWidth={1} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <p>No hay movimientos registrados para este producto.</p>
            </div>
          ) : (
            <div className="tabla-historial">
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center' }}>Fecha</th>
                    <th style={{ textAlign: 'center' }}>Tipo</th>
                    <th style={{ textAlign: 'center' }}>Cantidad</th>
                    <th style={{ textAlign: 'center' }}>Talla</th>
                    <th style={{ textAlign: 'center' }}>Precio/Costo</th>
                    <th style={{ textAlign: 'center' }}>Detalles</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((mov) => (
                    <tr key={`${mov.tipo}-${mov.id}`}>
                      <td>{formatearFecha(mov.fecha)}</td>
                      <td>
                        <span className={`badge-tipo badge-${mov.tipo}`}>
                          {mov.tipo === 'entrada' ? (
                            <>
                              <ArrowDown size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
                              Entrada
                            </>
                          ) : (
                            <>
                              <ArrowUp size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
                              Venta
                            </>
                          )}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>
                        <Package size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />
                        {mov.cantidad}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge-talla">{mov.talla}</span>
                      </td>
                      <td>
                        {mov.tipo === 'entrada' ? (
                          <div style={{ fontSize: '0.85rem' }}>
                            <div style={{ color: '#f87171' }}>
                              Costo: <DollarSign size={10} style={{ display: 'inline' }} />
                              {(mov.costo_unitario || 0).toFixed(2)}
                            </div>
                            <div style={{ color: '#34d399', marginTop: '0.25rem' }}>
                              Venta: <DollarSign size={10} style={{ display: 'inline' }} />
                              {(mov.precio_unitario || 0).toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.9rem' }}>
                            <div style={{ color: '#22c55e', fontWeight: 700 }}>
                              <DollarSign size={12} style={{ display: 'inline' }} />
                              {(mov.precio_unitario || 0).toFixed(2)}
                            </div>
                            {mov.saldo_pendiente !== undefined && mov.saldo_pendiente > 0 && (
                              <div style={{ color: '#facc15', marginTop: '0.25rem', fontSize: '0.8rem', fontWeight: 600 }}>
                                Pendiente: ${(mov.saldo_pendiente).toFixed(2)}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                        {mov.tipo_movimiento && (
                          <div>{mov.tipo_movimiento}</div>
                        )}
                        {mov.cliente && (
                          <div style={{ marginTop: '0.25rem', color: '#94a3b8' }}>
                            Cliente: {mov.cliente}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

