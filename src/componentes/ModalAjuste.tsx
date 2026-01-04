import { useState } from 'react'
import { X, Save, AlertCircle } from 'lucide-react'
import './ModalAjuste.css'

interface PropsModalAjuste {
  producto: {
    folio_producto: string
    nombre_producto: string
    stock_actual: number
    tallas_detalle?: { talla: string; cantidad: number }[]
  }
  alCerrar: () => void
  alGuardar: (nuevoStock: number, motivo: string, talla: string) => Promise<void>
}

export function ModalAjuste({ producto, alCerrar, alGuardar }: PropsModalAjuste) {
  // Obtener tallas disponibles o usar una por defecto si no hay detalle
  const tallas = producto.tallas_detalle && producto.tallas_detalle.length > 0
    ? producto.tallas_detalle
    : [{ talla: 'Única', cantidad: producto.stock_actual }]

  const [tallaSeleccionada, setTallaSeleccionada] = useState(tallas[0].talla)
  // Inicializar stock con la cantidad de la primera talla
  const [nuevoStock, setNuevoStock] = useState(tallas[0].cantidad)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Actualizar stock visualizado al cambiar talla
  const cambiarTalla = (nuevaTalla: string) => {
    setTallaSeleccionada(nuevaTalla)
    const tallaInfo = tallas.find(t => t.talla === nuevaTalla)
    setNuevoStock(tallaInfo ? tallaInfo.cantidad : 0)
  }

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    if (nuevoStock < 0) {
      setError('El stock no puede ser negativo')
      return
    }

    if (!tallaSeleccionada) {
      setError('Debes seleccionar una talla')
      return
    }

    setGuardando(true)
    try {
      await alGuardar(nuevoStock, motivo, tallaSeleccionada)
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
            <label>Talla a Ajustar</label>
            <select
              value={tallaSeleccionada}
              onChange={(e) => cambiarTalla(e.target.value)}
              className="select-talla-ajuste"
              style={{
                width: '100%',
                padding: '0.5rem',
                marginBottom: '1rem',
                background: 'rgba(15, 23, 42, 0.5)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: '6px',
                color: '#e2e8f0'
              }}
            >
              {tallas.map(t => (
                <option key={t.talla} value={t.talla}>
                  {t.talla} (Actual: {t.cantidad})
                </option>
              ))}
            </select>
          </div>

          <div className="campo-ajuste">
            <label>Nuevo Stock para Talla {tallaSeleccionada}</label>
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

