import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Building2 } from 'lucide-react'
import './ModalProveedores.css'

interface PropsModalProveedores {
  alCerrar: () => void
}

export function ModalProveedores({ alCerrar }: PropsModalProveedores) {
  const [proveedores, setProveedores] = useState<string[]>([])
  const [nuevoProveedor, setNuevoProveedor] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    cargarProveedores()
  }, [])

  const cargarProveedores = async () => {
    setCargando(true)
    try {
      const datos = await window.ipcRenderer.getProveedores()
      setProveedores(datos)
    } catch (err) {
      console.error('Error cargando proveedores:', err)
    } finally {
      setCargando(false)
    }
  }

  const manejarAgregar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!nuevoProveedor.trim()) {
      setError('El nombre del proveedor no puede estar vacío.')
      return
    }

    try {
      await window.ipcRenderer.agregarProveedor(nuevoProveedor.trim())
      setNuevoProveedor('')
      await cargarProveedores()
      // Notificar que se agregó un proveedor para que otros componentes recarguen
      window.dispatchEvent(new CustomEvent('proveedores-actualizados'))
    } catch (err: any) {
      setError(err?.message ?? 'Error al agregar el proveedor')
    }
  }

  const manejarEliminar = async (nombre: string) => {
    if (!confirm(`¿Estás seguro de eliminar el proveedor "${nombre}"?`)) {
      return
    }

    try {
      await window.ipcRenderer.eliminarProveedor(nombre)
      await cargarProveedores()
    } catch (err) {
      setError('Error al eliminar el proveedor')
    }
  }

  return (
    <div className="modal-overlay" onClick={alCerrar}>
      <div className="modal-contenido-proveedores" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h3>Gestión de Proveedores</h3>
            <p className="subtitulo-modal">Administra las marcas y proveedores disponibles</p>
          </div>
          <button className="boton-cerrar-modal" onClick={alCerrar}>
            <X size={20} />
          </button>
        </header>

        <div className="contenido-proveedores">
          <form onSubmit={manejarAgregar} className="formulario-agregar">
            <div className="input-grupo">
              <Building2 size={18} className="icono-input" />
              <input
                type="text"
                placeholder="Nombre del proveedor o marca..."
                value={nuevoProveedor}
                onChange={(e) => setNuevoProveedor(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn-agregar">
                <Plus size={16} />
                Agregar
              </button>
            </div>
            {error && <div className="error-mensaje">{error}</div>}
          </form>

          <div className="lista-proveedores">
            {cargando ? (
              <div className="cargando">Cargando proveedores...</div>
            ) : proveedores.length === 0 ? (
              <div className="sin-proveedores">
                <Building2 size={48} strokeWidth={1} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                <p>No hay proveedores registrados.</p>
                <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', color: '#94a3b8' }}>
                  Agrega proveedores para evitar discrepancias al registrar productos.
                </p>
              </div>
            ) : (
              <ul>
                {proveedores.map((proveedor) => (
                  <li key={proveedor}>
                    <span>{proveedor}</span>
                    <button
                      className="btn-eliminar"
                      onClick={() => manejarEliminar(proveedor)}
                      title="Eliminar proveedor"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

