import { useMemo, useState } from 'react'
import { FormularioProducto } from '../componentes/FormularioProducto/FormularioProducto'
import { useProductos } from '../hooks/useProductos'
import { ModalProveedores } from '../componentes/ModalProveedores'
import { CheckCircle2, Plus, Package, Search, Building2 } from 'lucide-react'
import './Entradas.css'

export function Entradas() {
  const { productos, recargarProductos } = useProductos()
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [mostrarProveedores, setMostrarProveedores] = useState(false)
  const [exito, setExito] = useState(false)
  const [mensajeExito, setMensajeExito] = useState('')
  const [busqueda, setBusqueda] = useState('')

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

  const productosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return productos
    const termino = busqueda.trim().toLowerCase()
    return productos.filter((producto) =>
      producto.folio_producto.toLowerCase().includes(termino) ||
      (producto.nombre_producto ?? '').toLowerCase().includes(termino)
    )
  }, [busqueda, productos])

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
                      <th>Folio</th>
                      <th>Producto</th>
                      <th>Categoría</th>
                      <th>Stock</th>
                      <th>Proveedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosFiltrados.map((producto) => (
                      <tr key={producto.folio_producto}>
                        <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>
                          {producto.folio_producto}
                        </td>
                        <td>{producto.nombre_producto || '—'}</td>
                        <td>{producto.categoria}</td>
                        <td style={{ fontWeight: 'bold' }}>{producto.stock_actual}</td>
                        <td style={{ color: '#cbd5e1' }}>{producto.proveedor || '—'}</td>
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
    </div>
  )
}
