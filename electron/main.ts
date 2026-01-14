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

// Determinar si la app está empaquetada
const isPackaged = app.isPackaged

// Rutas para la base de datos
// En desarrollo: usamos la carpeta del proyecto
// En producción: usamos userData (AppData en Windows, ~/.config en Linux, etc.)
let dbDir: string
let schemaPath: string

if (isPackaged) {
  // Producción: base de datos en userData (persistente y escribible)
  dbDir = path.join(app.getPath('userData'), 'database')
  // El schema está en resources (extraResources)
  schemaPath = path.join(process.resourcesPath, 'database', 'schema.sql')
} else {
  // Desarrollo: base de datos en la carpeta del proyecto
  dbDir = path.join(process.env.APP_ROOT, 'database')
  schemaPath = path.join(process.env.APP_ROOT, 'database', 'schema.sql')
}

const dbPath = path.join(dbDir, 'marly.db')

// Asegurar que el directorio de la base de datos existe
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

// Determinar la ruta del binding nativo de better-sqlite3
let nativeBindingPath: string
if (isPackaged) {
  // En producción, el binding está en node_modules dentro de resources/app.asar.unpacked
  nativeBindingPath = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node'
  )
} else {
  nativeBindingPath = path.join(
    process.env.APP_ROOT,
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node'
  )
}

// @ts-ignore
const db = new Database(dbPath, { verbose: console.log, nativeBinding: nativeBindingPath })

// Ejecutar esquema si la base de datos es nueva o está vacía
const initDb = () => {
  try {
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf-8')
      db.exec(schema)
      console.log('Base de datos inicializada/verificada.')
    } else {
      console.warn('Archivo de esquema no encontrado:', schemaPath)
    }
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error)
  }
}

initDb()

// Migración para actualizar la restricción CHECK en movimientos_cliente
const migrateDatabase = () => {
  try {
    // Verificar si la tabla ya tiene la restricción actualizada
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='movimientos_cliente'").get() as any
    if (tableInfo && !tableInfo.sql.includes("'reembolso'")) {
      console.log('Migrando tabla movimientos_cliente para permitir reembolsos...')

      db.transaction(() => {
        // 1. Renombrar tabla actual
        db.prepare("ALTER TABLE movimientos_cliente RENAME TO movimientos_cliente_old").run()

        // 2. Crear nueva tabla con la restricción actualizada
        db.prepare(`
          CREATE TABLE movimientos_cliente (
            id_movimiento INTEGER PRIMARY KEY AUTOINCREMENT,
            id_cliente INTEGER NOT NULL,
            fecha TEXT NOT NULL,
            tipo_movimiento TEXT NOT NULL,
            monto REAL NOT NULL,
            referencia TEXT,
            responsable TEXT,
            FOREIGN KEY (id_cliente) REFERENCES clientes (id_cliente) ON UPDATE CASCADE ON DELETE CASCADE,
            CHECK (monto >= 0),
            CHECK (tipo_movimiento IN ('cargo', 'abono', 'reembolso', 'devolucion'))
          )
        `).run()

        // 3. Copiar datos
        db.prepare(`
          INSERT INTO movimientos_cliente (id_movimiento, id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
          SELECT id_movimiento, id_cliente, fecha, tipo_movimiento, monto, referencia, responsable
          FROM movimientos_cliente_old
        `).run()

        // 4. Eliminar tabla antigua
        db.prepare("DROP TABLE movimientos_cliente_old").run()
      })()

      console.log('Migración completada exitosamente.')
    }
  } catch (error) {
    console.error('Error durante la migración de base de datos:', error)
  }
}

migrateDatabase()

