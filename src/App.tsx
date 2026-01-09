import { useState } from 'react'
import { Encabezado, type Pagina } from './componentes/Encabezado'
import { VentasNuevo } from './paginas/VentasNuevo'
import { InventarioNuevo } from './paginas/InventarioNuevo'
import { EntradasNuevo } from './paginas/EntradasNuevo'
import { Estadisticas } from './paginas/Estadisticas'
import { ModalAdmin } from './componentes/ModalAdmin'
import { Shield } from 'lucide-react'
import './App.css'

function App() {
  const [paginaActual, setPaginaActual] = useState<Pagina>('ventas')
  const [modoAdmin, setModoAdmin] = useState(false)
  const [mostrarModalAdmin, setMostrarModalAdmin] = useState(false)

  const cerrarSesionAdmin = () => {
    setModoAdmin(false)
    setPaginaActual('ventas')
  }

  const renderizarPagina = () => {
    switch (paginaActual) {
      case 'ventas':
        return <VentasNuevo />
      case 'inventario':
        return <InventarioNuevo />
      case 'entradas':
        return <EntradasNuevo />
      case 'estadisticas':
        return <Estadisticas />
      default:
        return <VentasNuevo />
    }
  }

  return (
    <>
      {/* Header con logo para modo cajera */}
      {!modoAdmin && (
        <header className="encabezado-cajera">
          <div className="contenedor-logo-cajera">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="icono-logo"
            >
              <path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
            </svg>
            <span className="texto-logo">MarlyJeans</span>
          </div>
        </header>
      )}

      {/* Header completo para admin */}
      {modoAdmin && (
        <Encabezado
          paginaActual={paginaActual}
          cambiarPagina={setPaginaActual}
          cerrarSesionAdmin={cerrarSesionAdmin}
        />
      )}

      <main className={`contenedor-aplicacion ${!modoAdmin ? 'modo-cajera' : ''}`}>
        {renderizarPagina()}
      </main>

      {/* Botón flotante de admin cuando es modo cajera */}
      {!modoAdmin && (
        <button
          className="btn-admin-flotante"
          onClick={() => setMostrarModalAdmin(true)}
          title="Acceso administrador"
        >
          <Shield size={20} />
        </button>
      )}

      {mostrarModalAdmin && (
        <ModalAdmin
          alCerrar={() => setMostrarModalAdmin(false)}
          alAutenticar={() => setModoAdmin(true)}
        />
      )}
    </>
  )
}

export default App
