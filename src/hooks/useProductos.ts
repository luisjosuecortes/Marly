import { useState, useEffect, useCallback } from 'react'

export interface Producto {
  folio_producto: string
  nombre_producto: string
  categoria: string
  estado_producto: string
  stock_actual: number
  stock_minimo: number
  stock_maximo: number
  proveedor: string | null
  fecha_ultima_actualizacion: string
  tallas_detalle: { talla: string; cantidad: number }[]
}

export function useProductos() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargarProductos = useCallback(async () => {
    setCargando(true)
    try {
      const datos = await window.ipcRenderer.getProductos()
      setProductos(datos)
      setError(null)
    } catch (err) {
      console.error('Error cargando productos:', err)
      setError('Error al cargar el inventario.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargarProductos()
  }, [cargarProductos])

  return { productos, cargando, error, recargarProductos: cargarProductos }
}
