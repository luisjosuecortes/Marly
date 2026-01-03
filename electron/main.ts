import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Estructura de carpetas de construcción:
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST
const VITE_PUBLIC_DIR = process.env.VITE_PUBLIC as string

// Inicializar base de datos
const dbPath = path.join(process.env.APP_ROOT, 'database', 'marly.db')
const schemaPath = path.join(process.env.APP_ROOT, 'database', 'schema.sql')

// Asegurar que el directorio de la base de datos existe
if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
}

// @ts-ignore
const db = new Database(dbPath, { verbose: console.log, nativeBinding: path.join(process.env.APP_ROOT, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node') })

// Ejecutar esquema si la base de datos es nueva o está vacía
const initDb = () => {
  try {
    const schema = fs.readFileSync(schemaPath, 'utf-8')
    db.exec(schema)
    console.log('Base de datos inicializada/verificada.')
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error)
  }
}

initDb()

// IPC Handlers para la base de datos
ipcMain.handle('get-productos', () => {
  try {
    const stmt = db.prepare(`
      SELECT 
        p.*, 
        json_group_array(json_object('talla', tp.talla, 'cantidad', tp.cantidad)) as tallas_detalle
      FROM productos p
      LEFT JOIN tallas_producto tp ON p.folio_producto = tp.folio_producto
      GROUP BY p.folio_producto
      ORDER BY p.fecha_ultima_actualizacion DESC
    `)
    const productos = stmt.all()

    // Parsear el JSON de tallas para que llegue como objeto al frontend
    return productos.map((p: any) => ({
      ...p,
      tallas_detalle: p.tallas_detalle ? JSON.parse(p.tallas_detalle) : []
    }))
  } catch (error) {
    console.error('Error al obtener productos:', error)
    return []
  }
})

// Actualizar stock (Auditoría/Ajuste manual)
ipcMain.handle('actualizar-stock', (_event, datos) => {
  const { folio_producto, nuevo_stock } = datos

  const actualizar = db.transaction(() => {
    // 1. Obtener stock anterior
    const producto = db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get(folio_producto)
    if (!producto) throw new Error('Producto no encontrado')

    // 2. Registrar movimiento (ajuste) - Usaremos la tabla de entradas temporalmente o una nueva de ajustes?
    // El usuario pidió "Permite auditorías y ajustes manuales".
    // Lo ideal es tener una tabla de 'ajustes_inventario' o usar 'entradas'/'ventas' con un tipo especial,
    // pero por simplicidad y siguiendo el schema actual, podemos registrarlo en 'estados_producto' si es cambio de estado,
    // o simplemente actualizar el stock y dejar nota en 'observaciones' si no hay tabla de historial de movimientos físicos (kardex).
    //
    // Reviando schema.sql, no hay tabla de 'ajustes' o 'kardex'. 
    // Usaremos 'entradas' con tipo_movimiento = 'Ajuste Manual' si aumenta, 
    // o 'ventas' si disminuye? No, eso ensucia las ventas.
    //
    // Mejor: Actualizar directamente y quizas agregar una nota en 'observaciones' del producto por ahora, 
    // ya que no hay tabla específica de auditoría en el schema proporcionado.
    // O mejor aún, actualizar el stock y ya, el usuario pidió "ajustes manuales".

    const stmt = db.prepare(`
      UPDATE productos 
      SET stock_actual = @nuevo_stock,
          fecha_ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio_producto
    `)

    stmt.run({ nuevo_stock, folio_producto })
  })

  try {
    actualizar()
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar stock:', error)
    throw error
  }
})

// Handlers para proveedores
ipcMain.handle('get-proveedores', () => {
  try {
    const stmt = db.prepare('SELECT nombre FROM proveedores ORDER BY nombre')
    return stmt.all().map((p: any) => p.nombre)
  } catch (error) {
    console.error('Error al obtener proveedores:', error)
    return []
  }
})

ipcMain.handle('agregar-proveedor', (_event, nombre) => {
  try {
    const nombreMayusculas = nombre.trim().toUpperCase()
    const stmt = db.prepare('INSERT INTO proveedores (nombre) VALUES (?)')
    stmt.run(nombreMayusculas)
    return { success: true }
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      throw new Error('Este proveedor ya existe.')
    }
    throw error
  }
})

ipcMain.handle('eliminar-proveedor', (_event, nombre) => {
  try {
    const stmt = db.prepare('DELETE FROM proveedores WHERE nombre = ?')
    stmt.run(nombre)
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar proveedor:', error)
    throw error
  }
})

// Obtener historial de entradas de un producto
ipcMain.handle('get-historial-entradas', (_event, folio) => {
  try {
    const stmt = db.prepare(`
      SELECT 
        id_entrada,
        fecha_entrada,
        cantidad_recibida,
        talla,
        costo_unitario_proveedor,
        precio_unitario_base,
        precio_unitario_promocion,
        tipo_movimiento,
        responsable_recepcion,
        observaciones_entrada
      FROM entradas
      WHERE folio_producto = ?
      ORDER BY fecha_entrada DESC, id_entrada DESC
    `)
    return stmt.all(folio)
  } catch (error) {
    console.error('Error al obtener historial de entradas:', error)
    return []
  }
})

ipcMain.handle('get-historial-ventas', (_event, folio) => {
  try {
    const ventas = db.prepare(`
      SELECT 
        v.id_venta,
        v.fecha_venta,
        v.cantidad_vendida,
        v.talla,
        v.precio_unitario_real,
        v.descuento_aplicado,
        v.tipo_salida,
        v.id_cliente,
        v.responsable_caja,
        v.notas,
        c.nombre_completo as nombre_cliente
      FROM ventas v
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
      WHERE v.folio_producto = ?
      ORDER BY v.fecha_venta DESC, v.id_venta DESC
    `).all(folio) as any[]

    // Para cada venta, calcular el monto realmente vendido (abono inicial + abonos posteriores)
    return ventas.map((venta) => {
      let montoVendido = 0
      const montoTotal = (venta.precio_unitario_real * venta.cantidad_vendida) - (venta.descuento_aplicado || 0)

      // Si es Venta normal o Prestado, el monto vendido es el total
      if (venta.tipo_salida === 'Venta' || venta.tipo_salida === 'Prestado') {
        montoVendido = montoTotal
      } else if (venta.tipo_salida === 'Crédito' || venta.tipo_salida === 'Apartado') {
        // Si es Crédito o Apartado, calcular abonos
        if (venta.id_cliente) {
          // Obtener todos los abonos relacionados con esta venta
          const abonos = db.prepare(`
            SELECT COALESCE(SUM(monto), 0) as total_abonado
            FROM movimientos_cliente
            WHERE id_cliente = ?
              AND tipo_movimiento = 'abono'
              AND (referencia LIKE ? OR referencia LIKE ?)
          `).get(
            venta.id_cliente,
            `%Venta #${venta.id_venta}%`,
            `Abono inicial - Venta #${venta.id_venta}%`
          ) as any

          montoVendido = abonos?.total_abonado || 0
        } else {
          // Si no hay cliente asociado, monto vendido es 0
          montoVendido = 0
        }
      }

      return {
        ...venta,
        monto_total: montoTotal,
        monto_vendido: montoVendido,
        saldo_pendiente: montoTotal - montoVendido
      }
    })
  } catch (error) {
    console.error('Error al obtener historial de ventas:', error)
    return []
  }
})

ipcMain.handle('get-historial-movimientos', (_event, folio) => {
  try {
    // Obtener entradas
    const entradas = db.prepare(`
      SELECT 
        'entrada' as tipo,
        id_entrada as id,
        fecha_entrada as fecha,
        cantidad_recibida as cantidad,
        talla,
        costo_unitario_proveedor as costo_unitario,
        precio_unitario_base as precio_unitario,
        tipo_movimiento,
        responsable_recepcion as responsable,
        NULL as cliente
      FROM entradas
      WHERE folio_producto = ?
    `).all(folio) as any[]

    // Obtener ventas
    const ventasRaw = db.prepare(`
      SELECT 
        'venta' as tipo,
        v.id_venta as id,
        v.fecha_venta as fecha,
        v.cantidad_vendida as cantidad,
        v.talla,
        NULL as costo_unitario,
        v.precio_unitario_real,
        v.descuento_aplicado,
        v.tipo_salida as tipo_movimiento,
        v.responsable_caja as responsable,
        v.id_cliente,
        c.nombre_completo as cliente
      FROM ventas v
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
      WHERE v.folio_producto = ?
    `).all(folio) as any[]

    // Para cada venta, calcular el monto realmente vendido (abono inicial + abonos posteriores)
    const ventas = ventasRaw.map((venta) => {
      let montoVendido = 0
      const montoTotal = (venta.precio_unitario_real * venta.cantidad) - (venta.descuento_aplicado || 0)

      // Si es Venta normal o Prestado, el monto vendido es el total
      if (venta.tipo_movimiento === 'Venta' || venta.tipo_movimiento === 'Prestado') {
        montoVendido = montoTotal
      } else if (venta.tipo_movimiento === 'Crédito' || venta.tipo_movimiento === 'Apartado') {
        // Si es Crédito o Apartado, calcular abonos
        if (venta.id_cliente) {
          // Obtener todos los abonos relacionados con esta venta
          const abonos = db.prepare(`
            SELECT COALESCE(SUM(monto), 0) as total_abonado
            FROM movimientos_cliente
            WHERE id_cliente = ?
              AND tipo_movimiento = 'abono'
              AND (referencia LIKE ? OR referencia LIKE ?)
          `).get(
            venta.id_cliente,
            `%Venta #${venta.id}%`,
            `Abono inicial - Venta #${venta.id}%`
          ) as any

          montoVendido = abonos?.total_abonado || 0
        } else {
          // Si no hay cliente asociado, monto vendido es 0
          montoVendido = 0
        }
      }

      return {
        tipo: venta.tipo,
        id: venta.id,
        fecha: venta.fecha,
        cantidad: venta.cantidad,
        talla: venta.talla,
        costo_unitario: null,
        precio_unitario: montoVendido, // Mostrar monto vendido en lugar de precio unitario
        tipo_movimiento: venta.tipo_movimiento,
        responsable: venta.responsable,
        cliente: venta.cliente
      }
    })

    // Combinar y ordenar por fecha descendente
    const movimientos = [...entradas, ...ventas].sort((a, b) => {
      const fechaA = new Date(a.fecha).getTime()
      const fechaB = new Date(b.fecha).getTime()
      if (fechaB !== fechaA) return fechaB - fechaA
      // Si las fechas son iguales, ordenar por ID descendente
      return b.id - a.id
    })

    return movimientos
  } catch (error) {
    console.error('Error al obtener historial de movimientos:', error)
    return []
  }
})

// Buscar producto por folio (para reabastecimiento)
ipcMain.handle('get-producto-detalle', (_event, folio) => {
  try {
    const stmt = db.prepare(`
      SELECT 
        p.*, 
        json_group_array(json_object('talla', tp.talla, 'cantidad', tp.cantidad)) as tallas_detalle
      FROM productos p
      LEFT JOIN tallas_producto tp ON p.folio_producto = tp.folio_producto
      WHERE p.folio_producto = ?
      GROUP BY p.folio_producto
    `)
    const producto = stmt.get(folio) as any

    if (!producto) return null

    // Parsear el JSON de tallas
    return {
      ...producto,
      tallas_detalle: producto.tallas_detalle ? JSON.parse(producto.tallas_detalle) : []
    }
  } catch (error) {
    console.error('Error al buscar producto:', error)
    return null
  }
})

// Obtener última entrada de un producto (para pre-llenar costo y precio)
ipcMain.handle('get-ultima-entrada', (_event, folio) => {
  try {
    const entrada = db.prepare(`
      SELECT costo_unitario_proveedor, precio_unitario_base
      FROM entradas
      WHERE folio_producto = ?
      ORDER BY fecha_entrada DESC, id_entrada DESC
      LIMIT 1
    `).get(folio)
    return entrada || null
  } catch (error) {
    console.error('Error al obtener última entrada:', error)
    return null
  }
})

ipcMain.handle('get-precio-venta', (_event, datos) => {
  const { folio_producto, talla } = datos
  try {
    // Primero intentar obtener el precio de la última entrada de esa talla específica
    const entradaTalla = db.prepare(`
      SELECT precio_unitario_base
      FROM entradas
      WHERE folio_producto = ? AND talla = ?
      ORDER BY fecha_entrada DESC, id_entrada DESC
      LIMIT 1
    `).get(folio_producto, talla) as any

    if (entradaTalla) {
      return { precio_unitario_base: entradaTalla.precio_unitario_base }
    }

    // Si no hay entrada específica de esa talla, obtener el precio base general
    const entradaGeneral = db.prepare(`
      SELECT precio_unitario_base
      FROM entradas
      WHERE folio_producto = ?
      ORDER BY fecha_entrada DESC, id_entrada DESC
      LIMIT 1
    `).get(folio_producto) as any

    return entradaGeneral || { precio_unitario_base: 0 }
  } catch (error) {
    console.error('Error al obtener precio de venta:', error)
    return { precio_unitario_base: 0 }
  }
})

// Registrar un producto nuevo (Primera entrada)
ipcMain.handle('registrar-nuevo-producto', (_event, datos) => {
  const { producto, entrada } = datos

  // Transacción para asegurar integridad
  const registrar = db.transaction(() => {
    // 1. Insertar producto
    const stmtProducto = db.prepare(`
      INSERT INTO productos (
        folio_producto, nombre_producto, categoria, genero_destino,
        stock_actual, stock_minimo, proveedor, observaciones
      ) VALUES (
        @folio_producto, @nombre_producto, @categoria, @genero_destino,
        @stock_actual, 5, @proveedor, @observaciones
      )
    `)

    // El stock inicial es igual a la cantidad recibida
    stmtProducto.run({
      ...producto,
      stock_actual: entrada.cantidad_recibida
    })

    // 2. Insertar entrada
    const stmtEntrada = db.prepare(`
      INSERT INTO entradas (
        fecha_entrada, folio_producto, cantidad_recibida, talla, costo_unitario_proveedor,
        precio_unitario_base, precio_unitario_promocion, tipo_movimiento,
        responsable_recepcion, observaciones_entrada
      ) VALUES (
        @fecha_entrada, @folio_producto, @cantidad_recibida, @talla, @costo_unitario_proveedor,
        @precio_unitario_base, @precio_unitario_promocion, @tipo_movimiento,
        @responsable_recepcion, @observaciones_entrada
      )
    `)

    stmtEntrada.run({
      ...entrada,
      folio_producto: producto.folio_producto, // Asegurar foreign key
      tipo_movimiento: 'Entrada Inicial'
    })

    // 3. Registrar Talla
    const stmtTalla = db.prepare(`
      INSERT INTO tallas_producto (folio_producto, talla, cantidad)
      VALUES (@folio, @talla, @cantidad)
    `)

    stmtTalla.run({
      folio: producto.folio_producto,
      talla: entrada.talla,
      cantidad: entrada.cantidad_recibida
    })
  })

  try {
    registrar()
    return { success: true }
  } catch (error: any) {
    console.error('Error al registrar nuevo producto:', error)
    if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      throw new Error('El folio del producto ya existe.')
    }
    throw error
  }
})

