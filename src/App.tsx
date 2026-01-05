import { useState } from 'react'
import { Encabezado, type Pagina } from './componentes/Encabezado'
import { Ventas } from './paginas/Ventas'
import { InventarioNuevo } from './paginas/InventarioNuevo'
import { EntradasNuevo } from './paginas/EntradasNuevo'
import { Estadisticas } from './paginas/Estadisticas'
import './App.css'

function App() {
  const [paginaActual, setPaginaActual] = useState<Pagina>('ventas')

  const renderizarPagina = () => {
    switch (paginaActual) {
      case 'ventas':
        return <Ventas />
      case 'inventario':
        return <InventarioNuevo />
      case 'entradas':
        return <EntradasNuevo />
      case 'estadisticas':
        return <Estadisticas />
      default:
        return <Ventas />
    }
  }

  return (
    <>
      <Encabezado
        paginaActual={paginaActual}
        cambiarPagina={setPaginaActual}
      />
      <main className="contenedor-aplicacion">
        {renderizarPagina()}
      </main>
    </>
  )
}

export default App