// IPC Handlers para la base de datos
ipcMain.handle('get-productos', () => {
  try {
    const stmt = db.prepare(`
      SELECT 
        p.*, 
        json_group_array(json_object('talla', tp.talla, 'cantidad', tp.cantidad)) as tallas_detalle,
        (SELECT precio_unitario_base FROM entradas WHERE folio_producto = p.folio_producto ORDER BY id_entrada DESC LIMIT 1) as ultimo_precio
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
  const { folio_producto, nuevo_stock, talla, motivo, responsable } = datos

  if (!talla) {
    throw new Error('Es necesario especificar la talla para ajustar el stock.')
  }

  const actualizar = db.transaction(() => {
    // 1. Obtener stock anterior de la talla
    const tallaActual = db.prepare('SELECT cantidad FROM tallas_producto WHERE folio_producto = ? AND talla = ?').get(folio_producto, talla) as any
    const stockAnterior = tallaActual ? tallaActual.cantidad : 0
    const diferencia = nuevo_stock - stockAnterior

    if (diferencia === 0) return // No hay cambios

    // 2. Actualizar/Insertar Talla
    const stmtTalla = db.prepare(`
      INSERT INTO tallas_producto (folio_producto, talla, cantidad, fecha_actualizacion)
      VALUES (@folio, @talla, @cantidad, CURRENT_TIMESTAMP)
      ON CONFLICT(folio_producto, talla) DO UPDATE SET
        cantidad = @cantidad,
        fecha_actualizacion = CURRENT_TIMESTAMP
    `)

    stmtTalla.run({
      folio: folio_producto,
      talla,
      cantidad: nuevo_stock
    })

    // 3. Actualizar stock total del producto
    const stmtProducto = db.prepare(`
      UPDATE productos 
      SET stock_actual = stock_actual + @diferencia,
          fecha_ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio
    `)

    stmtProducto.run({
      diferencia,
      folio: folio_producto
    })

    // 4. Registrar movimiento en historial (usando tabla entradas con tipo especial 'Ajuste')
    // Esto es opcional pero muy útil para auditoría
    const stmtHistorial = db.prepare(`
      INSERT INTO entradas (
        fecha_entrada, folio_producto, cantidad_recibida, talla, 
        costo_unitario_proveedor, precio_unitario_base, 
        tipo_movimiento, responsable_recepcion, observaciones_entrada
      ) VALUES (
        CURRENT_TIMESTAMP, @folio, @cantidad, @talla, 
        0, 0, 
        'Ajuste Manual', @responsable, @motivo
      )
    `)

    stmtHistorial.run({
      folio: folio_producto,
      cantidad: diferencia, // Puede ser negativo
      talla,
      responsable: responsable || 'Sistema',
      motivo: motivo || 'Ajuste de inventario'
    })
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

// Responsables handlers
ipcMain.handle('get-responsables', () => {
  try {
    const stmt = db.prepare('SELECT id_responsable, nombre FROM responsables WHERE activo = 1 ORDER BY nombre')
    return stmt.all()
  } catch (error) {
    console.error('Error al obtener responsables:', error)
    return []
  }
})

ipcMain.handle('agregar-responsable', (_event, nombre: string) => {
  try {
    const nombreTrim = nombre.trim()
    if (!nombreTrim) throw new Error('El nombre no puede estar vacío')
    const stmt = db.prepare('INSERT INTO responsables (nombre) VALUES (?)')
    const result = stmt.run(nombreTrim)
    return { success: true, id: result.lastInsertRowid }
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('Este responsable ya existe.')
    }
    throw error
  }
})

ipcMain.handle('eliminar-responsable', (_event, id: number) => {
  try {
    // Soft delete - just mark as inactive
    const stmt = db.prepare('UPDATE responsables SET activo = 0 WHERE id_responsable = ?')
    stmt.run(id)
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar responsable:', error)
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
        ...venta,
        precio_unitario: venta.precio_unitario_real,
        monto_vendido: montoVendido,
        saldo_pendiente: montoTotal - montoVendido
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

    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    const fechaLocal = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`

    db.prepare(`
      INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
      VALUES (@id_cliente, @fecha, 'abono', @monto, @referencia, @responsable)
    `).run({
      id_cliente,
      fecha: fechaLocal,
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
ipcMain.handle('devolver-venta', (_event, id_venta, responsable) => {
  const devolver = db.transaction(() => {
    // 1. Obtener datos de la venta
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

    if (venta.tipo_salida === 'Devolución') {
      throw new Error('Esta venta ya fue devuelta.')
    }

    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    const fechaLocal = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`

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
      db.prepare(`
        INSERT INTO tallas_producto (folio_producto, talla, cantidad, fecha_actualizacion)
        VALUES (@folio, @talla, @cantidad, CURRENT_TIMESTAMP)
      `).run({
        folio: venta.folio_producto,
        talla: venta.talla,
        cantidad: venta.cantidad_vendida
      })
    }

    // 4. Si es crédito o apartado, manejar movimientos del cliente
    if (venta.id_cliente && (venta.tipo_salida === 'Crédito' || venta.tipo_salida === 'Apartado')) {
      const montoTotal = (venta.precio_unitario_real * venta.cantidad_vendida) - (venta.descuento_aplicado || 0)

      // Obtener todos los abonos relacionados con esta venta
      const abonosResult = db.prepare(`
        SELECT id_movimiento, monto, referencia
        FROM movimientos_cliente
        WHERE id_cliente = ?
          AND tipo_movimiento = 'abono'
          AND (referencia LIKE ? OR referencia LIKE ?)
      `).all(venta.id_cliente, `%Venta #${id_venta}%`, `Abono inicial - Venta #${id_venta}%`) as any[]

      let totalReembolsado = 0

      // Convertir cada abono a reembolso
      for (const abono of abonosResult) {
        totalReembolsado += abono.monto

        // Actualizar el movimiento existente a reembolso
        db.prepare(`
          UPDATE movimientos_cliente
          SET tipo_movimiento = 'reembolso',
              referencia = @nuevaReferencia,
              fecha = @fecha
          WHERE id_movimiento = @id_movimiento
        `).run({
          id_movimiento: abono.id_movimiento,
          nuevaReferencia: `Reembolso - ${abono.referencia}`,
          fecha: fechaLocal
        })
      }

      // Agregar movimiento de devolución para cancelar el cargo original
      db.prepare(`
        INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
        VALUES (@id_cliente, @fecha, 'devolucion', @monto, @referencia, @responsable)
      `).run({
        id_cliente: venta.id_cliente,
        fecha: fechaLocal,
        monto: montoTotal,
        referencia: `Devolución - Venta #${id_venta}`,
        responsable: responsable || null
      })

      // Ajustar saldo del cliente: restar el cargo original y devolver los reembolsos
      const saldoARestar = montoTotal - totalReembolsado
      if (saldoARestar !== 0) {
        db.prepare(`
          UPDATE clientes 
          SET saldo_pendiente = saldo_pendiente - @monto,
              estado_cuenta = CASE 
                WHEN saldo_pendiente - @monto > 0 THEN 'Con saldo'
                ELSE 'Al corriente'
              END
          WHERE id_cliente = @id_cliente
        `).run({
          monto: saldoARestar,
          id_cliente: venta.id_cliente
        })
      }
    }

    // 5. Revertir estado del producto si aplica
    if (venta.tipo_salida === 'Apartado' || venta.tipo_salida === 'Prestado' || venta.tipo_salida === 'Crédito') {
      const producto = db.prepare('SELECT estado_producto FROM productos WHERE folio_producto = ?').get(venta.folio_producto) as any
      if (producto?.estado_producto === venta.tipo_salida) {
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

        db.prepare(`
          INSERT INTO estados_producto (folio_producto, fecha_cambio, estado_anterior, estado_nuevo, motivo, responsable)
          VALUES (@folio, @fecha, @estadoAnterior, @estadoNuevo, 'Devolución de venta', @responsable)
        `).run({
          folio: venta.folio_producto,
          fecha: fechaLocal,
          estadoAnterior: venta.tipo_salida,
          estadoNuevo,
          responsable: responsable || null
        })
      }
    }

    // 6. Eliminar la venta completamente
    db.prepare('DELETE FROM ventas WHERE id_venta = ?').run(id_venta)

    return { success: true }
  })

  try {
    return devolver()
  } catch (error: any) {
    console.error('Error al devolver venta:', error)
    throw error
  }
})

// Eliminar un movimiento de cliente y ajustar su saldo
ipcMain.handle('eliminar-movimiento-cliente', (_event, id_movimiento) => {
  const eliminar = db.transaction(() => {
    // 1. Obtener datos del movimiento antes de eliminarlo
    const movimiento = db.prepare(`
      SELECT 
        id_cliente,
        tipo_movimiento,
        monto,
        referencia
      FROM movimientos_cliente
      WHERE id_movimiento = ?
    `).get(id_movimiento) as any

    if (!movimiento) {
      throw new Error('Movimiento no encontrado.')
    }

    // 2. Ajustar el saldo del cliente según tipo de movimiento
    // Si era un cargo, restamos (porque lo estamos eliminando)
    // Si era un abono, sumamos (porque lo estamos eliminando)
    const ajuste = movimiento.tipo_movimiento === 'cargo'
      ? -movimiento.monto
      : movimiento.monto

    db.prepare(`
      UPDATE clientes 
      SET saldo_pendiente = saldo_pendiente + @ajuste,
          estado_cuenta = CASE 
            WHEN saldo_pendiente + @ajuste > 0 THEN 'Con saldo'
            ELSE 'Al corriente'
          END
      WHERE id_cliente = @id_cliente
    `).run({
      ajuste,
      id_cliente: movimiento.id_cliente
    })

    // 3. Eliminar el movimiento
    db.prepare('DELETE FROM movimientos_cliente WHERE id_movimiento = ?').run(id_movimiento)

    return { success: true }
  })

  try {
    return eliminar()
  } catch (error: any) {
    console.error('Error al eliminar movimiento de cliente:', error)
    throw error
  }
})

// =============================================
// ESTADÍSTICAS
// =============================================

// Resumen de KPIs principales
ipcMain.handle('get-estadisticas-resumen', (_event, filtro: { fechaInicio?: string, fechaFin?: string } = {}) => {
  const hoy = new Date().toISOString().split('T')[0]
  const fechaInicio = filtro.fechaInicio || hoy
  const fechaFin = filtro.fechaFin || hoy

  // Ventas del período (solo tipo Venta, dinero recibido)
  const ventasPeriodo = db.prepare(`
    SELECT 
      COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0) as total_ventas,
      COALESCE(COUNT(*), 0) as num_ventas
    FROM ventas
    WHERE DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
  `).get(fechaInicio, fechaFin) as any

  // Costos del período (basado en las ventas realizadas)
  const costosPeriodo = db.prepare(`
    SELECT COALESCE(SUM(
      v.cantidad_vendida * (
        SELECT COALESCE(e.costo_unitario_proveedor, 0)
        FROM entradas e
        WHERE e.folio_producto = v.folio_producto AND e.talla = v.talla
        ORDER BY e.fecha_entrada DESC
        LIMIT 1
      )
    ), 0) as total_costos
    FROM ventas v
    WHERE DATE(v.fecha_venta) >= DATE(?) AND DATE(v.fecha_venta) <= DATE(?)
  `).get(fechaInicio, fechaFin) as any

  // Dinero cobrado (Ventas directas + Abonos de créditos/apartados)
  const cobradoPeriodo = db.prepare(`
    SELECT (
      -- 1. Ventas directas (tipo 'Venta')
      (SELECT COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0)
       FROM ventas
       WHERE tipo_salida = 'Venta'
       AND DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?))
      +
      -- 2. Abonos recibidos (iniciales y posteriores)
      (SELECT COALESCE(SUM(monto), 0)
       FROM movimientos_cliente
       WHERE tipo_movimiento = 'abono'
       AND DATE(fecha) >= DATE(?) AND DATE(fecha) <= DATE(?))
    ) as total_cobrado
  `).get(fechaInicio, fechaFin, fechaInicio, fechaFin) as any

  // Saldo pendiente total de clientes
  const saldoPendiente = db.prepare(`
    SELECT COALESCE(SUM(saldo_pendiente), 0) as total_pendiente
    FROM clientes
    WHERE saldo_pendiente > 0
  `).get() as any

  // Valor del inventario actual
  const valorInventario = db.prepare(`
    SELECT COALESCE(SUM(
      tp.cantidad * (
        SELECT COALESCE(e.costo_unitario_proveedor, 0)
        FROM entradas e
        WHERE e.folio_producto = tp.folio_producto AND e.talla = tp.talla
        ORDER BY e.fecha_entrada DESC
        LIMIT 1
      )
    ), 0) as valor_inventario
    FROM tallas_producto tp
    WHERE tp.cantidad > 0
  `).get() as any

  const totalVentas = ventasPeriodo?.total_ventas || 0
  const totalCostos = costosPeriodo?.total_costos || 0

  return {
    ventasTotales: totalVentas,
    costosTotales: totalCostos,
    gananciaNeta: totalVentas - totalCostos,
    totalCobrado: cobradoPeriodo?.total_cobrado || 0,
    saldoPendiente: saldoPendiente?.total_pendiente || 0,
    valorInventario: valorInventario?.valor_inventario || 0,
    numVentas: ventasPeriodo?.num_ventas || 0
  }
})

// Ventas agrupadas por período para gráfica temporal
ipcMain.handle('get-ventas-por-periodo', (_event, filtro: { fechaInicio: string, fechaFin: string, agrupacion?: string }) => {
  const { fechaInicio, fechaFin, agrupacion = 'dia' } = filtro

  let groupBy: string
  let selectPeriodo: string

  switch (agrupacion) {
    case 'hora':
      // Para "Hoy" - agrupar por hora
      selectPeriodo = "strftime('%H', fecha_venta)"
      groupBy = "strftime('%H', fecha_venta)"
      break
    case 'dia_semana':
      // Para "Semana" - agrupar por día de la semana (0=Domingo, 1=Lunes, etc)
      selectPeriodo = "strftime('%w', fecha_venta)"
      groupBy = "strftime('%w', fecha_venta)"
      break
    case 'dia_mes':
      // Para "Mes" - agrupar por día del mes
      selectPeriodo = "strftime('%d', fecha_venta)"
      groupBy = "strftime('%d', fecha_venta)"
      break
    case 'mes':
      // Para "Año" - agrupar por mes
      selectPeriodo = "strftime('%m', fecha_venta)"
      groupBy = "strftime('%m', fecha_venta)"
      break
    default:
      // Por defecto - agrupar por fecha completa
      selectPeriodo = "DATE(fecha_venta)"
      groupBy = "DATE(fecha_venta)"
  }

  const ventas = db.prepare(`
    SELECT 
      ${selectPeriodo} as periodo,
      COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0) as total_ventas,
      COUNT(*) as num_ventas
    FROM ventas
    WHERE DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
    GROUP BY ${groupBy}
    ORDER BY periodo ASC
  `).all(fechaInicio, fechaFin)

  return ventas
})

// Top productos más vendidos
ipcMain.handle('get-productos-mas-vendidos', (_event, filtro: { fechaInicio?: string, fechaFin?: string, limite?: number } = {}) => {
  const hoy = new Date().toISOString().split('T')[0]
  const hace30Dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const fechaInicio = filtro.fechaInicio || hace30Dias
  const fechaFin = filtro.fechaFin || hoy
  const limite = filtro.limite || 10

  const productos = db.prepare(`
    SELECT 
      v.folio_producto,
      p.nombre_producto,
      SUM(v.cantidad_vendida) as unidades_vendidas,
      SUM(v.cantidad_vendida * v.precio_unitario_real - COALESCE(v.descuento_aplicado, 0)) as monto_total
    FROM ventas v
    JOIN productos p ON v.folio_producto = p.folio_producto
    WHERE DATE(v.fecha_venta) >= DATE(?) AND DATE(v.fecha_venta) <= DATE(?)
    GROUP BY v.folio_producto
    ORDER BY monto_total DESC
    LIMIT ?
  `).all(fechaInicio, fechaFin, limite)

  return productos
})

// Ventas por categoría
ipcMain.handle('get-ventas-por-categoria', (_event, filtro: { fechaInicio?: string, fechaFin?: string } = {}) => {
  const hoy = new Date().toISOString().split('T')[0]
  const hace30Dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const fechaInicio = filtro.fechaInicio || hace30Dias
  const fechaFin = filtro.fechaFin || hoy

  const categorias = db.prepare(`
    SELECT 
      p.categoria,
      SUM(v.cantidad_vendida) as unidades_vendidas,
      SUM(v.cantidad_vendida * v.precio_unitario_real - COALESCE(v.descuento_aplicado, 0)) as monto_total
    FROM ventas v
    JOIN productos p ON v.folio_producto = p.folio_producto
    WHERE DATE(v.fecha_venta) >= DATE(?) AND DATE(v.fecha_venta) <= DATE(?)
    GROUP BY p.categoria
    ORDER BY monto_total DESC
  `).all(fechaInicio, fechaFin)

  return categorias
})

// Ventas por tipo de salida
ipcMain.handle('get-ventas-por-tipo', (_event, filtro: { fechaInicio?: string, fechaFin?: string } = {}) => {
  const hoy = new Date().toISOString().split('T')[0]
  const hace30Dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const fechaInicio = filtro.fechaInicio || hace30Dias
  const fechaFin = filtro.fechaFin || hoy

  const tipos = db.prepare(`
    SELECT 
      tipo_salida,
      COUNT(*) as cantidad,
      SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)) as monto_total
    FROM ventas
    WHERE DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
    GROUP BY tipo_salida
    ORDER BY monto_total DESC
  `).all(fechaInicio, fechaFin)

  return tipos
})

// Ventas comparativas por período
ipcMain.handle('get-ventas-comparativas', (_event, params: {
  tipo: 'mes' | 'semana' | 'anio',
  periodos: string[]
}) => {
  const { tipo, periodos } = params
  const resultados: Record<string, { puntos: Array<{ x: number | string, y: number }>, total: number }> = {}

  for (const periodo of periodos) {
    let dateStart: string
    let dateEnd: string
    let puntos: Array<{ x: number | string, y: number }> = []

    if (tipo === 'mes') {
      // periodo format: '2026-01'
      const [year, month] = periodo.split('-').map(Number)
      const daysInMonth = new Date(year, month, 0).getDate()
      dateStart = `${year}-${String(month).padStart(2, '0')}-01`
      dateEnd = `${year}-${String(month).padStart(2, '0')}-${daysInMonth}`

      // Get sales by day of month
      const ventas = db.prepare(`
        SELECT 
          CAST(strftime('%d', fecha_venta) AS INTEGER) as dia,
          COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0) as ganancia
        FROM ventas
        WHERE DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
        GROUP BY strftime('%d', fecha_venta)
        ORDER BY dia
      `).all(dateStart, dateEnd) as Array<{ dia: number, ganancia: number }>

      // Fill all 31 days (missing days = 0)
      for (let d = 1; d <= 31; d++) {
        const found = ventas.find(v => v.dia === d)
        puntos.push({ x: d, y: found ? found.ganancia : 0 })
      }

    } else if (tipo === 'semana') {
      // periodo format: '2026-W01'
      const [year, weekStr] = periodo.split('-W')
      const weekNum = parseInt(weekStr)

      // Calculate start of week (ISO week starts on Monday)
      const jan4 = new Date(parseInt(year), 0, 4)
      const dayOfWeek = jan4.getDay() || 7
      const firstMonday = new Date(jan4)
      firstMonday.setDate(jan4.getDate() - dayOfWeek + 1)

      const weekStart = new Date(firstMonday)
      weekStart.setDate(firstMonday.getDate() + (weekNum - 1) * 7)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)

      dateStart = weekStart.toISOString().split('T')[0]
      dateEnd = weekEnd.toISOString().split('T')[0]

      const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
      const ventas = db.prepare(`
        SELECT 
          CAST(strftime('%w', fecha_venta) AS INTEGER) as dia_semana,
          COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0) as ganancia
        FROM ventas
        WHERE DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
        GROUP BY strftime('%w', fecha_venta)
        ORDER BY dia_semana
      `).all(dateStart, dateEnd) as Array<{ dia_semana: number, ganancia: number }>

      // Map Sunday=0 to index 6, Monday=1 to index 0, etc.
      for (let d = 0; d < 7; d++) {
        const sqlDow = d === 6 ? 0 : d + 1 // Convert 0-6 (Mon-Sun) to SQL (0=Sun, 1=Mon...)
        const found = ventas.find(v => v.dia_semana === sqlDow)
        puntos.push({ x: diasSemana[d], y: found ? found.ganancia : 0 })
      }

    } else if (tipo === 'anio') {
      // periodo format: '2026'
      const year = parseInt(periodo)
      dateStart = `${year}-01-01`
      dateEnd = `${year}-12-31`

      const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
      const ventas = db.prepare(`
        SELECT 
          CAST(strftime('%m', fecha_venta) AS INTEGER) as mes,
          COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0) as ganancia
        FROM ventas
        WHERE DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
        GROUP BY strftime('%m', fecha_venta)
        ORDER BY mes
      `).all(dateStart, dateEnd) as Array<{ mes: number, ganancia: number }>

      for (let m = 1; m <= 12; m++) {
        const found = ventas.find(v => v.mes === m)
        puntos.push({ x: meses[m - 1], y: found ? found.ganancia : 0 })
      }
    }

    // Calculate total
    const total = puntos.reduce((sum, p) => sum + p.y, 0)
    resultados[periodo] = { puntos, total }
  }

  return resultados
})

// Ventas comparativas por producto
ipcMain.handle('get-ventas-productos-comparativas', (_event, params: {
  productos: string[],
  tipo: 'mes' | 'semana' | 'anio'
}) => {
  const { productos, tipo } = params
  const resultados: Record<string, { nombre: string, puntos: Array<{ x: number | string, y: number }>, total: number }> = {}

  // Get current date for determining ranges
  const hoy = new Date()
  const year = hoy.getFullYear()
  const month = String(hoy.getMonth() + 1).padStart(2, '0')

  let dateStart: string = ''
  let dateEnd: string = ''
  let xLabels: (number | string)[] = []

  if (tipo === 'mes') {
    // Current month, by day
    const daysInMonth = new Date(year, hoy.getMonth() + 1, 0).getDate()
    dateStart = `${year}-${month}-01`
    dateEnd = `${year}-${month}-${daysInMonth}`
    xLabels = Array.from({ length: 31 }, (_, i) => i + 1)
  } else if (tipo === 'semana') {
    // Current week (Mon-Sun)
    const dayOfWeek = hoy.getDay() || 7
    const monday = new Date(hoy)
    monday.setDate(hoy.getDate() - dayOfWeek + 1)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    dateStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
    dateEnd = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`
    xLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  } else if (tipo === 'anio') {
    // Current year, by month
    dateStart = `${year}-01-01`
    dateEnd = `${year}-12-31`
    xLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  }

  for (const folio of productos) {
    // Get product name
    const prod = db.prepare('SELECT nombre_producto FROM productos WHERE folio_producto = ?').get(folio) as { nombre_producto: string } | undefined
    const nombre = prod?.nombre_producto || folio

    let puntos: Array<{ x: number | string, y: number }> = []

    if (tipo === 'mes') {
      const ventas = db.prepare(`
        SELECT 
          CAST(strftime('%d', fecha_venta) AS INTEGER) as dia,
          COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0) as ganancia
        FROM ventas
        WHERE folio_producto = ? AND DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
        GROUP BY strftime('%d', fecha_venta)
      `).all(folio, dateStart, dateEnd) as Array<{ dia: number, ganancia: number }>

      for (let d = 1; d <= 31; d++) {
        const found = ventas.find(v => v.dia === d)
        puntos.push({ x: d, y: found ? found.ganancia : 0 })
      }
    } else if (tipo === 'semana') {
      const ventas = db.prepare(`
        SELECT 
          CAST(strftime('%w', fecha_venta) AS INTEGER) as dia_semana,
          COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0) as ganancia
        FROM ventas
        WHERE folio_producto = ? AND DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
        GROUP BY strftime('%w', fecha_venta)
      `).all(folio, dateStart, dateEnd) as Array<{ dia_semana: number, ganancia: number }>

      for (let d = 0; d < 7; d++) {
        const sqlDow = d === 6 ? 0 : d + 1
        const found = ventas.find(v => v.dia_semana === sqlDow)
        puntos.push({ x: xLabels[d], y: found ? found.ganancia : 0 })
      }
    } else if (tipo === 'anio') {
      const ventas = db.prepare(`
        SELECT 
          CAST(strftime('%m', fecha_venta) AS INTEGER) as mes,
          COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0) as ganancia
        FROM ventas
        WHERE folio_producto = ? AND DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
        GROUP BY strftime('%m', fecha_venta)
      `).all(folio, dateStart, dateEnd) as Array<{ mes: number, ganancia: number }>

      for (let m = 1; m <= 12; m++) {
        const found = ventas.find(v => v.mes === m)
        puntos.push({ x: xLabels[m - 1], y: found ? found.ganancia : 0 })
      }
    }

    const total = puntos.reduce((sum, p) => sum + p.y, 0)
    resultados[folio] = { nombre, puntos, total }
  }

  return resultados
})

// Get top 5 selling products
ipcMain.handle('get-top-productos-vendidos', (_event, limit: number = 5) => {
  const productos = db.prepare(`
    SELECT 
      v.folio_producto,
      p.nombre_producto,
      SUM(v.cantidad_vendida) as unidades_vendidas,
      SUM(v.cantidad_vendida * v.precio_unitario_real - COALESCE(v.descuento_aplicado, 0)) as total_vendido
    FROM ventas v
    LEFT JOIN productos p ON v.folio_producto = p.folio_producto
    GROUP BY v.folio_producto
    ORDER BY total_vendido DESC
    LIMIT ?
  `).all(limit) as Array<{ folio_producto: string, nombre_producto: string, unidades_vendidas: number, total_vendido: number }>

  return productos
})

// Ventas comparativas por proveedor
ipcMain.handle('get-ventas-proveedores-comparativas', (_event, params: {
  proveedores: string[],
  tipo: 'mes' | 'semana' | 'anio'
}) => {
  const { proveedores, tipo } = params
  const resultados: Record<string, { puntos: Array<{ x: number | string, y: number }>, total: number }> = {}

  const hoy = new Date()
  const year = hoy.getFullYear()
  const month = String(hoy.getMonth() + 1).padStart(2, '0')

  let dateStart: string = ''
  let dateEnd: string = ''
  let xLabels: (number | string)[] = []

  if (tipo === 'mes') {
    const daysInMonth = new Date(year, hoy.getMonth() + 1, 0).getDate()
    dateStart = `${year}-${month}-01`
    dateEnd = `${year}-${month}-${daysInMonth}`
    xLabels = Array.from({ length: 31 }, (_, i) => i + 1)
  } else if (tipo === 'semana') {
    const dayOfWeek = hoy.getDay() || 7
    const monday = new Date(hoy)
    monday.setDate(hoy.getDate() - dayOfWeek + 1)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    dateStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
    dateEnd = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`
    xLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  } else if (tipo === 'anio') {
    dateStart = `${year}-01-01`
    dateEnd = `${year}-12-31`
    xLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  }

  for (const proveedor of proveedores) {
    let puntos: Array<{ x: number | string, y: number }> = []

    if (tipo === 'mes') {
      const ventas = db.prepare(`
        SELECT 
          CAST(strftime('%d', v.fecha_venta) AS INTEGER) as dia,
          COALESCE(SUM(v.cantidad_vendida * v.precio_unitario_real - COALESCE(v.descuento_aplicado, 0)), 0) as ganancia
        FROM ventas v
        JOIN productos p ON v.folio_producto = p.folio_producto
        WHERE p.proveedor = ? AND DATE(v.fecha_venta) >= DATE(?) AND DATE(v.fecha_venta) <= DATE(?)
        GROUP BY strftime('%d', v.fecha_venta)
      `).all(proveedor, dateStart, dateEnd) as Array<{ dia: number, ganancia: number }>

      for (let d = 1; d <= 31; d++) {
        const found = ventas.find(v => v.dia === d)
        puntos.push({ x: d, y: found ? found.ganancia : 0 })
      }
    } else if (tipo === 'semana') {
      const ventas = db.prepare(`
        SELECT 
          CAST(strftime('%w', v.fecha_venta) AS INTEGER) as dia_semana,
          COALESCE(SUM(v.cantidad_vendida * v.precio_unitario_real - COALESCE(v.descuento_aplicado, 0)), 0) as ganancia
        FROM ventas v
        JOIN productos p ON v.folio_producto = p.folio_producto
        WHERE p.proveedor = ? AND DATE(v.fecha_venta) >= DATE(?) AND DATE(v.fecha_venta) <= DATE(?)
        GROUP BY strftime('%w', v.fecha_venta)
      `).all(proveedor, dateStart, dateEnd) as Array<{ dia_semana: number, ganancia: number }>

      for (let d = 0; d < 7; d++) {
        const sqlDow = d === 6 ? 0 : d + 1
        const found = ventas.find(v => v.dia_semana === sqlDow)
        puntos.push({ x: xLabels[d], y: found ? found.ganancia : 0 })
      }
    } else if (tipo === 'anio') {
      const ventas = db.prepare(`
        SELECT 
          CAST(strftime('%m', v.fecha_venta) AS INTEGER) as mes,
          COALESCE(SUM(v.cantidad_vendida * v.precio_unitario_real - COALESCE(v.descuento_aplicado, 0)), 0) as ganancia
        FROM ventas v
        JOIN productos p ON v.folio_producto = p.folio_producto
        WHERE p.proveedor = ? AND DATE(v.fecha_venta) >= DATE(?) AND DATE(v.fecha_venta) <= DATE(?)
        GROUP BY strftime('%m', v.fecha_venta)
      `).all(proveedor, dateStart, dateEnd) as Array<{ mes: number, ganancia: number }>

      for (let m = 1; m <= 12; m++) {
        const found = ventas.find(v => v.mes === m)
        puntos.push({ x: xLabels[m - 1], y: found ? found.ganancia : 0 })
      }
    }

    const total = puntos.reduce((sum, p) => sum + p.y, 0)
    resultados[proveedor] = { puntos, total }
  }

  return resultados
})

// Get top 5 selling suppliers
ipcMain.handle('get-top-proveedores-vendidos', (_event, limit: number = 5) => {
  const proveedores = db.prepare(`
    SELECT 
      p.proveedor,
      SUM(v.cantidad_vendida) as unidades_vendidas,
      SUM(v.cantidad_vendida * v.precio_unitario_real - COALESCE(v.descuento_aplicado, 0)) as total_vendido
    FROM ventas v
    JOIN productos p ON v.folio_producto = p.folio_producto
    WHERE p.proveedor IS NOT NULL AND p.proveedor != ''
    GROUP BY p.proveedor
    ORDER BY total_vendido DESC
    LIMIT ?
  `).all(limit) as Array<{ proveedor: string, unidades_vendidas: number, total_vendido: number }>

  return proveedores
})

// Clientes con saldo pendiente
ipcMain.handle('get-clientes-con-saldo', () => {
  const clientes = db.prepare(`
    SELECT 
      id_cliente,
      nombre_completo,
      telefono,
      saldo_pendiente,
      estado_cuenta
    FROM clientes
    WHERE saldo_pendiente > 0
    ORDER BY saldo_pendiente DESC
  `).all()

  return clientes
})

// =============================================
// INVENTARIO - KPIs y Estadísticas por Categoría
// =============================================

// KPIs generales del inventario
ipcMain.handle('get-inventario-kpis', () => {
  try {
    // Valor total del inventario (cantidad * costo)
    const valorInventario = db.prepare(`
      SELECT COALESCE(SUM(
        tp.cantidad * (
          SELECT COALESCE(e.costo_unitario_proveedor, 0)
          FROM entradas e
          WHERE e.folio_producto = tp.folio_producto AND e.talla = tp.talla
          ORDER BY e.fecha_entrada DESC
          LIMIT 1
        )
      ), 0) as valor_costo,
      COALESCE(SUM(
        tp.cantidad * (
          SELECT COALESCE(e.precio_unitario_base, 0)
          FROM entradas e
          WHERE e.folio_producto = tp.folio_producto AND e.talla = tp.talla
          ORDER BY e.fecha_entrada DESC
          LIMIT 1
        )
      ), 0) as valor_venta
      FROM tallas_producto tp
      WHERE tp.cantidad > 0
    `).get() as any

    // Conteos generales
    const conteos = db.prepare(`
      SELECT 
        COUNT(DISTINCT p.folio_producto) as total_productos,
        COALESCE(SUM(tp.cantidad), 0) as total_unidades,
        COUNT(DISTINCT p.categoria) as total_categorias
      FROM productos p
      LEFT JOIN tallas_producto tp ON p.folio_producto = tp.folio_producto
    `).get() as any

    // Productos con bajo stock
    const bajoStock = db.prepare(`
      SELECT COUNT(*) as cantidad
      FROM productos
      WHERE stock_actual <= stock_minimo AND stock_actual > 0
    `).get() as any

    // Productos sin stock
    const sinStock = db.prepare(`
      SELECT COUNT(*) as cantidad
      FROM productos
      WHERE stock_actual = 0
    `).get() as any

    return {
      valorInventarioCosto: valorInventario?.valor_costo || 0,
      valorInventarioVenta: valorInventario?.valor_venta || 0,
      gananciaProyectada: (valorInventario?.valor_venta || 0) - (valorInventario?.valor_costo || 0),
      totalProductos: conteos?.total_productos || 0,
      totalUnidades: conteos?.total_unidades || 0,
      totalCategorias: conteos?.total_categorias || 0,
      productosBajoStock: bajoStock?.cantidad || 0,
      productosSinStock: sinStock?.cantidad || 0
    }
  } catch (error) {
    console.error('Error al obtener KPIs de inventario:', error)
    return {
      valorInventarioCosto: 0,
      valorInventarioVenta: 0,
      gananciaProyectada: 0,
      totalProductos: 0,
      totalUnidades: 0,
      totalCategorias: 0,
      productosBajoStock: 0,
      productosSinStock: 0
    }
  }
})

// Obtener productos con bajo stock
ipcMain.handle('get-productos-bajo-stock', () => {
  try {
    const productos = db.prepare(`
      SELECT 
        categoria,
        SUM(stock_actual) as stock_actual,
        SUM(stock_minimo) as stock_minimo,
        COUNT(*) as total_productos
      FROM productos
      GROUP BY categoria
      HAVING SUM(stock_actual) <= SUM(stock_minimo)
      ORDER BY stock_actual ASC
    `).all()
    return productos
  } catch (error) {
    console.error('Error al obtener productos bajo stock:', error)
    throw error
  }
})

// Actualizar stock mínimo de un producto
ipcMain.handle('update-stock-minimo', (_event, { folio_producto, stock_minimo }: { folio_producto: string, stock_minimo: number }) => {
  try {
    db.prepare(`
      UPDATE productos 
      SET stock_minimo = ?
      WHERE folio_producto = ?
    `).run(stock_minimo, folio_producto)
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar stock mínimo:', error)
    throw error
  }
})

// Estadísticas agrupadas por categoría
ipcMain.handle('get-inventario-por-categoria', () => {
  try {
    const categorias = db.prepare(`
      SELECT 
        p.categoria,
        COUNT(DISTINCT p.folio_producto) as num_productos,
        COALESCE(SUM(tp.cantidad), 0) as total_unidades,
        COALESCE(SUM(
          tp.cantidad * (
            SELECT COALESCE(e.costo_unitario_proveedor, 0)
            FROM entradas e
            WHERE e.folio_producto = tp.folio_producto AND e.talla = tp.talla
            ORDER BY e.fecha_entrada DESC
            LIMIT 1
          )
        ), 0) as valor_costo,
        COALESCE(SUM(
          tp.cantidad * (
            SELECT COALESCE(e.precio_unitario_base, 0)
            FROM entradas e
            WHERE e.folio_producto = tp.folio_producto AND e.talla = tp.talla
            ORDER BY e.fecha_entrada DESC
            LIMIT 1
          )
        ), 0) as valor_venta
      FROM productos p
      LEFT JOIN tallas_producto tp ON p.folio_producto = tp.folio_producto
      GROUP BY p.categoria
      ORDER BY p.categoria ASC
    `).all() as any[]

    return categorias.map(cat => ({
      categoria: cat.categoria,
      numProductos: cat.num_productos,
      totalUnidades: cat.total_unidades,
      valorCosto: cat.valor_costo,
      valorVenta: cat.valor_venta,
      gananciaProyectada: cat.valor_venta - cat.valor_costo
    }))
  } catch (error) {
    console.error('Error al obtener inventario por categoría:', error)
    return []
  }
})

// Obtener productos filtrados por categoría con información completa
ipcMain.handle('get-productos-por-categoria', (_event, categoria: string) => {
  try {
    const stmt = db.prepare(`
      SELECT 
        p.*, 
        json_group_array(json_object('talla', tp.talla, 'cantidad', tp.cantidad)) as tallas_detalle,
        (SELECT precio_unitario_base FROM entradas WHERE folio_producto = p.folio_producto ORDER BY id_entrada DESC LIMIT 1) as ultimo_precio,
        (SELECT costo_unitario_proveedor FROM entradas WHERE folio_producto = p.folio_producto ORDER BY id_entrada DESC LIMIT 1) as ultimo_costo
      FROM productos p
      LEFT JOIN tallas_producto tp ON p.folio_producto = tp.folio_producto
      WHERE p.categoria = ?
      GROUP BY p.folio_producto
      ORDER BY p.nombre_producto ASC
    `)
    const productos = stmt.all(categoria)

    return productos.map((p: any) => ({
      ...p,
      tallas_detalle: p.tallas_detalle ? JSON.parse(p.tallas_detalle) : []
    }))
  } catch (error) {
    console.error('Error al obtener productos por categoría:', error)
    return []
  }
})

// Timeline de movimientos de inventario recientes (entradas y ventas)
ipcMain.handle('get-movimientos-inventario-recientes', (_event, limite: number = 20) => {
  try {
    // Combinar entradas y ventas en una sola lista
    const movimientos = db.prepare(`
      SELECT 
        'entrada' as tipo,
        e.id_entrada as id,
        e.fecha_entrada as fecha,
        e.folio_producto,
        e.cantidad_recibida as cantidad,
        e.talla,
        e.costo_unitario_proveedor as costo,
        e.precio_unitario_base as precio,
        e.tipo_movimiento,
        p.nombre_producto,
        p.categoria,
        p.proveedor,
        NULL as cliente
      FROM entradas e
      LEFT JOIN productos p ON e.folio_producto = p.folio_producto
      WHERE e.tipo_movimiento IN ('Entrada Inicial', 'Reabastecimiento')
      
      UNION ALL
      
      SELECT 
        'venta' as tipo,
        v.id_venta as id,
        v.fecha_venta as fecha,
        v.folio_producto,
        v.cantidad_vendida as cantidad,
        v.talla,
        NULL as costo,
        v.precio_unitario_real as precio,
        v.tipo_salida as tipo_movimiento,
        p.nombre_producto,
        p.categoria,
        p.proveedor,
        c.nombre_completo as cliente
      FROM ventas v
      LEFT JOIN productos p ON v.folio_producto = p.folio_producto
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
      
      ORDER BY fecha DESC
      LIMIT ?
    `).all(limite)

    return movimientos
  } catch (error) {
    console.error('Error al obtener movimientos de inventario:', error)
    return []
  }
})

// =============================================
// ENTRADAS - KPIs y Timeline
// ==============================================

// KPIs de entradas (mes y año)
ipcMain.handle('get-entradas-kpis', () => {
  try {
    const hoy = new Date()
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0]
    const inicioAnio = new Date(hoy.getFullYear(), 0, 1).toISOString().split('T')[0]
    const finHoy = hoy.toISOString().split('T')[0]

    // Entradas del mes
    const entradasMes = db.prepare(`
      SELECT 
        COUNT(*) as num_entradas,
        COALESCE(SUM(cantidad_recibida), 0) as total_unidades,
        COALESCE(SUM(cantidad_recibida * costo_unitario_proveedor), 0) as inversion_total,
        COALESCE(SUM(cantidad_recibida * precio_unitario_base), 0) as valor_venta
      FROM entradas
      WHERE DATE(fecha_entrada) >= DATE(?) AND DATE(fecha_entrada) <= DATE(?)
        AND tipo_movimiento IN ('Entrada Inicial', 'Reabastecimiento')
    `).get(inicioMes, finHoy) as any

    // Entradas del año
    const entradasAnio = db.prepare(`
      SELECT 
        COUNT(*) as num_entradas,
        COALESCE(SUM(cantidad_recibida), 0) as total_unidades,
        COALESCE(SUM(cantidad_recibida * costo_unitario_proveedor), 0) as inversion_total,
        COALESCE(SUM(cantidad_recibida * precio_unitario_base), 0) as valor_venta
      FROM entradas
      WHERE DATE(fecha_entrada) >= DATE(?) AND DATE(fecha_entrada) <= DATE(?)
        AND tipo_movimiento IN ('Entrada Inicial', 'Reabastecimiento')
    `).get(inicioAnio, finHoy) as any

    // Entradas de todo el tiempo
    const entradasTodo = db.prepare(`
      SELECT 
        COUNT(*) as num_entradas,
        COALESCE(SUM(cantidad_recibida), 0) as total_unidades,
        COALESCE(SUM(cantidad_recibida * costo_unitario_proveedor), 0) as inversion_total,
        COALESCE(SUM(cantidad_recibida * precio_unitario_base), 0) as valor_venta
      FROM entradas
      WHERE tipo_movimiento IN ('Entrada Inicial', 'Reabastecimiento')
    `).get() as any

    // Productos nuevos este mes
    const productosNuevosMes = db.prepare(`
      SELECT COUNT(DISTINCT folio_producto) as cantidad
      FROM entradas
      WHERE DATE(fecha_entrada) >= DATE(?) AND DATE(fecha_entrada) <= DATE(?)
        AND tipo_movimiento = 'Entrada Inicial'
    `).get(inicioMes, finHoy) as any

    // Proveedores activos este mes
    const proveedoresActivosMes = db.prepare(`
      SELECT COUNT(DISTINCT p.proveedor) as cantidad
      FROM productos p
      INNER JOIN entradas e ON p.folio_producto = e.folio_producto
      WHERE DATE(e.fecha_entrada) >= DATE(?) AND DATE(e.fecha_entrada) <= DATE(?)
        AND e.tipo_movimiento IN ('Entrada Inicial', 'Reabastecimiento')
    `).get(inicioMes, finHoy) as any

    // Total productos y proveedores histórico
    const totalProductos = db.prepare(`SELECT COUNT(DISTINCT folio_producto) as cantidad FROM entradas`).get() as any
    const totalProveedores = db.prepare(`SELECT COUNT(DISTINCT proveedor) as cantidad FROM productos WHERE proveedor IS NOT NULL`).get() as any

    return {
      mes: {
        numEntradas: entradasMes?.num_entradas || 0,
        totalUnidades: entradasMes?.total_unidades || 0,
        inversionTotal: entradasMes?.inversion_total || 0,
        valorVenta: entradasMes?.valor_venta || 0,
        gananciaProyectada: (entradasMes?.valor_venta || 0) - (entradasMes?.inversion_total || 0)
      },
      anio: {
        numEntradas: entradasAnio?.num_entradas || 0,
        totalUnidades: entradasAnio?.total_unidades || 0,
        inversionTotal: entradasAnio?.inversion_total || 0,
        valorVenta: entradasAnio?.valor_venta || 0,
        gananciaProyectada: (entradasAnio?.valor_venta || 0) - (entradasAnio?.inversion_total || 0)
      },
      todo: {
        numEntradas: entradasTodo?.num_entradas || 0,
        totalUnidades: entradasTodo?.total_unidades || 0,
        inversionTotal: entradasTodo?.inversion_total || 0,
        valorVenta: entradasTodo?.valor_venta || 0,
        gananciaProyectada: (entradasTodo?.valor_venta || 0) - (entradasTodo?.inversion_total || 0)
      },
      productosNuevosMes: productosNuevosMes?.cantidad || 0,
      proveedoresActivosMes: proveedoresActivosMes?.cantidad || 0,
      totalProductos: totalProductos?.cantidad || 0,
      totalProveedores: totalProveedores?.cantidad || 0
    }
  } catch (error) {
    console.error('Error al obtener KPIs de entradas:', error)
    return {
      mes: { numEntradas: 0, totalUnidades: 0, inversionTotal: 0, valorVenta: 0, gananciaProyectada: 0 },
      anio: { numEntradas: 0, totalUnidades: 0, inversionTotal: 0, valorVenta: 0, gananciaProyectada: 0 },
      todo: { numEntradas: 0, totalUnidades: 0, inversionTotal: 0, valorVenta: 0, gananciaProyectada: 0 },
      productosNuevosMes: 0,
      proveedoresActivosMes: 0,
      totalProductos: 0,
      totalProveedores: 0
    }
  }
})

