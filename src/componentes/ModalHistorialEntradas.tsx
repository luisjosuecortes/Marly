import { useState, useEffect } from 'react'
import { X, History, DollarSign, Package, Trash2 } from 'lucide-react'
import './ModalHistorialEntradas.css'

interface PropsModalHistorialEntradas {
  folio: string
  nombreProducto: string
  alCerrar: () => void
}

interface Entrada {
  id_entrada: number
  fecha_entrada: string
  cantidad_recibida: number
  talla: string
  costo_unitario_proveedor: number
  precio_unitario_base: number
  precio_unitario_promocion: number | null
  tipo_movimiento: string
  responsable_recepcion: string | null
  observaciones_entrada: string | null
}

export function ModalHistorialEntradas({ folio, nombreProducto, alCerrar }: PropsModalHistorialEntradas) {
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [cargando, setCargando] = useState(true)
  const [eliminando, setEliminando] = useState<number | null>(null)

  const cargarHistorial = async () => {
    setCargando(true)
    try {
      const datos = await window.ipcRenderer.getHistorialEntradas(folio)
      setEntradas(datos)
    } catch (error) {
      console.error('Error cargando historial:', error)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargarHistorial()
  }, [folio])

  const handleEliminar = async (id_entrada: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta entrada? Esta acción revertirá el stock y no se puede deshacer.')) {
      return
    }

    setEliminando(id_entrada)
    try {
      await window.ipcRenderer.eliminarEntrada(id_entrada)
      // Recargar el historial
      await cargarHistorial()
      // Disparar evento para actualizar la lista de productos en otras pestañas
      window.dispatchEvent(new CustomEvent('productos-actualizados'))
    } catch (error: any) {
      alert(`Error al eliminar entrada: ${error.message || 'Error desconocido'}`)
    } finally {
      setEliminando(null)
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

  return (
    <div className="modal-overlay" onClick={alCerrar}>
      <div className="modal-contenido-historial" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h3>Historial de Entradas</h3>
            <p className="folio-modal">{folio} - {nombreProducto}</p>
          </div>
          <button className="boton-cerrar-modal" onClick={alCerrar}>
            <X size={20} />
          </button>
        </header>

        <div className="contenido-historial">
          {cargando ? (
            <div className="cargando">Cargando historial...</div>
          ) : entradas.length === 0 ? (
            <div className="sin-entradas">
              <History size={48} strokeWidth={1} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <p>No hay entradas registradas para este producto.</p>
            </div>
          ) : (
            <div className="tabla-historial">
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center' }}>Fecha</th>
                    <th style={{ textAlign: 'center' }}>Cantidad</th>
                    <th style={{ textAlign: 'center' }}>Talla</th>
                    <th style={{ textAlign: 'center' }}>Compra</th>
                    <th style={{ textAlign: 'center' }}>Venta</th>
                    <th style={{ textAlign: 'center' }}>Ganancia</th>
                    <th style={{ textAlign: 'center' }}>Tipo</th>
                    <th style={{ textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {entradas.map((entrada) => {
                    const gananciaUnitaria = entrada.precio_unitario_base - entrada.costo_unitario_proveedor
                    const gananciaTotal = gananciaUnitaria * entrada.cantidad_recibida
                    return (
                      <tr key={entrada.id_entrada}>
                        <td>{formatearFecha(entrada.fecha_entrada)}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>
                          <Package size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />
                          {entrada.cantidad_recibida}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge-talla">{entrada.talla}</span>
                        </td>
                        <td style={{ color: '#f87171' }}>
                          <DollarSign size={12} style={{ display: 'inline' }} />
                          {entrada.costo_unitario_proveedor.toFixed(2)}
                        </td>
                        <td style={{ color: '#34d399', fontWeight: 600 }}>
                          <DollarSign size={12} style={{ display: 'inline' }} />
                          {entrada.precio_unitario_base.toFixed(2)}
                        </td>
                        <td style={{ color: '#fbbf24', fontWeight: 600 }}>
                          <DollarSign size={12} style={{ display: 'inline' }} />
                          {gananciaTotal.toFixed(2)}
                        </td>
                        <td>
                          <span className="badge-tipo">{entrada.tipo_movimiento}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="boton-eliminar-entrada"
                            onClick={() => handleEliminar(entrada.id_entrada)}
                            disabled={eliminando === entrada.id_entrada}
                            title="Eliminar entrada"
                          >
                            <Trash2 size={16} />
                          </button>
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

