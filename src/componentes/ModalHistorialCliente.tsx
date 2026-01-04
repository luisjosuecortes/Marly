import { useState, useEffect } from 'react'
import { X, History, DollarSign, ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import './ModalHistorialCliente.css'

interface PropsModalHistorialCliente {
  idCliente: number
  nombreCliente: string
  alCerrar: () => void
}

interface Movimiento {
  id_movimiento: number
  fecha: string
  tipo_movimiento: string
  monto: number
  referencia: string | null
  responsable: string | null
}

export function ModalHistorialCliente({ idCliente, nombreCliente, alCerrar }: PropsModalHistorialCliente) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [cargando, setCargando] = useState(true)
  const [saldoActual, setSaldoActual] = useState(0)
  const [eliminando, setEliminando] = useState<number | null>(null)

  const cargarHistorial = async () => {
    setCargando(true)
    try {
      const datos = await window.ipcRenderer.getHistorialCliente(idCliente)
      setMovimientos(datos.movimientos)
      setSaldoActual(datos.saldoActual)
    } catch (error) {
      console.error('Error cargando historial:', error)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargarHistorial()
  }, [idCliente])

  const formatearFecha = (fecha: string) => {
    try {
      const d = new Date(fecha)
      return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return fecha
    }
  }

  const formatearMonto = (monto: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(monto)
  }

  const manejarEliminar = async (idMovimiento: number) => {
    if (!confirm('¿Estás seguro de eliminar este movimiento? Esta acción ajustará el saldo del cliente.')) {
      return
    }

    setEliminando(idMovimiento)
    try {
      await window.ipcRenderer.eliminarMovimientoCliente(idMovimiento)
      await cargarHistorial()
      window.dispatchEvent(new CustomEvent('clientes-actualizados'))
    } catch (error: any) {
      alert(error?.message || 'Error al eliminar el movimiento')
    } finally {
      setEliminando(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={alCerrar}>
      <div className="modal-contenido-historial" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h3>Historial de Movimientos</h3>
            <p className="folio-modal">{nombreCliente}</p>
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#94a3b8' }}>
              Saldo actual: <strong style={{ color: saldoActual > 0 ? '#fbbf24' : '#34d399' }}>
                {formatearMonto(saldoActual)}
              </strong>
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
              <History size={48} strokeWidth={1} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <p>No hay movimientos registrados para este cliente.</p>
            </div>
          ) : (
            <div className="tabla-historial">
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center' }}>Fecha</th>
                    <th style={{ textAlign: 'center' }}>Tipo</th>
                    <th style={{ textAlign: 'center' }}>Monto</th>
                    <th style={{ textAlign: 'center' }}>Referencia</th>
                    <th style={{ textAlign: 'center' }}>Responsable</th>
                    <th style={{ textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((movimiento) => (
                    <tr key={movimiento.id_movimiento}>
                      <td style={{ textAlign: 'center' }}>{formatearFecha(movimiento.fecha)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge-tipo ${movimiento.tipo_movimiento}`}>
                          {movimiento.tipo_movimiento === 'cargo' ? (
                            <>
                              <ArrowDown size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
                              Cargo
                            </>
                          ) : (
                            <>
                              <ArrowUp size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
                              Abono
                            </>
                          )}
                        </span>
                      </td>
                      <td style={{
                        fontWeight: 600,
                        color: movimiento.tipo_movimiento === 'cargo' ? '#f87171' : '#34d399',
                        textAlign: 'center'
                      }}>
                        <DollarSign size={12} style={{ display: 'inline' }} />
                        {movimiento.monto.toFixed(2)}
                      </td>
                      <td style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center' }}>
                        {movimiento.referencia || '—'}
                      </td>
                      <td style={{ color: '#cbd5e1', textAlign: 'center' }}>
                        {movimiento.responsable || '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn-eliminar-venta"
                          onClick={() => manejarEliminar(movimiento.id_movimiento)}
                          disabled={eliminando === movimiento.id_movimiento}
                          title="Eliminar movimiento"
                        >
                          <Trash2 size={14} />
                        </button>
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

