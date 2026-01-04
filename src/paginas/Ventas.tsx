import { useMemo, useState } from 'react'
import { FormularioVenta } from '../componentes/FormularioVenta/FormularioVenta'
import { useProductos } from '../hooks/useProductos'
import { VistaClientes } from '../componentes/VistaClientes'
import { ModalHistorialVentas } from '../componentes/ModalHistorialVentas'
import { CheckCircle2, Plus, ShoppingBag, Search, User, History, X } from 'lucide-react'
import './Ventas.css'

export function Ventas() {
  const { productos, recargarProductos } = useProductos()
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [mostrarClientes, setMostrarClientes] = useState(false)
  const [exito, setExito] = useState(false)
  const [mensajeExito, setMensajeExito] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [productoHistorial, setProductoHistorial] = useState<any | null>(null)

  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [productoSeleccionado, setProductoSeleccionado] = useState<any | null>(null)

  // Filtrar solo productos con stock disponible
  const productosDisponibles = useMemo(() => {
    return productos.filter(p => p.stock_actual > 0)
  }, [productos])

  const manejarGuardar = async (datos: any) => {
    try {
      await window.ipcRenderer.registrarVenta(datos)
      setMensajeExito('Venta registrada correctamente.')
      await recargarProductos()
      setExito(true)
      setTimeout(() => setExito(false), 3000)
      setMostrarFormulario(false)
      setProductoSeleccionado(null)

      // Notificar actualización de productos
      window.dispatchEvent(new CustomEvent('productos-actualizados'))
    } catch (error: any) {
      throw new Error(error?.message || 'Error al registrar la venta.')
    }
  }

  const productosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return productosDisponibles
    const termino = busqueda.trim().toLowerCase()
    return productosDisponibles.filter((producto) =>
      producto.folio_producto.toLowerCase().includes(termino) ||
      (producto.nombre_producto ?? '').toLowerCase().includes(termino)
    )
  }, [busqueda, productosDisponibles])

  return (
    <div className={`pagina-contenido ${mostrarFormulario ? 'layout-dividido' : ''}`}>
      {/* Vista de Clientes (siempre montada pero oculta si no está activa) */}
      <div style={{ display: mostrarClientes ? 'block' : 'none', width: '100%' }}>
        <VistaClientes alCerrar={() => setMostrarClientes(false)} />
      </div>

      {/* Vista de Ventas (oculta si mostramos clientes) */}
      <div className="layout-ventas" style={{ display: !mostrarClientes ? 'flex' : 'none' }}>
        {exito && (
          <div className="notificacion-exito">
            <CheckCircle2 size={24} />
            <div>
              <strong>¡Operación exitosa!</strong>
              <p>{mensajeExito}</p>
            </div>
          </div>
        )}

        {!mostrarFormulario ? (
          <div className="columna-tabla">
            <div className="tabla-header">
              <div className="tabla-header__info">
                <p className="etiqueta">Punto de Venta</p>
                <h1 className="tabla-titulo">Ventas</h1>
              </div>

              {modoSeleccion ? (
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
                  <div className="buscador-header" style={{ position: 'relative', width: '100%', maxWidth: '600px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      type="text"
                      placeholder="Buscar producto por folio o nombre..."
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      autoFocus
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem 0.75rem 2.5rem',
                        backgroundColor: 'transparent',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '10px',
                        color: '#f8fafc',
                        outline: 'none',
                        fontSize: '0.95rem'
                      }}
                    />
                  </div>
                  <button
                    className="btn-cerrar-busqueda"
                    onClick={() => {
                      setModoSeleccion(false)
                      setBusqueda('')
                    }}
                    title="Cancelar búsqueda"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <button
                    className="accion-secundaria"
                    onClick={() => setMostrarClientes(true)}
                    title="Gestionar Clientes"
                  >
                    <User size={18} />
                    Clientes
                  </button>
                  <button
                    className="accion-primaria"
                    onClick={() => setModoSeleccion(true)}
                  >
                    <Plus size={18} />
                    Nueva Venta
                  </button>
                </div>
              )}
            </div>

            <div className="tabla-contenedor">
              {productosDisponibles.length === 0 ? (
                <div className="tabla-vacia">
                  <ShoppingBag size={48} strokeWidth={1} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <p>No hay productos disponibles para venta.</p>
                  <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    Registra entradas de mercancía para comenzar a vender.
                  </p>
                </div>
              ) : productosFiltrados.length === 0 ? (
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
                        <th style={{ textAlign: 'center' }}>Folio</th>
                        <th style={{ textAlign: 'center' }}>Producto</th>
                        <th style={{ textAlign: 'center' }}>Categoría</th>
                        <th style={{ textAlign: 'center' }}>Precio</th>
                        <th style={{ textAlign: 'center' }}>Stock</th>
                        <th style={{ textAlign: 'center' }}>Tallas</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productosFiltrados.map((producto) => {
                        const tallasTexto = producto.tallas_detalle
                          ?.filter((t: any) => t.cantidad > 0)
                          .map((t: any) => `${t.talla}: ${t.cantidad}`)
                          .join(', ') || '0'

                        const precioFormateado = new Intl.NumberFormat('es-MX', {
                          style: 'currency',
                          currency: 'MXN'
                        }).format(producto.ultimo_precio || 0)

                        return (
                          <tr key={producto.folio_producto}>
                            <td style={{ fontFamily: 'monospace', color: '#94a3b8', textAlign: 'center' }}>
                              {producto.folio_producto}
                            </td>
                            <td style={{ textAlign: 'center' }}>{producto.nombre_producto || '0'}</td>
                            <td style={{ textAlign: 'center' }}>{producto.categoria}</td>
                            <td style={{ fontWeight: 600, color: '#34d399', textAlign: 'center' }}>
                              {precioFormateado}
                            </td>
                            <td style={{ fontWeight: 'bold', color: producto.stock_actual > 0 ? '#34d399' : '#f87171', textAlign: 'center' }}>
                              {producto.stock_actual}
                            </td>
                            <td style={{ fontSize: '0.85rem', color: '#cbd5e1', textAlign: 'center' }}>{tallasTexto}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                {modoSeleccion && (
                                  <button
                                    className="btn-accion"
                                    title="Seleccionar para venta"
                                    onClick={() => {
                                      setProductoSeleccionado(producto)
                                      setMostrarFormulario(true)
                                      setModoSeleccion(false)
                                      setBusqueda('')
                                    }}
                                    style={{ color: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.1)' }}
                                  >
                                    <ShoppingBag size={16} />
                                  </button>
                                )}
                                <button
                                  className="btn-accion"
                                  title="Ver Historial de Ventas"
                                  onClick={() => setProductoHistorial(producto)}
                                >
                                  <History size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="columna-formulario-full">
            <FormularioVenta
              key={productoSeleccionado?.folio_producto || 'nueva-venta'}
              alGuardar={manejarGuardar}
              alCerrar={() => {
                setMostrarFormulario(false)
                setProductoSeleccionado(null)
              }}
              folioInicial={productoSeleccionado?.folio_producto}
            />
          </div>
        )}
      </div>

      {productoHistorial && (
        <ModalHistorialVentas
          folio={productoHistorial.folio_producto}
          nombreProducto={productoHistorial.nombre_producto || 'Sin nombre'}
          alCerrar={() => setProductoHistorial(null)}
        />
      )}
    </div>
  )
}