// Registrar entrada para producto existente (Reabastecimiento)
ipcMain.handle('registrar-entrada-existente', (_event, entrada) => {
  const registrar = db.transaction(() => {
    // 1. Verificar que el producto existe
    const producto = db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get(entrada.folio_producto)
    if (!producto) {
      throw new Error('El producto no existe.')
    }

    // 2. Insertar entrada
    const stmtEntrada = db.prepare(`
      INSERT INTO entradas (
        fecha_entrada, folio_producto, cantidad_recibida, talla, costo_unitario_proveedor,
        precio_unitario_base, precio_unitario_promocion, tipo_movimiento,
        responsable_recepcion, observaciones_entrada
      ) VALUES (
        @fecha_entrada, @folio_producto, @cantidad_recibida, @talla, @costo_unitario_proveedor,
        @precio_unitario_base, @precio_unitario_promocion, @tipo_movimiento,
        @responsable_recepcion, @observaciones_entrada
      )
    `)

    stmtEntrada.run({
      ...entrada,
      tipo_movimiento: 'Reabastecimiento'
    })

    // 3. Actualizar stock del producto
    const stmtUpdate = db.prepare(`
      UPDATE productos 
      SET stock_actual = stock_actual + @cantidad,
          fecha_ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio
    `)

    stmtUpdate.run({
      cantidad: entrada.cantidad_recibida,
      folio: entrada.folio_producto
    })

    // 4. Actualizar/Insertar Talla
    const stmtTalla = db.prepare(`
      INSERT INTO tallas_producto (folio_producto, talla, cantidad)
      VALUES (@folio, @talla, @cantidad)
      ON CONFLICT(folio_producto, talla) DO UPDATE SET
        cantidad = cantidad + @cantidad,
        fecha_actualizacion = CURRENT_TIMESTAMP
    `)

    stmtTalla.run({
      folio: entrada.folio_producto,
      talla: entrada.talla,
      cantidad: entrada.cantidad_recibida
    })
  })

  try {
    registrar()
    return { success: true }
  } catch (error) {
    console.error('Error al registrar entrada:', error)
    throw error
  }
})