// Entradas agrupadas por categoría
ipcMain.handle('get-entradas-por-categoria', () => {
  try {
    const entradas = db.prepare(`
      SELECT 
        p.categoria,
        COUNT(DISTINCT e.id_entrada) as num_entradas,
        COALESCE(SUM(e.cantidad_recibida), 0) as total_unidades,
        COALESCE(SUM(e.cantidad_recibida * e.costo_unitario_proveedor), 0) as inversion_total,
        COALESCE(SUM(e.cantidad_recibida * e.precio_unitario_base), 0) as valor_venta
      FROM entradas e
      INNER JOIN productos p ON e.folio_producto = p.folio_producto
      WHERE e.tipo_movimiento IN ('Entrada Inicial', 'Reabastecimiento')
      GROUP BY p.categoria
      ORDER BY inversion_total DESC
    `).all()
    return entradas
  } catch (error) {
    console.error('Error al obtener entradas por categoría:', error)
    return []
  }
})

// Timeline de entradas recientes
ipcMain.handle('get-entradas-recientes', (_event, limite: number = 20) => {
  try {
    const entradas = db.prepare(`
      SELECT 
        e.id_entrada,
        e.fecha_entrada,
        e.folio_producto,
        e.cantidad_recibida,
        e.talla,
        e.costo_unitario_proveedor,
        e.precio_unitario_base,
        e.tipo_movimiento,
        e.responsable_recepcion,
        e.observaciones_entrada,
        p.nombre_producto,
        p.categoria,
        p.proveedor
      FROM entradas e
      LEFT JOIN productos p ON e.folio_producto = p.folio_producto
      WHERE e.tipo_movimiento IN ('Entrada Inicial', 'Reabastecimiento')
      ORDER BY e.fecha_entrada DESC, e.id_entrada DESC
      LIMIT ?
    `).all(limite)

    return entradas
  } catch (error) {
    console.error('Error al obtener entradas recientes:', error)
    return []
  }
})

