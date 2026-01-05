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
        json_group_array(json_object('talla', tp.talla, 'cantidad', tp.cantidad)) as tallas_detalle,
        (SELECT precio_unitario_base FROM entradas WHERE folio_producto = p.folio_producto ORDER BY id_entrada DESC LIMIT 1) as ultimo_precio
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
  const { folio_producto, nuevo_stock, talla, motivo, responsable } = datos;
  if (!talla) {
    throw new Error("Es necesario especificar la talla para ajustar el stock.");
  }
  const actualizar = db.transaction(() => {
    const tallaActual = db.prepare("SELECT cantidad FROM tallas_producto WHERE folio_producto = ? AND talla = ?").get(folio_producto, talla);
    const stockAnterior = tallaActual ? tallaActual.cantidad : 0;
    const diferencia = nuevo_stock - stockAnterior;
    if (diferencia === 0) return;
    const stmtTalla = db.prepare(`
      INSERT INTO tallas_producto (folio_producto, talla, cantidad, fecha_actualizacion)
      VALUES (@folio, @talla, @cantidad, CURRENT_TIMESTAMP)
      ON CONFLICT(folio_producto, talla) DO UPDATE SET
        cantidad = @cantidad,
        fecha_actualizacion = CURRENT_TIMESTAMP
    `);
    stmtTalla.run({
      folio: folio_producto,
      talla,
      cantidad: nuevo_stock
    });
    const stmtProducto = db.prepare(`
      UPDATE productos 
      SET stock_actual = stock_actual + @diferencia,
          fecha_ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio
    `);
    stmtProducto.run({
      diferencia,
      folio: folio_producto
    });
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
    `);
    stmtHistorial.run({
      folio: folio_producto,
      cantidad: diferencia,
      // Puede ser negativo
      talla,
      responsable: responsable || "Sistema",
      motivo: motivo || "Ajuste de inventario"
    });
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
ipcMain.handle("get-historial-ventas", (_event, folio) => {
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
    `).all(folio);
    return ventas.map((venta) => {
      let montoVendido = 0;
      const montoTotal = venta.precio_unitario_real * venta.cantidad_vendida - (venta.descuento_aplicado || 0);
      if (venta.tipo_salida === "Venta" || venta.tipo_salida === "Prestado") {
        montoVendido = montoTotal;
      } else if (venta.tipo_salida === "Crédito" || venta.tipo_salida === "Apartado") {
        if (venta.id_cliente) {
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
          );
          montoVendido = (abonos == null ? void 0 : abonos.total_abonado) || 0;
        } else {
          montoVendido = 0;
        }
      }
      return {
        ...venta,
        monto_total: montoTotal,
        monto_vendido: montoVendido,
        saldo_pendiente: montoTotal - montoVendido
      };
    });
  } catch (error) {
    console.error("Error al obtener historial de ventas:", error);
    return [];
  }
});
ipcMain.handle("get-historial-movimientos", (_event, folio) => {
  try {
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
    `).all(folio);
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
    `).all(folio);
    const ventas = ventasRaw.map((venta) => {
      let montoVendido = 0;
      const montoTotal = venta.precio_unitario_real * venta.cantidad - (venta.descuento_aplicado || 0);
      if (venta.tipo_movimiento === "Venta" || venta.tipo_movimiento === "Prestado") {
        montoVendido = montoTotal;
      } else if (venta.tipo_movimiento === "Crédito" || venta.tipo_movimiento === "Apartado") {
        if (venta.id_cliente) {
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
          );
          montoVendido = (abonos == null ? void 0 : abonos.total_abonado) || 0;
        } else {
          montoVendido = 0;
        }
      }
      return {
        ...venta,
        precio_unitario: venta.precio_unitario_real,
        monto_vendido: montoVendido,
        saldo_pendiente: montoTotal - montoVendido
      };
    });
    const movimientos = [...entradas, ...ventas].sort((a, b) => {
      const fechaA = new Date(a.fecha).getTime();
      const fechaB = new Date(b.fecha).getTime();
      if (fechaB !== fechaA) return fechaB - fechaA;
      return b.id - a.id;
    });
    return movimientos;
  } catch (error) {
    console.error("Error al obtener historial de movimientos:", error);
    return [];
  }
});
ipcMain.handle("get-producto-detalle", (_event, folio) => {
  try {
    const stmt = db.prepare(`
      SELECT 
        p.*, 
        json_group_array(json_object('talla', tp.talla, 'cantidad', tp.cantidad)) as tallas_detalle
      FROM productos p
      LEFT JOIN tallas_producto tp ON p.folio_producto = tp.folio_producto
      WHERE p.folio_producto = ?
      GROUP BY p.folio_producto
    `);
    const producto = stmt.get(folio);
    if (!producto) return null;
    return {
      ...producto,
      tallas_detalle: producto.tallas_detalle ? JSON.parse(producto.tallas_detalle) : []
    };
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
ipcMain.handle("get-precio-venta", (_event, datos) => {
  const { folio_producto, talla } = datos;
  try {
    const entradaTalla = db.prepare(`
      SELECT precio_unitario_base
      FROM entradas
      WHERE folio_producto = ? AND talla = ?
      ORDER BY fecha_entrada DESC, id_entrada DESC
      LIMIT 1
    `).get(folio_producto, talla);
    if (entradaTalla) {
      return { precio_unitario_base: entradaTalla.precio_unitario_base };
    }
    const entradaGeneral = db.prepare(`
      SELECT precio_unitario_base
      FROM entradas
      WHERE folio_producto = ?
      ORDER BY fecha_entrada DESC, id_entrada DESC
      LIMIT 1
    `).get(folio_producto);
    return entradaGeneral || { precio_unitario_base: 0 };
  } catch (error) {
    console.error("Error al obtener precio de venta:", error);
    return { precio_unitario_base: 0 };
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
ipcMain.handle("get-clientes", () => {
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
    `);
    return stmt.all();
  } catch (error) {
    console.error("Error al obtener clientes:", error);
    return [];
  }
});
ipcMain.handle("agregar-cliente", (_event, datos) => {
  const { nombre_completo, telefono, saldo_pendiente } = datos;
  const agregar = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO clientes (nombre_completo, telefono, saldo_pendiente, estado_cuenta)
      VALUES (@nombre_completo, @telefono, @saldo_pendiente, 
              CASE WHEN @saldo_pendiente > 0 THEN 'Con saldo' ELSE 'Al corriente' END)
    `);
    const resultado = stmt.run({
      nombre_completo: nombre_completo.trim(),
      telefono: telefono || null,
      saldo_pendiente: saldo_pendiente || 0
    });
    if (saldo_pendiente && saldo_pendiente > 0) {
      const idCliente = Number(resultado.lastInsertRowid);
      db.prepare(`
        INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
        VALUES (@id_cliente, CURRENT_TIMESTAMP, 'cargo', @monto, 'Saldo inicial', 'Sistema')
      `).run({
        id_cliente: idCliente,
        monto: saldo_pendiente
      });
    }
  });
  try {
    agregar();
    return { success: true };
  } catch (error) {
    console.error("Error al agregar cliente:", error);
    if (error.code === "SQLITE_CONSTRAINT") {
      throw new Error("Ya existe un cliente con ese nombre.");
    }
    throw error;
  }
});
ipcMain.handle("eliminar-cliente", (_event, id_cliente) => {
  try {
    const cliente = db.prepare("SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?").get(id_cliente);
    if (!cliente) {
      throw new Error("Cliente no encontrado.");
    }
    if (cliente.saldo_pendiente > 0) {
      throw new Error("No se puede eliminar un cliente con saldo pendiente.");
    }
    db.prepare("DELETE FROM clientes WHERE id_cliente = ?").run(id_cliente);
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar cliente:", error);
    throw error;
  }
});
ipcMain.handle("get-historial-cliente", (_event, id_cliente) => {
  try {
    const cliente = db.prepare("SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?").get(id_cliente);
    if (!cliente) {
      throw new Error("Cliente no encontrado.");
    }
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
    `);
    const movimientos = stmt.all(id_cliente);
    return {
      movimientos,
      saldoActual: cliente.saldo_pendiente
    };
  } catch (error) {
    console.error("Error al obtener historial del cliente:", error);
    throw error;
  }
});
ipcMain.handle("get-productos-pendientes-cliente", (_event, id_cliente) => {
  try {
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
    `).all(id_cliente);
    return ventas.map((venta) => {
      let montoAbonado = 0;
      const montoTotal = venta.monto_total;
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
      );
      montoAbonado = (abonos == null ? void 0 : abonos.total_abonado) || 0;
      const montoFaltante = montoTotal - montoAbonado;
      return {
        ...venta,
        monto_abonado: montoAbonado,
        monto_faltante: montoFaltante
      };
    }).filter((venta) => venta.monto_faltante > 0);
  } catch (error) {
    console.error("Error al obtener productos pendientes:", error);
    return [];
  }
});
ipcMain.handle("registrar-abono-cliente", (_event, datos) => {
  const { id_cliente, monto, id_venta, responsable, notas } = datos;
  const procesar = db.transaction(() => {
    const cliente = db.prepare("SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?").get(id_cliente);
    if (!cliente) {
      throw new Error("Cliente no encontrado.");
    }
    if (monto <= 0) {
      throw new Error("El monto del abono debe ser mayor a 0.");
    }
    if (id_venta) {
      const venta = db.prepare(`
        SELECT 
          (v.precio_unitario_real * v.cantidad_vendida - COALESCE(v.descuento_aplicado, 0)) as monto_total
        FROM ventas v
        WHERE v.id_venta = ? AND v.id_cliente = ?
      `).get(id_venta, id_cliente);
      if (venta) {
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
        );
        const totalAbonado = (abonosVenta == null ? void 0 : abonosVenta.total_abonado) || 0;
        const montoFaltante = venta.monto_total - totalAbonado;
        if (monto > montoFaltante) {
          throw new Error(`El abono ($${monto.toFixed(2)}) no puede ser mayor al monto faltante de este producto ($${montoFaltante.toFixed(2)}).`);
        }
      } else {
        throw new Error("Venta no encontrada.");
      }
    } else {
      if (monto > cliente.saldo_pendiente) {
        throw new Error(`El abono no puede ser mayor al saldo pendiente ($${cliente.saldo_pendiente.toFixed(2)}).`);
      }
    }
    const nuevoSaldo = cliente.saldo_pendiente - monto;
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
    });
    const referencia = id_venta ? `Abono - Venta #${id_venta}${notas ? ` - ${notas}` : ""}` : `Abono general${notas ? ` - ${notas}` : ""}`;
    db.prepare(`
      INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
      VALUES (@id_cliente, CURRENT_TIMESTAMP, 'abono', @monto, @referencia, @responsable)
    `).run({
      id_cliente,
      monto,
      referencia,
      responsable: responsable || null
    });
    const ventasAVerificar = id_venta ? [id_venta] : db.prepare(`
          SELECT DISTINCT v.id_venta
          FROM ventas v
          INNER JOIN productos p ON v.folio_producto = p.folio_producto
          WHERE v.id_cliente = ?
            AND v.tipo_salida IN ('Crédito', 'Apartado', 'Prestado')
            AND p.estado_producto IN ('Crédito', 'Apartado', 'Prestado')
        `).all(id_cliente).map((v) => v.id_venta);
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
      `).get(ventaId, id_cliente);
      if (venta) {
        const abonosVenta = db.prepare(`
          SELECT COALESCE(SUM(monto), 0) as total_abonado
          FROM movimientos_cliente
          WHERE id_cliente = ? 
            AND tipo_movimiento = 'abono'
            AND (referencia LIKE ? OR referencia LIKE ?)
        `).get(id_cliente, `%Venta #${ventaId}%`, `Abono inicial - Venta #${ventaId}%`);
        const totalAbonado = (abonosVenta == null ? void 0 : abonosVenta.total_abonado) || 0;
        const montoVenta = venta.monto_venta;
        if (totalAbonado >= montoVenta && venta.estado_producto !== "Vendido" && venta.estado_producto !== "Disponible") {
          const estadoAnterior = venta.estado_producto;
          const estadoNuevo = venta.tipo_salida === "Prestado" ? "Disponible" : "Vendido";
          db.prepare(`
            UPDATE productos 
            SET estado_producto = @estado_nuevo
            WHERE folio_producto = @folio
          `).run({
            estado_nuevo: estadoNuevo,
            folio: venta.folio_producto
          });
          db.prepare(`
            INSERT INTO estados_producto (folio_producto, fecha_cambio, estado_anterior, estado_nuevo, motivo, responsable)
            VALUES (@folio, CURRENT_TIMESTAMP, @estado_anterior, @estado_nuevo, @motivo, @responsable)
          `).run({
            folio: venta.folio_producto,
            estado_anterior: estadoAnterior,
            estado_nuevo: estadoNuevo,
            motivo: `Pago completado${notas ? ` - ${notas}` : ""}`,
            responsable: responsable || null
          });
        }
      }
    }
    return { success: true, nuevoSaldo };
  });
  try {
    return procesar();
  } catch (error) {
    console.error("Error al registrar abono:", error);
    throw error;
  }
});
ipcMain.handle("marcar-prestado-devuelto", (_event, datos) => {
  const { id_venta, responsable, notas } = datos;
  const procesar = db.transaction(() => {
    const venta = db.prepare(`
      SELECT 
        v.folio_producto,
        p.estado_producto
      FROM ventas v
      INNER JOIN productos p ON v.folio_producto = p.folio_producto
      WHERE v.id_venta = ? AND v.tipo_salida = 'Prestado'
    `).get(id_venta);
    if (!venta) {
      throw new Error("Venta no encontrada o no es un producto prestado.");
    }
    if (venta.estado_producto !== "Prestado") {
      throw new Error("Este producto ya no está marcado como prestado.");
    }
    db.prepare(`
      UPDATE productos 
      SET estado_producto = 'Disponible'
      WHERE folio_producto = @folio
    `).run({
      folio: venta.folio_producto
    });
    db.prepare(`
      INSERT INTO estados_producto (folio_producto, fecha_cambio, estado_anterior, estado_nuevo, motivo, responsable)
      VALUES (@folio, CURRENT_TIMESTAMP, @estadoAnterior, 'Disponible', @motivo, @responsable)
    `).run({
      folio: venta.folio_producto,
      estadoAnterior: "Prestado",
      motivo: `Producto prestado devuelto${notas ? ` - ${notas}` : ""}`,
      responsable: responsable || null
    });
    return { success: true };
  });
  try {
    return procesar();
  } catch (error) {
    console.error("Error al marcar producto como devuelto:", error);
    throw error;
  }
});
ipcMain.handle("get-productos-disponibles", () => {
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
    `);
    const productos = stmt.all();
    return productos.map((p) => ({
      ...p,
      tallas_detalle: p.tallas_detalle ? JSON.parse(p.tallas_detalle) : []
    }));
  } catch (error) {
    console.error("Error al obtener productos disponibles:", error);
    return [];
  }
});
ipcMain.handle("registrar-venta", (_event, datos) => {
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
  } = datos;
  const registrar = db.transaction(() => {
    const producto = db.prepare("SELECT stock_actual FROM productos WHERE folio_producto = ?").get(folio_producto);
    if (!producto) {
      throw new Error("Producto no encontrado.");
    }
    const tallaInfo = db.prepare(`
      SELECT cantidad FROM tallas_producto 
      WHERE folio_producto = ? AND talla = ?
    `).get(folio_producto, talla);
    if (!tallaInfo || tallaInfo.cantidad < cantidad_vendida) {
      throw new Error(`Stock insuficiente. Disponible en talla ${talla}: ${(tallaInfo == null ? void 0 : tallaInfo.cantidad) || 0}`);
    }
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
    `);
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
    });
    db.prepare(`
      UPDATE productos 
      SET stock_actual = stock_actual - @cantidad,
          fecha_ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio
    `).run({
      cantidad: cantidad_vendida,
      folio: folio_producto
    });
    db.prepare(`
      UPDATE tallas_producto
      SET cantidad = cantidad - @cantidad,
          fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio AND talla = @talla
    `).run({
      cantidad: cantidad_vendida,
      folio: folio_producto,
      talla
    });
    const tallaActual = db.prepare(`
      SELECT cantidad FROM tallas_producto 
      WHERE folio_producto = ? AND talla = ?
    `).get(folio_producto, talla);
    if (tallaActual && tallaActual.cantidad <= 0) {
      db.prepare(`
        DELETE FROM tallas_producto 
        WHERE folio_producto = ? AND talla = ?
      `).run(folio_producto, talla);
    }
    if (id_cliente && (tipo_salida === "Crédito" || tipo_salida === "Apartado")) {
      const montoTotal = precio_unitario_real * cantidad_vendida - (descuento_aplicado || 0);
      const abono = abono_inicial || 0;
      if (abono > montoTotal) {
        throw new Error(`El abono inicial ($${abono.toFixed(2)}) no puede ser mayor al monto total ($${montoTotal.toFixed(2)}). Esto generaría un saldo negativo.`);
      }
      if (abono < 0) {
        throw new Error("El abono inicial no puede ser negativo.");
      }
      db.prepare(`
        UPDATE clientes 
        SET saldo_pendiente = saldo_pendiente + @monto,
            estado_cuenta = 'Con saldo'
        WHERE id_cliente = @id_cliente
      `).run({
        monto: montoTotal,
        id_cliente
      });
      db.prepare(`
        INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
        VALUES (@id_cliente, @fecha, 'cargo', @monto, @referencia, @responsable)
      `).run({
        id_cliente,
        fecha: fecha_venta,
        monto: montoTotal,
        referencia: `Venta #${resultado.lastInsertRowid}`,
        responsable: responsable_caja
      });
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
        });
        db.prepare(`
          INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
          VALUES (@id_cliente, @fecha, 'abono', @monto, @referencia, @responsable)
        `).run({
          id_cliente,
          fecha: fecha_venta,
          monto: abono,
          referencia: `Abono inicial - Venta #${resultado.lastInsertRowid}`,
          responsable: responsable_caja
        });
      }
    }
    if (tipo_salida === "Crédito" || tipo_salida === "Apartado" || tipo_salida === "Prestado") {
      const estadoAnterior = db.prepare("SELECT estado_producto FROM productos WHERE folio_producto = ?").get(folio_producto);
      db.prepare(`
        UPDATE productos 
        SET estado_producto = @estado_nuevo
        WHERE folio_producto = @folio
      `).run({
        estado_nuevo: tipo_salida,
        folio: folio_producto
      });
      db.prepare(`
        INSERT INTO estados_producto (folio_producto, fecha_cambio, estado_anterior, estado_nuevo, motivo, responsable)
        VALUES (@folio, @fecha, @estado_anterior, @estado_nuevo, @motivo, @responsable)
      `).run({
        folio: folio_producto,
        fecha: fecha_venta,
        estado_anterior: (estadoAnterior == null ? void 0 : estadoAnterior.estado_producto) || "Disponible",
        estado_nuevo: tipo_salida,
        motivo: notas || `Venta registrada como ${tipo_salida}`,
        responsable: responsable_caja
      });
    }
  });
  try {
    registrar();
    return { success: true };
  } catch (error) {
    console.error("Error al registrar venta:", error);
    throw error;
  }
});
ipcMain.handle("eliminar-venta", (_event, id_venta) => {
  const eliminar = db.transaction(() => {
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
    `).get(id_venta);
    if (!venta) {
      throw new Error("Venta no encontrada.");
    }
    db.prepare(`
      UPDATE productos 
      SET stock_actual = stock_actual + @cantidad,
          fecha_ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio
    `).run({
      cantidad: venta.cantidad_vendida,
      folio: venta.folio_producto
    });
    const tallaExistente = db.prepare(`
      SELECT cantidad FROM tallas_producto 
      WHERE folio_producto = ? AND talla = ?
    `).get(venta.folio_producto, venta.talla);
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
      });
    } else {
      db.prepare(`
        INSERT INTO tallas_producto (folio_producto, talla, cantidad, fecha_actualizacion)
        VALUES (@folio, @talla, @cantidad, CURRENT_TIMESTAMP)
      `).run({
        folio: venta.folio_producto,
        talla: venta.talla,
        cantidad: venta.cantidad_vendida
      });
    }
    if (venta.id_cliente && (venta.tipo_salida === "Crédito" || venta.tipo_salida === "Apartado")) {
      const montoTotal = venta.precio_unitario_real * venta.cantidad_vendida - (venta.descuento_aplicado || 0);
      const abonos = db.prepare(`
        SELECT COALESCE(SUM(monto), 0) as total_abonado
        FROM movimientos_cliente
        WHERE id_cliente = ?
          AND tipo_movimiento = 'abono'
          AND (referencia LIKE ? OR referencia LIKE ?)
      `).get(venta.id_cliente, `%Venta #${id_venta}%`, `Abono inicial - Venta #${id_venta}%`);
      const totalAbonado = (abonos == null ? void 0 : abonos.total_abonado) || 0;
      const saldoARevertir = montoTotal - totalAbonado;
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
        });
      }
      db.prepare(`
        DELETE FROM movimientos_cliente
        WHERE id_cliente = ?
          AND (referencia LIKE ? OR referencia LIKE ?)
      `).run(venta.id_cliente, `%Venta #${id_venta}%`, `Abono inicial - Venta #${id_venta}%`);
    }
    if (venta.tipo_salida === "Apartado" || venta.tipo_salida === "Prestado") {
      const ultimoEstado = db.prepare(`
        SELECT estado_anterior 
        FROM estados_producto
        WHERE folio_producto = ?
          AND estado_nuevo = ?
        ORDER BY fecha_cambio DESC
        LIMIT 1
      `).get(venta.folio_producto, venta.tipo_salida);
      const estadoNuevo = (ultimoEstado == null ? void 0 : ultimoEstado.estado_anterior) || "Disponible";
      db.prepare(`
        UPDATE productos 
        SET estado_producto = @estadoNuevo
        WHERE folio_producto = @folio
      `).run({
        estadoNuevo,
        folio: venta.folio_producto
      });
      db.prepare(`
        INSERT INTO estados_producto (folio_producto, fecha_cambio, estado_anterior, estado_nuevo, motivo, responsable)
        VALUES (@folio, CURRENT_TIMESTAMP, @estadoAnterior, @estadoNuevo, @motivo, @responsable)
      `).run({
        folio: venta.folio_producto,
        estadoAnterior: venta.tipo_salida,
        estadoNuevo,
        motivo: "Venta eliminada - Estado revertido",
        responsable: null
      });
    } else if (venta.tipo_salida === "Crédito") {
      const producto = db.prepare("SELECT estado_producto FROM productos WHERE folio_producto = ?").get(venta.folio_producto);
      if ((producto == null ? void 0 : producto.estado_producto) === "Crédito") {
        const ultimoEstado = db.prepare(`
          SELECT estado_anterior 
          FROM estados_producto
          WHERE folio_producto = ?
            AND estado_nuevo = 'Crédito'
          ORDER BY fecha_cambio DESC
          LIMIT 1
        `).get(venta.folio_producto);
        const estadoNuevo = (ultimoEstado == null ? void 0 : ultimoEstado.estado_anterior) || "Disponible";
        db.prepare(`
          UPDATE productos 
          SET estado_producto = @estadoNuevo
          WHERE folio_producto = @folio
        `).run({
          estadoNuevo,
          folio: venta.folio_producto
        });
        db.prepare(`
          INSERT INTO estados_producto (folio_producto, fecha_cambio, estado_anterior, estado_nuevo, motivo, responsable)
          VALUES (@folio, CURRENT_TIMESTAMP, 'Crédito', @estadoNuevo, 'Venta eliminada - Estado revertido', NULL)
        `).run({
          folio: venta.folio_producto,
          estadoNuevo
        });
      }
    }
    db.prepare("DELETE FROM ventas WHERE id_venta = ?").run(id_venta);
    return { success: true };
  });
  try {
    return eliminar();
  } catch (error) {
    console.error("Error al eliminar venta:", error);
    throw error;
  }
});
ipcMain.handle("eliminar-movimiento-cliente", (_event, id_movimiento) => {
  const eliminar = db.transaction(() => {
    const movimiento = db.prepare(`
      SELECT 
        id_cliente,
        tipo_movimiento,
        monto,
        referencia
      FROM movimientos_cliente
      WHERE id_movimiento = ?
    `).get(id_movimiento);
    if (!movimiento) {
      throw new Error("Movimiento no encontrado.");
    }
    const ajuste = movimiento.tipo_movimiento === "cargo" ? -movimiento.monto : movimiento.monto;
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
    });
    db.prepare("DELETE FROM movimientos_cliente WHERE id_movimiento = ?").run(id_movimiento);
    return { success: true };
  });
  try {
    return eliminar();
  } catch (error) {
    console.error("Error al eliminar movimiento de cliente:", error);
    throw error;
  }
});
ipcMain.handle("get-estadisticas-resumen", (_event, filtro = {}) => {
  const hoy = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const fechaInicio = filtro.fechaInicio || hoy;
  const fechaFin = filtro.fechaFin || hoy;
  const ventasPeriodo = db.prepare(`
    SELECT 
      COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0) as total_ventas,
      COALESCE(COUNT(*), 0) as num_ventas
    FROM ventas
    WHERE DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
  `).get(fechaInicio, fechaFin);
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
  `).get(fechaInicio, fechaFin);
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
  `).get(fechaInicio, fechaFin, fechaInicio, fechaFin);
  const saldoPendiente = db.prepare(`
    SELECT COALESCE(SUM(saldo_pendiente), 0) as total_pendiente
    FROM clientes
    WHERE saldo_pendiente > 0
  `).get();
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
  `).get();
  const totalVentas = (ventasPeriodo == null ? void 0 : ventasPeriodo.total_ventas) || 0;
  const totalCostos = (costosPeriodo == null ? void 0 : costosPeriodo.total_costos) || 0;
  return {
    ventasTotales: totalVentas,
    costosTotales: totalCostos,
    gananciaNeta: totalVentas - totalCostos,
    totalCobrado: (cobradoPeriodo == null ? void 0 : cobradoPeriodo.total_cobrado) || 0,
    saldoPendiente: (saldoPendiente == null ? void 0 : saldoPendiente.total_pendiente) || 0,
    valorInventario: (valorInventario == null ? void 0 : valorInventario.valor_inventario) || 0,
    numVentas: (ventasPeriodo == null ? void 0 : ventasPeriodo.num_ventas) || 0
  };
});
ipcMain.handle("get-ventas-por-periodo", (_event, filtro) => {
  const { fechaInicio, fechaFin, agrupacion = "dia" } = filtro;
  let groupBy;
  let selectPeriodo;
  switch (agrupacion) {
    case "hora":
      selectPeriodo = "strftime('%H', fecha_venta)";
      groupBy = "strftime('%H', fecha_venta)";
      break;
    case "dia_semana":
      selectPeriodo = "strftime('%w', fecha_venta)";
      groupBy = "strftime('%w', fecha_venta)";
      break;
    case "dia_mes":
      selectPeriodo = "strftime('%d', fecha_venta)";
      groupBy = "strftime('%d', fecha_venta)";
      break;
    case "mes":
      selectPeriodo = "strftime('%m', fecha_venta)";
      groupBy = "strftime('%m', fecha_venta)";
      break;
    default:
      selectPeriodo = "DATE(fecha_venta)";
      groupBy = "DATE(fecha_venta)";
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
  `).all(fechaInicio, fechaFin);
  return ventas;
});
ipcMain.handle("get-productos-mas-vendidos", (_event, filtro = {}) => {
  const hoy = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const hace30Dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0];
  const fechaInicio = filtro.fechaInicio || hace30Dias;
  const fechaFin = filtro.fechaFin || hoy;
  const limite = filtro.limite || 10;
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
  `).all(fechaInicio, fechaFin, limite);
  return productos;
});
ipcMain.handle("get-ventas-por-categoria", (_event, filtro = {}) => {
  const hoy = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const hace30Dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0];
  const fechaInicio = filtro.fechaInicio || hace30Dias;
  const fechaFin = filtro.fechaFin || hoy;
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
  `).all(fechaInicio, fechaFin);
  return categorias;
});
ipcMain.handle("get-ventas-por-tipo", (_event, filtro = {}) => {
  const hoy = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const hace30Dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0];
  const fechaInicio = filtro.fechaInicio || hace30Dias;
  const fechaFin = filtro.fechaFin || hoy;
  const tipos = db.prepare(`
    SELECT 
      tipo_salida,
      COUNT(*) as cantidad,
      SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)) as monto_total
    FROM ventas
    WHERE DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
    GROUP BY tipo_salida
    ORDER BY monto_total DESC
  `).all(fechaInicio, fechaFin);
  return tipos;
});
ipcMain.handle("get-clientes-con-saldo", () => {
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
  `).all();
  return clientes;
});
ipcMain.handle("get-inventario-kpis", () => {
  try {
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
    `).get();
    const conteos = db.prepare(`
      SELECT 
        COUNT(DISTINCT p.folio_producto) as total_productos,
        COALESCE(SUM(tp.cantidad), 0) as total_unidades,
        COUNT(DISTINCT p.categoria) as total_categorias
      FROM productos p
      LEFT JOIN tallas_producto tp ON p.folio_producto = tp.folio_producto
    `).get();
    const bajoStock = db.prepare(`
      SELECT COUNT(*) as cantidad
      FROM productos
      WHERE stock_actual <= stock_minimo AND stock_actual > 0
    `).get();
    const sinStock = db.prepare(`
      SELECT COUNT(*) as cantidad
      FROM productos
      WHERE stock_actual = 0
    `).get();
    return {
      valorInventarioCosto: (valorInventario == null ? void 0 : valorInventario.valor_costo) || 0,
      valorInventarioVenta: (valorInventario == null ? void 0 : valorInventario.valor_venta) || 0,
      gananciaProyectada: ((valorInventario == null ? void 0 : valorInventario.valor_venta) || 0) - ((valorInventario == null ? void 0 : valorInventario.valor_costo) || 0),
      totalProductos: (conteos == null ? void 0 : conteos.total_productos) || 0,
      totalUnidades: (conteos == null ? void 0 : conteos.total_unidades) || 0,
      totalCategorias: (conteos == null ? void 0 : conteos.total_categorias) || 0,
      productosBajoStock: (bajoStock == null ? void 0 : bajoStock.cantidad) || 0,
      productosSinStock: (sinStock == null ? void 0 : sinStock.cantidad) || 0
    };
  } catch (error) {
    console.error("Error al obtener KPIs de inventario:", error);
    return {
      valorInventarioCosto: 0,
      valorInventarioVenta: 0,
      gananciaProyectada: 0,
      totalProductos: 0,
      totalUnidades: 0,
      totalCategorias: 0,
      productosBajoStock: 0,
      productosSinStock: 0
    };
  }
});
ipcMain.handle("get-productos-bajo-stock", () => {
  try {
    const productos = db.prepare(`
      SELECT 
        folio_producto,
        nombre_producto,
        categoria,
        stock_actual,
        stock_minimo,
        (SELECT talla FROM tallas_producto WHERE folio_producto = productos.folio_producto ORDER BY cantidad DESC LIMIT 1) as talla_principal
      FROM productos
      WHERE stock_actual <= stock_minimo
      ORDER BY stock_actual ASC
    `).all();
    return productos;
  } catch (error) {
    console.error("Error al obtener productos bajo stock:", error);
    throw error;
  }
});
ipcMain.handle("update-stock-minimo", (_event, { folio_producto, stock_minimo }) => {
  try {
    db.prepare(`
      UPDATE productos 
      SET stock_minimo = ?
      WHERE folio_producto = ?
    `).run(stock_minimo, folio_producto);
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar stock mínimo:", error);
    throw error;
  }
});
ipcMain.handle("get-inventario-por-categoria", () => {
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
    `).all();
    return categorias.map((cat) => ({
      categoria: cat.categoria,
      numProductos: cat.num_productos,
      totalUnidades: cat.total_unidades,
      valorCosto: cat.valor_costo,
      valorVenta: cat.valor_venta,
      gananciaProyectada: cat.valor_venta - cat.valor_costo
    }));
  } catch (error) {
    console.error("Error al obtener inventario por categoría:", error);
    return [];
  }
});
ipcMain.handle("get-productos-por-categoria", (_event, categoria) => {
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
    `);
    const productos = stmt.all(categoria);
    return productos.map((p) => ({
      ...p,
      tallas_detalle: p.tallas_detalle ? JSON.parse(p.tallas_detalle) : []
    }));
  } catch (error) {
    console.error("Error al obtener productos por categoría:", error);
    return [];
  }
});
ipcMain.handle("get-movimientos-inventario-recientes", (_event, limite = 20) => {
  try {
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
    `).all(limite);
    return movimientos;
  } catch (error) {
    console.error("Error al obtener movimientos de inventario:", error);
    return [];
  }
});
ipcMain.handle("get-entradas-kpis", () => {
  try {
    const hoy = /* @__PURE__ */ new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split("T")[0];
    const inicioAnio = new Date(hoy.getFullYear(), 0, 1).toISOString().split("T")[0];
    const finHoy = hoy.toISOString().split("T")[0];
    const entradasMes = db.prepare(`
      SELECT 
        COUNT(*) as num_entradas,
        COALESCE(SUM(cantidad_recibida), 0) as total_unidades,
        COALESCE(SUM(cantidad_recibida * costo_unitario_proveedor), 0) as inversion_total,
        COALESCE(SUM(cantidad_recibida * precio_unitario_base), 0) as valor_venta
      FROM entradas
      WHERE DATE(fecha_entrada) >= DATE(?) AND DATE(fecha_entrada) <= DATE(?)
        AND tipo_movimiento IN ('Entrada Inicial', 'Reabastecimiento')
    `).get(inicioMes, finHoy);
    const entradasAnio = db.prepare(`
      SELECT 
        COUNT(*) as num_entradas,
        COALESCE(SUM(cantidad_recibida), 0) as total_unidades,
        COALESCE(SUM(cantidad_recibida * costo_unitario_proveedor), 0) as inversion_total,
        COALESCE(SUM(cantidad_recibida * precio_unitario_base), 0) as valor_venta
      FROM entradas
      WHERE DATE(fecha_entrada) >= DATE(?) AND DATE(fecha_entrada) <= DATE(?)
        AND tipo_movimiento IN ('Entrada Inicial', 'Reabastecimiento')
    `).get(inicioAnio, finHoy);
    const entradasTodo = db.prepare(`
      SELECT 
        COUNT(*) as num_entradas,
        COALESCE(SUM(cantidad_recibida), 0) as total_unidades,
        COALESCE(SUM(cantidad_recibida * costo_unitario_proveedor), 0) as inversion_total,
        COALESCE(SUM(cantidad_recibida * precio_unitario_base), 0) as valor_venta
      FROM entradas
      WHERE tipo_movimiento IN ('Entrada Inicial', 'Reabastecimiento')
    `).get();
    const productosNuevosMes = db.prepare(`
      SELECT COUNT(DISTINCT folio_producto) as cantidad
      FROM entradas
      WHERE DATE(fecha_entrada) >= DATE(?) AND DATE(fecha_entrada) <= DATE(?)
        AND tipo_movimiento = 'Entrada Inicial'
    `).get(inicioMes, finHoy);
    const proveedoresActivosMes = db.prepare(`
      SELECT COUNT(DISTINCT p.proveedor) as cantidad
      FROM productos p
      INNER JOIN entradas e ON p.folio_producto = e.folio_producto
      WHERE DATE(e.fecha_entrada) >= DATE(?) AND DATE(e.fecha_entrada) <= DATE(?)
        AND e.tipo_movimiento IN ('Entrada Inicial', 'Reabastecimiento')
    `).get(inicioMes, finHoy);
    const totalProductos = db.prepare(`SELECT COUNT(DISTINCT folio_producto) as cantidad FROM entradas`).get();
    const totalProveedores = db.prepare(`SELECT COUNT(DISTINCT proveedor) as cantidad FROM productos WHERE proveedor IS NOT NULL`).get();
    return {
      mes: {
        numEntradas: (entradasMes == null ? void 0 : entradasMes.num_entradas) || 0,
        totalUnidades: (entradasMes == null ? void 0 : entradasMes.total_unidades) || 0,
        inversionTotal: (entradasMes == null ? void 0 : entradasMes.inversion_total) || 0,
        valorVenta: (entradasMes == null ? void 0 : entradasMes.valor_venta) || 0,
        gananciaProyectada: ((entradasMes == null ? void 0 : entradasMes.valor_venta) || 0) - ((entradasMes == null ? void 0 : entradasMes.inversion_total) || 0)
      },
      anio: {
        numEntradas: (entradasAnio == null ? void 0 : entradasAnio.num_entradas) || 0,
        totalUnidades: (entradasAnio == null ? void 0 : entradasAnio.total_unidades) || 0,
        inversionTotal: (entradasAnio == null ? void 0 : entradasAnio.inversion_total) || 0,
        valorVenta: (entradasAnio == null ? void 0 : entradasAnio.valor_venta) || 0,
        gananciaProyectada: ((entradasAnio == null ? void 0 : entradasAnio.valor_venta) || 0) - ((entradasAnio == null ? void 0 : entradasAnio.inversion_total) || 0)
      },
      todo: {
        numEntradas: (entradasTodo == null ? void 0 : entradasTodo.num_entradas) || 0,
        totalUnidades: (entradasTodo == null ? void 0 : entradasTodo.total_unidades) || 0,
        inversionTotal: (entradasTodo == null ? void 0 : entradasTodo.inversion_total) || 0,
        valorVenta: (entradasTodo == null ? void 0 : entradasTodo.valor_venta) || 0,
        gananciaProyectada: ((entradasTodo == null ? void 0 : entradasTodo.valor_venta) || 0) - ((entradasTodo == null ? void 0 : entradasTodo.inversion_total) || 0)
      },
      productosNuevosMes: (productosNuevosMes == null ? void 0 : productosNuevosMes.cantidad) || 0,
      proveedoresActivosMes: (proveedoresActivosMes == null ? void 0 : proveedoresActivosMes.cantidad) || 0,
      totalProductos: (totalProductos == null ? void 0 : totalProductos.cantidad) || 0,
      totalProveedores: (totalProveedores == null ? void 0 : totalProveedores.cantidad) || 0
    };
  } catch (error) {
    console.error("Error al obtener KPIs de entradas:", error);
    return {
      mes: { numEntradas: 0, totalUnidades: 0, inversionTotal: 0, valorVenta: 0, gananciaProyectada: 0 },
      anio: { numEntradas: 0, totalUnidades: 0, inversionTotal: 0, valorVenta: 0, gananciaProyectada: 0 },
      todo: { numEntradas: 0, totalUnidades: 0, inversionTotal: 0, valorVenta: 0, gananciaProyectada: 0 },
      productosNuevosMes: 0,
      proveedoresActivosMes: 0,
      totalProductos: 0,
      totalProveedores: 0
    };
  }
});
ipcMain.handle("get-entradas-por-categoria", () => {
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
    `).all();
    return entradas;
  } catch (error) {
    console.error("Error al obtener entradas por categoría:", error);
    return [];
  }
});
ipcMain.handle("get-entradas-recientes", (_event, limite = 20) => {
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
    `).all(limite);
    return entradas;
  } catch (error) {
    console.error("Error al obtener entradas recientes:", error);
    return [];
  }
});
ipcMain.handle("get-entradas-por-proveedor", () => {
  try {
    const hoy = /* @__PURE__ */ new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split("T")[0];
    const finHoy = hoy.toISOString().split("T")[0];
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
    `).all(inicioMes, finHoy);
    return proveedores;
  } catch (error) {
    console.error("Error al obtener entradas por proveedor:", error);
    return [];
  }
});
ipcMain.handle("registrar-entrada-multiple-tallas", (_event, datos) => {
  const { folio_producto, esNuevo, producto, tallas, responsable, observaciones } = datos;
  const registrar = db.transaction(() => {
    const fechaEntrada = (/* @__PURE__ */ new Date()).toISOString();
    if (esNuevo && producto) {
      const stmtProducto = db.prepare(`
        INSERT INTO productos (
          folio_producto, nombre_producto, categoria, genero_destino,
          stock_actual, stock_minimo, proveedor, observaciones
        ) VALUES (
          @folio_producto, @nombre_producto, @categoria, @genero_destino,
          0, 5, @proveedor, @observaciones
        )
      `);
      stmtProducto.run(producto);
    }
    for (const t of tallas) {
      if (t.cantidad <= 0) continue;
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
      `);
      stmtEntrada.run({
        fecha: fechaEntrada,
        folio: folio_producto,
        cantidad: t.cantidad,
        talla: t.talla,
        costo: t.costo,
        precio: t.precio,
        tipo: esNuevo ? "Entrada Inicial" : "Reabastecimiento",
        responsable: responsable || null,
        observaciones: observaciones || null
      });
      db.prepare(`
        UPDATE productos 
        SET stock_actual = stock_actual + @cantidad,
            fecha_ultima_actualizacion = CURRENT_TIMESTAMP
        WHERE folio_producto = @folio
      `).run({ cantidad: t.cantidad, folio: folio_producto });
      db.prepare(`
        INSERT INTO tallas_producto (folio_producto, talla, cantidad)
        VALUES (@folio, @talla, @cantidad)
        ON CONFLICT(folio_producto, talla) DO UPDATE SET
          cantidad = cantidad + @cantidad,
          fecha_actualizacion = CURRENT_TIMESTAMP
      `).run({ folio: folio_producto, talla: t.talla, cantidad: t.cantidad });
    }
  });
  try {
    registrar();
    return { success: true };
  } catch (error) {
    console.error("Error al registrar entrada con múltiples tallas:", error);
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
