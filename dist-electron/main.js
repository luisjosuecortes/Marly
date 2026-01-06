import { app as h, ipcMain as l, BrowserWindow as U } from "electron";
import { fileURLToPath as V } from "node:url";
import A from "node:path";
import L from "node:fs";
import $ from "better-sqlite3";
const F = A.dirname(V(import.meta.url));
process.env.APP_ROOT = A.join(F, "..");
const g = process.env.VITE_DEV_SERVER_URL, K = A.join(process.env.APP_ROOT, "dist-electron"), H = A.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = g ? A.join(process.env.APP_ROOT, "public") : H;
const Y = process.env.VITE_PUBLIC, w = h.isPackaged;
let b, N;
w ? (b = A.join(h.getPath("userData"), "database"), N = A.join(process.resourcesPath, "database", "schema.sql")) : (b = A.join(process.env.APP_ROOT, "database"), N = A.join(process.env.APP_ROOT, "database", "schema.sql"));
const B = A.join(b, "marly.db");
L.existsSync(b) || L.mkdirSync(b, { recursive: !0 });
let I;
w ? I = A.join(
  process.resourcesPath,
  "app.asar.unpacked",
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node"
) : I = A.join(
  process.env.APP_ROOT,
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node"
);
const e = new $(B, { verbose: console.log, nativeBinding: I }), k = () => {
  try {
    if (L.existsSync(N)) {
      const c = L.readFileSync(N, "utf-8");
      e.exec(c), console.log("Base de datos inicializada/verificada.");
    } else
      console.warn("Archivo de esquema no encontrado:", N);
  } catch (c) {
    console.error("Error al inicializar la base de datos:", c);
  }
};
k();
l.handle("get-productos", () => {
  try {
    return e.prepare(`
      SELECT 
        p.*, 
        json_group_array(json_object('talla', tp.talla, 'cantidad', tp.cantidad)) as tallas_detalle,
        (SELECT precio_unitario_base FROM entradas WHERE folio_producto = p.folio_producto ORDER BY id_entrada DESC LIMIT 1) as ultimo_precio
      FROM productos p
      LEFT JOIN tallas_producto tp ON p.folio_producto = tp.folio_producto
      GROUP BY p.folio_producto
      ORDER BY p.fecha_ultima_actualizacion DESC
    `).all().map((t) => ({
      ...t,
      tallas_detalle: t.tallas_detalle ? JSON.parse(t.tallas_detalle) : []
    }));
  } catch (c) {
    return console.error("Error al obtener productos:", c), [];
  }
});
l.handle("actualizar-stock", (c, a) => {
  const { folio_producto: t, nuevo_stock: o, talla: n, motivo: i, responsable: r } = a;
  if (!n)
    throw new Error("Es necesario especificar la talla para ajustar el stock.");
  const s = e.transaction(() => {
    const d = e.prepare("SELECT cantidad FROM tallas_producto WHERE folio_producto = ? AND talla = ?").get(t, n), p = d ? d.cantidad : 0, _ = o - p;
    if (_ === 0) return;
    e.prepare(`
      INSERT INTO tallas_producto (folio_producto, talla, cantidad, fecha_actualizacion)
      VALUES (@folio, @talla, @cantidad, CURRENT_TIMESTAMP)
      ON CONFLICT(folio_producto, talla) DO UPDATE SET
        cantidad = @cantidad,
        fecha_actualizacion = CURRENT_TIMESTAMP
    `).run({
      folio: t,
      talla: n,
      cantidad: o
    }), e.prepare(`
      UPDATE productos 
      SET stock_actual = stock_actual + @diferencia,
          fecha_ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio
    `).run({
      diferencia: _,
      folio: t
    }), e.prepare(`
      INSERT INTO entradas (
        fecha_entrada, folio_producto, cantidad_recibida, talla, 
        costo_unitario_proveedor, precio_unitario_base, 
        tipo_movimiento, responsable_recepcion, observaciones_entrada
      ) VALUES (
        CURRENT_TIMESTAMP, @folio, @cantidad, @talla, 
        0, 0, 
        'Ajuste Manual', @responsable, @motivo
      )
    `).run({
      folio: t,
      cantidad: _,
      // Puede ser negativo
      talla: n,
      responsable: r || "Sistema",
      motivo: i || "Ajuste de inventario"
    });
  });
  try {
    return s(), { success: !0 };
  } catch (d) {
    throw console.error("Error al actualizar stock:", d), d;
  }
});
l.handle("get-proveedores", () => {
  try {
    return e.prepare("SELECT nombre FROM proveedores ORDER BY nombre").all().map((a) => a.nombre);
  } catch (c) {
    return console.error("Error al obtener proveedores:", c), [];
  }
});
l.handle("agregar-proveedor", (c, a) => {
  try {
    const t = a.trim().toUpperCase();
    return e.prepare("INSERT INTO proveedores (nombre) VALUES (?)").run(t), { success: !0 };
  } catch (t) {
    throw t.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ? new Error("Este proveedor ya existe.") : t;
  }
});
l.handle("eliminar-proveedor", (c, a) => {
  try {
    return e.prepare("DELETE FROM proveedores WHERE nombre = ?").run(a), { success: !0 };
  } catch (t) {
    throw console.error("Error al eliminar proveedor:", t), t;
  }
});
l.handle("get-responsables", () => {
  try {
    return e.prepare("SELECT id_responsable, nombre FROM responsables WHERE activo = 1 ORDER BY nombre").all();
  } catch (c) {
    return console.error("Error al obtener responsables:", c), [];
  }
});
l.handle("agregar-responsable", (c, a) => {
  try {
    const t = a.trim();
    if (!t) throw new Error("El nombre no puede estar vacío");
    return { success: !0, id: e.prepare("INSERT INTO responsables (nombre) VALUES (?)").run(t).lastInsertRowid };
  } catch (t) {
    throw t.code === "SQLITE_CONSTRAINT_UNIQUE" ? new Error("Este responsable ya existe.") : t;
  }
});
l.handle("eliminar-responsable", (c, a) => {
  try {
    return e.prepare("UPDATE responsables SET activo = 0 WHERE id_responsable = ?").run(a), { success: !0 };
  } catch (t) {
    throw console.error("Error al eliminar responsable:", t), t;
  }
});
l.handle("get-historial-entradas", (c, a) => {
  try {
    return e.prepare(`
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
    `).all(a);
  } catch (t) {
    return console.error("Error al obtener historial de entradas:", t), [];
  }
});
l.handle("get-historial-ventas", (c, a) => {
  try {
    return e.prepare(`
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
    `).all(a).map((o) => {
      let n = 0;
      const i = o.precio_unitario_real * o.cantidad_vendida - (o.descuento_aplicado || 0);
      if (o.tipo_salida === "Venta" || o.tipo_salida === "Prestado")
        n = i;
      else if (o.tipo_salida === "Crédito" || o.tipo_salida === "Apartado")
        if (o.id_cliente) {
          const r = e.prepare(`
            SELECT COALESCE(SUM(monto), 0) as total_abonado
            FROM movimientos_cliente
            WHERE id_cliente = ?
              AND tipo_movimiento = 'abono'
              AND (referencia LIKE ? OR referencia LIKE ?)
          `).get(
            o.id_cliente,
            `%Venta #${o.id_venta}%`,
            `Abono inicial - Venta #${o.id_venta}%`
          );
          n = (r == null ? void 0 : r.total_abonado) || 0;
        } else
          n = 0;
      return {
        ...o,
        monto_total: i,
        monto_vendido: n,
        saldo_pendiente: i - n
      };
    });
  } catch (t) {
    return console.error("Error al obtener historial de ventas:", t), [];
  }
});
l.handle("get-historial-movimientos", (c, a) => {
  try {
    const t = e.prepare(`
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
    `).all(a), n = e.prepare(`
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
    `).all(a).map((r) => {
      let s = 0;
      const d = r.precio_unitario_real * r.cantidad - (r.descuento_aplicado || 0);
      if (r.tipo_movimiento === "Venta" || r.tipo_movimiento === "Prestado")
        s = d;
      else if (r.tipo_movimiento === "Crédito" || r.tipo_movimiento === "Apartado")
        if (r.id_cliente) {
          const p = e.prepare(`
            SELECT COALESCE(SUM(monto), 0) as total_abonado
            FROM movimientos_cliente
            WHERE id_cliente = ?
              AND tipo_movimiento = 'abono'
              AND (referencia LIKE ? OR referencia LIKE ?)
          `).get(
            r.id_cliente,
            `%Venta #${r.id}%`,
            `Abono inicial - Venta #${r.id}%`
          );
          s = (p == null ? void 0 : p.total_abonado) || 0;
        } else
          s = 0;
      return {
        ...r,
        precio_unitario: r.precio_unitario_real,
        monto_vendido: s,
        saldo_pendiente: d - s
      };
    });
    return [...t, ...n].sort((r, s) => {
      const d = new Date(r.fecha).getTime(), p = new Date(s.fecha).getTime();
      return p !== d ? p - d : s.id - r.id;
    });
  } catch (t) {
    return console.error("Error al obtener historial de movimientos:", t), [];
  }
});
l.handle("get-producto-detalle", (c, a) => {
  try {
    const o = e.prepare(`
      SELECT 
        p.*, 
        json_group_array(json_object('talla', tp.talla, 'cantidad', tp.cantidad)) as tallas_detalle
      FROM productos p
      LEFT JOIN tallas_producto tp ON p.folio_producto = tp.folio_producto
      WHERE p.folio_producto = ?
      GROUP BY p.folio_producto
    `).get(a);
    return o ? {
      ...o,
      tallas_detalle: o.tallas_detalle ? JSON.parse(o.tallas_detalle) : []
    } : null;
  } catch (t) {
    return console.error("Error al buscar producto:", t), null;
  }
});
l.handle("get-ultima-entrada", (c, a) => {
  try {
    return e.prepare(`
      SELECT costo_unitario_proveedor, precio_unitario_base
      FROM entradas
      WHERE folio_producto = ?
      ORDER BY fecha_entrada DESC, id_entrada DESC
      LIMIT 1
    `).get(a) || null;
  } catch (t) {
    return console.error("Error al obtener última entrada:", t), null;
  }
});
l.handle("get-precio-venta", (c, a) => {
  const { folio_producto: t, talla: o } = a;
  try {
    const n = e.prepare(`
      SELECT precio_unitario_base
      FROM entradas
      WHERE folio_producto = ? AND talla = ?
      ORDER BY fecha_entrada DESC, id_entrada DESC
      LIMIT 1
    `).get(t, o);
    return n ? { precio_unitario_base: n.precio_unitario_base } : e.prepare(`
      SELECT precio_unitario_base
      FROM entradas
      WHERE folio_producto = ?
      ORDER BY fecha_entrada DESC, id_entrada DESC
      LIMIT 1
    `).get(t) || { precio_unitario_base: 0 };
  } catch (n) {
    return console.error("Error al obtener precio de venta:", n), { precio_unitario_base: 0 };
  }
});
l.handle("registrar-nuevo-producto", (c, a) => {
  const { producto: t, entrada: o } = a, n = e.transaction(() => {
    e.prepare(`
      INSERT INTO productos (
        folio_producto, nombre_producto, categoria, genero_destino,
        stock_actual, stock_minimo, proveedor, observaciones
      ) VALUES (
        @folio_producto, @nombre_producto, @categoria, @genero_destino,
        @stock_actual, 5, @proveedor, @observaciones
      )
    `).run({
      ...t,
      stock_actual: o.cantidad_recibida
    }), e.prepare(`
      INSERT INTO entradas (
        fecha_entrada, folio_producto, cantidad_recibida, talla, costo_unitario_proveedor,
        precio_unitario_base, precio_unitario_promocion, tipo_movimiento,
        responsable_recepcion, observaciones_entrada
      ) VALUES (
        @fecha_entrada, @folio_producto, @cantidad_recibida, @talla, @costo_unitario_proveedor,
        @precio_unitario_base, @precio_unitario_promocion, @tipo_movimiento,
        @responsable_recepcion, @observaciones_entrada
      )
    `).run({
      ...o,
      folio_producto: t.folio_producto,
      // Asegurar foreign key
      tipo_movimiento: "Entrada Inicial"
    }), e.prepare(`
      INSERT INTO tallas_producto (folio_producto, talla, cantidad)
      VALUES (@folio, @talla, @cantidad)
    `).run({
      folio: t.folio_producto,
      talla: o.talla,
      cantidad: o.cantidad_recibida
    });
  });
  try {
    return n(), { success: !0 };
  } catch (i) {
    throw console.error("Error al registrar nuevo producto:", i), i.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ? new Error("El folio del producto ya existe.") : i;
  }
});
l.handle("registrar-entrada-existente", (c, a) => {
  const t = e.transaction(() => {
    if (!e.prepare("SELECT stock_actual FROM productos WHERE folio_producto = ?").get(a.folio_producto))
      throw new Error("El producto no existe.");
    e.prepare(`
      INSERT INTO entradas (
        fecha_entrada, folio_producto, cantidad_recibida, talla, costo_unitario_proveedor,
        precio_unitario_base, precio_unitario_promocion, tipo_movimiento,
        responsable_recepcion, observaciones_entrada
      ) VALUES (
        @fecha_entrada, @folio_producto, @cantidad_recibida, @talla, @costo_unitario_proveedor,
        @precio_unitario_base, @precio_unitario_promocion, @tipo_movimiento,
        @responsable_recepcion, @observaciones_entrada
      )
    `).run({
      ...a,
      tipo_movimiento: "Reabastecimiento"
    }), e.prepare(`
      UPDATE productos 
      SET stock_actual = stock_actual + @cantidad,
          fecha_ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio
    `).run({
      cantidad: a.cantidad_recibida,
      folio: a.folio_producto
    }), e.prepare(`
      INSERT INTO tallas_producto (folio_producto, talla, cantidad)
      VALUES (@folio, @talla, @cantidad)
      ON CONFLICT(folio_producto, talla) DO UPDATE SET
        cantidad = cantidad + @cantidad,
        fecha_actualizacion = CURRENT_TIMESTAMP
    `).run({
      folio: a.folio_producto,
      talla: a.talla,
      cantidad: a.cantidad_recibida
    });
  });
  try {
    return t(), { success: !0 };
  } catch (o) {
    throw console.error("Error al registrar entrada:", o), o;
  }
});
l.handle("eliminar-entrada", (c, a) => {
  const t = e.transaction(() => {
    const o = e.prepare(`
      SELECT folio_producto, cantidad_recibida, talla, tipo_movimiento
      FROM entradas
      WHERE id_entrada = ?
    `).get(a);
    if (!o)
      throw new Error("Entrada no encontrada.");
    if (o.tipo_movimiento === "Entrada Inicial" && e.prepare(`
        SELECT COUNT(*) as total FROM entradas WHERE folio_producto = ?
      `).get(o.folio_producto).total === 1)
      throw new Error("No se puede eliminar la entrada inicial del producto. Elimine el producto completo desde Inventario.");
    e.prepare(`
      UPDATE productos 
      SET stock_actual = stock_actual - @cantidad,
          fecha_ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio
    `).run({
      cantidad: o.cantidad_recibida,
      folio: o.folio_producto
    }), e.prepare(`
      UPDATE tallas_producto
      SET cantidad = cantidad - @cantidad,
          fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio AND talla = @talla
    `).run({
      cantidad: o.cantidad_recibida,
      folio: o.folio_producto,
      talla: o.talla
    });
    const r = e.prepare(`
      SELECT cantidad FROM tallas_producto 
      WHERE folio_producto = ? AND talla = ?
    `).get(o.folio_producto, o.talla);
    r && r.cantidad <= 0 && e.prepare(`
        DELETE FROM tallas_producto 
        WHERE folio_producto = ? AND talla = ?
      `).run(o.folio_producto, o.talla), e.prepare("DELETE FROM entradas WHERE id_entrada = ?").run(a);
  });
  try {
    return t(), { success: !0 };
  } catch (o) {
    throw console.error("Error al eliminar entrada:", o), o;
  }
});
l.handle("get-clientes", () => {
  try {
    return e.prepare(`
      SELECT 
        id_cliente,
        nombre_completo,
        telefono,
        saldo_pendiente,
        estado_cuenta
      FROM clientes
      ORDER BY nombre_completo ASC
    `).all();
  } catch (c) {
    return console.error("Error al obtener clientes:", c), [];
  }
});
l.handle("agregar-cliente", (c, a) => {
  const { nombre_completo: t, telefono: o, saldo_pendiente: n } = a, i = e.transaction(() => {
    const s = e.prepare(`
      INSERT INTO clientes (nombre_completo, telefono, saldo_pendiente, estado_cuenta)
      VALUES (@nombre_completo, @telefono, @saldo_pendiente, 
              CASE WHEN @saldo_pendiente > 0 THEN 'Con saldo' ELSE 'Al corriente' END)
    `).run({
      nombre_completo: t.trim(),
      telefono: o || null,
      saldo_pendiente: n || 0
    });
    if (n && n > 0) {
      const d = Number(s.lastInsertRowid);
      e.prepare(`
        INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
        VALUES (@id_cliente, CURRENT_TIMESTAMP, 'cargo', @monto, 'Saldo inicial', 'Sistema')
      `).run({
        id_cliente: d,
        monto: n
      });
    }
  });
  try {
    return i(), { success: !0 };
  } catch (r) {
    throw console.error("Error al agregar cliente:", r), r.code === "SQLITE_CONSTRAINT" ? new Error("Ya existe un cliente con ese nombre.") : r;
  }
});
l.handle("eliminar-cliente", (c, a) => {
  try {
    const t = e.prepare("SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?").get(a);
    if (!t)
      throw new Error("Cliente no encontrado.");
    if (t.saldo_pendiente > 0)
      throw new Error("No se puede eliminar un cliente con saldo pendiente.");
    return e.prepare("DELETE FROM clientes WHERE id_cliente = ?").run(a), { success: !0 };
  } catch (t) {
    throw console.error("Error al eliminar cliente:", t), t;
  }
});
l.handle("get-historial-cliente", (c, a) => {
  try {
    const t = e.prepare("SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?").get(a);
    if (!t)
      throw new Error("Cliente no encontrado.");
    return {
      movimientos: e.prepare(`
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
    `).all(a),
      saldoActual: t.saldo_pendiente
    };
  } catch (t) {
    throw console.error("Error al obtener historial del cliente:", t), t;
  }
});
l.handle("get-productos-pendientes-cliente", (c, a) => {
  try {
    return e.prepare(`
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
    `).all(a).map((o) => {
      let n = 0;
      const i = o.monto_total, r = e.prepare(`
          SELECT COALESCE(SUM(monto), 0) as total_abonado
          FROM movimientos_cliente
          WHERE id_cliente = ?
            AND tipo_movimiento = 'abono'
            AND (referencia LIKE ? OR referencia LIKE ?)
        `).get(
        a,
        `%Venta #${o.id_venta}%`,
        `Abono inicial - Venta #${o.id_venta}%`
      );
      n = (r == null ? void 0 : r.total_abonado) || 0;
      const s = i - n;
      return {
        ...o,
        monto_abonado: n,
        monto_faltante: s
      };
    }).filter((o) => o.monto_faltante > 0);
  } catch (t) {
    return console.error("Error al obtener productos pendientes:", t), [];
  }
});
l.handle("registrar-abono-cliente", (c, a) => {
  const { id_cliente: t, monto: o, id_venta: n, responsable: i, notas: r } = a, s = e.transaction(() => {
    const d = e.prepare("SELECT saldo_pendiente FROM clientes WHERE id_cliente = ?").get(t);
    if (!d)
      throw new Error("Cliente no encontrado.");
    if (o <= 0)
      throw new Error("El monto del abono debe ser mayor a 0.");
    if (n) {
      const u = e.prepare(`
        SELECT 
          (v.precio_unitario_real * v.cantidad_vendida - COALESCE(v.descuento_aplicado, 0)) as monto_total
        FROM ventas v
        WHERE v.id_venta = ? AND v.id_cliente = ?
      `).get(n, t);
      if (u) {
        const E = e.prepare(`
          SELECT COALESCE(SUM(monto), 0) as total_abonado
          FROM movimientos_cliente
          WHERE id_cliente = ?
            AND tipo_movimiento = 'abono'
            AND (referencia LIKE ? OR referencia LIKE ?)
        `).get(
          t,
          `%Venta #${n}%`,
          `Abono inicial - Venta #${n}%`
        ), m = (E == null ? void 0 : E.total_abonado) || 0, f = u.monto_total - m;
        if (o > f)
          throw new Error(`El abono ($${o.toFixed(2)}) no puede ser mayor al monto faltante de este producto ($${f.toFixed(2)}).`);
      } else
        throw new Error("Venta no encontrada.");
    } else if (o > d.saldo_pendiente)
      throw new Error(`El abono no puede ser mayor al saldo pendiente ($${d.saldo_pendiente.toFixed(2)}).`);
    const p = d.saldo_pendiente - o;
    e.prepare(`
      UPDATE clientes 
      SET saldo_pendiente = @nuevo_saldo,
          fecha_ultimo_pago = CURRENT_TIMESTAMP,
          estado_cuenta = CASE 
            WHEN @nuevo_saldo > 0 THEN 'Con saldo'
            ELSE 'Al corriente'
          END
      WHERE id_cliente = @id_cliente
    `).run({
      nuevo_saldo: p,
      id_cliente: t
    });
    const _ = n ? `Abono - Venta #${n}${r ? ` - ${r}` : ""}` : `Abono general${r ? ` - ${r}` : ""}`;
    e.prepare(`
      INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
      VALUES (@id_cliente, CURRENT_TIMESTAMP, 'abono', @monto, @referencia, @responsable)
    `).run({
      id_cliente: t,
      monto: o,
      referencia: _,
      responsable: i || null
    });
    const v = n ? [n] : e.prepare(`
          SELECT DISTINCT v.id_venta
          FROM ventas v
          INNER JOIN productos p ON v.folio_producto = p.folio_producto
          WHERE v.id_cliente = ?
            AND v.tipo_salida IN ('Crédito', 'Apartado', 'Prestado')
            AND p.estado_producto IN ('Crédito', 'Apartado', 'Prestado')
        `).all(t).map((u) => u.id_venta);
    for (const u of v) {
      const E = e.prepare(`
        SELECT 
          v.folio_producto,
          v.tipo_salida,
          (v.precio_unitario_real * v.cantidad_vendida - COALESCE(v.descuento_aplicado, 0)) as monto_venta,
          p.estado_producto
        FROM ventas v
        INNER JOIN productos p ON v.folio_producto = p.folio_producto
        WHERE v.id_venta = ? AND v.id_cliente = ?
      `).get(u, t);
      if (E) {
        const m = e.prepare(`
          SELECT COALESCE(SUM(monto), 0) as total_abonado
          FROM movimientos_cliente
          WHERE id_cliente = ? 
            AND tipo_movimiento = 'abono'
            AND (referencia LIKE ? OR referencia LIKE ?)
        `).get(t, `%Venta #${u}%`, `Abono inicial - Venta #${u}%`), f = (m == null ? void 0 : m.total_abonado) || 0, S = E.monto_venta;
        if (f >= S && E.estado_producto !== "Vendido" && E.estado_producto !== "Disponible") {
          const T = E.estado_producto, R = E.tipo_salida === "Prestado" ? "Disponible" : "Vendido";
          e.prepare(`
            UPDATE productos 
            SET estado_producto = @estado_nuevo
            WHERE folio_producto = @folio
          `).run({
            estado_nuevo: R,
            folio: E.folio_producto
          }), e.prepare(`
            INSERT INTO estados_producto (folio_producto, fecha_cambio, estado_anterior, estado_nuevo, motivo, responsable)
            VALUES (@folio, CURRENT_TIMESTAMP, @estado_anterior, @estado_nuevo, @motivo, @responsable)
          `).run({
            folio: E.folio_producto,
            estado_anterior: T,
            estado_nuevo: R,
            motivo: `Pago completado${r ? ` - ${r}` : ""}`,
            responsable: i || null
          });
        }
      }
    }
    return { success: !0, nuevoSaldo: p };
  });
  try {
    return s();
  } catch (d) {
    throw console.error("Error al registrar abono:", d), d;
  }
});
l.handle("marcar-prestado-devuelto", (c, a) => {
  const { id_venta: t, responsable: o, notas: n } = a, i = e.transaction(() => {
    const r = e.prepare(`
      SELECT 
        v.folio_producto,
        p.estado_producto
      FROM ventas v
      INNER JOIN productos p ON v.folio_producto = p.folio_producto
      WHERE v.id_venta = ? AND v.tipo_salida = 'Prestado'
    `).get(t);
    if (!r)
      throw new Error("Venta no encontrada o no es un producto prestado.");
    if (r.estado_producto !== "Prestado")
      throw new Error("Este producto ya no está marcado como prestado.");
    return e.prepare(`
      UPDATE productos 
      SET estado_producto = 'Disponible'
      WHERE folio_producto = @folio
    `).run({
      folio: r.folio_producto
    }), e.prepare(`
      INSERT INTO estados_producto (folio_producto, fecha_cambio, estado_anterior, estado_nuevo, motivo, responsable)
      VALUES (@folio, CURRENT_TIMESTAMP, @estadoAnterior, 'Disponible', @motivo, @responsable)
    `).run({
      folio: r.folio_producto,
      estadoAnterior: "Prestado",
      motivo: `Producto prestado devuelto${n ? ` - ${n}` : ""}`,
      responsable: o || null
    }), { success: !0 };
  });
  try {
    return i();
  } catch (r) {
    throw console.error("Error al marcar producto como devuelto:", r), r;
  }
});
l.handle("get-productos-disponibles", () => {
  try {
    return e.prepare(`
      SELECT 
        p.*, 
        json_group_array(json_object('talla', tp.talla, 'cantidad', tp.cantidad)) as tallas_detalle
      FROM productos p
      LEFT JOIN tallas_producto tp ON p.folio_producto = tp.folio_producto
      WHERE p.stock_actual > 0
      GROUP BY p.folio_producto
      HAVING SUM(tp.cantidad) > 0
      ORDER BY p.fecha_ultima_actualizacion DESC
    `).all().map((t) => ({
      ...t,
      tallas_detalle: t.tallas_detalle ? JSON.parse(t.tallas_detalle) : []
    }));
  } catch (c) {
    return console.error("Error al obtener productos disponibles:", c), [];
  }
});
l.handle("registrar-venta", (c, a) => {
  const {
    fecha_venta: t,
    folio_producto: o,
    cantidad_vendida: n,
    talla: i,
    precio_unitario_real: r,
    descuento_aplicado: s,
    tipo_salida: d,
    id_cliente: p,
    abono_inicial: _,
    responsable_caja: v,
    notas: u
  } = a, E = e.transaction(() => {
    if (!e.prepare("SELECT stock_actual FROM productos WHERE folio_producto = ?").get(o))
      throw new Error("Producto no encontrado.");
    const f = e.prepare(`
      SELECT cantidad FROM tallas_producto 
      WHERE folio_producto = ? AND talla = ?
    `).get(o, i);
    if (!f || f.cantidad < n)
      throw new Error(`Stock insuficiente. Disponible en talla ${i}: ${(f == null ? void 0 : f.cantidad) || 0}`);
    const T = e.prepare(`
      INSERT INTO ventas (
        fecha_venta, folio_producto, cantidad_vendida, talla,
        precio_unitario_real, descuento_aplicado, tipo_salida,
        id_cliente, responsable_caja, notas
      ) VALUES (
        @fecha_venta, @folio_producto, @cantidad_vendida, @talla,
        @precio_unitario_real, @descuento_aplicado, @tipo_salida,
        @id_cliente, @responsable_caja, @notas
      )
    `).run({
      fecha_venta: t,
      folio_producto: o,
      cantidad_vendida: n,
      talla: i,
      precio_unitario_real: r,
      descuento_aplicado: s || 0,
      tipo_salida: d,
      id_cliente: p || null,
      responsable_caja: v,
      notas: u || null
    });
    e.prepare(`
      UPDATE productos 
      SET stock_actual = stock_actual - @cantidad,
          fecha_ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio
    `).run({
      cantidad: n,
      folio: o
    }), e.prepare(`
      UPDATE tallas_producto
      SET cantidad = cantidad - @cantidad,
          fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio AND talla = @talla
    `).run({
      cantidad: n,
      folio: o,
      talla: i
    });
    const R = e.prepare(`
      SELECT cantidad FROM tallas_producto 
      WHERE folio_producto = ? AND talla = ?
    `).get(o, i);
    if (R && R.cantidad <= 0 && e.prepare(`
        DELETE FROM tallas_producto 
        WHERE folio_producto = ? AND talla = ?
      `).run(o, i), p && (d === "Crédito" || d === "Apartado")) {
      const O = r * n - (s || 0), C = _ || 0;
      if (C > O)
        throw new Error(`El abono inicial ($${C.toFixed(2)}) no puede ser mayor al monto total ($${O.toFixed(2)}). Esto generaría un saldo negativo.`);
      if (C < 0)
        throw new Error("El abono inicial no puede ser negativo.");
      e.prepare(`
        UPDATE clientes 
        SET saldo_pendiente = saldo_pendiente + @monto,
            estado_cuenta = 'Con saldo'
        WHERE id_cliente = @id_cliente
      `).run({
        monto: O,
        id_cliente: p
      }), e.prepare(`
        INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
        VALUES (@id_cliente, @fecha, 'cargo', @monto, @referencia, @responsable)
      `).run({
        id_cliente: p,
        fecha: t,
        monto: O,
        referencia: `Venta #${T.lastInsertRowid}`,
        responsable: v
      }), C > 0 && (e.prepare(`
          UPDATE clientes 
          SET saldo_pendiente = saldo_pendiente - @monto,
              estado_cuenta = CASE 
                WHEN saldo_pendiente - @monto > 0 THEN 'Con saldo'
                ELSE 'Al corriente'
              END
          WHERE id_cliente = @id_cliente
        `).run({
        monto: C,
        id_cliente: p
      }), e.prepare(`
          INSERT INTO movimientos_cliente (id_cliente, fecha, tipo_movimiento, monto, referencia, responsable)
          VALUES (@id_cliente, @fecha, 'abono', @monto, @referencia, @responsable)
        `).run({
        id_cliente: p,
        fecha: t,
        monto: C,
        referencia: `Abono inicial - Venta #${T.lastInsertRowid}`,
        responsable: v
      }));
    }
    if (d === "Crédito" || d === "Apartado" || d === "Prestado") {
      const O = e.prepare("SELECT estado_producto FROM productos WHERE folio_producto = ?").get(o);
      e.prepare(`
        UPDATE productos 
        SET estado_producto = @estado_nuevo
        WHERE folio_producto = @folio
      `).run({
        estado_nuevo: d,
        folio: o
      }), e.prepare(`
        INSERT INTO estados_producto (folio_producto, fecha_cambio, estado_anterior, estado_nuevo, motivo, responsable)
        VALUES (@folio, @fecha, @estado_anterior, @estado_nuevo, @motivo, @responsable)
      `).run({
        folio: o,
        fecha: t,
        estado_anterior: (O == null ? void 0 : O.estado_producto) || "Disponible",
        estado_nuevo: d,
        motivo: u || `Venta registrada como ${d}`,
        responsable: v
      });
    }
  });
  try {
    return E(), { success: !0 };
  } catch (m) {
    throw console.error("Error al registrar venta:", m), m;
  }
});
l.handle("eliminar-venta", (c, a) => {
  const t = e.transaction(() => {
    const o = e.prepare(`
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
    `).get(a);
    if (!o)
      throw new Error("Venta no encontrada.");
    if (e.prepare(`
      UPDATE productos 
      SET stock_actual = stock_actual + @cantidad,
          fecha_ultima_actualizacion = CURRENT_TIMESTAMP
      WHERE folio_producto = @folio
    `).run({
      cantidad: o.cantidad_vendida,
      folio: o.folio_producto
    }), e.prepare(`
      SELECT cantidad FROM tallas_producto 
      WHERE folio_producto = ? AND talla = ?
    `).get(o.folio_producto, o.talla) ? e.prepare(`
        UPDATE tallas_producto
        SET cantidad = cantidad + @cantidad,
            fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE folio_producto = @folio AND talla = @talla
      `).run({
      cantidad: o.cantidad_vendida,
      folio: o.folio_producto,
      talla: o.talla
    }) : e.prepare(`
        INSERT INTO tallas_producto (folio_producto, talla, cantidad, fecha_actualizacion)
        VALUES (@folio, @talla, @cantidad, CURRENT_TIMESTAMP)
      `).run({
      folio: o.folio_producto,
      talla: o.talla,
      cantidad: o.cantidad_vendida
    }), o.id_cliente && (o.tipo_salida === "Crédito" || o.tipo_salida === "Apartado")) {
      const i = o.precio_unitario_real * o.cantidad_vendida - (o.descuento_aplicado || 0), r = e.prepare(`
        SELECT COALESCE(SUM(monto), 0) as total_abonado
        FROM movimientos_cliente
        WHERE id_cliente = ?
          AND tipo_movimiento = 'abono'
          AND (referencia LIKE ? OR referencia LIKE ?)
      `).get(o.id_cliente, `%Venta #${a}%`, `Abono inicial - Venta #${a}%`), s = (r == null ? void 0 : r.total_abonado) || 0, d = i - s;
      d > 0 && e.prepare(`
          UPDATE clientes 
          SET saldo_pendiente = saldo_pendiente - @monto,
              estado_cuenta = CASE 
                WHEN saldo_pendiente - @monto > 0 THEN 'Con saldo'
                ELSE 'Al corriente'
              END
          WHERE id_cliente = @id_cliente
        `).run({
        monto: d,
        id_cliente: o.id_cliente
      }), e.prepare(`
        DELETE FROM movimientos_cliente
        WHERE id_cliente = ?
          AND (referencia LIKE ? OR referencia LIKE ?)
      `).run(o.id_cliente, `%Venta #${a}%`, `Abono inicial - Venta #${a}%`);
    }
    if (o.tipo_salida === "Apartado" || o.tipo_salida === "Prestado") {
      const i = e.prepare(`
        SELECT estado_anterior 
        FROM estados_producto
        WHERE folio_producto = ?
          AND estado_nuevo = ?
        ORDER BY fecha_cambio DESC
        LIMIT 1
      `).get(o.folio_producto, o.tipo_salida), r = (i == null ? void 0 : i.estado_anterior) || "Disponible";
      e.prepare(`
        UPDATE productos 
        SET estado_producto = @estadoNuevo
        WHERE folio_producto = @folio
      `).run({
        estadoNuevo: r,
        folio: o.folio_producto
      }), e.prepare(`
        INSERT INTO estados_producto (folio_producto, fecha_cambio, estado_anterior, estado_nuevo, motivo, responsable)
        VALUES (@folio, CURRENT_TIMESTAMP, @estadoAnterior, @estadoNuevo, @motivo, @responsable)
      `).run({
        folio: o.folio_producto,
        estadoAnterior: o.tipo_salida,
        estadoNuevo: r,
        motivo: "Venta eliminada - Estado revertido",
        responsable: null
      });
    } else if (o.tipo_salida === "Crédito") {
      const i = e.prepare("SELECT estado_producto FROM productos WHERE folio_producto = ?").get(o.folio_producto);
      if ((i == null ? void 0 : i.estado_producto) === "Crédito") {
        const r = e.prepare(`
          SELECT estado_anterior 
          FROM estados_producto
          WHERE folio_producto = ?
            AND estado_nuevo = 'Crédito'
          ORDER BY fecha_cambio DESC
          LIMIT 1
        `).get(o.folio_producto), s = (r == null ? void 0 : r.estado_anterior) || "Disponible";
        e.prepare(`
          UPDATE productos 
          SET estado_producto = @estadoNuevo
          WHERE folio_producto = @folio
        `).run({
          estadoNuevo: s,
          folio: o.folio_producto
        }), e.prepare(`
          INSERT INTO estados_producto (folio_producto, fecha_cambio, estado_anterior, estado_nuevo, motivo, responsable)
          VALUES (@folio, CURRENT_TIMESTAMP, 'Crédito', @estadoNuevo, 'Venta eliminada - Estado revertido', NULL)
        `).run({
          folio: o.folio_producto,
          estadoNuevo: s
        });
      }
    }
    return e.prepare("DELETE FROM ventas WHERE id_venta = ?").run(a), { success: !0 };
  });
  try {
    return t();
  } catch (o) {
    throw console.error("Error al eliminar venta:", o), o;
  }
});
l.handle("eliminar-movimiento-cliente", (c, a) => {
  const t = e.transaction(() => {
    const o = e.prepare(`
      SELECT 
        id_cliente,
        tipo_movimiento,
        monto,
        referencia
      FROM movimientos_cliente
      WHERE id_movimiento = ?
    `).get(a);
    if (!o)
      throw new Error("Movimiento no encontrado.");
    const n = o.tipo_movimiento === "cargo" ? -o.monto : o.monto;
    return e.prepare(`
      UPDATE clientes 
      SET saldo_pendiente = saldo_pendiente + @ajuste,
          estado_cuenta = CASE 
            WHEN saldo_pendiente + @ajuste > 0 THEN 'Con saldo'
            ELSE 'Al corriente'
          END
      WHERE id_cliente = @id_cliente
    `).run({
      ajuste: n,
      id_cliente: o.id_cliente
    }), e.prepare("DELETE FROM movimientos_cliente WHERE id_movimiento = ?").run(a), { success: !0 };
  });
  try {
    return t();
  } catch (o) {
    throw console.error("Error al eliminar movimiento de cliente:", o), o;
  }
});
l.handle("get-estadisticas-resumen", (c, a = {}) => {
  const t = (/* @__PURE__ */ new Date()).toISOString().split("T")[0], o = a.fechaInicio || t, n = a.fechaFin || t, i = e.prepare(`
    SELECT 
      COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0) as total_ventas,
      COALESCE(COUNT(*), 0) as num_ventas
    FROM ventas
    WHERE DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
  `).get(o, n), r = e.prepare(`
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
  `).get(o, n), s = e.prepare(`
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
  `).get(o, n, o, n), d = e.prepare(`
    SELECT COALESCE(SUM(saldo_pendiente), 0) as total_pendiente
    FROM clientes
    WHERE saldo_pendiente > 0
  `).get(), p = e.prepare(`
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
  `).get(), _ = (i == null ? void 0 : i.total_ventas) || 0, v = (r == null ? void 0 : r.total_costos) || 0;
  return {
    ventasTotales: _,
    costosTotales: v,
    gananciaNeta: _ - v,
    totalCobrado: (s == null ? void 0 : s.total_cobrado) || 0,
    saldoPendiente: (d == null ? void 0 : d.total_pendiente) || 0,
    valorInventario: (p == null ? void 0 : p.valor_inventario) || 0,
    numVentas: (i == null ? void 0 : i.num_ventas) || 0
  };
});
l.handle("get-ventas-por-periodo", (c, a) => {
  const { fechaInicio: t, fechaFin: o, agrupacion: n = "dia" } = a;
  let i, r;
  switch (n) {
    case "hora":
      r = "strftime('%H', fecha_venta)", i = "strftime('%H', fecha_venta)";
      break;
    case "dia_semana":
      r = "strftime('%w', fecha_venta)", i = "strftime('%w', fecha_venta)";
      break;
    case "dia_mes":
      r = "strftime('%d', fecha_venta)", i = "strftime('%d', fecha_venta)";
      break;
    case "mes":
      r = "strftime('%m', fecha_venta)", i = "strftime('%m', fecha_venta)";
      break;
    default:
      r = "DATE(fecha_venta)", i = "DATE(fecha_venta)";
  }
  return e.prepare(`
    SELECT 
      ${r} as periodo,
      COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0) as total_ventas,
      COUNT(*) as num_ventas
    FROM ventas
    WHERE DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
    GROUP BY ${i}
    ORDER BY periodo ASC
  `).all(t, o);
});
l.handle("get-productos-mas-vendidos", (c, a = {}) => {
  const t = (/* @__PURE__ */ new Date()).toISOString().split("T")[0], o = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0], n = a.fechaInicio || o, i = a.fechaFin || t, r = a.limite || 10;
  return e.prepare(`
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
  `).all(n, i, r);
});
l.handle("get-ventas-por-categoria", (c, a = {}) => {
  const t = (/* @__PURE__ */ new Date()).toISOString().split("T")[0], o = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0], n = a.fechaInicio || o, i = a.fechaFin || t;
  return e.prepare(`
    SELECT 
      p.categoria,
      SUM(v.cantidad_vendida) as unidades_vendidas,
      SUM(v.cantidad_vendida * v.precio_unitario_real - COALESCE(v.descuento_aplicado, 0)) as monto_total
    FROM ventas v
    JOIN productos p ON v.folio_producto = p.folio_producto
    WHERE DATE(v.fecha_venta) >= DATE(?) AND DATE(v.fecha_venta) <= DATE(?)
    GROUP BY p.categoria
    ORDER BY monto_total DESC
  `).all(n, i);
});
l.handle("get-ventas-por-tipo", (c, a = {}) => {
  const t = (/* @__PURE__ */ new Date()).toISOString().split("T")[0], o = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0], n = a.fechaInicio || o, i = a.fechaFin || t;
  return e.prepare(`
    SELECT 
      tipo_salida,
      COUNT(*) as cantidad,
      SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)) as monto_total
    FROM ventas
    WHERE DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
    GROUP BY tipo_salida
    ORDER BY monto_total DESC
  `).all(n, i);
});
l.handle("get-ventas-comparativas", (c, a) => {
  const { tipo: t, periodos: o } = a, n = {};
  for (const i of o) {
    let r, s, d = [];
    if (t === "mes") {
      const [_, v] = i.split("-").map(Number), u = new Date(_, v, 0).getDate();
      r = `${_}-${String(v).padStart(2, "0")}-01`, s = `${_}-${String(v).padStart(2, "0")}-${u}`;
      const E = e.prepare(`
        SELECT 
          CAST(strftime('%d', fecha_venta) AS INTEGER) as dia,
          COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0) as ganancia
        FROM ventas
        WHERE DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
        GROUP BY strftime('%d', fecha_venta)
        ORDER BY dia
      `).all(r, s);
      for (let m = 1; m <= 31; m++) {
        const f = E.find((S) => S.dia === m);
        d.push({ x: m, y: f ? f.ganancia : 0 });
      }
    } else if (t === "semana") {
      const [_, v] = i.split("-W"), u = parseInt(v), E = new Date(parseInt(_), 0, 4), m = E.getDay() || 7, f = new Date(E);
      f.setDate(E.getDate() - m + 1);
      const S = new Date(f);
      S.setDate(f.getDate() + (u - 1) * 7);
      const T = new Date(S);
      T.setDate(S.getDate() + 6), r = S.toISOString().split("T")[0], s = T.toISOString().split("T")[0];
      const R = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"], O = e.prepare(`
        SELECT 
          CAST(strftime('%w', fecha_venta) AS INTEGER) as dia_semana,
          COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0) as ganancia
        FROM ventas
        WHERE DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
        GROUP BY strftime('%w', fecha_venta)
        ORDER BY dia_semana
      `).all(r, s);
      for (let C = 0; C < 7; C++) {
        const y = C === 6 ? 0 : C + 1, M = O.find((W) => W.dia_semana === y);
        d.push({ x: R[C], y: M ? M.ganancia : 0 });
      }
    } else if (t === "anio") {
      const _ = parseInt(i);
      r = `${_}-01-01`, s = `${_}-12-31`;
      const v = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"], u = e.prepare(`
        SELECT 
          CAST(strftime('%m', fecha_venta) AS INTEGER) as mes,
          COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0) as ganancia
        FROM ventas
        WHERE DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
        GROUP BY strftime('%m', fecha_venta)
        ORDER BY mes
      `).all(r, s);
      for (let E = 1; E <= 12; E++) {
        const m = u.find((f) => f.mes === E);
        d.push({ x: v[E - 1], y: m ? m.ganancia : 0 });
      }
    }
    const p = d.reduce((_, v) => _ + v.y, 0);
    n[i] = { puntos: d, total: p };
  }
  return n;
});
l.handle("get-ventas-productos-comparativas", (c, a) => {
  const { productos: t, tipo: o } = a, n = {}, i = /* @__PURE__ */ new Date(), r = i.getFullYear(), s = String(i.getMonth() + 1).padStart(2, "0");
  let d = "", p = "", _ = [];
  if (o === "mes") {
    const v = new Date(r, i.getMonth() + 1, 0).getDate();
    d = `${r}-${s}-01`, p = `${r}-${s}-${v}`, _ = Array.from({ length: 31 }, (u, E) => E + 1);
  } else if (o === "semana") {
    const v = i.getDay() || 7, u = new Date(i);
    u.setDate(i.getDate() - v + 1);
    const E = new Date(u);
    E.setDate(u.getDate() + 6), d = `${u.getFullYear()}-${String(u.getMonth() + 1).padStart(2, "0")}-${String(u.getDate()).padStart(2, "0")}`, p = `${E.getFullYear()}-${String(E.getMonth() + 1).padStart(2, "0")}-${String(E.getDate()).padStart(2, "0")}`, _ = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  } else o === "anio" && (d = `${r}-01-01`, p = `${r}-12-31`, _ = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]);
  for (const v of t) {
    const u = e.prepare("SELECT nombre_producto FROM productos WHERE folio_producto = ?").get(v), E = (u == null ? void 0 : u.nombre_producto) || v;
    let m = [];
    if (o === "mes") {
      const S = e.prepare(`
        SELECT 
          CAST(strftime('%d', fecha_venta) AS INTEGER) as dia,
          COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0) as ganancia
        FROM ventas
        WHERE folio_producto = ? AND DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
        GROUP BY strftime('%d', fecha_venta)
      `).all(v, d, p);
      for (let T = 1; T <= 31; T++) {
        const R = S.find((O) => O.dia === T);
        m.push({ x: T, y: R ? R.ganancia : 0 });
      }
    } else if (o === "semana") {
      const S = e.prepare(`
        SELECT 
          CAST(strftime('%w', fecha_venta) AS INTEGER) as dia_semana,
          COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0) as ganancia
        FROM ventas
        WHERE folio_producto = ? AND DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
        GROUP BY strftime('%w', fecha_venta)
      `).all(v, d, p);
      for (let T = 0; T < 7; T++) {
        const R = T === 6 ? 0 : T + 1, O = S.find((C) => C.dia_semana === R);
        m.push({ x: _[T], y: O ? O.ganancia : 0 });
      }
    } else if (o === "anio") {
      const S = e.prepare(`
        SELECT 
          CAST(strftime('%m', fecha_venta) AS INTEGER) as mes,
          COALESCE(SUM(cantidad_vendida * precio_unitario_real - COALESCE(descuento_aplicado, 0)), 0) as ganancia
        FROM ventas
        WHERE folio_producto = ? AND DATE(fecha_venta) >= DATE(?) AND DATE(fecha_venta) <= DATE(?)
        GROUP BY strftime('%m', fecha_venta)
      `).all(v, d, p);
      for (let T = 1; T <= 12; T++) {
        const R = S.find((O) => O.mes === T);
        m.push({ x: _[T - 1], y: R ? R.ganancia : 0 });
      }
    }
    const f = m.reduce((S, T) => S + T.y, 0);
    n[v] = { nombre: E, puntos: m, total: f };
  }
  return n;
});
l.handle("get-top-productos-vendidos", (c, a = 5) => e.prepare(`
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
  `).all(a));
l.handle("get-ventas-proveedores-comparativas", (c, a) => {
  const { proveedores: t, tipo: o } = a, n = {}, i = /* @__PURE__ */ new Date(), r = i.getFullYear(), s = String(i.getMonth() + 1).padStart(2, "0");
  let d = "", p = "", _ = [];
  if (o === "mes") {
    const v = new Date(r, i.getMonth() + 1, 0).getDate();
    d = `${r}-${s}-01`, p = `${r}-${s}-${v}`, _ = Array.from({ length: 31 }, (u, E) => E + 1);
  } else if (o === "semana") {
    const v = i.getDay() || 7, u = new Date(i);
    u.setDate(i.getDate() - v + 1);
    const E = new Date(u);
    E.setDate(u.getDate() + 6), d = `${u.getFullYear()}-${String(u.getMonth() + 1).padStart(2, "0")}-${String(u.getDate()).padStart(2, "0")}`, p = `${E.getFullYear()}-${String(E.getMonth() + 1).padStart(2, "0")}-${String(E.getDate()).padStart(2, "0")}`, _ = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  } else o === "anio" && (d = `${r}-01-01`, p = `${r}-12-31`, _ = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]);
  for (const v of t) {
    let u = [];
    if (o === "mes") {
      const m = e.prepare(`
        SELECT 
          CAST(strftime('%d', v.fecha_venta) AS INTEGER) as dia,
          COALESCE(SUM(v.cantidad_vendida * v.precio_unitario_real - COALESCE(v.descuento_aplicado, 0)), 0) as ganancia
        FROM ventas v
        JOIN productos p ON v.folio_producto = p.folio_producto
        WHERE p.proveedor = ? AND DATE(v.fecha_venta) >= DATE(?) AND DATE(v.fecha_venta) <= DATE(?)
        GROUP BY strftime('%d', v.fecha_venta)
      `).all(v, d, p);
      for (let f = 1; f <= 31; f++) {
        const S = m.find((T) => T.dia === f);
        u.push({ x: f, y: S ? S.ganancia : 0 });
      }
    } else if (o === "semana") {
      const m = e.prepare(`
        SELECT 
          CAST(strftime('%w', v.fecha_venta) AS INTEGER) as dia_semana,
          COALESCE(SUM(v.cantidad_vendida * v.precio_unitario_real - COALESCE(v.descuento_aplicado, 0)), 0) as ganancia
        FROM ventas v
        JOIN productos p ON v.folio_producto = p.folio_producto
        WHERE p.proveedor = ? AND DATE(v.fecha_venta) >= DATE(?) AND DATE(v.fecha_venta) <= DATE(?)
        GROUP BY strftime('%w', v.fecha_venta)
      `).all(v, d, p);
      for (let f = 0; f < 7; f++) {
        const S = f === 6 ? 0 : f + 1, T = m.find((R) => R.dia_semana === S);
        u.push({ x: _[f], y: T ? T.ganancia : 0 });
      }
    } else if (o === "anio") {
      const m = e.prepare(`
        SELECT 
          CAST(strftime('%m', v.fecha_venta) AS INTEGER) as mes,
          COALESCE(SUM(v.cantidad_vendida * v.precio_unitario_real - COALESCE(v.descuento_aplicado, 0)), 0) as ganancia
        FROM ventas v
        JOIN productos p ON v.folio_producto = p.folio_producto
        WHERE p.proveedor = ? AND DATE(v.fecha_venta) >= DATE(?) AND DATE(v.fecha_venta) <= DATE(?)
        GROUP BY strftime('%m', v.fecha_venta)
      `).all(v, d, p);
      for (let f = 1; f <= 12; f++) {
        const S = m.find((T) => T.mes === f);
        u.push({ x: _[f - 1], y: S ? S.ganancia : 0 });
      }
    }
    const E = u.reduce((m, f) => m + f.y, 0);
    n[v] = { puntos: u, total: E };
  }
  return n;
});
l.handle("get-top-proveedores-vendidos", (c, a = 5) => e.prepare(`
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
  `).all(a));
l.handle("get-clientes-con-saldo", () => e.prepare(`
    SELECT 
      id_cliente,
      nombre_completo,
      telefono,
      saldo_pendiente,
      estado_cuenta
    FROM clientes
    WHERE saldo_pendiente > 0
    ORDER BY saldo_pendiente DESC
  `).all());
l.handle("get-inventario-kpis", () => {
  try {
    const c = e.prepare(`
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
    `).get(), a = e.prepare(`
      SELECT 
        COUNT(DISTINCT p.folio_producto) as total_productos,
        COALESCE(SUM(tp.cantidad), 0) as total_unidades,
        COUNT(DISTINCT p.categoria) as total_categorias
      FROM productos p
      LEFT JOIN tallas_producto tp ON p.folio_producto = tp.folio_producto
    `).get(), t = e.prepare(`
      SELECT COUNT(*) as cantidad
      FROM productos
      WHERE stock_actual <= stock_minimo AND stock_actual > 0
    `).get(), o = e.prepare(`
      SELECT COUNT(*) as cantidad
      FROM productos
      WHERE stock_actual = 0
    `).get();
    return {
      valorInventarioCosto: (c == null ? void 0 : c.valor_costo) || 0,
      valorInventarioVenta: (c == null ? void 0 : c.valor_venta) || 0,
      gananciaProyectada: ((c == null ? void 0 : c.valor_venta) || 0) - ((c == null ? void 0 : c.valor_costo) || 0),
      totalProductos: (a == null ? void 0 : a.total_productos) || 0,
      totalUnidades: (a == null ? void 0 : a.total_unidades) || 0,
      totalCategorias: (a == null ? void 0 : a.total_categorias) || 0,
      productosBajoStock: (t == null ? void 0 : t.cantidad) || 0,
      productosSinStock: (o == null ? void 0 : o.cantidad) || 0
    };
  } catch (c) {
    return console.error("Error al obtener KPIs de inventario:", c), {
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
l.handle("get-productos-bajo-stock", () => {
  try {
    return e.prepare(`
      SELECT 
        categoria,
        SUM(stock_actual) as stock_actual,
        SUM(stock_minimo) as stock_minimo,
        COUNT(*) as total_productos
      FROM productos
      GROUP BY categoria
      HAVING SUM(stock_actual) <= SUM(stock_minimo)
      ORDER BY stock_actual ASC
    `).all();
  } catch (c) {
    throw console.error("Error al obtener productos bajo stock:", c), c;
  }
});
l.handle("update-stock-minimo", (c, { folio_producto: a, stock_minimo: t }) => {
  try {
    return e.prepare(`
      UPDATE productos 
      SET stock_minimo = ?
      WHERE folio_producto = ?
    `).run(t, a), { success: !0 };
  } catch (o) {
    throw console.error("Error al actualizar stock mínimo:", o), o;
  }
});
l.handle("get-inventario-por-categoria", () => {
  try {
    return e.prepare(`
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
    `).all().map((a) => ({
      categoria: a.categoria,
      numProductos: a.num_productos,
      totalUnidades: a.total_unidades,
      valorCosto: a.valor_costo,
      valorVenta: a.valor_venta,
      gananciaProyectada: a.valor_venta - a.valor_costo
    }));
  } catch (c) {
    return console.error("Error al obtener inventario por categoría:", c), [];
  }
});
l.handle("get-productos-por-categoria", (c, a) => {
  try {
    return e.prepare(`
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
    `).all(a).map((n) => ({
      ...n,
      tallas_detalle: n.tallas_detalle ? JSON.parse(n.tallas_detalle) : []
    }));
  } catch (t) {
    return console.error("Error al obtener productos por categoría:", t), [];
  }
});
l.handle("get-movimientos-inventario-recientes", (c, a = 20) => {
  try {
    return e.prepare(`
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
    `).all(a);
  } catch (t) {
    return console.error("Error al obtener movimientos de inventario:", t), [];
  }
});
l.handle("get-entradas-kpis", () => {
  try {
    const c = /* @__PURE__ */ new Date(), a = new Date(c.getFullYear(), c.getMonth(), 1).toISOString().split("T")[0], t = new Date(c.getFullYear(), 0, 1).toISOString().split("T")[0], o = c.toISOString().split("T")[0], n = e.prepare(`
      SELECT 
        COUNT(*) as num_entradas,
        COALESCE(SUM(cantidad_recibida), 0) as total_unidades,
        COALESCE(SUM(cantidad_recibida * costo_unitario_proveedor), 0) as inversion_total,
        COALESCE(SUM(cantidad_recibida * precio_unitario_base), 0) as valor_venta
      FROM entradas
      WHERE DATE(fecha_entrada) >= DATE(?) AND DATE(fecha_entrada) <= DATE(?)
        AND tipo_movimiento IN ('Entrada Inicial', 'Reabastecimiento')
    `).get(a, o), i = e.prepare(`
      SELECT 
        COUNT(*) as num_entradas,
        COALESCE(SUM(cantidad_recibida), 0) as total_unidades,
        COALESCE(SUM(cantidad_recibida * costo_unitario_proveedor), 0) as inversion_total,
        COALESCE(SUM(cantidad_recibida * precio_unitario_base), 0) as valor_venta
      FROM entradas
      WHERE DATE(fecha_entrada) >= DATE(?) AND DATE(fecha_entrada) <= DATE(?)
        AND tipo_movimiento IN ('Entrada Inicial', 'Reabastecimiento')
    `).get(t, o), r = e.prepare(`
      SELECT 
        COUNT(*) as num_entradas,
        COALESCE(SUM(cantidad_recibida), 0) as total_unidades,
        COALESCE(SUM(cantidad_recibida * costo_unitario_proveedor), 0) as inversion_total,
        COALESCE(SUM(cantidad_recibida * precio_unitario_base), 0) as valor_venta
      FROM entradas
      WHERE tipo_movimiento IN ('Entrada Inicial', 'Reabastecimiento')
    `).get(), s = e.prepare(`
      SELECT COUNT(DISTINCT folio_producto) as cantidad
      FROM entradas
      WHERE DATE(fecha_entrada) >= DATE(?) AND DATE(fecha_entrada) <= DATE(?)
        AND tipo_movimiento = 'Entrada Inicial'
    `).get(a, o), d = e.prepare(`
      SELECT COUNT(DISTINCT p.proveedor) as cantidad
      FROM productos p
      INNER JOIN entradas e ON p.folio_producto = e.folio_producto
      WHERE DATE(e.fecha_entrada) >= DATE(?) AND DATE(e.fecha_entrada) <= DATE(?)
        AND e.tipo_movimiento IN ('Entrada Inicial', 'Reabastecimiento')
    `).get(a, o), p = e.prepare("SELECT COUNT(DISTINCT folio_producto) as cantidad FROM entradas").get(), _ = e.prepare("SELECT COUNT(DISTINCT proveedor) as cantidad FROM productos WHERE proveedor IS NOT NULL").get();
    return {
      mes: {
        numEntradas: (n == null ? void 0 : n.num_entradas) || 0,
        totalUnidades: (n == null ? void 0 : n.total_unidades) || 0,
        inversionTotal: (n == null ? void 0 : n.inversion_total) || 0,
        valorVenta: (n == null ? void 0 : n.valor_venta) || 0,
        gananciaProyectada: ((n == null ? void 0 : n.valor_venta) || 0) - ((n == null ? void 0 : n.inversion_total) || 0)
      },
      anio: {
        numEntradas: (i == null ? void 0 : i.num_entradas) || 0,
        totalUnidades: (i == null ? void 0 : i.total_unidades) || 0,
        inversionTotal: (i == null ? void 0 : i.inversion_total) || 0,
        valorVenta: (i == null ? void 0 : i.valor_venta) || 0,
        gananciaProyectada: ((i == null ? void 0 : i.valor_venta) || 0) - ((i == null ? void 0 : i.inversion_total) || 0)
      },
      todo: {
        numEntradas: (r == null ? void 0 : r.num_entradas) || 0,
        totalUnidades: (r == null ? void 0 : r.total_unidades) || 0,
        inversionTotal: (r == null ? void 0 : r.inversion_total) || 0,
        valorVenta: (r == null ? void 0 : r.valor_venta) || 0,
        gananciaProyectada: ((r == null ? void 0 : r.valor_venta) || 0) - ((r == null ? void 0 : r.inversion_total) || 0)
      },
      productosNuevosMes: (s == null ? void 0 : s.cantidad) || 0,
      proveedoresActivosMes: (d == null ? void 0 : d.cantidad) || 0,
      totalProductos: (p == null ? void 0 : p.cantidad) || 0,
      totalProveedores: (_ == null ? void 0 : _.cantidad) || 0
    };
  } catch (c) {
    return console.error("Error al obtener KPIs de entradas:", c), {
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
l.handle("get-entradas-por-categoria", () => {
  try {
    return e.prepare(`
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
  } catch (c) {
    return console.error("Error al obtener entradas por categoría:", c), [];
  }
});
l.handle("get-entradas-recientes", (c, a = 20) => {
  try {
    return e.prepare(`
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
    `).all(a);
  } catch (t) {
    return console.error("Error al obtener entradas recientes:", t), [];
  }
});
l.handle("get-entradas-por-proveedor", () => {
  try {
    const c = /* @__PURE__ */ new Date(), a = new Date(c.getFullYear(), c.getMonth(), 1).toISOString().split("T")[0], t = c.toISOString().split("T")[0];
    return e.prepare(`
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
    `).all(a, t);
  } catch (c) {
    return console.error("Error al obtener entradas por proveedor:", c), [];
  }
});
l.handle("registrar-entrada-multiple-tallas", (c, a) => {
  const { folio_producto: t, esNuevo: o, producto: n, tallas: i, responsable: r, observaciones: s } = a, d = e.transaction(() => {
    const p = (/* @__PURE__ */ new Date()).toISOString();
    o && n && e.prepare(`
        INSERT INTO productos (
          folio_producto, nombre_producto, categoria, genero_destino,
          stock_actual, stock_minimo, proveedor, observaciones
        ) VALUES (
          @folio_producto, @nombre_producto, @categoria, @genero_destino,
          0, 5, @proveedor, @observaciones
        )
      `).run(n);
    for (const _ of i) {
      if (_.cantidad <= 0) continue;
      e.prepare(`
        INSERT INTO entradas (
          fecha_entrada, folio_producto, cantidad_recibida, talla,
          costo_unitario_proveedor, precio_unitario_base,
          tipo_movimiento, responsable_recepcion, observaciones_entrada
        ) VALUES (
          @fecha, @folio, @cantidad, @talla,
          @costo, @precio,
          @tipo, @responsable, @observaciones
        )
      `).run({
        fecha: p,
        folio: t,
        cantidad: _.cantidad,
        talla: _.talla,
        costo: _.costo,
        precio: _.precio,
        tipo: o ? "Entrada Inicial" : "Reabastecimiento",
        responsable: r || null,
        observaciones: s || null
      }), e.prepare(`
        UPDATE productos 
        SET stock_actual = stock_actual + @cantidad,
            fecha_ultima_actualizacion = CURRENT_TIMESTAMP
        WHERE folio_producto = @folio
      `).run({ cantidad: _.cantidad, folio: t }), e.prepare(`
        INSERT INTO tallas_producto (folio_producto, talla, cantidad)
        VALUES (@folio, @talla, @cantidad)
        ON CONFLICT(folio_producto, talla) DO UPDATE SET
          cantidad = cantidad + @cantidad,
          fecha_actualizacion = CURRENT_TIMESTAMP
      `).run({ folio: t, talla: _.talla, cantidad: _.cantidad });
    }
  });
  try {
    return d(), { success: !0 };
  } catch (p) {
    throw console.error("Error al registrar entrada con múltiples tallas:", p), p;
  }
});
l.handle("get-ventas-kpis-hoy", () => {
  try {
    const c = /* @__PURE__ */ new Date(), a = c.getFullYear(), t = String(c.getMonth() + 1).padStart(2, "0"), o = String(c.getDate()).padStart(2, "0"), n = `${a}-${t}-${o}`, i = n + " 00:00:00", r = n + " 23:59:59", s = e.prepare(`
      SELECT COUNT(*) as num_ventas
      FROM ventas
      WHERE fecha_venta >= ? AND fecha_venta <= ?
    `).get(i, r), d = (s == null ? void 0 : s.num_ventas) || 0, p = e.prepare(`
      SELECT COALESCE(SUM(
        (precio_unitario_real - COALESCE(descuento_aplicado, 0)) * cantidad_vendida
      ), 0) as total
      FROM ventas
      WHERE tipo_salida = 'Venta'
        AND fecha_venta >= ? AND fecha_venta <= ?
    `).get(i, r), _ = (p == null ? void 0 : p.total) || 0, v = e.prepare(`
      SELECT COALESCE(SUM(monto), 0) as total
      FROM movimientos_cliente
      WHERE lower(tipo_movimiento) = 'abono'
        AND fecha >= ? AND fecha <= ?
    `).get(i, r), u = (v == null ? void 0 : v.total) || 0, E = _ + u, m = d > 0 ? E / d : 0;
    return console.log(`[KPIs] Fecha: ${n}, Ventas: ${d}, Cobrado: ${_}, Abonos: ${u}, Total: ${E}`), {
      ventasHoy: d,
      totalCobrado: E,
      pendientesHoy: 0,
      ticketPromedio: m
    };
  } catch (c) {
    return console.error("Error al obtener KPIs de ventas:", c), {
      ventasHoy: 0,
      totalCobrado: 0,
      pendientesHoy: 0,
      ticketPromedio: 0
    };
  }
});
l.handle("get-ventas-recientes", (c, a = 15) => {
  try {
    return e.prepare(`
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
    `).all(a).map((o) => ({
      ...o,
      total: (o.precio_unitario_real - (o.descuento_aplicado || 0)) * o.cantidad_vendida
    }));
  } catch (t) {
    return console.error("Error al obtener ventas recientes:", t), [];
  }
});
let D;
function P() {
  D = new U({
    icon: A.join(Y, "electron-vite.svg"),
    webPreferences: {
      preload: A.join(F, "preload.mjs")
    }
  }), D.webContents.on("did-finish-load", () => {
    D == null || D.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString("es-ES"));
  }), g ? D.loadURL(g) : D.loadFile(A.join(H, "index.html"));
}
h.on("window-all-closed", () => {
  process.platform !== "darwin" && (h.quit(), D = null);
});
h.on("activate", () => {
  U.getAllWindows().length === 0 && P();
});
h.whenReady().then(P);
export {
  K as MAIN_DIST,
  H as RENDERER_DIST,
  g as VITE_DEV_SERVER_URL
};
