/**
 * Test script for database logic in electron/main.ts
 * Run with: node test_db_logic.js
 */

const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

// Database path
const dbPath = path.join(__dirname, 'database', 'marly.db')
const schemaPath = path.join(__dirname, 'database', 'schema.sql')

console.log('='.repeat(60))
console.log('TESTING DATABASE LOGIC')
console.log('='.repeat(60))
console.log(`Database: ${dbPath}`)
console.log(`Schema: ${schemaPath}`)
console.log('')

// Check if database exists
if (!fs.existsSync(dbPath)) {
  console.error('❌ Database file not found!')
  process.exit(1)
}

const db = new Database(dbPath)

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`✅ ${name}`)
    passed++
  } catch (error) {
    console.log(`❌ ${name}`)
    console.log(`   Error: ${error.message}`)
    failed++
  }
}

// ========== TEST PRODUCTS ==========
console.log('\n--- PRODUCTOS ---')

test('get-productos: should return products array', () => {
  const productos = db.prepare(`
    SELECT 
      p.*, 
      json_group_array(json_object('talla', tp.talla, 'cantidad', tp.cantidad)) as tallas_detalle,
      (SELECT precio_unitario_base FROM entradas WHERE folio_producto = p.folio_producto ORDER BY id_entrada DESC LIMIT 1) as ultimo_precio
    FROM productos p
    LEFT JOIN tallas_producto tp ON p.folio_producto = tp.folio_producto
    GROUP BY p.folio_producto
    ORDER BY p.fecha_ultima_actualizacion DESC
  `).all()

  if (!Array.isArray(productos)) throw new Error('Expected array')
  console.log(`   Found ${productos.length} products`)
})

test('get-producto-detalle: should return product with tallas', () => {
  const folio = db.prepare('SELECT folio_producto FROM productos LIMIT 1').get()
  if (!folio) {
    console.log('   (No products to test)')
    return
  }

  const producto = db.prepare(`
    SELECT 
      p.*, 
      json_group_array(json_object('talla', tp.talla, 'cantidad', tp.cantidad)) as tallas_detalle
    FROM productos p
    LEFT JOIN tallas_producto tp ON p.folio_producto = tp.folio_producto
    WHERE p.folio_producto = ?
    GROUP BY p.folio_producto
  `).get(folio.folio_producto)

  if (!producto) throw new Error('Product not found')
})

// ========== TEST PROVEEDORES ==========
console.log('\n--- PROVEEDORES ---')

test('get-proveedores: should return providers list', () => {
  const proveedores = db.prepare('SELECT nombre FROM proveedores ORDER BY nombre').all()
  if (!Array.isArray(proveedores)) throw new Error('Expected array')
  console.log(`   Found ${proveedores.length} providers`)
})

// ========== TEST RESPONSABLES ==========
console.log('\n--- RESPONSABLES ---')

test('get-responsables: should return active responsables', () => {
  const responsables = db.prepare('SELECT id_responsable, nombre FROM responsables WHERE activo = 1 ORDER BY nombre').all()
  if (!Array.isArray(responsables)) throw new Error('Expected array')
  console.log(`   Found ${responsables.length} responsables`)
})

// ========== TEST CLIENTES ==========
console.log('\n--- CLIENTES ---')

test('get-clientes: should return clients with balances', () => {
  const clientes = db.prepare(`
    SELECT 
      id_cliente,
      nombre_completo,
      telefono,
      saldo_pendiente,
      fecha_ultimo_pago,
      estado_cuenta,
      notas
    FROM clientes
    ORDER BY nombre_completo
  `).all()

  if (!Array.isArray(clientes)) throw new Error('Expected array')
  console.log(`   Found ${clientes.length} clients`)
})

// ========== TEST VENTAS ==========
console.log('\n--- VENTAS ---')

test('get-ventas-kpis-hoy: should return today KPIs', () => {
  const hoy = new Date()
  const year = hoy.getFullYear()
  const month = String(hoy.getMonth() + 1).padStart(2, '0')
  const day = String(hoy.getDate()).padStart(2, '0')
  const fechaHoy = `${year}-${month}-${day}`
  const inicioHoy = fechaHoy + ' 00:00:00'
  const finHoy = fechaHoy + ' 23:59:59'

  const resultVentas = db.prepare(`
    SELECT COUNT(*) as num_ventas
    FROM ventas
    WHERE fecha_venta >= ? AND fecha_venta <= ?
  `).get(inicioHoy, finHoy)

  const resultCobrado = db.prepare(`
    SELECT COALESCE(SUM(
      (precio_unitario_real - COALESCE(descuento_aplicado, 0)) * cantidad_vendida
    ), 0) as total
    FROM ventas
    WHERE tipo_salida = 'Venta'
      AND fecha_venta >= ? AND fecha_venta <= ?
  `).get(inicioHoy, finHoy)

  const resultAbonos = db.prepare(`
    SELECT COALESCE(SUM(monto), 0) as total
    FROM movimientos_cliente
    WHERE lower(tipo_movimiento) = 'abono'
      AND fecha >= ? AND fecha <= ?
  `).get(inicioHoy, finHoy)

  console.log(`   Ventas hoy: ${resultVentas.num_ventas}, Cobrado: ${resultCobrado.total}, Abonos: ${resultAbonos.total}`)
})

test('get-ventas-hoy: should return today transactions', () => {
  const now = new Date()
  const fechaInicio = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toLocaleString('sv')
  const fechaFin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toLocaleString('sv')

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

  if (!Array.isArray(ventas)) throw new Error('Expected array')
  console.log(`   Found ${ventas.length} sales today`)
})

test('get-prendas-prestadas: should return borrowed items', () => {
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

  if (!Array.isArray(prestamos)) throw new Error('Expected array')
  console.log(`   Found ${prestamos.length} borrowed items`)
})

