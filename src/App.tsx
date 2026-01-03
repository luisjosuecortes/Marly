import { useState } from 'react'
import { Encabezado, type Pagina } from './componentes/Encabezado'
import { Ventas } from './paginas/Ventas'
import { Inventario } from './paginas/Inventario'
import { Entradas } from './paginas/Entradas'
import { Estadisticas } from './paginas/Estadisticas'
import './App.css'

function App() {
  const [paginaActual, setPaginaActual] = useState<Pagina>('ventas')

  const renderizarPagina = () => {
    switch (paginaActual) {
      case 'ventas':
        return <Ventas />
      case 'inventario':
        return <Inventario />
      case 'entradas':
        return <Entradas />
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
