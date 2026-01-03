import { useState, useEffect } from 'react'
import { AlertCircle, Save, X, Search } from 'lucide-react'
import './FormularioProducto.css'

interface PropsFormularioProducto {
  alCerrar?: () => void
  alGuardar: (datos: { producto: any, entrada: any, esExistente: boolean }) => Promise<void>
}

const CATEGORIAS = [
  'Playera', 'Camisa', 'Pantalon', 'Blusa', 'Chamarra',
  'Sudadera', 'Gorra', 'Cinturon', 'Sueter', 'Leggin',
  'Vestido', 'Falda', 'Pans', 'Short'
]

const GENEROS = ['Hombre', 'Mujer', 'Niño', 'Niña']

const TALLAS = [
  'CH', 'M', 'G', 'XL', 'XXL',
  '2', '3', '4', '6', '8', '10', '12', '14', '16',
  '24/3', '26/5', '28/7', '30/9', '31', '32 (11)', '33', '34 (13)', '35', '36 (15)', '38 (17)',
  '40', '42', '44', '46', '48', 'Unitalla'
]

export function FormularioProducto({ alCerrar, alGuardar }: PropsFormularioProducto) {
  const [guardando, setGuardando] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [esExistente, setEsExistente] = useState(false)
  const [proveedores, setProveedores] = useState<string[]>([])

  // Cargar proveedores al montar y cuando se actualicen
  useEffect(() => {
    const cargarProveedores = async () => {
      try {
        const datos = await window.ipcRenderer.getProveedores()
        setProveedores(datos)
      } catch (err) {
        console.error('Error cargando proveedores:', err)
      }
    }
    cargarProveedores()

    // Escuchar eventos de actualización de proveedores
    const handleActualizacion = () => {
      cargarProveedores()
    }
    window.addEventListener('proveedores-actualizados', handleActualizacion)
    
    return () => {
      window.removeEventListener('proveedores-actualizados', handleActualizacion)
    }
  }, [])

  const [producto, setProducto] = useState({
    folio_producto: '',
    nombre_producto: '',
    categoria: CATEGORIAS[0],
    genero_destino: GENEROS[1],
    // estado_producto: 'Disponible', // Backend default
    // stock_minimo: 5, // Manualmente en ventas/ajustes
    proveedor: '',
    observaciones: '',
  })

  const [entrada, setEntrada] = useState({
    cantidad_recibida: 1,
    talla: TALLAS[0],
    costo_unitario_proveedor: 0,
    precio_unitario_base: 0,
    precio_unitario_promocion: 0,
    responsable_recepcion: '',
    observaciones_entrada: '',
  })

  // Detectar cambios en folio y buscar automáticamente
  useEffect(() => {
    const buscarProducto = async () => {
      if (!producto.folio_producto.trim()) {
        setEsExistente(false)
        return
      }

      setBuscando(true)
      try {
        const existente = await window.ipcRenderer.getProductoDetalle(producto.folio_producto)
        if (existente) {
          setEsExistente(true)
          setProducto(prev => ({ 
            ...prev, 
            nombre_producto: existente.nombre_producto || '',
            categoria: existente.categoria || CATEGORIAS[0],
            genero_destino: existente.genero_destino || GENEROS[1],
            proveedor: existente.proveedor || '',
            observaciones: existente.observaciones || ''
          }))
          
          // Obtener última entrada para pre-llenar costo y precio
          const ultimaEntrada = await window.ipcRenderer.getUltimaEntrada(producto.folio_producto)
          if (ultimaEntrada) {
            setEntrada(prev => ({
              ...prev,
              costo_unitario_proveedor: ultimaEntrada.costo_unitario_proveedor,
              precio_unitario_base: ultimaEntrada.precio_unitario_base
            }))
          }
        } else {
          setEsExistente(false)
          // Limpiar campos de entrada si no existe
          setEntrada(prev => ({
            ...prev,
            costo_unitario_proveedor: 0,
            precio_unitario_base: 0
          }))
        }
      } catch (err) {
        console.error('Error buscando producto:', err)
      } finally {
        setBuscando(false)
      }
    }

    const timeoutId = setTimeout(buscarProducto, 500) // Debounce de 500ms
    return () => clearTimeout(timeoutId)
  }, [producto.folio_producto])

  const manejarCambioProducto = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target
    setProducto((prev) => ({ ...prev, [name]: value }))
  }

  const manejarCambioEntrada = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target
    setEntrada((prev) => ({ ...prev, [name]: value }))
  }

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!producto.folio_producto.trim()) {
      setError('El folio es obligatorio.')
      return
    }

    if (!producto.nombre_producto.trim()) {
      setError('La descripción del producto es obligatoria.')
      return
    }

    if (!producto.proveedor) {
      setError('El proveedor es obligatorio.')
      return
    }

    if (entrada.cantidad_recibida <= 0) {
      setError('La cantidad recibida debe ser mayor a 0.')
      return
    }

    if (entrada.costo_unitario_proveedor <= 0 || entrada.precio_unitario_base <= 0) {
      setError('El costo y el precio de venta deben ser mayores a 0.')
      return
    }

    try {
      setGuardando(true)
      await alGuardar({
        producto,
        entrada: {
          ...entrada,
          fecha_entrada: new Date().toISOString(),
          tipo_movimiento: esExistente ? 'Reabastecimiento' : 'Entrada Inicial',
        },
        esExistente
      })
      if (alCerrar) alCerrar()
      if (!alCerrar) {
        // Reset parcial si no cierra
        setProducto(prev => ({ 
          ...prev, 
          folio_producto: '', 
          nombre_producto: '',
        }))
        setEntrada(prev => ({ ...prev, cantidad_recibida: 1, costo_unitario_proveedor: 0, precio_unitario_base: 0 }))
        setEsExistente(false)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Error al guardar el producto')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="panel-formulario">
      <header className="formulario-encabezado">
        <div>
          <p className="etiqueta">
            {esExistente ? 'Reabastecimiento de Stock' : 'Registro de Mercancía'}
          </p>
          <h2>{esExistente ? 'Producto Existente' : 'Nuevo Producto'}</h2>
        </div>
        {alCerrar && (
          <button type="button" className="boton-cerrar" onClick={alCerrar}>
            <X size={18} />
          </button>
        )}
      </header>

      <form className="formulario-producto" onSubmit={manejarEnvio}>
        {error && (
          <div className="mensaje-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* DATOS PRINCIPALES */}
        <div className="seccion-formulario-limpia">
          <h3 className="titulo-seccion"></h3>
          
          <div className="fila-formulario">
            <div className="grupo-formulario">
              <label htmlFor="folio_producto">Folio {buscando && <span style={{fontSize: '0.7em'}}>(Buscando...)</span>}</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="folio_producto"
                  name="folio_producto"
                  type="text"
                  placeholder="321-01"
                  value={producto.folio_producto}
                  onChange={manejarCambioProducto}
                  required
                  autoFocus
                />
                {esExistente && (
                  <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#34d399' }}>
                    <Search size={16} />
                  </div>
                )}
              </div>
            </div>
            <div className="grupo-formulario" style={{ flex: 2 }}>
              <label htmlFor="nombre_producto">Descripción</label>
              <input
                id="nombre_producto"
                name="nombre_producto"
                type="text"
                placeholder="Ej. Blusa Sophia verde"
                value={producto.nombre_producto}
                onChange={manejarCambioProducto}
                disabled={esExistente}
                required
                style={esExistente ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
              />
            </div>
          </div>

          <div className="fila-formulario">
            <div className="grupo-formulario">
              <label htmlFor="categoria">Categoría</label>
              <select
                id="categoria"
                name="categoria"
                value={producto.categoria}
                onChange={manejarCambioProducto}
                disabled={esExistente}
                style={esExistente ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
              >
                {CATEGORIAS.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="grupo-formulario">
              <label htmlFor="genero_destino">Género</label>
              <select
                id="genero_destino"
                name="genero_destino"
                value={producto.genero_destino}
                onChange={manejarCambioProducto}
                disabled={esExistente}
                style={esExistente ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
              >
                {GENEROS.map((gen) => (
                  <option key={gen} value={gen}>{gen}</option>
                ))}
              </select>
            </div>
             <div className="grupo-formulario">
              <label htmlFor="talla">Talla</label>
              <select
                id="talla"
                name="talla"
                value={entrada.talla}
                onChange={manejarCambioEntrada}
              >
                {TALLAS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ENTRADA Y PRECIOS */}
        <div className="seccion-formulario-limpia">
          <h3 className="titulo-seccion">Entrada y Precios</h3>

          <div className="fila-formulario">
            <div className="grupo-formulario">
              <label htmlFor="cantidad_recibida">Cantidad</label>
              <input
                id="cantidad_recibida"
                name="cantidad_recibida"
                type="number"
                min="1"
                value={entrada.cantidad_recibida}
                onChange={manejarCambioEntrada}
                required
              />
            </div>
            <div className="grupo-formulario">
              <label htmlFor="costo_unitario_proveedor">Costo ($)</label>
              <input
                id="costo_unitario_proveedor"
                name="costo_unitario_proveedor"
                type="number"
                min="0"
                step="0.50"
                value={entrada.costo_unitario_proveedor}
                onChange={manejarCambioEntrada}
                required
              />
            </div>
            <div className="grupo-formulario">
              <label htmlFor="precio_unitario_base">Venta ($)</label>
              <input
                id="precio_unitario_base"
                name="precio_unitario_base"
                type="number"
                min="0"
                step="0.50"
                value={entrada.precio_unitario_base}
                onChange={manejarCambioEntrada}
                required
              />
            </div>
          </div>
        </div>

        {/* DETALLES */}
        <div className="seccion-formulario-limpia">
          <h3 className="titulo-seccion">Detalles</h3>
          <div className="fila-formulario">
            <div className="grupo-formulario" style={{ flex: 1 }}>
              <label htmlFor="proveedor">Proveedor</label>
              <select
                id="proveedor"
                name="proveedor"
                value={producto.proveedor || ''}
                onChange={manejarCambioProducto}
                disabled={esExistente}
                required
                style={esExistente ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
              >
                <option value="">Seleccionar proveedor...</option>
                {proveedores.map(prov => (
                  <option key={prov} value={prov}>{prov}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="acciones-formulario">
          {alCerrar && (
            <button type="button" className="boton-secundario" onClick={alCerrar}>
              Cancelar
            </button>
          )}
          <button type="submit" className="boton-primario" disabled={guardando}>
            {guardando ? 'Guardando...' : (
              <>
                <Save size={18} />
                {esExistente ? 'Agregar Stock' : 'Registrar Producto'}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
