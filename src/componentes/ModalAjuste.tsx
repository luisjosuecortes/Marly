import { useState } from 'react'
import { X, Save, AlertCircle } from 'lucide-react'
import './ModalAjuste.css'

interface PropsModalAjuste {
  producto: {
    folio_producto: string
    nombre_producto: string
    stock_actual: number
  }
  alCerrar: () => void
  alGuardar: (nuevoStock: number, motivo: string) => Promise<void>
}

export function ModalAjuste({ producto, alCerrar, alGuardar }: PropsModalAjuste) {
  const [nuevoStock, setNuevoStock] = useState(producto.stock_actual)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    if (nuevoStock < 0) {
      setError('El stock no puede ser negativo')
      return
    }

    setGuardando(true)
    try {
      await alGuardar(nuevoStock, motivo)
      alCerrar()
    } catch (err) {
      setError('Error al actualizar el stock')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-contenido">
        <header className="modal-header">
          <h3>Ajuste de Stock</h3>
          <button className="boton-cerrar-modal" onClick={alCerrar}>
            <X size={20} />
          </button>
        </header>

        <form onSubmit={manejarEnvio}>
          <div className="info-producto">
            <p className="folio">{producto.folio_producto}</p>
            <p className="nombre">{producto.nombre_producto}</p>
          </div>

          <div className="campo-ajuste">
            <label>Stock Actual</label>
            <div className="control-numerico">
              <button 
                type="button" 
                onClick={() => setNuevoStock(prev => Math.max(0, prev - 1))}
                className="btn-control"
              >-</button>
              <input 
                type="number" 
                value={nuevoStock} 
                onChange={(e) => setNuevoStock(parseInt(e.target.value) || 0)}
                min="0"
              />
              <button 
                type="button" 
                onClick={() => setNuevoStock(prev => prev + 1)}
                className="btn-control"
              >+</button>
            </div>
          </div>

          <div className="campo-motivo">
            <label>Motivo del ajuste (Opcional)</label>
            <textarea 
              value={motivo} 
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. Auditoría mensual, Pérdida, Regalo..."
              rows={2}
            />
          </div>

          {error && (
            <div className="error-modal">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="acciones-modal">
            <button type="button" className="boton-cancelar" onClick={alCerrar}>
              Cancelar
            </button>
            <button type="submit" className="boton-guardar" disabled={guardando}>
              {guardando ? 'Guardando...' : (
                <>
                  <Save size={16} /> Guardar Ajuste
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

