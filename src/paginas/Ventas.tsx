import { useMemo, useState } from 'react'
import { FormularioVenta } from '../componentes/FormularioVenta/FormularioVenta'
import { useProductos } from '../hooks/useProductos'
import { VistaClientes } from '../componentes/VistaClientes'
import { ModalHistorialVentas } from '../componentes/ModalHistorialVentas'
import { CheckCircle2, Plus, ShoppingBag, Search, User, History } from 'lucide-react'
import './Ventas.css'

export function Ventas() {
  const { productos, recargarProductos } = useProductos()
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [mostrarClientes, setMostrarClientes] = useState(false)
  const [exito, setExito] = useState(false)
  const [mensajeExito, setMensajeExito] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [productoHistorial, setProductoHistorial] = useState<any | null>(null)

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

  // Si se está mostrando la vista de clientes, reemplazar todo el contenido
  if (mostrarClientes) {
    return (
      <div className="pagina-contenido">
        <VistaClientes alCerrar={() => setMostrarClientes(false)} />
      </div>
    )
  }

  return (
    <div className={`pagina-contenido ${mostrarFormulario ? 'layout-dividido' : ''}`}>
      <div className="layout-ventas">
        {exito && (
          <div className="notificacion-exito">
            <CheckCircle2 size={24} />
            <div>
              <strong>¡Operación exitosa!</strong>
              <p>{mensajeExito}</p>
            </div>
          </div>
        )}

        <div className="columna-tabla">
          <div className="tabla-header">
            <div className="tabla-header__info">
              <p className="etiqueta">Punto de Venta</p>
              <h1 className="tabla-titulo">Ventas</h1>
            </div>
            {mostrarFormulario ? (
              <div className="barra-busqueda">
                <div className="input-busqueda">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Buscar por folio o producto..."
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
                  className="accion-secundaria"
                  onClick={() => setMostrarClientes(true)}
                  title="Gestionar Clientes"
                >
                  <User size={18} />
                  Clientes
                </button>
                <button
                  className="accion-primaria"
                  onClick={() => setMostrarFormulario(true)}
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
                      <th>Folio</th>
                      <th>Producto</th>
                      <th>Categoría</th>
                      <th>Stock</th>
                      <th>Tallas</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosFiltrados.map((producto) => {
                      const tallasTexto = producto.tallas_detalle
                        ?.filter((t: any) => t.cantidad > 0)
                        .map((t: any) => `${t.talla}: ${t.cantidad}`)
                        .join(', ') || '0'
                      
                      return (
                        <tr key={producto.folio_producto}>
                          <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>
                            {producto.folio_producto}
                          </td>
                          <td>{producto.nombre_producto || '0'}</td>
                          <td>{producto.categoria}</td>
                          <td style={{ fontWeight: 'bold', color: producto.stock_actual > 0 ? '#34d399' : '#f87171' }}>
                            {producto.stock_actual}
                          </td>
                          <td style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{tallasTexto}</td>
                          <td>
                            <button 
                              className="btn-accion" 
                              title="Ver Historial de Ventas"
                              onClick={() => setProductoHistorial(producto)}
                            >
                              <History size={16} />
                            </button>
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
        
        {mostrarFormulario && (
          <div className="columna-formulario">
            <FormularioVenta 
              alGuardar={manejarGuardar} 
              alCerrar={() => setMostrarFormulario(false)}
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
