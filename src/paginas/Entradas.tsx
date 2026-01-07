import { useMemo, useState } from 'react'
import { FormularioProducto } from '../componentes/FormularioProducto/FormularioProducto'
import { useProductos } from '../hooks/useProductos'
import { ModalProveedores } from '../componentes/ModalProveedores'
import { ModalHistorialEntradas } from '../componentes/ModalHistorialEntradas.tsx'
import { ModalAjuste } from '../componentes/ModalAjuste'
import { CheckCircle2, Plus, Package, Search, Building2, History, Filter, Edit2 } from 'lucide-react'
import './Entradas.css'

export function Entradas() {
  const { productos, recargarProductos } = useProductos()
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [mostrarProveedores, setMostrarProveedores] = useState(false)
  const [exito, setExito] = useState(false)
  const [mensajeExito, setMensajeExito] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('Todas')
  const [talla, setTalla] = useState('Todas')
  const [productoHistorial, setProductoHistorial] = useState<any | null>(null)
  const [productoAEditar, setProductoAEditar] = useState<any | null>(null)

  const manejarGuardar = async (datos: { producto: any, entrada: any, esExistente: boolean }) => {
    if (datos.esExistente) {
      await window.ipcRenderer.registrarEntradaExistente({
        ...datos.entrada,
        folio_producto: datos.producto.folio_producto
      })
      setMensajeExito('Stock actualizado correctamente.')
    } else {
      await window.ipcRenderer.registrarNuevoProducto(datos)
      setMensajeExito('Producto registrado correctamente.')
    }

    await recargarProductos()
    setExito(true)
    setTimeout(() => setExito(false), 3000)
    setMostrarFormulario(false)
  }

  const manejarGuardarAjuste = async (nuevoStock: number, motivo: string, talla: string) => {
    if (!productoAEditar) return

    await window.ipcRenderer.actualizarStock({
      folio_producto: productoAEditar.folio_producto,
      nuevo_stock: nuevoStock,
      talla,
      motivo,
      responsable: 'Admin'
    })

    await recargarProductos()
    setMensajeExito('Stock ajustado correctamente.')
    setExito(true)
    setTimeout(() => setExito(false), 3000)
  }

  // Listas para dropdowns
  const categorias = ['Todas', ...Array.from(new Set(productos.map(p => p.categoria)))]
  const tallasDisponibles = ['Todas', ...Array.from(new Set(productos.flatMap(p => p.tallas_detalle ? p.tallas_detalle.map(t => t.talla) : []))).sort()]

  const productosFiltrados = useMemo(() => {
    return productos.filter(p => {
      const coincideBusqueda =
        !busqueda.trim() ||
        p.folio_producto.toLowerCase().includes(busqueda.trim().toLowerCase()) ||
        (p.nombre_producto ?? '').toLowerCase().includes(busqueda.trim().toLowerCase())

      const coincideCategoria = categoria === 'Todas' || p.categoria === categoria

      const coincideTalla = talla === 'Todas' || (p.tallas_detalle && p.tallas_detalle.some(t => t.talla === talla))

      return coincideBusqueda && coincideCategoria && coincideTalla
    })
  }, [productos, busqueda, categoria, talla])

  return (
    <div className={`pagina-contenido ${mostrarFormulario ? 'layout-dividido' : ''}`}>
      <div className="layout-entradas">
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
              <p className="etiqueta">Registro</p>
              <h1 className="tabla-titulo">Entradas de Mercancía</h1>
            </div>
            {!mostrarFormulario && (
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button
                  className="accion-secundaria"
                  onClick={() => setMostrarProveedores(true)}
                  title="Gestionar Proveedores"
                >
                  <Building2 size={18} />
                  Proveedores
                </button>
                <button
                  className="accion-primaria"
                  onClick={() => setMostrarFormulario(true)}
                >
                  <Plus size={18} />
                  Nueva Entrada
                </button>
              </div>
            )}
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
                <p>No hay productos registrados.</p>
                <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                  Haz clic en "Nueva Entrada" para comenzar.
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
                      <th style={{ textAlign: 'center' }}>Detalle Tallas</th>
                      <th style={{ textAlign: 'center' }}>Stock Total</th>
                      <th style={{ textAlign: 'center' }}>Proveedor</th>
                      <th style={{ textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosFiltrados.map((producto) => (
                      <tr key={producto.folio_producto}>
                        <td style={{ fontFamily: 'monospace', color: '#94a3b8', textAlign: 'center' }}>
                          {producto.folio_producto}
                        </td>
                        <td style={{ textAlign: 'center' }}>{producto.nombre_producto || '0'}</td>
                        <td style={{ textAlign: 'center' }}>{producto.categoria}</td>
                        <td style={{ color: '#cbd5e1', fontSize: '0.85rem', textAlign: 'center' }}>
                          {producto.tallas_detalle && producto.tallas_detalle.length > 0 ? (
                            producto.tallas_detalle
                              .map((t: any) => `${t.talla}: ${t.cantidad}`)
                              .join(', ')
                          ) : (
                            <span style={{ color: '#94a3b8' }}>0</span>
                          )}
                        </td>
                        <td style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: '1rem', textAlign: 'center' }}>
                          {producto.stock_actual}
                        </td>
                        <td style={{ color: '#cbd5e1', textAlign: 'center' }}>{producto.proveedor || '0'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            <button
                              className="btn-accion"
                              title="Ver Historial de Entradas y Precios"
                              onClick={() => setProductoHistorial(producto)}
                            >
                              <History size={16} />
                            </button>
                            <button
                              className="btn-accion"
                              title="Ajustar Stock"
                              onClick={() => setProductoAEditar(producto)}
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

        {mostrarFormulario && (
          <div className="columna-formulario">
            <FormularioProducto
              alGuardar={manejarGuardar}
              alCerrar={() => setMostrarFormulario(false)}
            />
          </div>
        )}
      </div>

      {mostrarProveedores && (
        <ModalProveedores alCerrar={() => setMostrarProveedores(false)} />
      )}

      {productoHistorial && (
        <ModalHistorialEntradas
          folio={productoHistorial.folio_producto}
          nombreProducto={productoHistorial.nombre_producto || 'Sin nombre'}
          alCerrar={() => setProductoHistorial(null)}
        />
      )}

      {productoAEditar && (
        <ModalAjuste
          producto={productoAEditar}
          alCerrar={() => setProductoAEditar(null)}
          alGuardar={manejarGuardarAjuste}
        />
      )}
    </div>
  )
}
