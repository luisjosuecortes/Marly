import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = path.join(__dirname, 'test_stock_adjustment.db')

// Limpiar DB anterior
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath)
}

const db = new Database(dbPath)

// Inicializar Schema (Simplificado para la prueba)
db.exec(`
  CREATE TABLE IF NOT EXISTS productos (
    folio_producto TEXT PRIMARY KEY,
    nombre_producto TEXT,
    stock_actual INTEGER NOT NULL DEFAULT 0,
    fecha_ultima_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tallas_producto (
    id_talla INTEGER PRIMARY KEY AUTOINCREMENT,
    folio_producto TEXT NOT NULL,
    talla TEXT NOT NULL,
    cantidad INTEGER NOT NULL DEFAULT 0,
    fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (folio_producto, talla)
  );

  CREATE TABLE IF NOT EXISTS entradas (
    id_entrada INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_entrada TEXT NOT NULL,
    folio_producto TEXT NOT NULL,
    cantidad_recibida INTEGER NOT NULL,
    talla TEXT NOT NULL,
    costo_unitario_proveedor REAL NOT NULL,
    precio_unitario_base REAL NOT NULL,
    tipo_movimiento TEXT NOT NULL,
    responsable_recepcion TEXT,
    observaciones_entrada TEXT
  );
`)

console.log('DB Inicializada')

// Mock del handler actualizar-stock (Copiado de main.ts para probar la lógica)
const actualizarStock = (datos: any) => {
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

        // 4. Registrar movimiento en historial
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
            cantidad: diferencia,
            talla,
            responsable: responsable || 'Sistema',
            motivo: motivo || 'Ajuste de inventario'
        })
    })

    actualizar()
}

// --- PRUEBAS ---

// 1. Insertar producto inicial
db.prepare(`
  INSERT INTO productos (folio_producto, nombre_producto, stock_actual)
  VALUES ('PROD-001', 'Camisa Test', 10)
`).run()

db.prepare(`
  INSERT INTO tallas_producto (folio_producto, talla, cantidad)
  VALUES ('PROD-001', 'M', 10)
`).run()

console.log('Producto inicial creado: Stock 10, Talla M: 10')

// 2. Ajustar stock de Talla M de 10 a 15 (+5)
console.log('Ejecutando ajuste: Talla M -> 15')
actualizarStock({
    folio_producto: 'PROD-001',
    nuevo_stock: 15,
    talla: 'M',
    motivo: 'Prueba Aumento',
    responsable: 'Tester'
})

// Verificaciones
const prod1 = db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get('PROD-001') as any
const tallaM1 = db.prepare('SELECT cantidad FROM tallas_producto WHERE folio_producto = ? AND talla = ?').get('PROD-001', 'M') as any

console.log(`Stock Total: ${prod1.stock_actual} (Esperado: 15)`)
console.log(`Talla M: ${tallaM1.cantidad} (Esperado: 15)`)

if (prod1.stock_actual !== 15 || tallaM1.cantidad !== 15) {
    console.error('FALLO PRUEBA 1')
    process.exit(1)
}

// 3. Agregar nueva talla L con stock 5
console.log('Ejecutando ajuste: Nueva Talla L -> 5')
actualizarStock({
    folio_producto: 'PROD-001',
    nuevo_stock: 5,
    talla: 'L',
    motivo: 'Nueva Talla',
    responsable: 'Tester'
})

const prod2 = db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get('PROD-001') as any
const tallaL2 = db.prepare('SELECT cantidad FROM tallas_producto WHERE folio_producto = ? AND talla = ?').get('PROD-001', 'L') as any
const tallaM2 = db.prepare('SELECT cantidad FROM tallas_producto WHERE folio_producto = ? AND talla = ?').get('PROD-001', 'M') as any

console.log(`Stock Total: ${prod2.stock_actual} (Esperado: 20 -> 15+5)`)
console.log(`Talla L: ${tallaL2.cantidad} (Esperado: 5)`)
console.log(`Talla M: ${tallaM2.cantidad} (Esperado: 15)`)

if (prod2.stock_actual !== 20 || tallaL2.cantidad !== 5 || tallaM2.cantidad !== 15) {
    console.error('FALLO PRUEBA 2')
    process.exit(1)
}

// 4. Reducir stock Talla M de 15 a 10 (-5)
console.log('Ejecutando ajuste: Talla M -> 10')
actualizarStock({
    folio_producto: 'PROD-001',
    nuevo_stock: 10,
    talla: 'M',
    motivo: 'Reducción',
    responsable: 'Tester'
})

const prod3 = db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get('PROD-001') as any
const tallaM3 = db.prepare('SELECT cantidad FROM tallas_producto WHERE folio_producto = ? AND talla = ?').get('PROD-001', 'M') as any

console.log(`Stock Total: ${prod3.stock_actual} (Esperado: 15 -> 10+5)`)
console.log(`Talla M: ${tallaM3.cantidad} (Esperado: 10)`)

if (prod3.stock_actual !== 15 || tallaM3.cantidad !== 10) {
    console.error('FALLO PRUEBA 3')
    process.exit(1)
}

console.log('TODAS LAS PRUEBAS PASARON')
