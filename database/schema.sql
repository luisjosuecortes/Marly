PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS productos (
  folio_producto TEXT PRIMARY KEY,
  nombre_producto TEXT,
  categoria TEXT NOT NULL,
  genero_destino TEXT NOT NULL,
  estado_producto TEXT NOT NULL DEFAULT 'Disponible',
  stock_actual INTEGER NOT NULL DEFAULT 0,
  stock_minimo INTEGER NOT NULL DEFAULT 0,
  proveedor TEXT,
  fecha_ultima_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP,
  observaciones TEXT
);

CREATE TABLE IF NOT EXISTS clientes (
  id_cliente INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre_completo TEXT NOT NULL,
  telefono TEXT,
  saldo_pendiente REAL NOT NULL DEFAULT 0,
  fecha_ultimo_pago TEXT,
  estado_cuenta TEXT NOT NULL DEFAULT 'Al corriente',
  notas TEXT
);

CREATE TABLE IF NOT EXISTS entradas (
  id_entrada INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha_entrada TEXT NOT NULL,
  folio_producto TEXT NOT NULL,
  cantidad_recibida INTEGER NOT NULL,
  talla TEXT NOT NULL,
  costo_unitario_proveedor REAL NOT NULL,
  precio_unitario_base REAL NOT NULL,
  precio_unitario_promocion REAL,
  tipo_movimiento TEXT NOT NULL DEFAULT 'Entrada',
  responsable_recepcion TEXT,
  observaciones_entrada TEXT,
  FOREIGN KEY (folio_producto) REFERENCES productos (folio_producto) ON UPDATE CASCADE ON DELETE RESTRICT,
  CHECK (cantidad_recibida >= 0)
);

CREATE TABLE IF NOT EXISTS ventas (
  id_venta INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha_venta TEXT NOT NULL,
  folio_producto TEXT NOT NULL,
  cantidad_vendida INTEGER NOT NULL,
  talla TEXT NOT NULL,
  precio_unitario_real REAL NOT NULL,
  descuento_aplicado REAL DEFAULT 0,
  tipo_salida TEXT NOT NULL DEFAULT 'Venta',
  id_cliente INTEGER,
  responsable_caja TEXT,
  notas TEXT,
  FOREIGN KEY (folio_producto) REFERENCES productos (folio_producto) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (id_cliente) REFERENCES clientes (id_cliente) ON UPDATE CASCADE ON DELETE SET NULL,
  CHECK (cantidad_vendida > 0)
);

CREATE TABLE IF NOT EXISTS estados_producto (
  id_estado INTEGER PRIMARY KEY AUTOINCREMENT,
  folio_producto TEXT NOT NULL,
  fecha_cambio TEXT NOT NULL,
  estado_anterior TEXT,
  estado_nuevo TEXT NOT NULL,
  motivo TEXT,
  responsable TEXT,
  FOREIGN KEY (folio_producto) REFERENCES productos (folio_producto) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS movimientos_cliente (
  id_movimiento INTEGER PRIMARY KEY AUTOINCREMENT,
  id_cliente INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  tipo_movimiento TEXT NOT NULL,
  monto REAL NOT NULL,
  referencia TEXT,
  responsable TEXT,
  FOREIGN KEY (id_cliente) REFERENCES clientes (id_cliente) ON UPDATE CASCADE ON DELETE CASCADE,
  CHECK (monto >= 0),
  CHECK (tipo_movimiento IN ('cargo', 'abono'))
);

CREATE TABLE IF NOT EXISTS tallas_producto (
  id_talla INTEGER PRIMARY KEY AUTOINCREMENT,
  folio_producto TEXT NOT NULL,
  talla TEXT NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 0,
  fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (folio_producto) REFERENCES productos (folio_producto) ON UPDATE CASCADE ON DELETE CASCADE,
  CHECK (cantidad >= 0),
  UNIQUE (folio_producto, talla)
);

CREATE TABLE IF NOT EXISTS proveedores (
  nombre TEXT PRIMARY KEY
);