// ========== TEST ENTRADAS ==========
console.log('\n--- ENTRADAS ---')

test('get-entradas-recientes: should return recent entries', () => {
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
    LIMIT 20
  `).all()

  if (!Array.isArray(entradas)) throw new Error('Expected array')
  console.log(`   Found ${entradas.length} recent entries`)
})

test('get-entradas-por-categoria: should return entries by category', () => {
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

  if (!Array.isArray(entradas)) throw new Error('Expected array')
  console.log(`   Found ${entradas.length} categories with entries`)
})

// ========== TEST ESTADISTICAS ==========
console.log('\n--- ESTADÍSTICAS ---')

test('get-estadisticas-ventas: should return sales stats', () => {
  const ventas = db.prepare(`
    SELECT 
      COALESCE(SUM(cantidad_vendida * (precio_unitario_real - COALESCE(descuento_aplicado, 0))), 0) as total_ventas,
      COUNT(*) as num_transacciones
    FROM ventas
    WHERE tipo_salida = 'Venta'
  `).get()

  if (ventas.total_ventas === undefined) throw new Error('Failed to get stats')
  console.log(`   Total ventas: $${ventas.total_ventas.toFixed(2)}, Transacciones: ${ventas.num_transacciones}`)
})

test('get-top-productos: should return top products', () => {
  const top = db.prepare(`
    SELECT 
      v.folio_producto,
      p.nombre_producto,
      SUM(v.cantidad_vendida) as unidades_vendidas,
      SUM(v.cantidad_vendida * v.precio_unitario_real - COALESCE(v.descuento_aplicado, 0)) as total_vendido
    FROM ventas v
    LEFT JOIN productos p ON v.folio_producto = p.folio_producto
    GROUP BY v.folio_producto
    ORDER BY total_vendido DESC
    LIMIT 5
  `).all()

  if (!Array.isArray(top)) throw new Error('Expected array')
  console.log(`   Top ${top.length} products by sales`)
})

test('get-top-proveedores: should return top providers', () => {
  const top = db.prepare(`
    SELECT 
      p.proveedor,
      SUM(v.cantidad_vendida) as unidades_vendidas,
      SUM(v.cantidad_vendida * v.precio_unitario_real - COALESCE(v.descuento_aplicado, 0)) as total_vendido
    FROM ventas v
    JOIN productos p ON v.folio_producto = p.folio_producto
    WHERE p.proveedor IS NOT NULL AND p.proveedor != ''
    GROUP BY p.proveedor
    ORDER BY total_vendido DESC
    LIMIT 5
  `).all()

  if (!Array.isArray(top)) throw new Error('Expected array')
  console.log(`   Top ${top.length} providers by sales`)
})

// ========== TEST HISTORIAL ==========
console.log('\n--- HISTORIAL ---')

test('get-historial-entradas: should return entry history', () => {
  const folio = db.prepare('SELECT folio_producto FROM productos LIMIT 1').get()
  if (!folio) {
    console.log('   (No products to test)')
    return
  }

  const historial = db.prepare(`
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
  `).all(folio.folio_producto)

  if (!Array.isArray(historial)) throw new Error('Expected array')
  console.log(`   Found ${historial.length} entries for product ${folio.folio_producto}`)
})

test('get-historial-ventas: should return sales history', () => {
  const folio = db.prepare('SELECT folio_producto FROM ventas LIMIT 1').get()
  if (!folio) {
    console.log('   (No sales to test)')
    return
  }

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
  `).all(folio.folio_producto)

  if (!Array.isArray(ventas)) throw new Error('Expected array')
  console.log(`   Found ${ventas.length} sales for product ${folio.folio_producto}`)
})

// ========== TEST MOVIMIENTOS CLIENTE ==========
console.log('\n--- MOVIMIENTOS CLIENTE ---')

test('get-movimientos-cliente: should return client movements', () => {
  const cliente = db.prepare('SELECT id_cliente FROM clientes LIMIT 1').get()
  if (!cliente) {
    console.log('   (No clients to test)')
    return
  }

  const movimientos = db.prepare(`
    SELECT 
      id_movimiento,
      fecha,
      tipo_movimiento,
      monto,
      referencia,
      responsable
    FROM movimientos_cliente
    WHERE id_cliente = ?
    ORDER BY fecha DESC
  `).all(cliente.id_cliente)

  if (!Array.isArray(movimientos)) throw new Error('Expected array')
  console.log(`   Found ${movimientos.length} movements for client ${cliente.id_cliente}`)
})

// ========== TEST INVENTARIO KPIs ==========
console.log('\n--- INVENTARIO KPIs ---')

test('get-inventario-kpis: should return inventory KPIs', () => {
  const stockTotal = db.prepare(`SELECT COALESCE(SUM(stock_actual), 0) as total FROM productos`).get()
  const stockBajo = db.prepare(`SELECT COUNT(*) as count FROM productos WHERE stock_actual <= stock_minimo`).get()
  const valorInventario = db.prepare(`
    SELECT COALESCE(SUM(p.stock_actual * COALESCE(
      (SELECT precio_unitario_base FROM entradas WHERE folio_producto = p.folio_producto ORDER BY id_entrada DESC LIMIT 1), 0
    )), 0) as valor
    FROM productos p
  `).get()

  console.log(`   Stock total: ${stockTotal.total}, Stock bajo: ${stockBajo.count}, Valor: $${valorInventario.valor.toFixed(2)}`)
})

// ========== SUMMARY ==========
console.log('\n' + '='.repeat(60))
console.log(`RESULTS: ${passed} passed, ${failed} failed`)
console.log('='.repeat(60))

db.close()

process.exit(failed > 0 ? 1 : 0)