// Estadísticas por proveedor
ipcMain.handle('get-entradas-por-proveedor', () => {
  try {
    const hoy = new Date()
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0]
    const finHoy = hoy.toISOString().split('T')[0]

    const proveedores = db.prepare(`
      SELECT 
        p.proveedor,
        COUNT(DISTINCT e.id_entrada) as num_entradas,
        COALESCE(SUM(e.cantidad_recibida), 0) as total_unidades,
        COALESCE(SUM(e.cantidad_recibida * e.costo_unitario_proveedor), 0) as inversion_total,
        COUNT(DISTINCT p.folio_producto) as num_productos,
        MAX(e.fecha_entrada) as ultima_entrada
      FROM productos p
      INNER JOIN entradas e ON p.folio_producto = e.folio_producto
      WHERE e.tipo_movimiento IN ('Entrada Inicial', 'Reabastecimiento')
        AND DATE(e.fecha_entrada) >= DATE(?) AND DATE(e.fecha_entrada) <= DATE(?)
      GROUP BY p.proveedor
      ORDER BY inversion_total DESC
    `).all(inicioMes, finHoy)

    return proveedores
  } catch (error) {
    console.error('Error al obtener entradas por proveedor:', error)
    return []
  }
})

// Registrar entrada con múltiples tallas
ipcMain.handle('registrar-entrada-multiple-tallas', (_event, datos: {
  folio_producto: string,
  esNuevo: boolean,
  producto?: any,
  tallas: Array<{ talla: string, cantidad: number, costo: number, precio: number }>,
  responsable?: string,
  observaciones?: string
}) => {
  const { folio_producto, esNuevo, producto, tallas, responsable, observaciones } = datos

  const registrar = db.transaction(() => {
    const fechaEntrada = new Date().toISOString()

    if (esNuevo && producto) {
      // Insertar producto nuevo
      const stmtProducto = db.prepare(`
        INSERT INTO productos (
          folio_producto, nombre_producto, categoria, genero_destino,
          stock_actual, stock_minimo, proveedor, observaciones
        ) VALUES (
          @folio_producto, @nombre_producto, @categoria, @genero_destino,
          0, 5, @proveedor, @observaciones
        )
      `)
      stmtProducto.run(producto)
    }

    // Insertar cada talla como una entrada separada
    for (const t of tallas) {
      if (t.cantidad <= 0) continue

      // Insertar entrada
      const stmtEntrada = db.prepare(`
        INSERT INTO entradas (
          fecha_entrada, folio_producto, cantidad_recibida, talla,
          costo_unitario_proveedor, precio_unitario_base,
          tipo_movimiento, responsable_recepcion, observaciones_entrada
        ) VALUES (
          @fecha, @folio, @cantidad, @talla,
          @costo, @precio,
          @tipo, @responsable, @observaciones
        )
      `)
      stmtEntrada.run({
        fecha: fechaEntrada,
        folio: folio_producto,
        cantidad: t.cantidad,
        talla: t.talla,
        costo: t.costo,
        precio: t.precio,
        tipo: esNuevo ? 'Entrada Inicial' : 'Reabastecimiento',
        responsable: responsable || null,
        observaciones: observaciones || null
      })

      // Actualizar stock del producto
      db.prepare(`
        UPDATE productos 
        SET stock_actual = stock_actual + @cantidad,
            fecha_ultima_actualizacion = CURRENT_TIMESTAMP
        WHERE folio_producto = @folio
      `).run({ cantidad: t.cantidad, folio: folio_producto })

      // Actualizar/Insertar talla
      db.prepare(`
        INSERT INTO tallas_producto (folio_producto, talla, cantidad)
        VALUES (@folio, @talla, @cantidad)
        ON CONFLICT(folio_producto, talla) DO UPDATE SET
          cantidad = cantidad + @cantidad,
          fecha_actualizacion = CURRENT_TIMESTAMP
      `).run({ folio: folio_producto, talla: t.talla, cantidad: t.cantidad })
    }
  })

  try {
    registrar()
    return { success: true }
  } catch (error: any) {
    console.error('Error al registrar entrada con múltiples tallas:', error)
    throw error
  }
})

