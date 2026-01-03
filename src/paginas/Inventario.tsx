import { useState, useMemo } from 'react'
import { useProductos } from '../hooks/useProductos'
import { Package, AlertCircle, Filter, Edit2, Search, History } from 'lucide-react'
import { ModalAjuste } from '../componentes/ModalAjuste'
import { ModalHistorialInventario } from '../componentes/ModalHistorialInventario'
import './Inventario.css'

export function Inventario() {
  const { productos, cargando, error, recargarProductos } = useProductos()
  
  // Filtros
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('Todas')
  const [talla, setTalla] = useState('Todas')
  
  // Modales
  const [productoAEditar, setProductoAEditar] = useState<any | null>(null)
  const [productoHistorial, setProductoHistorial] = useState<any | null>(null)

  // Listas para dropdowns (podrían venir de BD o constantes)
  const categorias = ['Todas', ...Array.from(new Set(productos.map(p => p.categoria)))]
  const tallasDisponibles = ['Todas', ...Array.from(new Set(productos.flatMap(p => p.tallas_detalle ? p.tallas_detalle.map(t => t.talla) : []))).sort()]

  const productosFiltrados = useMemo(() => {
    return productos.filter(p => {
      const coincideBusqueda = 
        p.folio_producto.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.nombre_producto.toLowerCase().includes(busqueda.toLowerCase())
      
      const coincideCategoria = categoria === 'Todas' || p.categoria === categoria
      
      const coincideTalla = talla === 'Todas' || (p.tallas_detalle && p.tallas_detalle.some(t => t.talla === talla))

      return coincideBusqueda && coincideCategoria && coincideTalla
    })
  }, [productos, busqueda, categoria, talla])

  const manejarGuardarAjuste = async (nuevoStock: number, motivo: string) => {
    if (!productoAEditar) return
    
    await window.ipcRenderer.actualizarStock({
      folio_producto: productoAEditar.folio_producto,
      nuevo_stock: nuevoStock,
      motivo,
      responsable: 'Admin' // Podríamos pasar el usuario real si hubiera login
    })
    
    await recargarProductos()
  }

  if (cargando) {
    return <div className="pagina-contenido">Cargando inventario...</div>
  }

  if (error) {
    return (
      <div className="pagina-contenido">
        <div className="error-mensaje">
          <AlertCircle className="icono-error" />
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="pagina-contenido">
      {productoAEditar && (
        <ModalAjuste 
          producto={productoAEditar}
          alCerrar={() => setProductoAEditar(null)}
          alGuardar={manejarGuardarAjuste}
        />
      )}

      {productoHistorial && (
        <ModalHistorialInventario
          folio={productoHistorial.folio_producto}
          nombreProducto={productoHistorial.nombre_producto || 'Sin nombre'}
          alCerrar={() => setProductoHistorial(null)}
        />
      )}

      <div className="layout-inventario">
        <div className="columna-tabla">
          <div className="tabla-header">
            <div>
              <p className="etiqueta">Gestión</p>
              <h1 className="tabla-titulo">Inventario General</h1>
            </div>
          </div>

          <div className="filtros-container">
            <div className="input-busqueda-inventario">
              <Search size={18} className="icono-busqueda" />
              <input 
                type="text" 
                placeholder="Buscar por folio o nombre..." 
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            
            <div className="grupo-filtro">
              <Filter size={16} />
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="grupo-filtro">
              <span className="etiqueta-filtro">Talla:</span>
              <select value={talla} onChange={(e) => setTalla(e.target.value)}>
                {tallasDisponibles.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="tabla-contenedor">
            {productos.length === 0 ? (
              <div className="tabla-vacia">
                <Package size={48} strokeWidth={1} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <p>No hay productos registrados aún.</p>
                <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                  Ve a la sección de <strong>Entradas</strong> para registrar mercancía.
                </p>
              </div>
            ) : productosFiltrados.length === 0 ? (
               <div className="tabla-vacia">
                <Search size={48} strokeWidth={1} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <p>No se encontraron productos con los filtros seleccionados.</p>
              </div>
            ) : (
              <div className="tabla-scroll">
                <table className="tabla-inventario">
                  <thead>
                    <tr>
                      <th>Folio</th>
                      <th>Producto</th>
                      <th>Categoría</th>
                      <th>Estado</th>
                      <th>Detalle Tallas</th>
                      <th>Stock Total</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosFiltrados.map((producto) => (
                      <tr key={producto.folio_producto}>
                        <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>
                          {producto.folio_producto}
                        </td>
                        <td>{producto.nombre_producto || '0'}</td>
                        <td>{producto.categoria}</td>
                        <td>
                          <span className={`estado-badge estado-${producto.estado_producto.toLowerCase()}`}>
                            {producto.estado_producto}
                          </span>
                        </td>
                         <td style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>
                          {producto.tallas_detalle && producto.tallas_detalle.length > 0 ? (
                            <div className="lista-tallas">
                              {producto.tallas_detalle.map((t, idx) => (
                                <span key={idx} className="talla-badge" title={`Talla: ${t.talla}, Cantidad: ${t.cantidad}`}>
                                  <span className="talla-nombre">{t.talla}</span>
                                  <span className="talla-cantidad">{t.cantidad}</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>0</span>
                          )}
                        </td>
                        <td style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: '1rem' }}>
                          {producto.stock_actual}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                            <button 
                              className="btn-accion" 
                              title="Ver Historial de Movimientos"
                              onClick={() => setProductoHistorial(producto)}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <History size={16} />
                            </button>
                            <button 
                              className="btn-accion" 
                              title="Ajustar Stock"
                              onClick={() => setProductoAEditar(producto)}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Edit2 size={16} />
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
      </div>
    </div>
  )
}