// Eliminar una entrada y revertir el stock
ipcMain.handle('eliminar-entrada', (_event, id_entrada) => {
  const eliminar = db.transaction(() => {
    // 1. Obtener datos de la entrada antes de eliminarla
    const entrada = db.prepare(`
      SELECT folio_producto, cantidad_recibida, talla, tipo_movimiento
      FROM entradas
      WHERE id_entrada = ?
    `).get(id_entrada) as any

    if (!entrada) {
      throw new Error('Entrada no encontrada.')
    }

    // 2. Verificar que no sea la entrada inicial (no se puede eliminar si es la única entrada)
    if (entrada.tipo_movimiento === 'Entrada Inicial') {
      const countEntradas = db.prepare(`
        SELECT COUNT(*) as total FROM entradas WHERE folio_producto = ?
      `).get(entrada.folio_producto) as any

      if (countEntradas.total === 1) {
        throw new Error('No se puede eliminar la entrada inicial del producto. Elimine el producto completo desde Inventario.')
      }
    }

    // 3. Revertir stock en productos
    const stmtUpdateStock = db.prepare(`
      UPDATE productos 
      SET stock_actual = stock_actual - @cantidad,
          fecha_ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio
    `)

    stmtUpdateStock.run({
      cantidad: entrada.cantidad_recibida,
      folio: entrada.folio_producto
    })

    // 4. Revertir cantidad en tallas_producto
    const stmtUpdateTalla = db.prepare(`
      UPDATE tallas_producto
      SET cantidad = cantidad - @cantidad,
          fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio AND talla = @talla
    `)

    stmtUpdateTalla.run({
      cantidad: entrada.cantidad_recibida,
      folio: entrada.folio_producto,
      talla: entrada.talla
    })

    // Si la cantidad queda en 0 o negativo, eliminar el registro de talla
    const tallaActual = db.prepare(`
      SELECT cantidad FROM tallas_producto 
      WHERE folio_producto = ? AND talla = ?
    `).get(entrada.folio_producto, entrada.talla) as any

    if (tallaActual && tallaActual.cantidad <= 0) {
      db.prepare(`
        DELETE FROM tallas_producto 
        WHERE folio_producto = ? AND talla = ?
      `).run(entrada.folio_producto, entrada.talla)
    }

    // 5. Eliminar la entrada
    db.prepare('DELETE FROM entradas WHERE id_entrada = ?').run(id_entrada)
  })

  try {
    eliminar()
    return { success: true }
  } catch (error: any) {
    console.error('Error al eliminar entrada:', error)
    throw error
  }
})