// KPIs de Ventas del Día
ipcMain.handle('get-ventas-kpis-hoy', () => {
  try {
    // Usar fecha local, no UTC
    const hoy = new Date()
    const year = hoy.getFullYear()
    const month = String(hoy.getMonth() + 1).padStart(2, '0')
    const day = String(hoy.getDate()).padStart(2, '0')
    const fechaHoy = `${year}-${month}-${day}`
    const inicioHoy = fechaHoy + ' 00:00:00'
    const finHoy = fechaHoy + ' 23:59:59'

    // 1. Número de ventas del día (transacciones únicas)
    const resultVentas = db.prepare(`
      SELECT COUNT(*) as num_ventas
      FROM ventas
      WHERE fecha_venta >= ? AND fecha_venta <= ?
    `).get(inicioHoy, finHoy) as any
    const ventasHoy = resultVentas?.num_ventas || 0

    // 2. Total cobrado hoy = ventas directas tipo "Venta"
    // (Las ventas directas se cobran inmediatamente)
    const resultCobrado = db.prepare(`
      SELECT COALESCE(SUM(
        (precio_unitario_real - COALESCE(descuento_aplicado, 0)) * cantidad_vendida
      ), 0) as total
      FROM ventas
      WHERE tipo_salida = 'Venta'
        AND fecha_venta >= ? AND fecha_venta <= ?
    `).get(inicioHoy, finHoy) as any
    const cobradoVentas = resultCobrado?.total || 0

    // 3. Abonos registrados hoy (incluyendo abonos iniciales de créditos/apartados)
    const resultAbonos = db.prepare(`
      SELECT COALESCE(SUM(monto), 0) as total
      FROM movimientos_cliente
      WHERE lower(tipo_movimiento) = 'abono'
        AND fecha >= ? AND fecha <= ?
    `).get(inicioHoy, finHoy) as any
    const cobradoAbonos = resultAbonos?.total || 0

    const totalCobrado = cobradoVentas + cobradoAbonos

    // 4. Contar número de abonos (transacciones de abono)
    const resultNumAbonos = db.prepare(`
      SELECT COUNT(*) as num_abonos
      FROM movimientos_cliente
      WHERE lower(tipo_movimiento) = 'abono'
        AND fecha >= ? AND fecha <= ?
    `).get(inicioHoy, finHoy) as any
    const numAbonos = resultNumAbonos?.num_abonos || 0

    // Total de transacciones = ventas + abonos
    const transaccionesHoy = ventasHoy + numAbonos

    // Ticket promedio
    const ticketPromedio = ventasHoy > 0 ? totalCobrado / ventasHoy : 0

    console.log(`[KPIs] Fecha: ${fechaHoy}, Ventas: ${ventasHoy}, Abonos: ${numAbonos}, Transacciones: ${transaccionesHoy}, Cobrado: ${cobradoVentas}, AbonosMonto: ${cobradoAbonos}, Total: ${totalCobrado}`)

    return {
      ventasHoy,
      transaccionesHoy,
      totalCobrado,
      pendientesHoy: 0,
      ticketPromedio
    }
  } catch (error) {
    console.error('Error al obtener KPIs de ventas:', error)
    return {
      ventasHoy: 0,
      transaccionesHoy: 0,
      totalCobrado: 0,
      pendientesHoy: 0,
      ticketPromedio: 0
    }
  }
})

