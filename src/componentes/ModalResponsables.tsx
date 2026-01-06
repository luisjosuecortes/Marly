import { useState, useEffect } from 'react'
import { X, Plus, Trash2, UserCheck } from 'lucide-react'
import './ModalProveedores.css' // Reusing same styles

interface Responsable {
    id_responsable: number
    nombre: string
}

interface PropsModalResponsables {
    alCerrar: () => void
}

export function ModalResponsables({ alCerrar }: PropsModalResponsables) {
    const [responsables, setResponsables] = useState<Responsable[]>([])
    const [nuevoResponsable, setNuevoResponsable] = useState('')
    const [cargando, setCargando] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        cargarResponsables()
    }, [])

    const cargarResponsables = async () => {
        setCargando(true)
        try {
            const datos = await window.ipcRenderer.getResponsables()
            setResponsables(datos)
        } catch (err) {
            console.error('Error cargando responsables:', err)
        } finally {
            setCargando(false)
        }
    }

    const manejarAgregar = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (!nuevoResponsable.trim()) {
            setError('El nombre del responsable no puede estar vacío.')
            return
        }

        try {
            await window.ipcRenderer.agregarResponsable(nuevoResponsable.trim())
            setNuevoResponsable('')
            await cargarResponsables()
            window.dispatchEvent(new CustomEvent('responsables-actualizados'))
        } catch (err: any) {
            setError(err?.message ?? 'Error al agregar el responsable')
        }
    }

    const manejarEliminar = async (id: number, nombre: string) => {
        if (!confirm(`¿Estás seguro de eliminar al responsable "${nombre}"?`)) {
            return
        }

        try {
            await window.ipcRenderer.eliminarResponsable(id)
            await cargarResponsables()
            window.dispatchEvent(new CustomEvent('responsables-actualizados'))
        } catch (err) {
            setError('Error al eliminar el responsable')
        }
    }

    return (
        <div className="modal-overlay" onClick={alCerrar}>
            <div className="modal-contenido-proveedores" onClick={(e) => e.stopPropagation()}>
                <header className="modal-header">
                    <div>
                        <h3>Gestión de Responsables</h3>
                        <p className="subtitulo-modal">Administra los responsables de ventas y entradas</p>
                    </div>
                    <button className="boton-cerrar-modal" onClick={alCerrar}>
                        <X size={20} />
                    </button>
                </header>

                <div className="contenido-proveedores">
                    <form onSubmit={manejarAgregar} className="formulario-agregar">
                        <div className="input-grupo">
                            <UserCheck size={18} className="icono-input" />
                            <input
                                type="text"
                                placeholder="Nombre del responsable..."
                                value={nuevoResponsable}
                                onChange={(e) => setNuevoResponsable(e.target.value)}
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
                            <div className="cargando">Cargando responsables...</div>
                        ) : responsables.length === 0 ? (
                            <div className="sin-proveedores">
                                <UserCheck size={48} strokeWidth={1} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                                <p>No hay responsables registrados.</p>
                                <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', color: '#94a3b8' }}>
                                    Agrega responsables para asignarlos a ventas y entradas.
                                </p>
                            </div>
                        ) : (
                            <ul>
                                {responsables.map((responsable) => (
                                    <li key={responsable.id_responsable}>
                                        <span>{responsable.nombre}</span>
                                        <button
                                            className="btn-eliminar"
                                            onClick={() => manejarEliminar(responsable.id_responsable, responsable.nombre)}
                                            title="Eliminar responsable"
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