// ========== HANDLERS DE CLIENTES ==========

ipcMain.handle('get-clientes', () => {
  try {
    const stmt = db.prepare(`
      SELECT 
        id_cliente,
        nombre_completo,
        telefono,
        saldo_pendiente,
        estado_cuenta
      FROM clientes
      ORDER BY nombre_completo ASC
    `)
    return stmt.all()
  } catch (error) {
    console.error('Error al obtener clientes:', error)
    return []
  }
})

ipcMain.handle('agregar-cliente', (_event, datos) => {
  const { nombre_completo, telefono, saldo_pendiente } = datos

  const agregar = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO clientes (nombre_completo, telefono, saldo_pendiente, estado_cuenta)
      VALUES (@nombre_completo, @telefono, @saldo_pendiente, 
              CASE WHEN @saldo_pendiente > 0 THEN 'Con saldo' ELSE 'Al corriente' END)
    `)
    const resultado = stmt.run({
      nombre_completo: nombre_completo.trim(),
      telefono: telefono || null,
      saldo_pendiente: saldo_pendiente || 0
    })

    // Si hay saldo pendiente inicial, registrar un movimiento
    if (saldo_pendiente && saldo_pendiente > 0) {
      const idCliente = Number(resultado.lastInsertRowid)
      db.prepare(`
        INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
        VALUES (@id_cliente, CURRENT_TIMESTAMP, 'cargo', @monto, 'Saldo inicial', 'Sistema')
      `).run({
        id_cliente: idCliente,
        monto: saldo_pendiente
      })
    }
  })

  try {
    agregar()
    return { success: true }
  } catch (error: any) {
    console.error('Error al agregar cliente:', error)
    if (error.code === 'SQLITE_CONSTRAINT') {
      throw new Error('Ya existe un cliente con ese nombre.')
    }
    throw error
  }
})

ipcMain.handle('eliminar-cliente', (_event, id_cliente) => {
  try {
    // Verificar si el cliente tiene saldo pendiente
    const cliente = db.prepare('SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?').get(id_cliente) as any
    if (!cliente) {
      throw new Error('Cliente no encontrado.')
    }

    if (cliente.saldo_pendiente > 0) {
      throw new Error('No se puede eliminar un cliente con saldo pendiente.')
    }

    db.prepare('DELETE FROM clientes WHERE id_cliente = ?').run(id_cliente)
    return { success: true }
  } catch (error: any) {
    console.error('Error al eliminar cliente:', error)
    throw error
  }
})

ipcMain.handle('get-historial-cliente', (_event, id_cliente) => {
  try {
    // Obtener saldo actual del cliente
    const cliente = db.prepare('SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?').get(id_cliente) as any
    if (!cliente) {
      throw new Error('Cliente no encontrado.')
    }

    // Obtener movimientos ordenados por fecha descendente
    const stmt = db.prepare(`
      SELECT 
        id_movimiento,
        fecha,
        tipo_movimiento,
        monto,
        referencia,
        responsable
      FROM movimientos_cliente
      WHERE id_cliente = ?
      ORDER BY fecha DESC, id_movimiento DESC
    `)
    const movimientos = stmt.all(id_cliente) as any[]

    return {
      movimientos,
      saldoActual: cliente.saldo_pendiente
    }
  } catch (error) {
    console.error('Error al obtener historial del cliente:', error)
    throw error
  }
})

// Obtener productos pendientes de un cliente (Crédito, Apartado, Prestado)
ipcMain.handle('get-productos-pendientes-cliente', (_event, id_cliente) => {
  try {
    // Obtener todas las ventas del cliente que sean Crédito, Apartado o Prestado
    const ventas = db.prepare(`
      SELECT DISTINCT
        v.id_venta,
        v.fecha_venta,
        v.folio_producto,
        v.cantidad_vendida,
        v.talla,
        v.precio_unitario_real,
        v.descuento_aplicado,
        v.tipo_salida,
        v.notas,
        p.nombre_producto,
        p.estado_producto,
        (v.precio_unitario_real * v.cantidad_vendida - COALESCE(v.descuento_aplicado, 0)) as monto_total
      FROM ventas v
      INNER JOIN productos p ON v.folio_producto = p.folio_producto
      WHERE v.id_cliente = ? 
        AND v.tipo_salida IN ('Crédito', 'Apartado', 'Prestado')
      ORDER BY v.fecha_venta DESC
    `).all(id_cliente) as any[]

    // Para cada venta, calcular el monto abonado y faltante
    // Solo retornar productos que aún tienen saldo pendiente (monto_faltante > 0)
    return ventas
      .map((venta) => {
        let montoAbonado = 0
        const montoTotal = venta.monto_total

        // Calcular todos los abonos relacionados con esta venta específica
        const abonos = db.prepare(`
          SELECT COALESCE(SUM(monto), 0) as total_abonado
          FROM movimientos_cliente
          WHERE id_cliente = ?
            AND tipo_movimiento = 'abono'
            AND (referencia LIKE ? OR referencia LIKE ?)
        `).get(
          id_cliente,
          `%Venta #${venta.id_venta}%`,
          `Abono inicial - Venta #${venta.id_venta}%`
        ) as any

        montoAbonado = abonos?.total_abonado || 0
        const montoFaltante = montoTotal - montoAbonado

        return {
          ...venta,
          monto_abonado: montoAbonado,
          monto_faltante: montoFaltante
        }
      })
      .filter((venta) => venta.monto_faltante > 0) // Solo productos con saldo pendiente
  } catch (error) {
    console.error('Error al obtener productos pendientes:', error)
    return []
  }
})

