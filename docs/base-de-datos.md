# Documentación rápida de la base de datos

Guía pensada para quien se integra por primera vez. Explica qué guarda cada tabla y para qué sirve cada campo.

---

## Tabla `productos`
- `folio_producto`: folio único de la prenda; todo lo demás se cuelga de este valor.
- `nombre_producto`: nombre corto para reconocerla sin ver el folio.
- `categoria`: una de las categorías oficiales (Playera, Camisa, …, Short).
- `genero_destino`: público al que va dirigido (Hombre, Mujer, Niño, Niña).
- `estado_producto`: cómo se encuentra hoy (Disponible, Apartado, Prestado, etc.).
- `stock_minimo`: cantidad que, si se alcanza, nos avisa que hay que surtir.
- `stock_maximo`: tope deseado para no sobre comprar.
- `proveedor`: quién nos vende esa prenda normalmente.
- `fecha_ultima_actualizacion`: última vez que alguien modificó la ficha.
- `observaciones`: notas libres (colores, temporada, tela, etc.).
- Columnas de tallas (`talla_ch`, `talla_30_9`, …): cuántas piezas hay por talla específica.

---

## Tabla `entradas`
- `id_entrada`: folio interno para rastrear cada lote que ingresa.
- `fecha_entrada`: cuándo se registró la llegada.
- `folio_producto`: prenda a la que pertenece la entrada.
- `cantidad_recibida`: piezas que entraron en ese movimiento.
- `costo_unitario_proveedor`: lo que se pagó por cada pieza a proveedor.
- `precio_unitario_base`: precio normal al que se planea vender.
- `precio_unitario_promocion`: precio especial permanente para ese lote (si aplica).
- `tipo_movimiento`: etiqueta para distinguir entradas, ajustes o devoluciones.
- `responsable_recepcion`: persona que registró la entrada.
- `observaciones_entrada`: detalles como “llegó con descuento”, “daño leve”, etc.

---

## Tabla `ventas`
- `id_venta`: folio de la operación o ticket.
- `fecha_venta`: momento en el que se cobró.
- `folio_producto`: prenda que salió.
- `cantidad_vendida`: cuántas piezas de ese folio se vendieron en la operación.
- `precio_unitario_real`: precio final que pagó el cliente (incluye descuento).
- `descuento_aplicado`: campo opcional para anotar cuánto se descontó respecto al precio base.
- `tipo_salida`: Venta normal, Apartado, Crédito o Prestado.
- `id_cliente`: cliente asociado cuando la operación genera saldo.
- `responsable_caja`: quien atendió la venta.
- `notas`: comentarios sobre el ticket (reimpresión, se entregó bolsa, etc.).

---

## Tabla `estados_producto`
- `id_estado`: folio del historial.
- `folio_producto`: prenda cuyo estado cambió.
- `fecha_cambio`: cuándo ocurrió el cambio.
- `estado_anterior`: estado que tenía antes.
- `estado_nuevo`: nuevo estado (por ejemplo, “Apartado”).
- `motivo`: razón del cambio (“apartado con $200”, “prestado para prueba”).
- `responsable`: persona que registró el movimiento.

---

## Tabla `clientes`
- `id_cliente`: identificador interno del cliente.
- `nombre_completo`: cómo se llama el cliente.
- `telefono`: número para contactarlo.
- `saldo_pendiente`: cuánto debe actualmente (suma de cargos menos abonos).
- `fecha_ultimo_pago`: cuándo pagó por última vez.
- `estado_cuenta`: estado general (Al corriente, Con saldo, Moroso, Congelado).
- `notas`: datos relevantes (prefiere pago quincenal, aparta chamarras, etc.).

---

## Tabla `movimientos_cliente`
- `id_movimiento`: folio del movimiento de cuenta.
- `id_cliente`: cliente al que pertenece el cargo o abono.
- `fecha`: día en que se registró el movimiento.
- `tipo_movimiento`: `cargo` cuando el cliente debe más, `abono` cuando paga.
- `monto`: valor del cargo o abono.
- `referencia`: folio de venta, ticket o nota de abono para rastrear el origen.
- `responsable`: quien registró el movimiento.

---

### Cómo se relacionan
- Todas las operaciones usan el `folio_producto` para saber qué prenda se mueve.
- Las ventas y los movimientos de cliente se enlazan con `id_cliente` para llevar los saldos.
- El stock se calcula sumando entradas y restando ventas o mermas:

```
stock_actual = stock_inicial + entradas - ventas - mermas
```

Con esta guía cualquier persona puede identificar dónde va cada dato sin conocer detalles técnicos de SQLite.

