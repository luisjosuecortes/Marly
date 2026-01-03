/**
 * Script de Pruebas de Lógica de Consultas SQL
 * Este script verifica que los cálculos sean correctos en todas las operaciones
 * 
 * Ejecutar con: npx tsx tests/test-logic.ts
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TEST_DB_PATH = path.join(__dirname, '..', 'database', 'test_marly.db')
const SCHEMA_PATH = path.join(__dirname, '..', 'database', 'schema.sql')

// Eliminar base de datos de prueba si existe
if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH)
}

const db = new Database(TEST_DB_PATH)

// Inicializar esquema
const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8')
db.exec(schema)

console.log('🧪 Iniciando pruebas de lógica de consultas SQL...\n')

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
    if (condition) {
        console.log(`  ✅ ${message}`)
        testsPassed++
    } else {
        console.log(`  ❌ FALLÓ: ${message}`)
        testsFailed++
    }
}

function assertApprox(actual: number, expected: number, message: string, tolerance = 0.01) {
    const diff = Math.abs(actual - expected)
    if (diff <= tolerance) {
        console.log(`  ✅ ${message} (${actual} ≈ ${expected})`)
        testsPassed++
    } else {
        console.log(`  ❌ FALLÓ: ${message} - Esperado: ${expected}, Obtenido: ${actual}`)
        testsFailed++
    }
}

// =========================================
// TEST 1: Registro de productos y entradas
// =========================================
console.log('\n📦 TEST 1: Registro de productos y stock')

// Agregar proveedor
db.prepare("INSERT INTO proveedores (nombre) VALUES ('Proveedor Test')").run()

// Registrar producto nuevo
db.prepare(`
  INSERT INTO productos (folio_producto, nombre_producto, categoria, genero_destino, stock_actual, stock_minimo, proveedor)
  VALUES ('TEST-001', 'Blusa Test', 'Blusa', 'Mujer', 10, 5, 'Proveedor Test')
`).run()

// Registrar entrada
db.prepare(`
  INSERT INTO entradas (fecha_entrada, folio_producto, cantidad_recibida, talla, costo_unitario_proveedor, precio_unitario_base, tipo_movimiento, responsable_recepcion)
  VALUES (CURRENT_TIMESTAMP, 'TEST-001', 10, 'M', 100, 200, 'Entrada Inicial', 'Admin')
`).run()

// Registrar talla
db.prepare(`
  INSERT INTO tallas_producto (folio_producto, talla, cantidad)
  VALUES ('TEST-001', 'M', 10)
`).run()

const producto = db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get('TEST-001') as any
assert(producto.stock_actual === 10, 'Stock inicial correcto (10 unidades)')

// Agregar más stock
db.prepare(`
  UPDATE productos SET stock_actual = stock_actual + 5 WHERE folio_producto = 'TEST-001'
`).run()
db.prepare(`
  UPDATE tallas_producto SET cantidad = cantidad + 5 WHERE folio_producto = 'TEST-001' AND talla = 'M'
`).run()

const productoActualizado = db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get('TEST-001') as any
assert(productoActualizado.stock_actual === 15, 'Stock después de reabastecimiento (15 unidades)')

// =========================================
// TEST 2: Registro de clientes y saldo inicial
// =========================================
console.log('\n👤 TEST 2: Clientes y saldo inicial')

// Cliente sin saldo inicial
db.prepare(`
  INSERT INTO clientes (nombre_completo, telefono, saldo_pendiente, estado_cuenta)
  VALUES ('Cliente Sin Deuda', '1234567890', 0, 'Al corriente')
`).run()

const clienteSinDeuda = db.prepare('SELECT * FROM clientes WHERE nombre_completo = ?').get('Cliente Sin Deuda') as any
assert(clienteSinDeuda.saldo_pendiente === 0, 'Cliente sin saldo inicial tiene $0')
assert(clienteSinDeuda.estado_cuenta === 'Al corriente', 'Estado es "Al corriente"')

// Cliente con saldo inicial
db.prepare(`
  INSERT INTO clientes (nombre_completo, telefono, saldo_pendiente, estado_cuenta)
  VALUES ('Cliente Con Deuda', '0987654321', 500, 'Con saldo')
`).run()

const clienteConDeuda = db.prepare('SELECT * FROM clientes WHERE nombre_completo = ?').get('Cliente Con Deuda') as any
assert(clienteConDeuda.saldo_pendiente === 500, 'Cliente con saldo inicial tiene $500')
assert(clienteConDeuda.estado_cuenta === 'Con saldo', 'Estado es "Con saldo"')

// =========================================
// TEST 3: Venta normal (contado)
// =========================================
console.log('\n💰 TEST 3: Venta de contado')

// Registrar venta de contado
db.prepare(`
  INSERT INTO ventas (fecha_venta, folio_producto, cantidad_vendida, talla, precio_unitario_real, descuento_aplicado, tipo_salida, responsable_caja)
  VALUES (CURRENT_TIMESTAMP, 'TEST-001', 2, 'M', 200, 0, 'Venta', 'Vendedor')
`).run()

// Actualizar stock
db.prepare(`UPDATE productos SET stock_actual = stock_actual - 2 WHERE folio_producto = 'TEST-001'`).run()
db.prepare(`UPDATE tallas_producto SET cantidad = cantidad - 2 WHERE folio_producto = 'TEST-001' AND talla = 'M'`).run()

const stockDespuesVenta = db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get('TEST-001') as any
assert(stockDespuesVenta.stock_actual === 13, 'Stock después de venta contado (15-2=13)')

// =========================================
// TEST 4: Venta a crédito - CÁLCULO CORRECTO DEL SALDO
// =========================================
console.log('\n💳 TEST 4: Venta a crédito (CRÍTICO)')

const idCliente = (db.prepare('SELECT id_cliente FROM clientes WHERE nombre_completo = ?').get('Cliente Sin Deuda') as any).id_cliente

// Simular venta a crédito: Total $500, Abono inicial $100
const montoTotal = 500
const abonoInicial = 100

// 1. Insertar venta
const resultVenta = db.prepare(`
  INSERT INTO ventas (fecha_venta, folio_producto, cantidad_vendida, talla, precio_unitario_real, descuento_aplicado, tipo_salida, id_cliente, responsable_caja)
  VALUES (CURRENT_TIMESTAMP, 'TEST-001', 1, 'M', 500, 0, 'Crédito', ?, 'Vendedor')
`).run(idCliente)

const idVenta = resultVenta.lastInsertRowid

// 2. Actualizar stock
db.prepare(`UPDATE productos SET stock_actual = stock_actual - 1 WHERE folio_producto = 'TEST-001'`).run()
db.prepare(`UPDATE tallas_producto SET cantidad = cantidad - 1 WHERE folio_producto = 'TEST-001' AND talla = 'M'`).run()

// 3. LÓGICA CORREGIDA: Primero sumar el total, luego restar el abono
// Paso 3a: Sumar el monto total al saldo del cliente
db.prepare(`
  UPDATE clientes 
  SET saldo_pendiente = saldo_pendiente + ?,
      estado_cuenta = 'Con saldo'
  WHERE id_cliente = ?
`).run(montoTotal, idCliente)

// Registrar movimiento de cargo
db.prepare(`
  INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
  VALUES (?, CURRENT_TIMESTAMP, 'cargo', ?, ?, 'Vendedor')
`).run(idCliente, montoTotal, `Venta #${idVenta}`)

// Paso 3b: Si hay abono inicial, restarlo
if (abonoInicial > 0) {
    db.prepare(`
    UPDATE clientes 
    SET saldo_pendiente = saldo_pendiente - ?,
        estado_cuenta = CASE WHEN saldo_pendiente - ? > 0 THEN 'Con saldo' ELSE 'Al corriente' END
    WHERE id_cliente = ?
  `).run(abonoInicial, abonoInicial, idCliente)

    // Registrar movimiento de abono
    db.prepare(`
    INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
    VALUES (?, CURRENT_TIMESTAMP, 'abono', ?, ?, 'Vendedor')
  `).run(idCliente, abonoInicial, `Abono inicial - Venta #${idVenta}`)
}

// VERIFICACIÓN CRÍTICA
const clienteDespuesCredito = db.prepare('SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?').get(idCliente) as any
const saldoEsperado = montoTotal - abonoInicial // 500 - 100 = 400

assertApprox(clienteDespuesCredito.saldo_pendiente, saldoEsperado,
    `Saldo después de crédito $500 con abono $100 = $${saldoEsperado}`)

// Verificar movimientos
const movimientos = db.prepare('SELECT * FROM movimientos_cliente WHERE id_cliente = ? ORDER BY id_movimiento').all(idCliente) as any[]
assert(movimientos.length === 2, `Hay 2 movimientos registrados (cargo + abono)`)
assert(movimientos[0].tipo_movimiento === 'cargo' && movimientos[0].monto === 500, 'Primer movimiento es cargo de $500')
assert(movimientos[1].tipo_movimiento === 'abono' && movimientos[1].monto === 100, 'Segundo movimiento es abono de $100')

// =========================================
// TEST 5: Abono posterior
// =========================================
console.log('\n💵 TEST 5: Abono posterior a venta a crédito')

const saldoAntes = (db.prepare('SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?').get(idCliente) as any).saldo_pendiente
const montoAbono = 150

// Registrar abono
db.prepare(`
  UPDATE clientes 
  SET saldo_pendiente = saldo_pendiente - ?,
      estado_cuenta = CASE WHEN saldo_pendiente - ? > 0 THEN 'Con saldo' ELSE 'Al corriente' END
  WHERE id_cliente = ?
`).run(montoAbono, montoAbono, idCliente)

db.prepare(`
  INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
  VALUES (?, CURRENT_TIMESTAMP, 'abono', ?, ?, 'Cajero')
`).run(idCliente, montoAbono, `Abono - Venta #${idVenta}`)

const saldoDespuesAbono = (db.prepare('SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?').get(idCliente) as any).saldo_pendiente
assertApprox(saldoDespuesAbono, saldoAntes - montoAbono, `Saldo después de abono $150: $${saldoAntes} - $${montoAbono} = $${saldoAntes - montoAbono}`)

// =========================================
// TEST 6: Cálculo de productos pendientes
// =========================================
console.log('\n📋 TEST 6: Cálculo de productos pendientes por cliente')

// Obtener ventas del cliente con monto faltante
const ventasCliente = db.prepare(`
  SELECT 
    v.id_venta,
    (v.precio_unitario_real * v.cantidad_vendida - COALESCE(v.descuento_aplicado, 0)) as monto_total
  FROM ventas v
  WHERE v.id_cliente = ? AND v.tipo_salida IN ('Crédito', 'Apartado', 'Prestado')
`).all(idCliente) as any[]

for (const venta of ventasCliente) {
    // Calcular abonos para esta venta
    const abonos = db.prepare(`
    SELECT COALESCE(SUM(monto), 0) as total_abonado
    FROM movimientos_cliente
    WHERE id_cliente = ?
      AND tipo_movimiento = 'abono'
      AND (referencia LIKE ? OR referencia LIKE ?)
  `).get(idCliente, `%Venta #${venta.id_venta}%`, `Abono inicial - Venta #${venta.id_venta}%`) as any

    const montoAbonado = abonos.total_abonado
    const montoFaltante = venta.monto_total - montoAbonado

    assertApprox(montoFaltante, 250, `Monto faltante de venta #${venta.id_venta}: $${venta.monto_total} - $${montoAbonado} = $${montoFaltante}`)
}

// =========================================
// TEST 7: Eliminación de venta y reversión de saldo
// =========================================
console.log('\n🗑️ TEST 7: Eliminación de venta y reversión')

// Crear nueva venta para eliminar
const resultVenta2 = db.prepare(`
  INSERT INTO ventas (fecha_venta, folio_producto, cantidad_vendida, talla, precio_unitario_real, descuento_aplicado, tipo_salida, id_cliente, responsable_caja)
  VALUES (CURRENT_TIMESTAMP, 'TEST-001', 1, 'M', 300, 0, 'Crédito', ?, 'Vendedor')
`).run(idCliente)

const idVenta2 = resultVenta2.lastInsertRowid

// Simular que se sumó al saldo
db.prepare(`UPDATE clientes SET saldo_pendiente = saldo_pendiente + 300 WHERE id_cliente = ?`).run(idCliente)
db.prepare(`
  INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
  VALUES (?, CURRENT_TIMESTAMP, 'cargo', 300, ?, 'Vendedor')
`).run(idCliente, `Venta #${idVenta2}`)

const saldoAntesEliminar = (db.prepare('SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?').get(idCliente) as any).saldo_pendiente

// Eliminar venta: revertir saldo
db.prepare(`UPDATE clientes SET saldo_pendiente = saldo_pendiente - 300 WHERE id_cliente = ?`).run(idCliente)
db.prepare(`DELETE FROM movimientos_cliente WHERE referencia LIKE ?`).run(`%Venta #${idVenta2}%`)
db.prepare(`DELETE FROM ventas WHERE id_venta = ?`).run(idVenta2)

const saldoDespuesEliminar = (db.prepare('SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?').get(idCliente) as any).saldo_pendiente
assertApprox(saldoDespuesEliminar, saldoAntesEliminar - 300, `Saldo revertido después de eliminar venta`)

// =========================================
// TEST 8: Descuentos en ventas
// =========================================
console.log('\n🏷️ TEST 8: Cálculos con descuentos')

const resultVenta3 = db.prepare(`
  INSERT INTO ventas (fecha_venta, folio_producto, cantidad_vendida, talla, precio_unitario_real, descuento_aplicado, tipo_salida, id_cliente, responsable_caja)
  VALUES (CURRENT_TIMESTAMP, 'TEST-001', 2, 'M', 200, 50, 'Crédito', ?, 'Vendedor')
`).run(idCliente)

// Monto total = (200 * 2) - 50 = 350
const montoConDescuento = (200 * 2) - 50
db.prepare(`UPDATE clientes SET saldo_pendiente = saldo_pendiente + ? WHERE id_cliente = ?`).run(montoConDescuento, idCliente)

const ventaConDescuento = db.prepare(`
  SELECT (precio_unitario_real * cantidad_vendida - COALESCE(descuento_aplicado, 0)) as monto_total
  FROM ventas WHERE id_venta = ?
`).get(resultVenta3.lastInsertRowid) as any

assertApprox(ventaConDescuento.monto_total, 350, 'Monto con descuento: (200 × 2) - 50 = $350')

// =========================================
// RESUMEN
// =========================================
console.log('\n' + '='.repeat(50))
console.log('📊 RESUMEN DE PRUEBAS')
console.log('='.repeat(50))
console.log(`  ✅ Pruebas exitosas: ${testsPassed}`)
console.log(`  ❌ Pruebas fallidas: ${testsFailed}`)
console.log('='.repeat(50))

// Limpiar
db.close()
fs.unlinkSync(TEST_DB_PATH)

if (testsFailed > 0) {
    console.log('\n⚠️ HAY ERRORES EN LA LÓGICA DE LAS CONSULTAS')
    process.exit(1)
} else {
    console.log('\n🎉 TODAS LAS PRUEBAS PASARON CORRECTAMENTE')
    process.exit(0)
}