// Registrar abono y actualizar estados si es necesario
ipcMain.handle('registrar-abono-cliente', (_event, datos) => {
  const { id_cliente, monto, id_venta, responsable, notas } = datos

  const procesar = db.transaction(() => {
    // 1. Verificar que el cliente existe
    const cliente = db.prepare('SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?').get(id_cliente) as any
    if (!cliente) {
      throw new Error('Cliente no encontrado.')
    }

    if (monto <= 0) {
      throw new Error('El monto del abono debe ser mayor a 0.')
    }

    // Si se especificó una venta, validar primero contra el monto faltante de esa venta específica
    if (id_venta) {
      const venta = db.prepare(`
        SELECT 
          (v.precio_unitario_real * v.cantidad_vendida - COALESCE(v.descuento_aplicado, 0)) as monto_total
        FROM ventas v
        WHERE v.id_venta = ? AND v.id_cliente = ?
      `).get(id_venta, id_cliente) as any

      if (venta) {
        // Calcular cuánto se ha abonado de esta venta específica
        const abonosVenta = db.prepare(`
          SELECT COALESCE(SUM(monto), 0) as total_abonado
          FROM movimientos_cliente
          WHERE id_cliente = ?
            AND tipo_movimiento = 'abono'
            AND (referencia LIKE ? OR referencia LIKE ?)
        `).get(
          id_cliente,
          `%Venta #${id_venta}%`,
          `Abono inicial - Venta #${id_venta}%`
        ) as any

        const totalAbonado = abonosVenta?.total_abonado || 0
        const montoFaltante = venta.monto_total - totalAbonado

        if (monto > montoFaltante) {
          throw new Error(`El abono ($${monto.toFixed(2)}) no puede ser mayor al monto faltante de este producto ($${montoFaltante.toFixed(2)}).`)
        }
      } else {
        throw new Error('Venta no encontrada.')
      }
    } else {
      // Si no se especificó venta, validar contra el saldo pendiente total del cliente
      if (monto > cliente.saldo_pendiente) {
        throw new Error(`El abono no puede ser mayor al saldo pendiente ($${cliente.saldo_pendiente.toFixed(2)}).`)
      }
    }

    // 2. Actualizar saldo del cliente
    const nuevoSaldo = cliente.saldo_pendiente - monto
    db.prepare(`
      UPDATE clientes 
      SET saldo_pendiente = @nuevo_saldo,
          fecha_ultimo_pago = CURRENT_TIMESTAMP,
          estado_cuenta = CASE 
            WHEN @nuevo_saldo > 0 THEN 'Con saldo'
            ELSE 'Al corriente'
          END
      WHERE id_cliente = @id_cliente
    `).run({
      nuevo_saldo: nuevoSaldo,
      id_cliente
    })

    // 3. Registrar movimiento de abono
    const referencia = id_venta
      ? `Abono - Venta #${id_venta}${notas ? ` - ${notas}` : ''}`
      : `Abono general${notas ? ` - ${notas}` : ''}`

    db.prepare(`
      INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
      VALUES (@id_cliente, CURRENT_TIMESTAMP, 'abono', @monto, @referencia, @responsable)
    `).run({
      id_cliente,
      monto,
      referencia,
      responsable: responsable || null
    })

    // 4. Verificar si se completó el pago de alguna venta
    // Si se especificó una venta, verificar solo esa; si no, verificar todas las ventas pendientes
    const ventasAVerificar = id_venta
      ? [id_venta]
      : db.prepare(`
          SELECT DISTINCT v.id_venta
          FROM ventas v
          INNER JOIN productos p ON v.folio_producto = p.folio_producto
          WHERE v.id_cliente = ?
            AND v.tipo_salida IN ('Crédito', 'Apartado', 'Prestado')
            AND p.estado_producto IN ('Crédito', 'Apartado', 'Prestado')
        `).all(id_cliente).map((v: any) => v.id_venta)

    for (const ventaId of ventasAVerificar) {
      const venta = db.prepare(`
        SELECT 
          v.folio_producto,
          v.tipo_salida,
          (v.precio_unitario_real * v.cantidad_vendida - COALESCE(v.descuento_aplicado, 0)) as monto_venta,
          p.estado_producto
        FROM ventas v
        INNER JOIN productos p ON v.folio_producto = p.folio_producto
        WHERE v.id_venta = ? AND v.id_cliente = ?
      `).get(ventaId, id_cliente) as any

      if (venta) {
        // Calcular cuánto se ha pagado de esta venta
        // Incluir abono inicial de la venta y todos los abonos posteriores
        const abonosVenta = db.prepare(`
          SELECT COALESCE(SUM(monto), 0) as total_abonado
          FROM movimientos_cliente
          WHERE id_cliente = ? 
            AND tipo_movimiento = 'abono'
            AND (referencia LIKE ? OR referencia LIKE ?)
        `).get(id_cliente, `%Venta #${ventaId}%`, `Abono inicial - Venta #${ventaId}%`) as any

        const totalAbonado = abonosVenta?.total_abonado || 0
        const montoVenta = venta.monto_venta

        // Si se completó el pago y el producto está en estado pendiente
        if (totalAbonado >= montoVenta && venta.estado_producto !== 'Vendido' && venta.estado_producto !== 'Disponible') {
          const estadoAnterior = venta.estado_producto
          // Crédito y Apartado se convierten en Vendido cuando se completa el pago
          // Prestado se convierte en Disponible cuando se devuelve
          const estadoNuevo = venta.tipo_salida === 'Prestado' ? 'Disponible' : 'Vendido'

          // Actualizar estado del producto
          db.prepare(`
            UPDATE productos 
            SET estado_producto = @estado_nuevo
            WHERE folio_producto = @folio
          `).run({
            estado_nuevo: estadoNuevo,
            folio: venta.folio_producto
          })

          // Registrar cambio de estado
          db.prepare(`
            INSERT INTO estados_producto (folio_producto, fecha_cambio, estado_anterior, estado_nuevo, motivo, responsable)
            VALUES (@folio, CURRENT_TIMESTAMP, @estado_anterior, @estado_nuevo, @motivo, @responsable)
          `).run({
            folio: venta.folio_producto,
            estado_anterior: estadoAnterior,
            estado_nuevo: estadoNuevo,
            motivo: `Pago completado${notas ? ` - ${notas}` : ''}`,
            responsable: responsable || null
          })
        }
      }
    }

    return { success: true, nuevoSaldo }
  })

  try {
    return procesar()
  } catch (error: any) {
    console.error('Error al registrar abono:', error)
    throw error
  }
})

