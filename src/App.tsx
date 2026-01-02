import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [mensajePrincipal, establecerMensajePrincipal] = useState(
    'Esperando mensaje del proceso principal...',
  )
  const [accionesRegistradas, establecerAccionesRegistradas] = useState(0)

  useEffect(() => {
    const manejarMensaje = (_evento: unknown, mensaje: string) => {
      establecerMensajePrincipal(`Último mensaje recibido: ${mensaje}`)
    }

    window.ipcRenderer.on('main-process-message', manejarMensaje)

    return () => {
      window.ipcRenderer.off('main-process-message', manejarMensaje)
    }
  }, [])

  return (
    <main className="contenedor-aplicacion">
      <section className="panel-principal">
        <header>
          <p className="etiqueta">Proyecto base</p>
          <h1>Marly escritorio</h1>
          <p className="descripcion">
            Punto de partida limpio para crear interfaces de escritorio con
            Electron, React y Vite.
          </p>
        </header>

        <div className="tarjeta-estado">
          <p className="etiqueta">Proceso principal</p>
          <p className="valor-estado">{mensajePrincipal}</p>
        </div>

        <div className="acciones">
          <button
            type="button"
            onClick={() =>
              establecerAccionesRegistradas((valorActual) => valorActual + 1)
            }
          >
            Registrar acción
          </button>
          <p className="nota">
            Acciones registradas: <strong>{accionesRegistradas}</strong>
          </p>
        </div>
      </section>
    </main>
  )
}

export default App
