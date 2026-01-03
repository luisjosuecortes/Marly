import './Encabezado.css'

export type Pagina = 'ventas' | 'inventario' | 'entradas' | 'estadisticas'

interface PropsEncabezado {
  paginaActual: Pagina
  cambiarPagina: (pagina: Pagina) => void
}

export function Encabezado({ paginaActual, cambiarPagina }: PropsEncabezado) {
  return (
    <header className="encabezado">
      <div className="contenedor-logo">
        {/* Icono de camiseta (SVG inline) */}
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
        <span className="texto-logo">Marly</span>
      </div>

      <nav className="navegacion">
        <button
          className={`boton-nav ${paginaActual === 'ventas' ? 'activo' : ''}`}
          onClick={() => cambiarPagina('ventas')}
        >
          Ventas
        </button>
        <button
          className={`boton-nav ${paginaActual === 'inventario' ? 'activo' : ''}`}
          onClick={() => cambiarPagina('inventario')}
        >
          Inventario
        </button>
        <button
          className={`boton-nav ${paginaActual === 'entradas' ? 'activo' : ''}`}
          onClick={() => cambiarPagina('entradas')}
        >
          Entradas
        </button>
        <button
          className={`boton-nav ${paginaActual === 'estadisticas' ? 'activo' : ''}`}
          onClick={() => cambiarPagina('estadisticas')}
        >
          Estadísticas
        </button>
      </nav>
    </header>
  )
}
