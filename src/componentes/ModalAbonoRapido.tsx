import { useState, useEffect } from 'react'
import { X, DollarSign, Wallet, AlertCircle } from 'lucide-react'
import './ModalAbonoRapido.css'

interface PropsModalAbonoRapido {
  idCliente: number
  nombreCliente: string
  saldoPendiente: number
  alCerrar: () => void
  onActualizar: () => void
}

export function ModalAbonoRapido({
  idCliente,
  nombreCliente,
  saldoPendiente,
  alCerrar,
  onActualizar
}: PropsModalAbonoRapido) {
  const [montoAbono, setMontoAbono] = useState('')
  const [responsable, setResponsable] = useState('')
  const [responsables, setResponsables] = useState<{ id_responsable: number, nombre: string }[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saldoActual, setSaldoActual] = useState(saldoPendiente)
  const [exito, setExito] = useState(false)

  useEffect(() => {
    cargarResponsables()
  }, [])

  const cargarResponsables = async () => {
    try {
      const datos = await window.ipcRenderer.getResponsables()
      setResponsables(datos)
    } catch (err) {
      console.error('Error cargando responsables:', err)
    }
  }

  const formatearMoneda = (monto: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(monto)
  }

  const manejarAbono = async () => {
    setError(null)
    const monto = parseFloat(montoAbono)

    if (isNaN(monto) || monto <= 0) {
      setError('El monto debe ser mayor a 0.')
      return
    }

    if (monto > saldoActual) {
      setError(`El abono no puede ser mayor al saldo pendiente (${formatearMoneda(saldoActual)}).`)
      return
    }

    if (!responsable.trim()) {
      setError('Debes seleccionar un responsable.')
      return
    }

    setGuardando(true)
    try {
      await window.ipcRenderer.registrarAbonoCliente({
        id_cliente: idCliente,
        monto,
        id_venta: undefined,
        responsable: responsable.trim(),
        notas: `Abono - Venta #${idCliente}`
      })

      const nuevoSaldo = saldoActual - monto
      setSaldoActual(nuevoSaldo)
      setMontoAbono('')
      setExito(true)
      onActualizar()
      window.dispatchEvent(new CustomEvent('ventas-actualizadas'))

      setTimeout(() => {
        if (nuevoSaldo <= 0) {
          alCerrar()
        } else {
          setExito(false)
        }
      }, 1500)
    } catch (err: any) {
      setError(err?.message || 'Error al registrar el abono')
    } finally {
      setGuardando(false)
    }
  }

  const abonarTodo = () => {
    setMontoAbono(saldoActual.toFixed(2))
  }

  return (
    <div className="modal-overlay" onClick={alCerrar}>
      <div className="modal-abono-rapido" onClick={(e) => e.stopPropagation()}>
        <header className="abono-header">
          <div className="abono-header-info">
            <div className="abono-icono">
              <Wallet size={24} />
            </div>
            <div>
              <h3>Registrar Abono</h3>
              <p className="abono-cliente">{nombreCliente}</p>
            </div>
          </div>
          <button className="boton-cerrar-modal" onClick={alCerrar}>
            <X size={20} />
          </button>
        </header>

        {error && (
          <div className="abono-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {exito && (
          <div className="abono-exito">
            <DollarSign size={16} />
            <span>¡Abono registrado con éxito!</span>
          </div>
        )}

        <div className="abono-saldo-container">
          <span className="abono-saldo-label">Saldo Pendiente</span>
          <span className={`abono-saldo-valor ${saldoActual <= 0 ? 'pagado' : ''}`}>
            {formatearMoneda(saldoActual)}
          </span>
        </div>

        {saldoActual > 0 && (
          <div className="abono-form">
            <div className="abono-campo">
              <label>Monto a Abonar</label>
              <div className="abono-input-container">
                <span className="abono-input-prefix">$</span>
                <input
                  type="number"
                  value={montoAbono}
                  onChange={(e) => setMontoAbono(e.target.value)}
                  placeholder="0.00"
                  step="50"
                  min="0"
                  max={saldoActual}
                  disabled={guardando || exito}
                  autoFocus
                />
                <button
                  className="btn-abonar-todo"
                  onClick={abonarTodo}
                  disabled={guardando || exito}
                  type="button"
                >
                  Todo
                </button>
              </div>
            </div>

            <div className="abono-campo">
              <label>Responsable</label>
              <select
                value={responsable}
                onChange={(e) => setResponsable(e.target.value)}
                disabled={guardando || exito}
              >
                <option value="">Seleccionar...</option>
                {responsables.map((r) => (
                  <option key={r.id_responsable} value={r.nombre}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>

            {montoAbono && parseFloat(montoAbono) > 0 && (
              <div className="abono-resumen">
                <div className="abono-resumen-row">
                  <span>Saldo actual:</span>
                  <span>{formatearMoneda(saldoActual)}</span>
                </div>
                <div className="abono-resumen-row">
                  <span>Abono:</span>
                  <span className="abono-monto">- {formatearMoneda(parseFloat(montoAbono) || 0)}</span>
                </div>
                <div className="abono-resumen-row abono-resumen-total">
                  <span>Nuevo saldo:</span>
                  <span className={saldoActual - (parseFloat(montoAbono) || 0) <= 0 ? 'pagado' : ''}>
                    {formatearMoneda(Math.max(0, saldoActual - (parseFloat(montoAbono) || 0)))}
                  </span>
                </div>
              </div>
            )}

            <button
              className="btn-confirmar-abono"
              onClick={manejarAbono}
              disabled={guardando || exito || !montoAbono || !responsable}
            >
              {guardando ? 'Procesando...' : 'Confirmar Abono'}
            </button>
          </div>
        )}

        {saldoActual <= 0 && (
          <div className="abono-completado">
            <div className="abono-completado-icono">✅</div>
            <p>Este cliente no tiene saldo pendiente</p>
          </div>
        )}
      </div>
    </div>
  )
}
