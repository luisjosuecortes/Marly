import { useState, useEffect, useMemo } from 'react'
import { AlertCircle, Save, X, Search } from 'lucide-react'
import './FormularioVenta.css'

interface PropsFormularioVenta {
  alCerrar?: () => void
  alGuardar: (datos: any) => Promise<void>
}

interface Cliente {
  id_cliente: number
  nombre_completo: string
  telefono: string | null
}

const TIPOS_SALIDA = ['Venta', 'Crédito', 'Apartado', 'Prestado']

export function FormularioVenta({ alCerrar, alGuardar }: PropsFormularioVenta) {
  const [guardando, setGuardando] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [productoEncontrado, setProductoEncontrado] = useState<any>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [stockDisponible, setStockDisponible] = useState<number>(0)
  const [tallasDisponibles, setTallasDisponibles] = useState<{ talla: string; cantidad: number }[]>([])

  const [venta, setVenta] = useState({
    folio_producto: '',
    talla: '',
    cantidad_vendida: 1,
    precio_unitario_real: 0,
    descuento_aplicado: 0,
    tipo_salida: 'Venta',
    id_cliente: null as number | null,
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

    const timeoutId = setTimeout(buscarProducto, 500)
    return () => clearTimeout(timeoutId)
  }, [venta.folio_producto])

  // Actualizar stock disponible y precio cuando cambia la talla
  useEffect(() => {
    if (venta.talla && tallasDisponibles.length > 0 && venta.folio_producto) {
      const tallaInfo = tallasDisponibles.find(t => t.talla === venta.talla)
      setStockDisponible(tallaInfo?.cantidad || 0)
      
      // Ajustar cantidad si excede el stock
      if (venta.cantidad_vendida > (tallaInfo?.cantidad || 0)) {
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
      const cantidad = parseInt(value) || 1
      const maxCantidad = stockDisponible
      setVenta(prev => ({ 
        ...prev, 
        cantidad_vendida: Math.min(Math.max(1, cantidad), maxCantidad) 
      }))
    } else if (name === 'descuento_aplicado') {
      setVenta(prev => ({ 
        ...prev, 
        [name]: parseFloat(value) || 0 
      }))
    } else if (name === 'abono_inicial') {
      // Permitir que el campo esté vacío mientras se escribe
      const numValue = value === '' ? '' : parseFloat(value)
      const nuevoValor = numValue === '' ? 0 : (isNaN(numValue) ? 0 : Math.max(0, numValue))
      
      setVenta(prev => {
        // Validar que no exceda el monto total en tiempo real
        if (productoEncontrado && prev.talla && nuevoValor > 0) {
          const montoMaximo = (prev.precio_unitario_real * prev.cantidad_vendida) - prev.descuento_aplicado
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
          [name]: parseFloat(value) || 0 
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

    if (venta.cantidad_vendida > stockDisponible) {
      setError(`No hay suficiente stock. Disponible: ${stockDisponible}`)
      return
    }

    if (venta.cantidad_vendida < 1) {
      setError('La cantidad debe ser al menos 1.')
      return
    }

    if (venta.precio_unitario_real <= 0) {
      setError('El precio unitario debe ser mayor a 0.')
      return
    }

    if (requiereCliente && !venta.id_cliente) {
      setError('Debes seleccionar un cliente para este tipo de operación.')
      return
    }

    // Validar abono inicial si aplica
    if (venta.tipo_salida === 'Crédito' || venta.tipo_salida === 'Apartado') {
      const montoTotal = (venta.precio_unitario_real * venta.cantidad_vendida) - venta.descuento_aplicado
      
      if (venta.abono_inicial < 0) {
        setError('El abono inicial no puede ser negativo.')
        return
      }
      
      if (venta.abono_inicial > montoTotal) {
        setError(`El abono inicial no puede ser mayor al monto total ($${montoTotal.toFixed(2)}). Esto generaría un saldo negativo.`)
        return
      }
      
      if (venta.abono_inicial === montoTotal && venta.tipo_salida === 'Crédito') {
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
                Folio del Producto {buscando && <span style={{fontSize: '0.7em'}}>(Buscando...)</span>}
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
            <div className="info-producto-encontrado">
              <div>
                <strong>{productoEncontrado.nombre_producto || '0'}</strong>
                <span className="badge-categoria">{productoEncontrado.categoria}</span>
              </div>
              <div style={{ marginTop: '0.5rem', color: '#94a3b8', fontSize: '0.9rem' }}>
                Stock total: <strong style={{ color: '#e2e8f0' }}>{productoEncontrado.stock_actual}</strong>
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
                    <option value="">Selecciona una talla</option>
                    {tallasConStock.map((talla) => {
                      const info = tallasDisponibles.find(t => t.talla === talla)
                      return (
                        <option key={talla} value={talla}>
                          {talla} ({info?.cantidad || 0} disponibles)
                        </option>
                      )
                    })}
                  </select>
                </div>
                <div className="grupo-formulario">
                  <label htmlFor="cantidad_vendida">
                    Cantidad {stockDisponible > 0 && (
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        (Máx: {stockDisponible})
                      </span>
                    )}
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
              </div>

              <div className="fila-formulario">
                <div className="grupo-formulario">
                  <label htmlFor="precio_unitario_real">
                    Precio Unitario ($)
                    {productoEncontrado && venta.talla && (
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.5rem' }}>
                        (Automático según talla)
                      </span>
                    )}
                    {productoEncontrado && !venta.talla && (
                      <span style={{ fontSize: '0.75rem', color: '#f87171', marginLeft: '0.5rem' }}>
                        (Selecciona una talla primero)
                      </span>
                    )}
                  </label>
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
                  <label htmlFor="descuento_aplicado">Descuento ($)</label>
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
                  <label htmlFor="tipo_salida">Tipo de Salida</label>
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
                <div className="grupo-formulario">
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
                    <option value="">{requiereCliente ? 'Selecciona un cliente' : 'Cliente (opcional)'}</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id_cliente} value={cliente.id_cliente}>
                        {cliente.nombre_completo} {cliente.telefono && `(${cliente.telefono})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {(venta.tipo_salida === 'Crédito' || venta.tipo_salida === 'Apartado') && (
                <div className="fila-formulario">
                  <div className="grupo-formulario">
                    <label htmlFor="abono_inicial">
                      Abono Inicial ($)
                      {productoEncontrado && venta.talla && (
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.5rem' }}>
                          (Máx: ${((venta.precio_unitario_real * venta.cantidad_vendida) - venta.descuento_aplicado).toFixed(2)})
                        </span>
                      )}
                    </label>
                    <input
                      id="abono_inicial"
                      name="abono_inicial"
                      type="number"
                      step="0.01"
                      min="0"
                      max={productoEncontrado && venta.talla ? (venta.precio_unitario_real * venta.cantidad_vendida) - venta.descuento_aplicado : undefined}
                      value={venta.abono_inicial === 0 ? '' : venta.abono_inicial}
                      onChange={manejarCambio}
                      placeholder="0.00"
                    />
                    <small style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                      {venta.abono_inicial > 0 && productoEncontrado && venta.talla && (
                        <>
                          Saldo pendiente: <strong style={{ color: '#f87171' }}>
                            ${(((venta.precio_unitario_real * venta.cantidad_vendida) - venta.descuento_aplicado) - venta.abono_inicial).toFixed(2)}
                          </strong>
                        </>
                      )}
                    </small>
                  </div>
                </div>
              )}

              <div className="fila-formulario">
                <div className="grupo-formulario">
                  <label htmlFor="responsable_caja">Responsable de Caja</label>
                  <input
                    id="responsable_caja"
                    name="responsable_caja"
                    type="text"
                    placeholder="Nombre del responsable"
                    value={venta.responsable_caja}
                    onChange={manejarCambio}
                    required
                  />
                </div>
              </div>

              <div className="fila-formulario">
                <div className="grupo-formulario" style={{ flex: 1 }}>
                  <label htmlFor="notas">Notas (opcional)</label>
                  <textarea
                    id="notas"
                    name="notas"
                    rows={3}
                    placeholder="Observaciones sobre la venta..."
                    value={venta.notas}
                    onChange={manejarCambio}
                  />
                </div>
              </div>

              {stockDisponible > 0 && venta.cantidad_vendida > 0 && venta.precio_unitario_real > 0 && (
                <div className="resumen-venta">
                  <div className="resumen-linea">
                    <span>Subtotal:</span>
                    <strong>${(venta.precio_unitario_real * venta.cantidad_vendida).toFixed(2)}</strong>
                  </div>
                  {venta.descuento_aplicado > 0 && (
                    <div className="resumen-linea">
                      <span>Descuento:</span>
                      <strong style={{ color: '#f87171' }}>-${venta.descuento_aplicado.toFixed(2)}</strong>
                    </div>
                  )}
                  {(venta.tipo_salida === 'Crédito' || venta.tipo_salida === 'Apartado') && venta.abono_inicial > 0 && (
                    <div className="resumen-linea">
                      <span>Abono Inicial:</span>
                      <strong style={{ color: '#34d399' }}>-${venta.abono_inicial.toFixed(2)}</strong>
                    </div>
                  )}
                  <div className="resumen-linea resumen-total">
                    <span>
                      {venta.tipo_salida === 'Venta' ? 'Total a Pagar:' : 
                       venta.tipo_salida === 'Prestado' ? 'Total:' :
                       'Saldo Pendiente:'}
                    </span>
                    <strong>
                      ${(() => {
                        const montoTotal = (venta.precio_unitario_real * venta.cantidad_vendida) - venta.descuento_aplicado
                        if (venta.tipo_salida === 'Venta' || venta.tipo_salida === 'Prestado') {
                          return montoTotal.toFixed(2)
                        } else {
                          // Crédito o Apartado: mostrar saldo pendiente
                          return (montoTotal - (venta.abono_inicial || 0)).toFixed(2)
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