// Marcar producto prestado como devuelto
ipcMain.handle('marcar-prestado-devuelto', (_event, datos) => {
  const { id_venta, responsable, notas } = datos

  const procesar = db.transaction(() => {
    // Obtener información de la venta
    const venta = db.prepare(`
      SELECT 
        v.folio_producto,
        p.estado_producto
      FROM ventas v
      INNER JOIN productos p ON v.folio_producto = p.folio_producto
      WHERE v.id_venta = ? AND v.tipo_salida = 'Prestado'
    `).get(id_venta) as any

    if (!venta) {
      throw new Error('Venta no encontrada o no es un producto prestado.')
    }

    if (venta.estado_producto !== 'Prestado') {
      throw new Error('Este producto ya no está marcado como prestado.')
    }

    // El estado anterior es siempre 'Prestado' según la validación de arriba

    // Actualizar estado del producto a Disponible
    db.prepare(`
      UPDATE productos 
      SET estado_producto = 'Disponible'
      WHERE folio_producto = @folio
    `).run({
      folio: venta.folio_producto
    })

    // Registrar cambio de estado
    db.prepare(`
      INSERT INTO estados_producto (folio_producto, fecha_cambio, estado_anterior, estado_nuevo, motivo, responsable)
      VALUES (@folio, CURRENT_TIMESTAMP, @estadoAnterior, 'Disponible', @motivo, @responsable)
    `).run({
      folio: venta.folio_producto,
      estadoAnterior: 'Prestado',
      motivo: `Producto prestado devuelto${notas ? ` - ${notas}` : ''}`,
      responsable: responsable || null
    })

    return { success: true }
  })

  try {
    return procesar()
  } catch (error: any) {
    console.error('Error al marcar producto como devuelto:', error)
    throw error
  }
})

// ========== HANDLERS DE VENTAS ==========

ipcMain.handle('get-productos-disponibles', () => {
  try {
    const stmt = db.prepare(`
      SELECT 
        p.*, 
        json_group_array(json_object('talla', tp.talla, 'cantidad', tp.cantidad)) as tallas_detalle
      FROM productos p
      LEFT JOIN tallas_producto tp ON p.folio_producto = tp.folio_producto
      WHERE p.stock_actual > 0
      GROUP BY p.folio_producto
      HAVING SUM(tp.cantidad) > 0
      ORDER BY p.fecha_ultima_actualizacion DESC
    `)
    const productos = stmt.all()

    return productos.map((p: any) => ({
      ...p,
      tallas_detalle: p.tallas_detalle ? JSON.parse(p.tallas_detalle) : []
    }))
  } catch (error) {
    console.error('Error al obtener productos disponibles:', error)
    return []
  }
})

