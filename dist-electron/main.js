import { ipcMain, app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
const VITE_PUBLIC_DIR = process.env.VITE_PUBLIC;
const dbPath = path.join(process.env.APP_ROOT, "database", "marly.db");
const schemaPath = path.join(process.env.APP_ROOT, "database", "schema.sql");
if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}
const db = new Database(dbPath, { verbose: console.log, nativeBinding: path.join(process.env.APP_ROOT, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node") });
const initDb = () => {
  try {
    const schema = fs.readFileSync(schemaPath, "utf-8");
    db.exec(schema);
    console.log("Base de datos inicializada/verificada.");
  } catch (error) {
    console.error("Error al inicializar la base de datos:", error);
  }
};
initDb();
ipcMain.handle("get-productos", () => {
  try {
    const stmt = db.prepare(`
      SELECT 
        p.*, 
        json_group_array(json_object('talla', tp.talla, 'cantidad', tp.cantidad)) as tallas_detalle
      FROM productos p
      LEFT JOIN tallas_producto tp ON p.folio_producto = tp.folio_producto
      GROUP BY p.folio_producto
      ORDER BY p.fecha_ultima_actualizacion DESC
    `);
    const productos = stmt.all();
    return productos.map((p) => ({
      ...p,
      tallas_detalle: p.tallas_detalle ? JSON.parse(p.tallas_detalle) : []
    }));
  } catch (error) {
    console.error("Error al obtener productos:", error);
    return [];
  }
});
ipcMain.handle("actualizar-stock", (_event, datos) => {
  const { folio_producto, nuevo_stock } = datos;
  const actualizar = db.transaction(() => {
    const producto = db.prepare("SELECT stock_actual FROM productos WHERE folio_producto = ?").get(folio_producto);
    if (!producto) throw new Error("Producto no encontrado");
    const stmt = db.prepare(`
      UPDATE productos 
      SET stock_actual = @nuevo_stock,
          fecha_ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio_producto
    `);
    stmt.run({ nuevo_stock, folio_producto });
  });
  try {
    actualizar();
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar stock:", error);
    throw error;
  }
});
ipcMain.handle("get-proveedores", () => {
  try {
    const stmt = db.prepare("SELECT nombre FROM proveedores ORDER BY nombre");
    return stmt.all().map((p) => p.nombre);
  } catch (error) {
    console.error("Error al obtener proveedores:", error);
    return [];
  }
});
ipcMain.handle("agregar-proveedor", (_event, nombre) => {
  try {
    const nombreMayusculas = nombre.trim().toUpperCase();
    const stmt = db.prepare("INSERT INTO proveedores (nombre) VALUES (?)");
    stmt.run(nombreMayusculas);
    return { success: true };
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      throw new Error("Este proveedor ya existe.");
    }
    throw error;
  }
});
ipcMain.handle("eliminar-proveedor", (_event, nombre) => {
  try {
    const stmt = db.prepare("DELETE FROM proveedores WHERE nombre = ?");
    stmt.run(nombre);
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar proveedor:", error);
    throw error;
  }
});
ipcMain.handle("get-historial-entradas", (_event, folio) => {
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
    `);
    return stmt.all(folio);
  } catch (error) {
    console.error("Error al obtener historial de entradas:", error);
    return [];
  }
});
ipcMain.handle("get-producto-detalle", (_event, folio) => {
  try {
    const producto = db.prepare("SELECT * FROM productos WHERE folio_producto = ?").get(folio);
    return producto || null;
  } catch (error) {
    console.error("Error al buscar producto:", error);
    return null;
  }
});
ipcMain.handle("get-ultima-entrada", (_event, folio) => {
  try {
    const entrada = db.prepare(`
      SELECT costo_unitario_proveedor, precio_unitario_base
      FROM entradas
      WHERE folio_producto = ?
      ORDER BY fecha_entrada DESC, id_entrada DESC
      LIMIT 1
    `).get(folio);
    return entrada || null;
  } catch (error) {
    console.error("Error al obtener última entrada:", error);
    return null;
  }
});
ipcMain.handle("registrar-nuevo-producto", (_event, datos) => {
  const { producto, entrada } = datos;
  const registrar = db.transaction(() => {
    const stmtProducto = db.prepare(`
      INSERT INTO productos (
        folio_producto, nombre_producto, categoria, genero_destino,
        stock_actual, stock_minimo, proveedor, observaciones
      ) VALUES (
        @folio_producto, @nombre_producto, @categoria, @genero_destino,
        @stock_actual, 5, @proveedor, @observaciones
      )
    `);
    stmtProducto.run({
      ...producto,
      stock_actual: entrada.cantidad_recibida
    });
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
    `);
    stmtEntrada.run({
      ...entrada,
      folio_producto: producto.folio_producto,
      // Asegurar foreign key
      tipo_movimiento: "Entrada Inicial"
    });
    const stmtTalla = db.prepare(`
      INSERT INTO tallas_producto (folio_producto, talla, cantidad)
      VALUES (@folio, @talla, @cantidad)
    `);
    stmtTalla.run({
      folio: producto.folio_producto,
      talla: entrada.talla,
      cantidad: entrada.cantidad_recibida
    });
  });
  try {
    registrar();
    return { success: true };
  } catch (error) {
    console.error("Error al registrar nuevo producto:", error);
    if (error.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      throw new Error("El folio del producto ya existe.");
    }
    throw error;
  }
});
ipcMain.handle("registrar-entrada-existente", (_event, entrada) => {
  const registrar = db.transaction(() => {
    const producto = db.prepare("SELECT stock_actual FROM productos WHERE folio_producto = ?").get(entrada.folio_producto);
    if (!producto) {
      throw new Error("El producto no existe.");
    }
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
    `);
    stmtEntrada.run({
      ...entrada,
      tipo_movimiento: "Reabastecimiento"
    });
    const stmtUpdate = db.prepare(`
      UPDATE productos 
      SET stock_actual = stock_actual + @cantidad,
          fecha_ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio
    `);
    stmtUpdate.run({
      cantidad: entrada.cantidad_recibida,
      folio: entrada.folio_producto
    });
    const stmtTalla = db.prepare(`
      INSERT INTO tallas_producto (folio_producto, talla, cantidad)
      VALUES (@folio, @talla, @cantidad)
      ON CONFLICT(folio_producto, talla) DO UPDATE SET
        cantidad = cantidad + @cantidad,
        fecha_actualizacion = CURRENT_TIMESTAMP
    `);
    stmtTalla.run({
      folio: entrada.folio_producto,
      talla: entrada.talla,
      cantidad: entrada.cantidad_recibida
    });
  });
  try {
    registrar();
    return { success: true };
  } catch (error) {
    console.error("Error al registrar entrada:", error);
    throw error;
  }
});
ipcMain.handle("eliminar-entrada", (_event, id_entrada) => {
  const eliminar = db.transaction(() => {
    const entrada = db.prepare(`
      SELECT folio_producto, cantidad_recibida, talla, tipo_movimiento
      FROM entradas
      WHERE id_entrada = ?
    `).get(id_entrada);
    if (!entrada) {
      throw new Error("Entrada no encontrada.");
    }
    if (entrada.tipo_movimiento === "Entrada Inicial") {
      const countEntradas = db.prepare(`
        SELECT COUNT(*) as total FROM entradas WHERE folio_producto = ?
      `).get(entrada.folio_producto);
      if (countEntradas.total === 1) {
        throw new Error("No se puede eliminar la entrada inicial del producto. Elimine el producto completo desde Inventario.");
      }
    }
    const stmtUpdateStock = db.prepare(`
      UPDATE productos 
      SET stock_actual = stock_actual - @cantidad,
          fecha_ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio
    `);
    stmtUpdateStock.run({
      cantidad: entrada.cantidad_recibida,
      folio: entrada.folio_producto
    });
    const stmtUpdateTalla = db.prepare(`
      UPDATE tallas_producto
      SET cantidad = cantidad - @cantidad,
          fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio AND talla = @talla
    `);
    stmtUpdateTalla.run({
      cantidad: entrada.cantidad_recibida,
      folio: entrada.folio_producto,
      talla: entrada.talla
    });
    const tallaActual = db.prepare(`
      SELECT cantidad FROM tallas_producto 
      WHERE folio_producto = ? AND talla = ?
    `).get(entrada.folio_producto, entrada.talla);
    if (tallaActual && tallaActual.cantidad <= 0) {
      db.prepare(`
        DELETE FROM tallas_producto 
        WHERE folio_producto = ? AND talla = ?
      `).run(entrada.folio_producto, entrada.talla);
    }
    db.prepare("DELETE FROM entradas WHERE id_entrada = ?").run(id_entrada);
  });
  try {
    eliminar();
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar entrada:", error);
    throw error;
  }
});
let ventanaPrincipal;
function crearVentana() {
  ventanaPrincipal = new BrowserWindow({
    icon: path.join(VITE_PUBLIC_DIR, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
  ventanaPrincipal.webContents.on("did-finish-load", () => {
    ventanaPrincipal == null ? void 0 : ventanaPrincipal.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString("es-ES"));
  });
  if (VITE_DEV_SERVER_URL) {
    ventanaPrincipal.loadURL(VITE_DEV_SERVER_URL);
  } else {
    ventanaPrincipal.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    ventanaPrincipal = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    crearVentana();
  }
});
app.whenReady().then(crearVentana);
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
