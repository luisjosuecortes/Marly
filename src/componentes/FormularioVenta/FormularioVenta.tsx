import { useState, useEffect, useMemo } from 'react'
import { AlertCircle, Save, X, Search } from 'lucide-react'
import './FormularioVenta.css'

interface PropsFormularioVenta {
  alCerrar?: () => void
  alGuardar: (datos: any) => Promise<void>
  folioInicial?: string
}

interface Cliente {
  id_cliente: number
  nombre_completo: string
  telefono: string | null
}

const TIPOS_SALIDA = ['Venta', 'Crédito', 'Apartado', 'Prestado']

interface VentaState {
  folio_producto: string
  talla: string
  cantidad_vendida: number | string
  precio_unitario_real: number | string
  descuento_aplicado: number | string
  tipo_salida: string
  id_cliente: number | null
  abono_inicial: number | string
  responsable_caja: string
  notas: string
}

export function FormularioVenta({ alCerrar, alGuardar, folioInicial }: PropsFormularioVenta) {
  const [guardando, setGuardando] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [productoEncontrado, setProductoEncontrado] = useState<any>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [stockDisponible, setStockDisponible] = useState<number>(0)
  const [tallasDisponibles, setTallasDisponibles] = useState<{ talla: string; cantidad: number }[]>([])

  const [venta, setVenta] = useState<VentaState>({
    folio_producto: folioInicial || '',
    talla: '',
    cantidad_vendida: 1,
    precio_unitario_real: 0,
    descuento_aplicado: 0,
    tipo_salida: 'Venta',
    id_cliente: null,
    abono_inicial: 0,
    responsable_caja: '',
    notas: ''
  })

  // Cargar clientes al montar
  useEffect(() => {
    const cargarClientes = async () => {
      try {
        const datos = await window.ipcRenderer.getClientes()
        setClientes(datos)
      } catch (err) {
        console.error('Error cargando clientes:', err)
      }
    }
    cargarClientes()

    const handleActualizacion = () => {
      cargarClientes()
    }
    window.addEventListener('clientes-actualizados', handleActualizacion)

    return () => {
      window.removeEventListener('clientes-actualizados', handleActualizacion)
    }
  }, [])

  // Buscar producto cuando cambia el folio
  useEffect(() => {
    const buscarProducto = async () => {
      if (!venta.folio_producto.trim()) {
        setProductoEncontrado(null)
        setStockDisponible(0)
        setTallasDisponibles([])
        setVenta(prev => ({ ...prev, precio_unitario_real: 0 }))
        return
      }

      setBuscando(true)
      try {
        const producto = await window.ipcRenderer.getProductoDetalle(venta.folio_producto)
        if (producto) {
          setProductoEncontrado(producto)

          // No establecer precio aquí, se establecerá cuando se seleccione la talla

          // Obtener tallas disponibles
          const tallas = producto.tallas_detalle || []
          setTallasDisponibles(tallas)

          // Si hay una talla seleccionada, actualizar stock disponible
          if (venta.talla) {
            const tallaInfo = tallas.find((t: any) => t.talla === venta.talla)
            setStockDisponible(tallaInfo?.cantidad || 0)
          }
        } else {
          setProductoEncontrado(null)
          setStockDisponible(0)
          setTallasDisponibles([])
        }
      } catch (err) {
        console.error('Error buscando producto:', err)
        setProductoEncontrado(null)
      } finally {
        setBuscando(false)
      }
    }

    // Si tenemos un folio inicial y coincide con el actual, buscar inmediatamente
    if (folioInicial && venta.folio_producto === folioInicial) {
      buscarProducto()
    } else {
      // Si no, usar debounce para la búsqueda manual
      const timeoutId = setTimeout(buscarProducto, 500)
      return () => clearTimeout(timeoutId)
    }
  }, [venta.folio_producto, folioInicial])

  // Actualizar stock disponible y precio cuando cambia la talla
  useEffect(() => {
    if (venta.talla && tallasDisponibles.length > 0 && venta.folio_producto) {
      const tallaInfo = tallasDisponibles.find(t => t.talla === venta.talla)
      setStockDisponible(tallaInfo?.cantidad || 0)

      // Ajustar cantidad si excede el stock
      if (Number(venta.cantidad_vendida) > (tallaInfo?.cantidad || 0)) {
        setVenta(prev => ({
          ...prev,
          cantidad_vendida: Math.max(1, tallaInfo?.cantidad || 1)
        }))
      }

      // Obtener precio según la talla seleccionada
      const obtenerPrecio = async () => {
        try {
          const precioData = await window.ipcRenderer.getPrecioVenta({
            folio_producto: venta.folio_producto,
            talla: venta.talla
          })
          if (precioData && precioData.precio_unitario_base > 0) {
            setVenta(prev => ({
              ...prev,
              precio_unitario_real: precioData.precio_unitario_base
            }))
          }
        } catch (err) {
          console.error('Error obteniendo precio:', err)
        }
      }
      obtenerPrecio()
    } else {
      setStockDisponible(0)
    }
  }, [venta.talla, tallasDisponibles, venta.folio_producto])

  const manejarCambio = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target

    if (name === 'tipo_salida') {
      setVenta(prev => ({
        ...prev,
        [name]: value,
        id_cliente: value === 'Venta' ? null : prev.id_cliente
      }))
    } else if (name === 'id_cliente') {
      setVenta(prev => ({
        ...prev,
        id_cliente: value ? parseInt(value) : null
      }))
    } else if (name === 'cantidad_vendida') {
      // Permitir valor vacío para poder borrar
      if (value === '') {
        setVenta(prev => ({ ...prev, cantidad_vendida: '' }))
        return
      }
      const cantidad = parseInt(value)
      // Solo validar máximo si es un número válido
      if (!isNaN(cantidad)) {
        const maxCantidad = stockDisponible
        // No forzamos min(1) aquí para permitir escribir libremente, se validará al enviar o onBlur
        const nuevaCantidad = Math.min(cantidad, maxCantidad)
        setVenta(prev => ({ ...prev, cantidad_vendida: nuevaCantidad }))
      }
    } else if (name === 'descuento_aplicado') {
      const nuevoValor = value === '' ? '' : parseFloat(value)
      setVenta(prev => ({
        ...prev,
        [name]: nuevoValor
      }))
    } else if (name === 'abono_inicial') {
      // Permitir que el campo esté vacío mientras se escribe
      const numValue = value === '' ? '' : parseFloat(value)
      const nuevoValor = numValue === '' ? 0 : (isNaN(numValue) ? 0 : Math.max(0, numValue))

      setVenta(prev => {
        // Validar que no exceda el monto total en tiempo real
        if (productoEncontrado && prev.talla && nuevoValor > 0) {
          const montoMaximo = (Number(prev.precio_unitario_real || 0) * Number(prev.cantidad_vendida || 0)) - Number(prev.descuento_aplicado || 0)
          if (nuevoValor > montoMaximo) {
            setError(`El abono inicial no puede ser mayor a $${montoMaximo.toFixed(2)}. Esto generaría un saldo negativo.`)
            return prev // No actualizar si excede el máximo
          }
        }

        // Limpiar error si el valor es válido
        if (error && error.includes('abono inicial')) {
          setError(null)
        }

        return {
          ...prev,
          [name]: nuevoValor
        }
      })
    } else if (name === 'precio_unitario_real') {
      // El precio no debe ser editable cuando hay producto y talla seleccionados
      // Solo permitir edición si no hay producto o talla
      if (!productoEncontrado || !venta.talla) {
        setVenta(prev => ({
          ...prev,
          [name]: value === '' ? '' : parseFloat(value)
        }))
      }
    } else if (name === 'tipo_salida') {
      // Resetear abono_inicial cuando cambia el tipo de salida
      setVenta(prev => ({
        ...prev,
        [name]: value,
        abono_inicial: (value === 'Crédito' || value === 'Apartado') ? prev.abono_inicial : 0
      }))
    } else {
      setVenta(prev => ({ ...prev, [name]: value }))
    }
  }

  const requiereCliente = venta.tipo_salida !== 'Venta'
  const clienteValido = !requiereCliente || venta.id_cliente !== null

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!productoEncontrado) {
      setError('Debes buscar y seleccionar un producto válido.')
      return
    }

    if (!venta.talla) {
      setError('Debes seleccionar una talla.')
      return
    }

    const cantidadVendidaNum = Number(venta.cantidad_vendida)
    const precioUnitarioRealNum = Number(venta.precio_unitario_real)
    const descuentoAplicadoNum = Number(venta.descuento_aplicado)
    const abonoInicialNum = Number(venta.abono_inicial)

    if (cantidadVendidaNum > stockDisponible) {
      setError(`No hay suficiente stock. Disponible: ${stockDisponible}`)
      return
    }

    if (cantidadVendidaNum < 1) {
      setError('La cantidad debe ser al menos 1.')
      return
    }

    if (precioUnitarioRealNum <= 0) {
      setError('El precio unitario debe ser mayor a 0.')
      return
    }

    if (requiereCliente && !venta.id_cliente) {
      setError('Debes seleccionar un cliente para este tipo de operación.')
      return
    }

    // Validar abono inicial si aplica
    if (venta.tipo_salida === 'Crédito' || venta.tipo_salida === 'Apartado') {
      const montoTotal = (precioUnitarioRealNum * cantidadVendidaNum) - descuentoAplicadoNum

      if (abonoInicialNum < 0) {
        setError('El abono inicial no puede ser negativo.')
        return
      }

      if (abonoInicialNum > montoTotal) {
        setError(`El abono inicial no puede ser mayor al monto total ($${montoTotal.toFixed(2)}). Esto generaría un saldo negativo.`)
        return
      }

      if (abonoInicialNum === montoTotal && venta.tipo_salida === 'Crédito') {
        setError('Si el abono inicial es igual al monto total, el tipo de salida debe ser "Venta" en lugar de "Crédito".')
        return
      }
    }

    if (!venta.responsable_caja.trim()) {
      setError('Debes indicar el responsable de caja.')
      return
    }

    setGuardando(true)
    try {
      await alGuardar({
        ...venta,
        cantidad_vendida: cantidadVendidaNum,
        precio_unitario_real: precioUnitarioRealNum,
        descuento_aplicado: descuentoAplicadoNum,
        abono_inicial: abonoInicialNum,
        fecha_venta: new Date().toISOString()
      })
      // Resetear formulario
      setVenta({
        folio_producto: '',
        talla: '',
        cantidad_vendida: 1,
        precio_unitario_real: 0,
        descuento_aplicado: 0,
        tipo_salida: 'Venta',
        id_cliente: null,
        abono_inicial: 0,
        responsable_caja: '',
        notas: ''
      })
      setProductoEncontrado(null)
      setStockDisponible(0)
      setTallasDisponibles([])
    } catch (err: any) {
      setError(err?.message || 'Error al registrar la venta.')
    } finally {
      setGuardando(false)
    }
  }

  const tallasConStock = useMemo(() => {
    return tallasDisponibles.filter(t => t.cantidad > 0).map(t => t.talla)
  }, [tallasDisponibles])

  return (
    <div className="panel-formulario">
      <header className="formulario-encabezado">
        <div>
          <p className="etiqueta">Punto de Venta</p>
          <h2>Registrar Venta</h2>
        </div>
        {alCerrar && (
          <button type="button" className="boton-cerrar" onClick={alCerrar}>
            <X size={18} />
          </button>
        )}
      </header>

      <form className="formulario-venta" onSubmit={manejarEnvio}>
        {error && (
          <div className="mensaje-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* BÚSQUEDA DE PRODUCTO */}
        <div className="seccion-formulario-limpia">
          <div className="fila-formulario">
            <div className="grupo-formulario" style={{ flex: 2 }}>
              <label htmlFor="folio_producto">
                Folio del Producto {buscando && <span style={{ fontSize: '0.7em' }}>(Buscando...)</span>}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="folio_producto"
                  name="folio_producto"
                  type="text"
                  placeholder="321-01"
                  value={venta.folio_producto}
                  onChange={manejarCambio}
                  required
                  autoFocus
                />
                {productoEncontrado && (
                  <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#34d399' }}>
                    <Search size={16} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {productoEncontrado && (
            <div className="info-producto-encontrado" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <strong style={{ fontSize: '1.1rem', color: '#34d399' }}>{productoEncontrado.nombre_producto || '0'}</strong>
                <span className="badge-categoria" style={{ margin: 0, padding: '0.15rem 0.5rem', fontSize: '0.7rem' }}>{productoEncontrado.categoria}</span>
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                Stock: <strong style={{ color: '#e2e8f0' }}>{productoEncontrado.stock_actual}</strong>
              </div>
            </div>
          )}
        </div>

        {/* DETALLES DE VENTA */}
        {productoEncontrado && (
          <>
            <div className="seccion-formulario-limpia">
              <div className="fila-formulario">
                <div className="grupo-formulario">
                  <label htmlFor="talla">Talla</label>
                  <select
                    id="talla"
                    name="talla"
                    value={venta.talla}
                    onChange={manejarCambio}
                    required
                  >
                    <option value="">Selecciona</option>
                    {tallasConStock.map((talla) => {
                      const info = tallasDisponibles.find(t => t.talla === talla)
                      return (
                        <option key={talla} value={talla}>
                          {talla} ({info?.cantidad || 0})
                        </option>
                      )
                    })}
                  </select>
                </div>
                <div className="grupo-formulario">
                  <label htmlFor="cantidad_vendida">
                    Cant. {stockDisponible > 0 && <span style={{ fontSize: '0.7em', color: '#94a3b8' }}>/{stockDisponible}</span>}
                  </label>
                  <input
                    id="cantidad_vendida"
                    name="cantidad_vendida"
                    type="number"
                    min="1"
                    max={stockDisponible}
                    value={venta.cantidad_vendida}
                    onChange={manejarCambio}
                    required
                  />
                </div>
                <div className="grupo-formulario">
                  <label htmlFor="precio_unitario_real">Precio ($)</label>
                  <input
                    id="precio_unitario_real"
                    name="precio_unitario_real"
                    type="number"
                    step="0.01"
                    min="0"
                    value={venta.precio_unitario_real}
                    onChange={manejarCambio}
                    required
                    disabled={productoEncontrado ? true : false}
                    style={productoEncontrado ? {
                      opacity: 0.7,
                      cursor: 'not-allowed',
                      backgroundColor: 'rgba(15, 23, 42, 0.5)'
                    } : {}}
                  />
                </div>
                <div className="grupo-formulario">
                  <label htmlFor="descuento_aplicado">Desc. ($)</label>
                  <input
                    id="descuento_aplicado"
                    name="descuento_aplicado"
                    type="number"
                    step="0.01"
                    min="0"
                    value={venta.descuento_aplicado}
                    onChange={manejarCambio}
                  />
                </div>
              </div>

              <div className="fila-formulario">
                <div className="grupo-formulario">
                  <label htmlFor="tipo_salida">Tipo</label>
                  <select
                    id="tipo_salida"
                    name="tipo_salida"
                    value={venta.tipo_salida}
                    onChange={manejarCambio}
                    required
                  >
                    {TIPOS_SALIDA.map((tipo) => (
                      <option key={tipo} value={tipo}>{tipo}</option>
                    ))}
                  </select>
                </div>
                <div className="grupo-formulario" style={{ flex: 1.5 }}>
                  <label htmlFor="id_cliente">
                    Cliente {requiereCliente && <span style={{ color: '#f87171' }}>*</span>}
                  </label>
                  <select
                    id="id_cliente"
                    name="id_cliente"
                    value={venta.id_cliente || ''}
                    onChange={manejarCambio}
                    required={requiereCliente}
                  >
                    <option value="">{requiereCliente ? 'Selecciona un cliente' : 'Opcional'}</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id_cliente} value={cliente.id_cliente}>
                        {cliente.nombre_completo}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grupo-formulario">
                  <label htmlFor="responsable_caja">Responsable</label>
                  <input
                    id="responsable_caja"
                    name="responsable_caja"
                    type="text"
                    placeholder="Nombre"
                    value={venta.responsable_caja}
                    onChange={manejarCambio}
                    required
                  />
                </div>
              </div>

              <div className="fila-formulario">
                {(venta.tipo_salida === 'Crédito' || venta.tipo_salida === 'Apartado') && (
                  <div className="grupo-formulario" style={{ flex: 1 }}>
                    <label htmlFor="abono_inicial">
                      Abono Inicial ($)
                    </label>
                    <input
                      id="abono_inicial"
                      name="abono_inicial"
                      type="number"
                      step="0.01"
                      min="0"
                      max={productoEncontrado && venta.talla ? (Number(venta.precio_unitario_real || 0) * Number(venta.cantidad_vendida || 0)) - Number(venta.descuento_aplicado || 0) : undefined}
                      value={venta.abono_inicial === 0 ? '' : venta.abono_inicial}
                      onChange={manejarCambio}
                      placeholder="0.00"
                    />
                    <small style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                      {Number(venta.abono_inicial) > 0 && productoEncontrado && venta.talla && (
                        <>
                          Pendiente: <strong style={{ color: '#f87171' }}>
                            ${(((Number(venta.precio_unitario_real || 0) * Number(venta.cantidad_vendida || 0)) - Number(venta.descuento_aplicado || 0)) - Number(venta.abono_inicial || 0)).toFixed(2)}
                          </strong>
                        </>
                      )}
                    </small>
                  </div>
                )}

                <div className="grupo-formulario" style={{ flex: 2 }}>
                  <label htmlFor="notas">Notas (opcional)</label>
                  <input
                    id="notas"
                    name="notas"
                    type="text"
                    placeholder="Observaciones..."
                    value={venta.notas}
                    onChange={manejarCambio}
                  />
                </div>
              </div>

              {stockDisponible > 0 && Number(venta.cantidad_vendida) > 0 && Number(venta.precio_unitario_real) > 0 && (
                <div className="resumen-venta" style={{ padding: '0.75rem 1.25rem', marginTop: '0.5rem' }}>
                  <div className="resumen-linea" style={{ padding: '0.25rem 0' }}>
                    <span>Subtotal:</span>
                    <strong>${((Number(venta.precio_unitario_real) || 0) * (Number(venta.cantidad_vendida) || 0)).toFixed(2)}</strong>
                  </div>
                  {Number(venta.descuento_aplicado) > 0 && (
                    <div className="resumen-linea" style={{ padding: '0.25rem 0' }}>
                      <span>Descuento:</span>
                      <strong style={{ color: '#f87171' }}>-${Number(venta.descuento_aplicado).toFixed(2)}</strong>
                    </div>
                  )}
                  {(venta.tipo_salida === 'Crédito' || venta.tipo_salida === 'Apartado') && Number(venta.abono_inicial) > 0 && (
                    <div className="resumen-linea" style={{ padding: '0.25rem 0' }}>
                      <span>Abono Inicial:</span>
                      <strong style={{ color: '#34d399' }}>-${Number(venta.abono_inicial).toFixed(2)}</strong>
                    </div>
                  )}
                  <div className="resumen-linea resumen-total" style={{ marginTop: '0.25rem', paddingTop: '0.5rem' }}>
                    <span>
                      {venta.tipo_salida === 'Venta' ? 'Total:' :
                        venta.tipo_salida === 'Prestado' ? 'Total:' :
                          'Pendiente:'}
                    </span>
                    <strong>
                      ${(() => {
                        const precio = Number(venta.precio_unitario_real) || 0
                        const cantidad = Number(venta.cantidad_vendida) || 0
                        const descuento = Number(venta.descuento_aplicado) || 0
                        const abono = Number(venta.abono_inicial) || 0

                        const montoTotal = (precio * cantidad) - descuento
                        if (venta.tipo_salida === 'Venta' || venta.tipo_salida === 'Prestado') {
                          return montoTotal.toFixed(2)
                        } else {
                          return (montoTotal - abono).toFixed(2)
                        }
                      })()}
                    </strong>
                  </div>
                </div>
              )}
            </div>

            <div className="acciones-formulario">
              {alCerrar && (
                <button type="button" className="boton-secundario" onClick={alCerrar}>
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                className="boton-primario"
                disabled={guardando || !clienteValido || stockDisponible === 0}
              >
                <Save size={18} />
                {guardando ? 'Registrando...' : 'Registrar Venta'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}