ipcMain.handle('registrar-venta', (_event, datos) => {
  const {
    fecha_venta,
    folio_producto,
    cantidad_vendida,
    talla,
    precio_unitario_real,
    descuento_aplicado,
    tipo_salida,
    id_cliente,
    abono_inicial,
    responsable_caja,
    notas
  } = datos

  const registrar = db.transaction(() => {
    // 1. Verificar que el producto existe y tiene stock suficiente
    const producto = db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get(folio_producto) as any
    if (!producto) {
      throw new Error('Producto no encontrado.')
    }

    // Verificar stock en la talla específica
    const tallaInfo = db.prepare(`
      SELECT cantidad FROM tallas_producto 
      WHERE folio_producto = ? AND talla = ?
    `).get(folio_producto, talla) as any

    if (!tallaInfo || tallaInfo.cantidad < cantidad_vendida) {
      throw new Error(`Stock insuficiente. Disponible en talla ${talla}: ${tallaInfo?.cantidad || 0}`)
    }

    // 2. Insertar registro de venta
    const stmtVenta = db.prepare(`
      INSERT INTO ventas (
        fecha_venta, folio_producto, cantidad_vendida, talla,
        precio_unitario_real, descuento_aplicado, tipo_salida,
        id_cliente, responsable_caja, notas
      ) VALUES (
        @fecha_venta, @folio_producto, @cantidad_vendida, @talla,
        @precio_unitario_real, @descuento_aplicado, @tipo_salida,
        @id_cliente, @responsable_caja, @notas
      )
    `)

    const resultado = stmtVenta.run({
      fecha_venta,
      folio_producto,
      cantidad_vendida,
      talla,
      precio_unitario_real,
      descuento_aplicado: descuento_aplicado || 0,
      tipo_salida,
      id_cliente: id_cliente || null,
      responsable_caja,
      notas: notas || null
    })

    // 3. Actualizar stock del producto
    db.prepare(`
      UPDATE productos 
      SET stock_actual = stock_actual - @cantidad,
          fecha_ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio
    `).run({
      cantidad: cantidad_vendida,
      folio: folio_producto
    })

    // 4. Actualizar cantidad en tallas_producto
    db.prepare(`
      UPDATE tallas_producto
      SET cantidad = cantidad - @cantidad,
          fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio AND talla = @talla
    `).run({
      cantidad: cantidad_vendida,
      folio: folio_producto,
      talla
    })

    // Si la cantidad queda en 0, eliminar el registro de talla
    const tallaActual = db.prepare(`
      SELECT cantidad FROM tallas_producto 
      WHERE folio_producto = ? AND talla = ?
    `).get(folio_producto, talla) as any

    if (tallaActual && tallaActual.cantidad <= 0) {
      db.prepare(`
        DELETE FROM tallas_producto 
        WHERE folio_producto = ? AND talla = ?
      `).run(folio_producto, talla)
    }

    // 5. Si es crédito o apartado, actualizar saldo del cliente
    if (id_cliente && (tipo_salida === 'Crédito' || tipo_salida === 'Apartado')) {
      const montoTotal = (precio_unitario_real * cantidad_vendida) - (descuento_aplicado || 0)
      const abono = abono_inicial || 0

      // Validar que el abono no exceda el monto total (seguridad en backend)
      if (abono > montoTotal) {
        throw new Error(`El abono inicial ($${abono.toFixed(2)}) no puede ser mayor al monto total ($${montoTotal.toFixed(2)}). Esto generaría un saldo negativo.`)
      }

      if (abono < 0) {
        throw new Error('El abono inicial no puede ser negativo.')
      }

      // 1. Primero registrar el cargo por el monto TOTAL de la venta
      db.prepare(`
        UPDATE clientes 
        SET saldo_pendiente = saldo_pendiente + @monto,
            estado_cuenta = 'Con saldo'
        WHERE id_cliente = @id_cliente
      `).run({
        monto: montoTotal,
        id_cliente
      })

      // Registrar movimiento de cargo por el total
      db.prepare(`
        INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
        VALUES (@id_cliente, @fecha, 'cargo', @monto, @referencia, @responsable)
      `).run({
        id_cliente,
        fecha: fecha_venta,
        monto: montoTotal,
        referencia: `Venta #${resultado.lastInsertRowid}`,
        responsable: responsable_caja
      })

      // 2. Si hay abono inicial, registrarlo como un abono que reduce el saldo
      if (abono > 0) {
        db.prepare(`
          UPDATE clientes 
          SET saldo_pendiente = saldo_pendiente - @monto,
              estado_cuenta = CASE 
                WHEN saldo_pendiente - @monto > 0 THEN 'Con saldo'
                ELSE 'Al corriente'
              END
          WHERE id_cliente = @id_cliente
        `).run({
          monto: abono,
          id_cliente
        })

        // Registrar movimiento de abono
        db.prepare(`
          INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
          VALUES (@id_cliente, @fecha, 'abono', @monto, @referencia, @responsable)
        `).run({
          id_cliente,
          fecha: fecha_venta,
          monto: abono,
          referencia: `Abono inicial - Venta #${resultado.lastInsertRowid}`,
          responsable: responsable_caja
        })
      }
    }

    // 6. Actualizar estado del producto si es crédito, apartado o prestado
    if (tipo_salida === 'Crédito' || tipo_salida === 'Apartado' || tipo_salida === 'Prestado') {
      const estadoAnterior = db.prepare('SELECT estado_producto FROM productos WHERE folio_producto = ?').get(folio_producto) as any

      db.prepare(`
        UPDATE productos 
        SET estado_producto = @estado_nuevo
        WHERE folio_producto = @folio
      `).run({
        estado_nuevo: tipo_salida,
        folio: folio_producto
      })

      // Registrar cambio de estado
      db.prepare(`
        INSERT INTO estados_producto (folio_producto, fecha_cambio, estado_anterior, estado_nuevo, motivo, responsable)
        VALUES (@folio, @fecha, @estado_anterior, @estado_nuevo, @motivo, @responsable)
      `).run({
        folio: folio_producto,
        fecha: fecha_venta,
        estado_anterior: estadoAnterior?.estado_producto || 'Disponible',
        estado_nuevo: tipo_salida,
        motivo: notas || `Venta registrada como ${tipo_salida}`,
        responsable: responsable_caja
      })
    }
  })

  try {
    registrar()
    return { success: true }
  } catch (error: any) {
    console.error('Error al registrar venta:', error)
    throw error
  }
})

