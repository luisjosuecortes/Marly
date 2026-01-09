import { useState } from 'react'
import { Lock, X, Shield, ShieldCheck } from 'lucide-react'
import './ModalAdmin.css'

interface PropsModalAdmin {
    alCerrar: () => void
    alAutenticar: () => void
}

const CLAVE_ADMIN = 'admin507'

export function ModalAdmin({ alCerrar, alAutenticar }: PropsModalAdmin) {
    const [clave, setClave] = useState('')
    const [error, setError] = useState(false)
    const [exito, setExito] = useState(false)

    const manejarSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (clave === CLAVE_ADMIN) {
            setExito(true)
            setError(false)
            setTimeout(() => {
                alAutenticar()
                alCerrar()
            }, 800)
        } else {
            setError(true)
            setClave('')
        }
    }

    return (
        <div className="modal-admin-overlay" onClick={alCerrar}>
            <div className="modal-admin" onClick={(e) => e.stopPropagation()}>
                <button className="btn-cerrar-admin" onClick={alCerrar}>
                    <X size={20} />
                </button>

                <div className="modal-admin-header">
                    <div className={`icono-admin ${exito ? 'exito' : ''}`}>
                        {exito ? <ShieldCheck size={40} /> : <Shield size={40} />}
                    </div>
                    <h2>Acceso Administrador</h2>
                    <p>Ingresa la contraseña para desbloquear todas las funciones</p>
                </div>

                {exito ? (
                    <div className="mensaje-exito">
                        <p>¡Acceso concedido!</p>
                    </div>
                ) : (
                    <form onSubmit={manejarSubmit} className="form-admin">
                        <div className="campo-clave">
                            <Lock size={20} className="icono-clave" />
                            <input
                                type="password"
                                value={clave}
                                onChange={(e) => { setClave(e.target.value); setError(false) }}
                                placeholder="Contraseña"
                                autoFocus
                                className={error ? 'error' : ''}
                            />
                        </div>
                        {error && (
                            <p className="mensaje-error">Contraseña incorrecta</p>
                        )}
                        <button type="submit" className="btn-acceder">
                            Acceder
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}
