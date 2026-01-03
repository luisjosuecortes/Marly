import { useState, useEffect } from 'react'
import { X, History, DollarSign, ArrowDown, ArrowUp } from 'lucide-react'
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
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Monto</th>
                    <th>Referencia</th>
                    <th>Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((movimiento) => (
                    <tr key={movimiento.id_movimiento}>
                      <td>{formatearFecha(movimiento.fecha)}</td>
                      <td>
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
                        color: movimiento.tipo_movimiento === 'cargo' ? '#f87171' : '#34d399'
                      }}>
                        <DollarSign size={12} style={{ display: 'inline' }} />
                        {movimiento.monto.toFixed(2)}
                      </td>
                      <td style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                        {movimiento.referencia || '0'}
                      </td>
                      <td style={{ color: '#cbd5e1' }}>
                        {movimiento.responsable || '0'}
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