// Ventas recientes
ipcMain.handle('get-ventas-recientes', (_event, limite: number = 15) => {
  try {
    const ventas = db.prepare(`
      SELECT 
        v.id_venta,
        v.fecha_venta,
        v.folio_producto,
        v.cantidad_vendida,
        v.talla,
        v.precio_unitario_real,
        v.descuento_aplicado,
        v.tipo_salida,
        p.nombre_producto,
        p.categoria,
        c.nombre_completo as cliente
      FROM ventas v
      LEFT JOIN productos p ON v.folio_producto = p.folio_producto
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
      ORDER BY v.fecha_venta DESC
      LIMIT ?
    `).all(limite)

    return ventas.map((v: any) => ({
      ...v,
      total: (v.precio_unitario_real - (v.descuento_aplicado || 0)) * v.cantidad_vendida
    }))
  } catch (error) {
    console.error('Error al obtener ventas recientes:', error)
    return []
  }
})

// Ventas y transacciones de hoy (todas)
ipcMain.handle('get-ventas-hoy', (_event) => {
  try {
    const now = new Date()
    // Ajustar a zona horaria local si es necesario, pero por ahora usaremos string de fecha local
    // Nota: En producción idealmente usar UTC o timestamps, pero mantenemos consistencia con el resto de la app
    const fechaInicio = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toLocaleString('sv')
    const fechaFin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toLocaleString('sv')

    // Obtener ventas del día
    const ventas = db.prepare(`
      SELECT 
        v.id_venta,
        v.fecha_venta,
        v.folio_producto,
        v.cantidad_vendida,
        v.talla,
        v.precio_unitario_real,
        v.descuento_aplicado,
        v.tipo_salida,
        p.nombre_producto,
        p.categoria,
        c.nombre_completo as cliente
      FROM ventas v
      LEFT JOIN productos p ON v.folio_producto = p.folio_producto
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
      WHERE v.fecha_venta >= ? AND v.fecha_venta <= ?
      ORDER BY v.fecha_venta DESC
    `).all(fechaInicio, fechaFin)

    // Obtener abonos del día
    const abonos = db.prepare(`
      SELECT 
        m.id_movimiento,
        m.fecha,
        m.monto,
        m.tipo_movimiento,
        m.referencia,
        c.nombre_completo as cliente
      FROM movimientos_cliente m
      LEFT JOIN clientes c ON m.id_cliente = c.id_cliente
      WHERE lower(m.tipo_movimiento) = 'abono'
        AND m.fecha >= ? AND m.fecha <= ?
      ORDER BY m.fecha DESC
    `).all(fechaInicio, fechaFin)

    // Mapear ventas a formato uniforme
    const ventasFormateadas = ventas.map((v: any) => ({
      id: v.id_venta,
      fecha: v.fecha_venta,
      tipo_transaccion: 'venta',
      folio_producto: v.folio_producto,
      nombre_producto: v.nombre_producto,
      cantidad_vendida: v.cantidad_vendida,
      talla: v.talla,
      precio_unitario_real: v.precio_unitario_real,
      descuento_aplicado: v.descuento_aplicado,
      tipo_salida: v.tipo_salida,
      categoria: v.categoria,
      cliente: v.cliente,
      total: (v.precio_unitario_real - (v.descuento_aplicado || 0)) * v.cantidad_vendida
    }))

    // Mapear abonos a formato uniforme
    const abonosFormateados = abonos.map((a: any) => ({
      id: a.id_movimiento,
      fecha: a.fecha,
      tipo_transaccion: 'abono',
      folio_producto: null,
      nombre_producto: null,
      cantidad_vendida: null,
      talla: null,
      precio_unitario_real: null,
      descuento_aplicado: null,
      tipo_salida: 'Abono',
      categoria: null,
      cliente: a.cliente,
      referencia: a.referencia,
      total: a.monto
    }))

    // Combinar y ordenar por fecha descendente
    const transacciones = [...ventasFormateadas, ...abonosFormateados]
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())

    return transacciones
  } catch (error) {
    console.error('Error al obtener ventas de hoy:', error)
    return []
  }
})