// Eliminar una venta y revertir stock y movimientos del cliente
ipcMain.handle('eliminar-venta', (_event, id_venta) => {
  const eliminar = db.transaction(() => {
    // 1. Obtener datos de la venta antes de eliminarla
    const venta = db.prepare(`
      SELECT 
        folio_producto,
        cantidad_vendida,
        talla,
        tipo_salida,
        id_cliente,
        precio_unitario_real,
        descuento_aplicado
      FROM ventas
      WHERE id_venta = ?
    `).get(id_venta) as any

    if (!venta) {
      throw new Error('Venta no encontrada.')
    }

    // 2. Revertir stock del producto
    db.prepare(`
      UPDATE productos 
      SET stock_actual = stock_actual + @cantidad,
          fecha_ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio
    `).run({
      cantidad: venta.cantidad_vendida,
      folio: venta.folio_producto
    })

    // 3. Revertir cantidad en tallas_producto
    const tallaExistente = db.prepare(`
      SELECT cantidad FROM tallas_producto 
      WHERE folio_producto = ? AND talla = ?
    `).get(venta.folio_producto, venta.talla) as any

    if (tallaExistente) {
      db.prepare(`
        UPDATE tallas_producto
        SET cantidad = cantidad + @cantidad,
            fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE folio_producto = @folio AND talla = @talla
      `).run({
        cantidad: venta.cantidad_vendida,
        folio: venta.folio_producto,
        talla: venta.talla
      })
    } else {
      // Si no existe el registro, crearlo
      db.prepare(`
        INSERT INTO tallas_producto (folio_producto, talla, cantidad, fecha_actualizacion)
        VALUES (@folio, @talla, @cantidad, CURRENT_TIMESTAMP)
      `).run({
        folio: venta.folio_producto,
        talla: venta.talla,
        cantidad: venta.cantidad_vendida
      })
    }

    // 4. Si es crédito o apartado, revertir movimientos del cliente
    if (venta.id_cliente && (venta.tipo_salida === 'Crédito' || venta.tipo_salida === 'Apartado')) {
      const montoTotal = (venta.precio_unitario_real * venta.cantidad_vendida) - (venta.descuento_aplicado || 0)

      // Obtener todos los abonos relacionados con esta venta
      const abonos = db.prepare(`
        SELECT COALESCE(SUM(monto), 0) as total_abonado
        FROM movimientos_cliente
        WHERE id_cliente = ?
          AND tipo_movimiento = 'abono'
          AND (referencia LIKE ? OR referencia LIKE ?)
      `).get(venta.id_cliente, `%Venta #${id_venta}%`, `Abono inicial - Venta #${id_venta}%`) as any

      const totalAbonado = abonos?.total_abonado || 0
      const saldoARevertir = montoTotal - totalAbonado

      // Revertir el saldo pendiente del cliente
      if (saldoARevertir > 0) {
        db.prepare(`
          UPDATE clientes 
          SET saldo_pendiente = saldo_pendiente - @monto,
              estado_cuenta = CASE 
                WHEN saldo_pendiente - @monto > 0 THEN 'Con saldo'
                ELSE 'Al corriente'
              END
          WHERE id_cliente = @id_cliente
        `).run({
          monto: saldoARevertir,
          id_cliente: venta.id_cliente
        })
      }

      // Eliminar todos los movimientos relacionados con esta venta
      db.prepare(`
        DELETE FROM movimientos_cliente
        WHERE id_cliente = ?
          AND (referencia LIKE ? OR referencia LIKE ?)
      `).run(venta.id_cliente, `%Venta #${id_venta}%`, `Abono inicial - Venta #${id_venta}%`)
    }

    // 5. Si es apartado o prestado, revertir estado del producto
    if (venta.tipo_salida === 'Apartado' || venta.tipo_salida === 'Prestado') {
      // Obtener el estado anterior del historial de estados
      const ultimoEstado = db.prepare(`
        SELECT estado_anterior 
        FROM estados_producto
        WHERE folio_producto = ?
          AND estado_nuevo = ?
        ORDER BY fecha_cambio DESC
        LIMIT 1
      `).get(venta.folio_producto, venta.tipo_salida) as any

      const estadoNuevo = ultimoEstado?.estado_anterior || 'Disponible'

      db.prepare(`
        UPDATE productos 
        SET estado_producto = @estadoNuevo
        WHERE folio_producto = @folio
      `).run({
        estadoNuevo,
        folio: venta.folio_producto
      })

      // Registrar cambio de estado
      db.prepare(`
        INSERT INTO estados_producto (folio_producto, fecha_cambio, estado_anterior, estado_nuevo, motivo, responsable)
        VALUES (@folio, CURRENT_TIMESTAMP, @estadoAnterior, @estadoNuevo, @motivo, @responsable)
      `).run({
        folio: venta.folio_producto,
        estadoAnterior: venta.tipo_salida,
        estadoNuevo,
        motivo: 'Venta eliminada - Estado revertido',
        responsable: null
      })
    } else if (venta.tipo_salida === 'Crédito') {
      // Para crédito, verificar si el producto está en estado Crédito y revertirlo
      const producto = db.prepare('SELECT estado_producto FROM productos WHERE folio_producto = ?').get(venta.folio_producto) as any
      if (producto?.estado_producto === 'Crédito') {
        const ultimoEstado = db.prepare(`
          SELECT estado_anterior 
          FROM estados_producto
          WHERE folio_producto = ?
            AND estado_nuevo = 'Crédito'
          ORDER BY fecha_cambio DESC
          LIMIT 1
        `).get(venta.folio_producto) as any

        const estadoNuevo = ultimoEstado?.estado_anterior || 'Disponible'

        db.prepare(`
          UPDATE productos 
          SET estado_producto = @estadoNuevo
          WHERE folio_producto = @folio
        `).run({
          estadoNuevo,
          folio: venta.folio_producto
        })

        db.prepare(`
          INSERT INTO estados_producto (folio_producto, fecha_cambio, estado_anterior, estado_nuevo, motivo, responsable)
          VALUES (@folio, CURRENT_TIMESTAMP, 'Crédito', @estadoNuevo, 'Venta eliminada - Estado revertido', NULL)
        `).run({
          folio: venta.folio_producto,
          estadoNuevo
        })
      }
    }

    // 6. Eliminar la venta
    db.prepare('DELETE FROM ventas WHERE id_venta = ?').run(id_venta)

    return { success: true }
  })

  try {
    return eliminar()
  } catch (error: any) {
    console.error('Error al eliminar venta:', error)
    throw error
  }
})

let ventanaPrincipal: BrowserWindow | null

function crearVentana() {
  ventanaPrincipal = new BrowserWindow({
    icon: path.join(VITE_PUBLIC_DIR, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  ventanaPrincipal.webContents.on('did-finish-load', () => {
    ventanaPrincipal?.webContents.send('main-process-message', new Date().toLocaleString('es-ES'))
  })

  if (VITE_DEV_SERVER_URL) {
    ventanaPrincipal.loadURL(VITE_DEV_SERVER_URL)
  } else {
    ventanaPrincipal.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    ventanaPrincipal = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    crearVentana()
  }
})

app.whenReady().then(crearVentana)
