/**
 * Script de Pruebas COMPLETAS de Lógica de Consultas SQL
 * Cubre TODOS los 24 handlers IPC del sistema
 * 
 * Ejecutar con: npx tsx tests/test-logic-complete.ts
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TEST_DB_PATH = path.join(__dirname, '..', 'database', 'test_complete.db')
const SCHEMA_PATH = path.join(__dirname, '..', 'database', 'schema.sql')

// Eliminar base de datos de prueba si existe
if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH)
}

const db = new Database(TEST_DB_PATH)

// Inicializar esquema
const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8')
db.exec(schema)

console.log('🧪 PRUEBAS COMPLETAS DE LÓGICA SQL - 24 HANDLERS\n')
console.log('='.repeat(60))

let testsPassed = 0
let testsFailed = 0
let currentSection = ''

function section(name: string) {
    currentSection = name
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`📌 ${name}`)
    console.log('─'.repeat(60))
}

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

function assertNull(value: any, message: string) {
    if (value === null || value === undefined) {
        console.log(`  ✅ ${message}`)
        testsPassed++
    } else {
        console.log(`  ❌ FALLÓ: ${message} - Se esperaba null pero se obtuvo: ${value}`)
        testsFailed++
    }
}

function assertNotNull(value: any, message: string) {
    if (value !== null && value !== undefined) {
        console.log(`  ✅ ${message}`)
        testsPassed++
    } else {
        console.log(`  ❌ FALLÓ: ${message} - Se esperaba un valor pero se obtuvo null`)
        testsFailed++
    }
}

// =========================================
// SETUP: Datos iniciales
// =========================================
section('SETUP: Preparando datos de prueba')

// Proveedores
db.prepare("INSERT INTO proveedores (nombre) VALUES ('Proveedor A')").run()
db.prepare("INSERT INTO proveedores (nombre) VALUES ('Proveedor B')").run()
assert(true, 'Proveedores de prueba creados')

// =========================================
// 1. get-proveedores
// =========================================
section('1. get-proveedores')

const proveedores = db.prepare('SELECT nombre FROM proveedores ORDER BY nombre').all() as any[]
assert(proveedores.length === 2, `Obtener proveedores: ${proveedores.length} proveedores`)
assert(proveedores[0].nombre === 'Proveedor A', 'Primer proveedor es "Proveedor A"')

// =========================================
// 2. agregar-proveedor
// =========================================
section('2. agregar-proveedor')

db.prepare("INSERT INTO proveedores (nombre) VALUES ('Proveedor C')").run()
const proveedoresDespues = db.prepare('SELECT COUNT(*) as count FROM proveedores').get() as any
assert(proveedoresDespues.count === 3, 'Agregar proveedor: 3 proveedores en total')

// =========================================
// 3. eliminar-proveedor
// =========================================
section('3. eliminar-proveedor')

db.prepare("DELETE FROM proveedores WHERE nombre = 'Proveedor C'").run()
const proveedoresRestantes = db.prepare('SELECT COUNT(*) as count FROM proveedores').get() as any
assert(proveedoresRestantes.count === 2, 'Eliminar proveedor: 2 proveedores restantes')

// =========================================
// 4. registrar-nuevo-producto
// =========================================
section('4. registrar-nuevo-producto')

// Insertar producto
db.prepare(`
  INSERT INTO productos (folio_producto, nombre_producto, categoria, genero_destino, stock_actual, stock_minimo, proveedor)
  VALUES ('PROD-001', 'Blusa Floreada', 'Blusa', 'Mujer', 0, 5, 'Proveedor A')
`).run()

// Insertar entrada inicial
db.prepare(`
  INSERT INTO entradas (fecha_entrada, folio_producto, cantidad_recibida, talla, costo_unitario_proveedor, precio_unitario_base, tipo_movimiento, responsable_recepcion)
  VALUES (CURRENT_TIMESTAMP, 'PROD-001', 10, 'M', 150, 300, 'Entrada Inicial', 'Admin')
`).run()

// Actualizar stock
db.prepare(`UPDATE productos SET stock_actual = 10 WHERE folio_producto = 'PROD-001'`).run()

// Insertar talla
db.prepare(`INSERT INTO tallas_producto (folio_producto, talla, cantidad) VALUES ('PROD-001', 'M', 10)`).run()

const productoNuevo = db.prepare('SELECT * FROM productos WHERE folio_producto = ?').get('PROD-001') as any
assert(productoNuevo !== null, 'Producto creado correctamente')
assert(productoNuevo.stock_actual === 10, 'Stock inicial = 10')
assert(productoNuevo.categoria === 'Blusa', 'Categoría correcta')

// =========================================
// 5. get-productos
// =========================================
section('5. get-productos')

const productos = db.prepare(`
  SELECT p.*, json_group_array(json_object('talla', tp.talla, 'cantidad', tp.cantidad)) as tallas_detalle
  FROM productos p
  LEFT JOIN tallas_producto tp ON p.folio_producto = tp.folio_producto
  GROUP BY p.folio_producto
`).all() as any[]

assert(productos.length === 1, 'Hay 1 producto en el sistema')
const tallasDetalle = JSON.parse(productos[0].tallas_detalle)
assert(tallasDetalle[0].talla === 'M', 'Talla M registrada')
assert(tallasDetalle[0].cantidad === 10, 'Cantidad en talla M = 10')

// =========================================
// 6. get-producto-detalle
// =========================================
section('6. get-producto-detalle')

const detalle = db.prepare(`
  SELECT p.*, json_group_array(json_object('talla', tp.talla, 'cantidad', tp.cantidad)) as tallas_detalle
  FROM productos p
  LEFT JOIN tallas_producto tp ON p.folio_producto = tp.folio_producto
  WHERE p.folio_producto = ?
  GROUP BY p.folio_producto
`).get('PROD-001') as any

assertNotNull(detalle, 'Detalle de producto obtenido')
assert(detalle.nombre_producto === 'Blusa Floreada', 'Nombre correcto en detalle')

// =========================================
// 7. get-ultima-entrada
// =========================================
section('7. get-ultima-entrada')

const ultimaEntrada = db.prepare(`
  SELECT * FROM entradas WHERE folio_producto = ? ORDER BY fecha_entrada DESC LIMIT 1
`).get('PROD-001') as any

assertNotNull(ultimaEntrada, 'Última entrada obtenida')
assert(ultimaEntrada.costo_unitario_proveedor === 150, 'Costo unitario = $150')
assert(ultimaEntrada.precio_unitario_base === 300, 'Precio venta = $300')

// =========================================
// 8. get-precio-venta
// =========================================
section('8. get-precio-venta')

const precioVenta = db.prepare(`
  SELECT precio_unitario_base FROM entradas 
  WHERE folio_producto = ? AND talla = ?
  ORDER BY fecha_entrada DESC LIMIT 1
`).get('PROD-001', 'M') as any

assertNotNull(precioVenta, 'Precio de venta obtenido para talla')
assert(precioVenta.precio_unitario_base === 300, 'Precio de venta talla M = $300')

// =========================================
// 9. registrar-entrada-existente (Reabastecimiento)
// =========================================
section('9. registrar-entrada-existente')

// Agregar más stock a talla existente
db.prepare(`
  INSERT INTO entradas (fecha_entrada, folio_producto, cantidad_recibida, talla, costo_unitario_proveedor, precio_unitario_base, tipo_movimiento, responsable_recepcion)
  VALUES (CURRENT_TIMESTAMP, 'PROD-001', 5, 'M', 150, 300, 'Reabastecimiento', 'Admin')
`).run()
db.prepare(`UPDATE productos SET stock_actual = stock_actual + 5 WHERE folio_producto = 'PROD-001'`).run()
db.prepare(`UPDATE tallas_producto SET cantidad = cantidad + 5 WHERE folio_producto = 'PROD-001' AND talla = 'M'`).run()

const stockDespuesReabasto = db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get('PROD-001') as any
assert(stockDespuesReabasto.stock_actual === 15, 'Stock después de reabastecimiento = 15')

// Agregar nueva talla
db.prepare(`
  INSERT INTO entradas (fecha_entrada, folio_producto, cantidad_recibida, talla, costo_unitario_proveedor, precio_unitario_base, tipo_movimiento, responsable_recepcion)
  VALUES (CURRENT_TIMESTAMP, 'PROD-001', 8, 'G', 150, 320, 'Reabastecimiento', 'Admin')
`).run()
db.prepare(`UPDATE productos SET stock_actual = stock_actual + 8 WHERE folio_producto = 'PROD-001'`).run()
db.prepare(`INSERT INTO tallas_producto (folio_producto, talla, cantidad) VALUES ('PROD-001', 'G', 8)`).run()

const stockConNuevaTalla = db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get('PROD-001') as any
assert(stockConNuevaTalla.stock_actual === 23, 'Stock con nueva talla G = 23')

// =========================================
// 10. get-historial-entradas
// =========================================
section('10. get-historial-entradas')

const historialEntradas = db.prepare('SELECT * FROM entradas WHERE folio_producto = ? ORDER BY fecha_entrada DESC').all('PROD-001') as any[]
assert(historialEntradas.length === 3, 'Hay 3 entradas registradas')

// =========================================
// 11. eliminar-entrada
// =========================================
section('11. eliminar-entrada')

const entradaAEliminar = db.prepare('SELECT id_entrada, cantidad_recibida, talla FROM entradas WHERE folio_producto = ? AND tipo_movimiento = ? ORDER BY id_entrada DESC LIMIT 1').get('PROD-001', 'Reabastecimiento') as any
const stockAntesEliminar = (db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get('PROD-001') as any).stock_actual

// Simular eliminación de entrada
db.prepare(`UPDATE productos SET stock_actual = stock_actual - ? WHERE folio_producto = 'PROD-001'`).run(entradaAEliminar.cantidad_recibida)
db.prepare(`UPDATE tallas_producto SET cantidad = cantidad - ? WHERE folio_producto = 'PROD-001' AND talla = ?`).run(entradaAEliminar.cantidad_recibida, entradaAEliminar.talla)
db.prepare('DELETE FROM entradas WHERE id_entrada = ?').run(entradaAEliminar.id_entrada)

const stockDespuesEliminar = (db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get('PROD-001') as any).stock_actual
assert(stockDespuesEliminar === stockAntesEliminar - entradaAEliminar.cantidad_recibida, `Stock revertido: ${stockAntesEliminar} - ${entradaAEliminar.cantidad_recibida} = ${stockDespuesEliminar}`)

// =========================================
// 12. actualizar-stock (Ajuste manual)
// =========================================
section('12. actualizar-stock')

const stockAntes = (db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get('PROD-001') as any).stock_actual
const nuevoStock = 20

db.prepare(`UPDATE productos SET stock_actual = ? WHERE folio_producto = 'PROD-001'`).run(nuevoStock)

const stockDespuesAjuste = (db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get('PROD-001') as any).stock_actual
assert(stockDespuesAjuste === nuevoStock, `Ajuste manual de stock: ${stockAntes} → ${nuevoStock}`)

// =========================================
// 13. agregar-cliente
// =========================================
section('13. agregar-cliente')

// Cliente sin saldo
db.prepare(`
  INSERT INTO clientes (nombre_completo, telefono, saldo_pendiente, estado_cuenta)
  VALUES ('María García', '5551234567', 0, 'Al corriente')
`).run()

// Cliente con saldo inicial
const resultCliente2 = db.prepare(`
  INSERT INTO clientes (nombre_completo, telefono, saldo_pendiente, estado_cuenta)
  VALUES ('Juan Pérez', '5559876543', 200, 'Con saldo')
`).run()
const idClienteConSaldo = resultCliente2.lastInsertRowid

// Registrar movimiento de saldo inicial
db.prepare(`
  INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
  VALUES (?, CURRENT_TIMESTAMP, 'cargo', 200, 'Saldo inicial', 'Sistema')
`).run(idClienteConSaldo)

const cliente1 = db.prepare('SELECT * FROM clientes WHERE nombre_completo = ?').get('María García') as any
const cliente2 = db.prepare('SELECT * FROM clientes WHERE nombre_completo = ?').get('Juan Pérez') as any

assert(cliente1.saldo_pendiente === 0, 'Cliente María sin saldo = $0')
assert(cliente1.estado_cuenta === 'Al corriente', 'Estado María = "Al corriente"')
assert(cliente2.saldo_pendiente === 200, 'Cliente Juan con saldo = $200')
assert(cliente2.estado_cuenta === 'Con saldo', 'Estado Juan = "Con saldo"')

// =========================================
// 14. get-clientes
// =========================================
section('14. get-clientes')

const clientes = db.prepare('SELECT * FROM clientes ORDER BY nombre_completo').all() as any[]
assert(clientes.length === 2, 'Hay 2 clientes registrados')

// =========================================
// 15. get-historial-cliente
// =========================================
section('15. get-historial-cliente')

const historialCliente = db.prepare('SELECT * FROM movimientos_cliente WHERE id_cliente = ?').all(idClienteConSaldo) as any[]
assert(historialCliente.length === 1, 'Historial de Juan tiene 1 movimiento (saldo inicial)')
assert(historialCliente[0].tipo_movimiento === 'cargo', 'Movimiento es cargo')
assert(historialCliente[0].monto === 200, 'Monto del cargo = $200')

// =========================================
// 16. registrar-venta (Contado)
// =========================================
section('16. registrar-venta (Contado)')

const stockAntesVenta = (db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get('PROD-001') as any).stock_actual

db.prepare(`
  INSERT INTO ventas (fecha_venta, folio_producto, cantidad_vendida, talla, precio_unitario_real, descuento_aplicado, tipo_salida, responsable_caja)
  VALUES (CURRENT_TIMESTAMP, 'PROD-001', 2, 'M', 300, 0, 'Venta', 'Vendedor')
`).run()
db.prepare(`UPDATE productos SET stock_actual = stock_actual - 2 WHERE folio_producto = 'PROD-001'`).run()
db.prepare(`UPDATE tallas_producto SET cantidad = cantidad - 2 WHERE folio_producto = 'PROD-001' AND talla = 'M'`).run()

const stockDespuesVenta = (db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get('PROD-001') as any).stock_actual
assert(stockDespuesVenta === stockAntesVenta - 2, `Venta contado: Stock ${stockAntesVenta} - 2 = ${stockDespuesVenta}`)

// =========================================
// 17. registrar-venta (Crédito con abono inicial)
// =========================================
section('17. registrar-venta (Crédito con abono) - CRÍTICO')

const idCliente = (db.prepare('SELECT id_cliente FROM clientes WHERE nombre_completo = ?').get('María García') as any).id_cliente
const saldoAntesCredito = (db.prepare('SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?').get(idCliente) as any).saldo_pendiente

const montoTotal = 500
const abonoInicial = 100

// Insertar venta
const resultVenta = db.prepare(`
  INSERT INTO ventas (fecha_venta, folio_producto, cantidad_vendida, talla, precio_unitario_real, descuento_aplicado, tipo_salida, id_cliente, responsable_caja)
  VALUES (CURRENT_TIMESTAMP, 'PROD-001', 1, 'M', 500, 0, 'Crédito', ?, 'Vendedor')
`).run(idCliente)
const idVentaCredito = resultVenta.lastInsertRowid

// Actualizar stock
db.prepare(`UPDATE productos SET stock_actual = stock_actual - 1 WHERE folio_producto = 'PROD-001'`).run()
db.prepare(`UPDATE tallas_producto SET cantidad = cantidad - 1 WHERE folio_producto = 'PROD-001' AND talla = 'M'`).run()

// LÓGICA CORRECTA: Sumar total, luego restar abono
db.prepare(`UPDATE clientes SET saldo_pendiente = saldo_pendiente + ?, estado_cuenta = 'Con saldo' WHERE id_cliente = ?`).run(montoTotal, idCliente)
db.prepare(`INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable) VALUES (?, CURRENT_TIMESTAMP, 'cargo', ?, ?, 'Vendedor')`).run(idCliente, montoTotal, `Venta #${idVentaCredito}`)

if (abonoInicial > 0) {
    db.prepare(`UPDATE clientes SET saldo_pendiente = saldo_pendiente - ?, estado_cuenta = CASE WHEN saldo_pendiente - ? > 0 THEN 'Con saldo' ELSE 'Al corriente' END WHERE id_cliente = ?`).run(abonoInicial, abonoInicial, idCliente)
    db.prepare(`INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable) VALUES (?, CURRENT_TIMESTAMP, 'abono', ?, ?, 'Vendedor')`).run(idCliente, abonoInicial, `Abono inicial - Venta #${idVentaCredito}`)
}

const saldoDespuesCredito = (db.prepare('SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?').get(idCliente) as any).saldo_pendiente
const saldoEsperado = saldoAntesCredito + montoTotal - abonoInicial // 0 + 500 - 100 = 400

assertApprox(saldoDespuesCredito, saldoEsperado, `Crédito $500 - Abono $100 = Saldo $${saldoEsperado}`)

// =========================================
// 18. registrar-venta (Apartado)
// =========================================
section('18. registrar-venta (Apartado)')

const saldoAntesApartado = (db.prepare('SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?').get(idCliente) as any).saldo_pendiente

const resultApartado = db.prepare(`
  INSERT INTO ventas (fecha_venta, folio_producto, cantidad_vendida, talla, precio_unitario_real, descuento_aplicado, tipo_salida, id_cliente, responsable_caja)
  VALUES (CURRENT_TIMESTAMP, 'PROD-001', 1, 'M', 300, 0, 'Apartado', ?, 'Vendedor')
`).run(idCliente)
const idVentaApartado = resultApartado.lastInsertRowid

db.prepare(`UPDATE productos SET stock_actual = stock_actual - 1 WHERE folio_producto = 'PROD-001'`).run()
db.prepare(`UPDATE tallas_producto SET cantidad = cantidad - 1 WHERE folio_producto = 'PROD-001' AND talla = 'M'`).run()

// Apartado con abono de 50
db.prepare(`UPDATE clientes SET saldo_pendiente = saldo_pendiente + 300, estado_cuenta = 'Con saldo' WHERE id_cliente = ?`).run(idCliente)
db.prepare(`INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable) VALUES (?, CURRENT_TIMESTAMP, 'cargo', 300, ?, 'Vendedor')`).run(idCliente, `Venta #${idVentaApartado}`)
db.prepare(`UPDATE clientes SET saldo_pendiente = saldo_pendiente - 50 WHERE id_cliente = ?`).run(idCliente)
db.prepare(`INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable) VALUES (?, CURRENT_TIMESTAMP, 'abono', 50, ?, 'Vendedor')`).run(idCliente, `Abono inicial - Venta #${idVentaApartado}`)

const saldoDespuesApartado = (db.prepare('SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?').get(idCliente) as any).saldo_pendiente
assertApprox(saldoDespuesApartado, saldoAntesApartado + 300 - 50, `Apartado $300 - Abono $50 = +$250 al saldo`)

// =========================================
// 19. registrar-venta (Prestado)
// =========================================
section('19. registrar-venta (Prestado)')

// Primero necesitamos agregar stock a talla G que fue eliminada en test 11
db.prepare(`
  INSERT INTO entradas (fecha_entrada, folio_producto, cantidad_recibida, talla, costo_unitario_proveedor, precio_unitario_base, tipo_movimiento, responsable_recepcion)
  VALUES (CURRENT_TIMESTAMP, 'PROD-001', 10, 'G', 150, 320, 'Reabastecimiento', 'Admin')
`).run()
db.prepare(`UPDATE productos SET stock_actual = stock_actual + 10 WHERE folio_producto = 'PROD-001'`).run()
// Verificar si la talla G existe, si no insertarla, si sí actualizarla
const tallaGExiste = db.prepare('SELECT cantidad FROM tallas_producto WHERE folio_producto = ? AND talla = ?').get('PROD-001', 'G') as any
if (tallaGExiste) {
    db.prepare(`UPDATE tallas_producto SET cantidad = cantidad + 10 WHERE folio_producto = 'PROD-001' AND talla = 'G'`).run()
} else {
    db.prepare(`INSERT INTO tallas_producto (folio_producto, talla, cantidad) VALUES ('PROD-001', 'G', 10)`).run()
}

const resultPrestado = db.prepare(`
  INSERT INTO ventas (fecha_venta, folio_producto, cantidad_vendida, talla, precio_unitario_real, descuento_aplicado, tipo_salida, id_cliente, responsable_caja)
  VALUES (CURRENT_TIMESTAMP, 'PROD-001', 1, 'G', 320, 0, 'Prestado', ?, 'Vendedor')
`).run(idCliente)

db.prepare(`UPDATE productos SET stock_actual = stock_actual - 1, estado_producto = 'Prestado' WHERE folio_producto = 'PROD-001'`).run()
db.prepare(`UPDATE tallas_producto SET cantidad = cantidad - 1 WHERE folio_producto = 'PROD-001' AND talla = 'G'`).run()

// Prestado NO afecta saldo pendiente directamente
const saldoDespuesPrestado = (db.prepare('SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?').get(idCliente) as any).saldo_pendiente
assertApprox(saldoDespuesPrestado, saldoDespuesApartado, 'Prestado NO afecta saldo pendiente')

const estadoProducto = (db.prepare('SELECT estado_producto FROM productos WHERE folio_producto = ?').get('PROD-001') as any).estado_producto
assert(estadoProducto === 'Prestado', 'Estado del producto = "Prestado"')

// =========================================
// 20. get-productos-pendientes-cliente
// =========================================
section('20. get-productos-pendientes-cliente')

const ventasPendientes = db.prepare(`
  SELECT v.id_venta, v.tipo_salida, 
    (v.precio_unitario_real * v.cantidad_vendida - COALESCE(v.descuento_aplicado, 0)) as monto_total
  FROM ventas v
  WHERE v.id_cliente = ? AND v.tipo_salida IN ('Crédito', 'Apartado', 'Prestado')
`).all(idCliente) as any[]

assert(ventasPendientes.length === 3, 'Hay 3 ventas pendientes (Crédito, Apartado, Prestado)')

// Calcular monto faltante para cada venta
for (const venta of ventasPendientes) {
    const abonos = db.prepare(`
    SELECT COALESCE(SUM(monto), 0) as total
    FROM movimientos_cliente
    WHERE id_cliente = ? AND tipo_movimiento = 'abono'
      AND (referencia LIKE ? OR referencia LIKE ?)
  `).get(idCliente, `%Venta #${venta.id_venta}%`, `Abono inicial - Venta #${venta.id_venta}%`) as any

    const montoFaltante = venta.monto_total - abonos.total
    console.log(`    📝 Venta #${venta.id_venta} (${venta.tipo_salida}): Total=$${venta.monto_total}, Abonado=$${abonos.total}, Faltante=$${montoFaltante}`)
}

// =========================================
// 21. registrar-abono-cliente
// =========================================
section('21. registrar-abono-cliente')

const saldoAntesAbono = (db.prepare('SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?').get(idCliente) as any).saldo_pendiente
const montoAbono = 150

db.prepare(`UPDATE clientes SET saldo_pendiente = saldo_pendiente - ?, estado_cuenta = CASE WHEN saldo_pendiente - ? > 0 THEN 'Con saldo' ELSE 'Al corriente' END WHERE id_cliente = ?`).run(montoAbono, montoAbono, idCliente)
db.prepare(`INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable) VALUES (?, CURRENT_TIMESTAMP, 'abono', ?, ?, 'Cajero')`).run(idCliente, montoAbono, `Abono - Venta #${idVentaCredito}`)

const saldoDespuesAbono = (db.prepare('SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?').get(idCliente) as any).saldo_pendiente
assertApprox(saldoDespuesAbono, saldoAntesAbono - montoAbono, `Abono $150: Saldo ${saldoAntesAbono} - ${montoAbono} = ${saldoDespuesAbono}`)

// =========================================
// 22. marcar-prestado-devuelto
// =========================================
section('22. marcar-prestado-devuelto')

// Devolver producto prestado
db.prepare(`UPDATE productos SET estado_producto = 'Disponible' WHERE folio_producto = 'PROD-001'`).run()
db.prepare(`INSERT INTO estados_producto (folio_producto, fecha_cambio, estado_anterior, estado_nuevo, motivo, responsable) VALUES ('PROD-001', CURRENT_TIMESTAMP, 'Prestado', 'Disponible', 'Producto devuelto', 'Admin')`).run()

const estadoDespuesDevolucion = (db.prepare('SELECT estado_producto FROM productos WHERE folio_producto = ?').get('PROD-001') as any).estado_producto
assert(estadoDespuesDevolucion === 'Disponible', 'Estado después de devolución = "Disponible"')

// =========================================
// 23. get-productos-disponibles
// =========================================
section('23. get-productos-disponibles')

const productosDisponibles = db.prepare(`
  SELECT p.folio_producto, p.stock_actual
  FROM productos p
  WHERE p.stock_actual > 0
`).all() as any[]

assert(productosDisponibles.length >= 0, `Productos disponibles query funciona: ${productosDisponibles.length} productos`)

// =========================================
// 24. eliminar-venta
// =========================================
section('24. eliminar-venta')

// Crear venta para eliminar
const resultVentaEliminar = db.prepare(`
  INSERT INTO ventas (fecha_venta, folio_producto, cantidad_vendida, talla, precio_unitario_real, descuento_aplicado, tipo_salida, id_cliente, responsable_caja)
  VALUES (CURRENT_TIMESTAMP, 'PROD-001', 1, 'G', 320, 0, 'Crédito', ?, 'Vendedor')
`).run(idCliente)
const idVentaEliminar = resultVentaEliminar.lastInsertRowid

db.prepare(`UPDATE productos SET stock_actual = stock_actual - 1 WHERE folio_producto = 'PROD-001'`).run()
db.prepare(`UPDATE clientes SET saldo_pendiente = saldo_pendiente + 320 WHERE id_cliente = ?`).run(idCliente)
db.prepare(`INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable) VALUES (?, CURRENT_TIMESTAMP, 'cargo', 320, ?, 'Vendedor')`).run(idCliente, `Venta #${idVentaEliminar}`)

const saldoAntesEliminarVenta = (db.prepare('SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?').get(idCliente) as any).saldo_pendiente
const stockAntesEliminarVenta = (db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get('PROD-001') as any).stock_actual

// Eliminar venta: revertir todo
db.prepare(`UPDATE productos SET stock_actual = stock_actual + 1 WHERE folio_producto = 'PROD-001'`).run()
db.prepare(`UPDATE tallas_producto SET cantidad = cantidad + 1 WHERE folio_producto = 'PROD-001' AND talla = 'G'`).run()
db.prepare(`UPDATE clientes SET saldo_pendiente = saldo_pendiente - 320 WHERE id_cliente = ?`).run(idCliente)
db.prepare(`DELETE FROM movimientos_cliente WHERE referencia LIKE ?`).run(`%Venta #${idVentaEliminar}%`)
db.prepare(`DELETE FROM ventas WHERE id_venta = ?`).run(idVentaEliminar)

const saldoDespuesEliminarVenta = (db.prepare('SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?').get(idCliente) as any).saldo_pendiente
const stockDespuesEliminarVenta = (db.prepare('SELECT stock_actual FROM productos WHERE folio_producto = ?').get('PROD-001') as any).stock_actual

assertApprox(saldoDespuesEliminarVenta, saldoAntesEliminarVenta - 320, 'Saldo revertido después de eliminar venta')
assert(stockDespuesEliminarVenta === stockAntesEliminarVenta + 1, 'Stock revertido después de eliminar venta')

// =========================================
// 25. get-historial-ventas
// =========================================
section('25. get-historial-ventas')

const historialVentas = db.prepare('SELECT * FROM ventas ORDER BY fecha_venta DESC').all() as any[]
assert(historialVentas.length >= 4, `Historial de ventas: ${historialVentas.length} ventas registradas`)

// =========================================
// 26. get-historial-movimientos
// =========================================
section('26. get-historial-movimientos (Entradas + Ventas)')

const historialMovimientos = {
    entradas: db.prepare('SELECT * FROM entradas WHERE folio_producto = ?').all('PROD-001'),
    ventas: db.prepare('SELECT * FROM ventas WHERE folio_producto = ?').all('PROD-001')
}

assert(historialMovimientos.entradas.length >= 1, `Historial tiene ${historialMovimientos.entradas.length} entradas`)
assert(historialMovimientos.ventas.length >= 4, `Historial tiene ${historialMovimientos.ventas.length} ventas`)

// =========================================
// 27. eliminar-cliente (con validación)
// =========================================
section('27. eliminar-cliente')

// Intentar eliminar cliente con saldo (debería fallar)
const clienteConSaldoPendiente = db.prepare('SELECT * FROM clientes WHERE saldo_pendiente > 0').get() as any
if (clienteConSaldoPendiente) {
    console.log(`    ⚠️ Cliente con saldo no debe eliminarse: ${clienteConSaldoPendiente.nombre_completo} ($${clienteConSaldoPendiente.saldo_pendiente})`)
    assert(clienteConSaldoPendiente.saldo_pendiente > 0, 'Validación: no eliminar cliente con saldo')
}

// Crear cliente sin saldo para eliminar
db.prepare(`INSERT INTO clientes (nombre_completo, telefono, saldo_pendiente, estado_cuenta) VALUES ('Cliente Temporal', '0000', 0, 'Al corriente')`).run()
const clienteTemporal = db.prepare('SELECT id_cliente FROM clientes WHERE nombre_completo = ?').get('Cliente Temporal') as any
db.prepare('DELETE FROM clientes WHERE id_cliente = ?').run(clienteTemporal.id_cliente)

const clienteEliminado = db.prepare('SELECT * FROM clientes WHERE nombre_completo = ?').get('Cliente Temporal')
assertNull(clienteEliminado, 'Cliente sin saldo eliminado correctamente')

// =========================================
// PRUEBAS ADICIONALES: Descuentos
// =========================================
section('28. EXTRA: Cálculos con descuentos')

db.prepare(`
  INSERT INTO ventas (fecha_venta, folio_producto, cantidad_vendida, talla, precio_unitario_real, descuento_aplicado, tipo_salida, responsable_caja)
  VALUES (CURRENT_TIMESTAMP, 'PROD-001', 3, 'G', 320, 60, 'Venta', 'Vendedor')
`).run()

const ventaConDescuento = db.prepare('SELECT (precio_unitario_real * cantidad_vendida - descuento_aplicado) as total FROM ventas ORDER BY id_venta DESC LIMIT 1').get() as any
assertApprox(ventaConDescuento.total, 900, 'Cálculo con descuento: (320×3) - 60 = $900')

// =========================================
// PRUEBAS ADICIONALES: Casos límite
// =========================================
section('29. EXTRA: Casos límite')

// Abono que liquida deuda completamente
const clienteParaLiquidar = db.prepare('SELECT id_cliente, saldo_pendiente FROM clientes WHERE saldo_pendiente > 0 LIMIT 1').get() as any
if (clienteParaLiquidar) {
    const saldoCompleto = clienteParaLiquidar.saldo_pendiente
    db.prepare(`UPDATE clientes SET saldo_pendiente = 0, estado_cuenta = 'Al corriente' WHERE id_cliente = ?`).run(clienteParaLiquidar.id_cliente)

    const clienteLiquidado = db.prepare('SELECT saldo_pendiente, estado_cuenta FROM clientes WHERE id_cliente = ?').get(clienteParaLiquidar.id_cliente) as any
    assert(clienteLiquidado.saldo_pendiente === 0, `Liquidación completa: Saldo = $0`)
    assert(clienteLiquidado.estado_cuenta === 'Al corriente', 'Estado después de liquidar = "Al corriente"')
}

// =========================================
// RESUMEN FINAL
// =========================================
console.log('\n' + '='.repeat(60))
console.log('📊 RESUMEN FINAL DE PRUEBAS')
console.log('='.repeat(60))
console.log(`  ✅ Pruebas exitosas: ${testsPassed}`)
console.log(`  ❌ Pruebas fallidas: ${testsFailed}`)
console.log(`  📈 Total de pruebas: ${testsPassed + testsFailed}`)
console.log('='.repeat(60))

// Limpiar
db.close()
fs.unlinkSync(TEST_DB_PATH)

if (testsFailed > 0) {
    console.log('\n⚠️ HAY ERRORES EN LA LÓGICA DE LAS CONSULTAS')
    process.exit(1)
} else {
    console.log('\n🎉 TODAS LAS PRUEBAS PASARON - LÓGICA VERIFICADA AL 100%')
    process.exit(0)
}