// Obtener prendas prestadas
ipcMain.handle('get-prendas-prestadas', (_event) => {
  try {
    const prestamos = db.prepare(`
      SELECT 
        v.id_venta,
        v.fecha_venta,
        v.folio_producto,
        v.cantidad_vendida,
        v.talla,
        v.precio_unitario_real,
        v.tipo_salida,
        v.notas,
        p.nombre_producto,
        p.categoria,
        c.id_cliente,
        c.nombre_completo as cliente,
        c.telefono
      FROM ventas v
      LEFT JOIN productos p ON v.folio_producto = p.folio_producto
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
      WHERE v.tipo_salida = 'Prestado'
      ORDER BY v.fecha_venta DESC
    `).all()

    return prestamos
  } catch (error) {
    console.error('Error al obtener prendas prestadas:', error)
    return []
  }
})

// Obtener prendas apartadas
ipcMain.handle('get-prendas-apartadas', (_event) => {
  try {
    const apartados = db.prepare(`
      SELECT 
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
        p.categoria,
        c.id_cliente,
        c.nombre_completo as cliente,
        c.telefono,
        c.saldo_pendiente as cliente_saldo_pendiente
      FROM ventas v
      LEFT JOIN productos p ON v.folio_producto = p.folio_producto
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
      WHERE v.tipo_salida = 'Apartado'
      ORDER BY v.fecha_venta ASC
    `).all() as any[]

    // Agrupar apartados por cliente
    const apartadosPorCliente: Record<number, any[]> = {}
    for (const apartado of apartados) {
      if (apartado.id_cliente) {
        if (!apartadosPorCliente[apartado.id_cliente]) {
          apartadosPorCliente[apartado.id_cliente] = []
        }
        apartadosPorCliente[apartado.id_cliente].push(apartado)
      }
    }

    // Procesar cada cliente
    const resultado: any[] = []

    for (const [idCliente, apartadosCliente] of Object.entries(apartadosPorCliente)) {
      // Calcular el total de todos los apartados del cliente
      let totalApartados = 0
      for (const ap of apartadosCliente) {
        totalApartados += (ap.precio_unitario_real * ap.cantidad_vendida) - (ap.descuento_aplicado || 0)
      }

      // Obtener el saldo pendiente actual del cliente
      const saldoPendiente = apartadosCliente[0]?.cliente_saldo_pendiente || 0

      // El monto total pagado es: total de apartados - saldo pendiente actual
      let montoPagadoDisponible = totalApartados - saldoPendiente

      // Distribuir pagos en orden FIFO (primero los más antiguos)
      for (const apartado of apartadosCliente) {
        const montoTotal = (apartado.precio_unitario_real * apartado.cantidad_vendida) - (apartado.descuento_aplicado || 0)

        // Cuánto de este apartado se puede pagar con el dinero disponible
        const montoPagadoEste = Math.min(montoTotal, Math.max(0, montoPagadoDisponible))
        montoPagadoDisponible -= montoPagadoEste

        // Solo agregar si aún tiene saldo pendiente (no está completamente pagado)
        if (montoTotal - montoPagadoEste > 0.01) {
          resultado.push({
            ...apartado,
            monto_total: montoTotal,
            monto_pagado: montoPagadoEste,
            saldo_pendiente: montoTotal - montoPagadoEste
          })
        }
      }
    }

    // Ordenar por fecha descendente para mostrar los más recientes primero
    resultado.sort((a, b) => new Date(b.fecha_venta).getTime() - new Date(a.fecha_venta).getTime())

    return resultado
  } catch (error) {
    console.error('Error al obtener prendas apartadas:', error)
    return []
  }
})

