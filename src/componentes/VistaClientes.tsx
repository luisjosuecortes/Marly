import { useState, useEffect } from 'react'
import { X, Plus, Trash2, User, Search, History, DollarSign } from 'lucide-react'
import { ModalHistorialCliente } from './ModalHistorialCliente'
import { ModalProductosPendientes } from './ModalProductosPendientes'
import './VistaClientes.css'

interface Cliente {
  id_cliente: number
  nombre_completo: string
  telefono: string | null
  saldo_pendiente: number
  estado_cuenta: string
}

interface PropsVistaClientes {
  alCerrar: () => void
}

export function VistaClientes({ alCerrar }: PropsVistaClientes) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState({
    nombre_completo: '',
    telefono: '',
    saldo_pendiente: 0
  })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [mostrarHistorial, setMostrarHistorial] = useState<{ id: number; nombre: string } | null>(null)
  const [mostrarProductosPendientes, setMostrarProductosPendientes] = useState<{ id: number; nombre: string; saldo: number } | null>(null)

  useEffect(() => {
    cargarClientes()

    const handleActualizacion = () => {
      cargarClientes()
    }
    window.addEventListener('clientes-actualizados', handleActualizacion)

    return () => {
      window.removeEventListener('clientes-actualizados', handleActualizacion)
    }
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

    if (!nuevoCliente.telefono.trim()) {
      setError('El teléfono del cliente es obligatorio.')
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
      setMostrarFormulario(false)
    } catch (err: any) {
      setError(err?.message ?? 'Error al agregar el cliente')
    }
  }

  const clientesFiltrados = clientes.filter((cliente) => {
    if (!busqueda.trim()) return true
    const termino = busqueda.trim().toLowerCase()
    return (
      cliente.nombre_completo.toLowerCase().includes(termino) ||
      (cliente.telefono || '').toLowerCase().includes(termino)
    )
  })

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
    <div className={`vista-clientes ${mostrarFormulario ? 'layout-dividido' : ''}`}>
      <div className="layout-clientes">
        <div className="columna-tabla">
          <div className="tabla-header">
            <div className="tabla-header__info">
              <p className="etiqueta">Gestión</p>
              <h1 className="tabla-titulo">Clientes</h1>
            </div>
            {mostrarFormulario ? (
              <div className="barra-busqueda">
                <div className="input-busqueda">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Buscar por nombre o teléfono..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                  />
                </div>
                {busqueda && (
                  <button className="btn-limpiar" onClick={() => setBusqueda('')}>
                    Limpiar
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button
                  className="boton-cerrar-vista"
                  onClick={alCerrar}
                  title="Volver a Ventas"
                >
                  <X size={18} />
                </button>
                <button
                  className="accion-primaria"
                  onClick={() => setMostrarFormulario(true)}
                >
                  <Plus size={18} />
                  Añadir Cliente
                </button>
              </div>
            )}
          </div>

          <div className="tabla-contenedor">
            {cargando ? (
              <div className="tabla-vacia">
                <User size={48} strokeWidth={1} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <p>Cargando clientes...</p>
              </div>
            ) : clientes.length === 0 ? (
              <div className="tabla-vacia">
                <User size={48} strokeWidth={1} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <p>No hay clientes registrados.</p>
                <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                  Haz clic en "Añadir Cliente" para comenzar.
                </p>
              </div>
            ) : clientesFiltrados.length === 0 ? (
              <div className="tabla-vacia">
                <Search size={48} strokeWidth={1} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <p>No encontramos resultados para "{busqueda}".</p>
                <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                  Ajusta tu búsqueda o limpia el filtro.
                </p>
              </div>
            ) : (
              <div className="tabla-scroll">
                <table className="tabla-inventario">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Teléfono</th>
                      <th>Estado</th>
                      <th>Saldo Pendiente</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientesFiltrados.map((cliente) => (
                      <tr key={cliente.id_cliente}>
                        <td style={{ fontWeight: 600, color: '#e2e8f0' }}>
                          {cliente.nombre_completo}
                        </td>
                        <td style={{ color: '#94a3b8' }}>
                          {cliente.telefono || '0'}
                        </td>
                        <td>
                          <span className={`badge-estado ${cliente.estado_cuenta.toLowerCase().replace(' ', '-')}`}>
                            {cliente.estado_cuenta}
                          </span>
                        </td>
                        <td style={{
                          fontWeight: 600,
                          color: cliente.saldo_pendiente > 0 ? '#fbbf24' : '#94a3b8'
                        }}>
                          {formatearSaldo(cliente.saldo_pendiente)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {(cliente.saldo_pendiente > 0 || cliente.estado_cuenta === 'Con saldo') && (
                              <button
                                className="btn-productos-pendientes"
                                onClick={() => setMostrarProductosPendientes({
                                  id: cliente.id_cliente,
                                  nombre: cliente.nombre_completo,
                                  saldo: cliente.saldo_pendiente
                                })}
                                title="Ver productos pendientes y abonar"
                              >
                                <DollarSign size={16} />
                              </button>
                            )}
                            <button
                              className="btn-historial-cliente"
                              onClick={() => setMostrarHistorial({ id: cliente.id_cliente, nombre: cliente.nombre_completo })}
                              title="Ver historial"
                            >
                              <History size={16} />
                            </button>
                            <button
                              className="btn-eliminar-cliente"
                              onClick={() => manejarEliminar(cliente.id_cliente, cliente.nombre_completo)}
                              title="Eliminar cliente"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {mostrarFormulario && (
          <div className="columna-formulario">
            <div className="panel-formulario-cliente">
              <header className="formulario-encabezado">
                <div>
                  <p className="etiqueta">Registro</p>
                  <h2>Nuevo Cliente</h2>
                </div>
                <button type="button" className="boton-cerrar" onClick={() => setMostrarFormulario(false)}>
                  <X size={18} />
                </button>
              </header>

              <form className="formulario-cliente" onSubmit={manejarAgregar}>
                {error && (
                  <div className="mensaje-error">
                    <span>{error}</span>
                  </div>
                )}

                <div className="seccion-formulario-limpia">
                  <div className="fila-formulario">
                    <div className="grupo-formulario" style={{ flex: 1 }}>
                      <label htmlFor="nombre_completo">Nombre Completo</label>
                      <input
                        id="nombre_completo"
                        type="text"
                        placeholder="Ej. Juan Pérez"
                        value={nuevoCliente.nombre_completo}
                        onChange={(e) => setNuevoCliente({ ...nuevoCliente, nombre_completo: e.target.value })}
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="fila-formulario">
                    <div className="grupo-formulario" style={{ flex: 1 }}>
                      <label htmlFor="telefono">Teléfono</label>
                      <input
                        id="telefono"
                        type="tel"
                        placeholder="Ej. 5551234567"
                        value={nuevoCliente.telefono}
                        onChange={(e) => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="fila-formulario">
                    <div className="grupo-formulario" style={{ flex: 1 }}>
                      <label htmlFor="saldo_pendiente">Saldo Pendiente Inicial (opcional)</label>
                      <input
                        id="saldo_pendiente"
                        type="number"
                        step="50"
                        min="0"
                        placeholder="0.00"
                        value={nuevoCliente.saldo_pendiente || ''}
                        onChange={(e) => setNuevoCliente({ ...nuevoCliente, saldo_pendiente: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                </div>

                <div className="acciones-formulario">
                  <button type="button" className="boton-secundario" onClick={() => setMostrarFormulario(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="boton-primario">
                    <Plus size={18} />
                    Agregar Cliente
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {mostrarHistorial && (
        <ModalHistorialCliente
          idCliente={mostrarHistorial.id}
          nombreCliente={mostrarHistorial.nombre}
          alCerrar={() => setMostrarHistorial(null)}
        />
      )}

      {mostrarProductosPendientes && (
        <ModalProductosPendientes
          idCliente={mostrarProductosPendientes.id}
          nombreCliente={mostrarProductosPendientes.nombre}
          saldoPendiente={mostrarProductosPendientes.saldo}
          alCerrar={() => setMostrarProductosPendientes(null)}
          onActualizar={cargarClientes}
        />
      )}
    </div>
  )
}

