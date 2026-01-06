import { useState, useEffect } from 'react'
import { X, Plus, Trash2, User } from 'lucide-react'
import './ModalClientes.css'

interface Cliente {
  id_cliente: number
  nombre_completo: string
  telefono: string | null
  saldo_pendiente: number
  estado_cuenta: string
}

interface PropsModalClientes {
  alCerrar: () => void
}

export function ModalClientes({ alCerrar }: PropsModalClientes) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [nuevoCliente, setNuevoCliente] = useState({
    nombre_completo: '',
    telefono: '',
    saldo_pendiente: 0
  })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    cargarClientes()
  }, [])

  const cargarClientes = async () => {
    setCargando(true)
    try {
      const datos = await window.ipcRenderer.getClientes()
      setClientes(datos)
    } catch (err) {
      console.error('Error cargando clientes:', err)
    } finally {
      setCargando(false)
    }
  }

  const manejarAgregar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!nuevoCliente.nombre_completo.trim()) {
      setError('El nombre del cliente es obligatorio.')
      return
    }

    try {
      await window.ipcRenderer.agregarCliente({
        nombre_completo: nuevoCliente.nombre_completo.trim(),
        telefono: nuevoCliente.telefono.trim() || null,
        saldo_pendiente: parseFloat(String(nuevoCliente.saldo_pendiente)) || 0
      })
      setNuevoCliente({ nombre_completo: '', telefono: '', saldo_pendiente: 0 })
      await cargarClientes()
      window.dispatchEvent(new CustomEvent('clientes-actualizados'))
    } catch (err: any) {
      setError(err?.message ?? 'Error al agregar el cliente')
    }
  }

  const manejarEliminar = async (id: number, nombre: string) => {
    if (!confirm(`¿Estás seguro de eliminar al cliente "${nombre}"?`)) {
      return
    }

    try {
      await window.ipcRenderer.eliminarCliente(id)
      await cargarClientes()
      window.dispatchEvent(new CustomEvent('clientes-actualizados'))
    } catch (err: any) {
      setError(err?.message ?? 'Error al eliminar el cliente')
    }
  }

  const formatearSaldo = (saldo: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(saldo)
  }

  return (
    <div className="modal-overlay" onClick={alCerrar}>
      <div className="modal-contenido-clientes" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h3>Gestión de Clientes</h3>
            <p className="subtitulo-modal">Administra la información de tus clientes</p>
          </div>
          <button className="boton-cerrar-modal" onClick={alCerrar}>
            <X size={20} />
          </button>
        </header>

        <div className="contenido-clientes">
          <form onSubmit={manejarAgregar} className="formulario-agregar">
            <div className="input-grupo">
              <User size={18} className="icono-input" />
              <input
                type="text"
                placeholder="Nombre completo..."
                value={nuevoCliente.nombre_completo}
                onChange={(e) => setNuevoCliente({ ...nuevoCliente, nombre_completo: e.target.value })}
                autoFocus
              />
            </div>
            <div className="input-grupo">
              <input
                type="tel"
                placeholder="Teléfono (opcional)..."
                value={nuevoCliente.telefono}
                onChange={(e) => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })}
              />
            </div>
            <div className="input-grupo">
              <input
                type="number"
                step="50"
                min="0"
                placeholder="Saldo pendiente inicial (opcional)..."
                value={nuevoCliente.saldo_pendiente || ''}
                onChange={(e) => setNuevoCliente({ ...nuevoCliente, saldo_pendiente: parseFloat(e.target.value) || 0 })}
              />
              <button type="submit" className="btn-agregar">
                <Plus size={16} />
                Agregar
              </button>
            </div>
            {error && <div className="error-mensaje">{error}</div>}
          </form>

          <div className="lista-clientes">
            {cargando ? (
              <div className="cargando">Cargando clientes...</div>
            ) : clientes.length === 0 ? (
              <div className="sin-clientes">
                <User size={48} strokeWidth={1} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                <p>No hay clientes registrados.</p>
                <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', color: '#94a3b8' }}>
                  Agrega clientes para gestionar créditos, apartados y préstamos.
                </p>
              </div>
            ) : (
              <ul>
                {clientes.map((cliente) => (
                  <li key={cliente.id_cliente}>
                    <div className="info-cliente">
                      <div>
                        <span className="nombre-cliente">{cliente.nombre_completo}</span>
                        {cliente.telefono && (
                          <span className="telefono-cliente">{cliente.telefono}</span>
                        )}
                      </div>
                      <div className="detalles-cliente">
                        <span className={`badge-estado ${cliente.estado_cuenta.toLowerCase().replace(' ', '-')}`}>
                          {cliente.estado_cuenta}
                        </span>
                        {cliente.saldo_pendiente > 0 && (
                          <span className="saldo-pendiente">
                            Saldo: {formatearSaldo(cliente.saldo_pendiente)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      className="btn-eliminar"
                      onClick={() => manejarEliminar(cliente.id_cliente, cliente.nombre_completo)}
                      title="Eliminar cliente"
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

