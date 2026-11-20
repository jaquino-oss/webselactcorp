# Catálogo público: integración con NAV BI

Este módulo agrega dos rutas **públicas y de solo lectura** a tu servicio Express (`index.js`):

| Ruta | Para qué sirve |
|---|---|
| `GET /api/public/catalogo?buscar=&marca=&categoria=&page=1&limit=24` | Lista paginada de productos |
| `GET /api/public/catalogo/filtros` | Marcas y categorías disponibles, con conteo |

## Qué filtra

Solo aparecen los artículos de la empresa **SELACT** que cumplen todo esto:

- Existencia > 0, calculada con `SUM(Quantity)` en `Item Ledger Entry`.
- `Item.Blocked = 0`.
- La descripción no termina en `*`, que es la misma convención que usan tus reportes de rotación.

## Qué NO expone

- Cantidades de inventario.
- Costos.
- Clientes.
- Vendedores.
- Precios, salvo que los actives (ver más abajo).

El nombre de la empresa está fijo en el código y no se toma de la URL. Las respuestas se guardan en caché 5 minutos para no cargar SQL Server.

## Instalación (3 pasos)

1. Copia `catalogo-publico.js` en la misma carpeta que `index.js`.
2. En `index.js`, **justo antes de `app.listen(...)`**, agrega esta línea. Tiene que ir después de que se declaren `dbConfig` y `obtenerRutaImagen`.
   ```js
   require('./catalogo-publico')(app, sql, dbConfig, obtenerRutaImagen);
   ```
3. Reinicia el servicio y prueba en el navegador:
   `http://TU_SERVIDOR:3002/api/public/catalogo?limit=5`

## Limpieza de marcas y filtro por grupo

- **Marcas:** se agrupan sin importar mayúsculas ni espacios. Por ejemplo, "Generica" y "GENERICA" cuentan como una sola.
- **Marcas que se ocultan:**
  - Las genéricas, como Generica, Generico o Sin marca.
  - Las que son solo números, como "62900".
  - Las que tienen menos de `CATALOGO_MARCA_MINIMO` artículos (por defecto 3).
  - Las que pongas en la lista de exclusión del `.env`.
- **Filtro "Tipo de producto":** usa `Product Group Code`. Muestra la descripción de la tabla `Product Group` si existe; si no, muestra el código.

Opciones en el `.env`:
```
CATALOGO_MARCA_MINIMO=3
CATALOGO_MARCAS_EXCLUIR=MEDIDAS 375*160*470MM,DESTONILLADOR DE IMPACTO
```

## Mostrar precios (opcional)

Agrega esta línea en el `.env`:
```
CATALOGO_MOSTRAR_PRECIOS=true
```

## Conectar la página web

En `js/config.js` de la página, pon la URL pública del servicio:
```js
apiUrl: "https://api.selactcorp.com",
```

Si la página se publica con **https**, el API también debe estar en **https**. Si no, el navegador bloquea las llamadas por "contenido mixto". Tienes dos opciones:

- Publicar el servicio detrás de un proxy con SSL: IIS con ARR, Nginx o Cloudflare Tunnel.
- Usar un subdominio, por ejemplo `api.selactcorp.com`.

Las imágenes de los productos salen de la ruta que ya existe, `/api/productos/imagen/:codigo`, que usa la carpeta `IMAGE_DIR`.

## Si tu versión de NAV usa otro campo de bloqueo

Algunas versiones tienen también `[Sales Blocked]`. Si quieres excluir esos artículos, agrega esta condición en `BASE_CTE` dentro de `catalogo-publico.js`:
```sql
AND I.[Sales Blocked] = 0
```