// Procesar devolución de préstamo
ipcMain.handle('procesar-devolucion-prestamo', (_event, id_venta) => {
  const devolver = db.transaction(() => {
    // 1. Obtener datos de la venta
    const venta = db.prepare(`
      SELECT folio_producto, cantidad_vendida, talla, tipo_salida
      FROM ventas
      WHERE id_venta = ?
    `).get(id_venta) as any

    if (!venta) throw new Error('Venta no encontrada')
    if (venta.tipo_salida !== 'Prestado') throw new Error('Esta venta no es un préstamo')

    // 2. Restaurar stock
    db.prepare(`
      UPDATE tallas_producto
      SET cantidad = cantidad + @cantidad
      WHERE folio_producto = @folio AND talla = @talla
    `).run({
      cantidad: venta.cantidad_vendida,
      folio: venta.folio_producto,
      talla: venta.talla
    })

    db.prepare(`
      UPDATE productos
      SET stock_actual = stock_actual + @cantidad
      WHERE folio_producto = @folio
    `).run({
      cantidad: venta.cantidad_vendida,
      folio: venta.folio_producto
    })

    // 3. Actualizar estado de la venta a 'Devolución'
    db.prepare(`
      UPDATE ventas
      SET tipo_salida = 'Devolución',
          notas = CASE WHEN notas IS NULL THEN 'Devolución de préstamo' ELSE notas || ' - Devolución de préstamo' END
      WHERE id_venta = ?
    `).run(id_venta)
  })

  try {
    devolver()
    return { success: true }
  } catch (error: any) {
    console.error('Error al procesar devolución de préstamo:', error)
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
