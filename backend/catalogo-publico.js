// ==========================================================================
// MÓDULO: CATÁLOGO PÚBLICO PARA LA PÁGINA WEB (SIN AUTENTICACIÓN)
// --------------------------------------------------------------------------
// Expone SOLO lectura de artículos de la empresa SELACT que:
//   • tengan existencia (> 0) en Item Ledger Entry
//   • NO estén bloqueados (Item.Blocked = 0)
//   • NO terminen en '*' en la descripción (convención de descontinuados)
//
// Limpieza de datos para la web:
//   • Marcas normalizadas (sin importar mayúsculas/espacios) y agrupadas.
//   • Marcas genéricas (Generica, Generico, Sin marca...) se tratan como "sin marca".
//   • Solo se publican como marca los valores con un mínimo de artículos y que
//     no sean solo números (ej. "62900"). Configurable por .env.
//   • El filtro principal es el Grupo de producto (Product Group Code), con su
//     descripción de la tabla Product Group si existe.
//
// Variables opcionales en .env:
//   CATALOGO_MOSTRAR_PRECIOS=true
//   CATALOGO_MARCA_MINIMO=3                   (artículos mínimos para mostrar una marca)
//   CATALOGO_MARCAS_EXCLUIR=MEDIDAS,DESTONILLADOR DE IMPACTO   (lista separada por comas)
//
// USO (en index.js, DESPUÉS de declarar dbConfig y obtenerRutaImagen):
//   require('./catalogo-publico')(app, sql, dbConfig, obtenerRutaImagen);
// ==========================================================================

const EMPRESA = 'SELACT'; // Fijo: nunca se toma de la URL
const CACHE_MS = 5 * 60 * 1000;
const MAX_LIMIT = 60;

// Variantes que se consideran "sin marca"
const MARCAS_GENERICAS = ['GENERICA', 'GENERICO', 'GENERICOS', 'GENERICAS', 'GENÉRICA', 'GENÉRICO',
    'SIN MARCA', 'S/M', 'N/A', 'NA', 'VARIOS', 'VARIAS', 'OTRA', 'OTRAS', 'OTROS', '-', '.'];

module.exports = function registrarCatalogoPublico(app, sql, dbConfig, obtenerRutaImagen) {
    const mostrarPrecios = String(process.env.CATALOGO_MOSTRAR_PRECIOS).toLowerCase() === 'true';
    const marcaMinimo = Math.max(parseInt(process.env.CATALOGO_MARCA_MINIMO) || 3, 1);
    const marcasExcluir = new Set(
        String(process.env.CATALOGO_MARCAS_EXCLUIR || '')
            .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    );
    const genericas = new Set(MARCAS_GENERICAS);
    // Grupos con menos artículos que esto no aparecen como filtro (siguen visibles en "Todas")
    const grupoMinimo = Math.max(parseInt(process.env.CATALOGO_GRUPO_MINIMO) || 3, 1);

    // Se detecta en la primera consulta si existe la tabla Product Group
    let usarTablaGrupo = true;

    const cache = new Map();
    const desdeCache = async (clave, fn) => {
        const hit = cache.get(clave);
        if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
        const v = await fn();
        cache.set(clave, { t: Date.now(), v });
        if (cache.size > 500) cache.delete(cache.keys().next().value);
        return v;
    };

    const MARCA_NORM = `UPPER(LTRIM(RTRIM(ISNULL(D.[Marca], ''))))`;
    const GRUPO_NORM = `UPPER(LTRIM(RTRIM(ISNULL(D.[Product Group Code], ''))))`;

    const BASE_CTE = `
        WITH INV AS (
            SELECT [Item No_], SUM([Quantity]) AS Qty
            FROM [${EMPRESA}$Item Ledger Entry] WITH (NOLOCK)
            GROUP BY [Item No_]
            HAVING SUM([Quantity]) > 0
        ),
        D AS (
            SELECT I.*
            FROM [${EMPRESA}$Item] I WITH (NOLOCK)
            INNER JOIN INV ON INV.[Item No_] = I.[No_]
            WHERE I.[Blocked] = 0
              AND RTRIM(I.[Description]) <> ''
              AND RTRIM(I.[Description]) NOT LIKE '%*'
        )
    `;

    const esMarcaValida = (marca, cantidad) =>
        marca &&
        !genericas.has(marca) &&
        !marcasExcluir.has(marca) &&
        !/^[\d\s.\-\/]+$/.test(marca) && // solo números → no es marca
        cantidad >= marcaMinimo;

    // ----------------------------------------------------------------------
    // Filtros (marcas válidas + grupos de producto). Cacheado.
    // ----------------------------------------------------------------------
    const consultarGrupos = async (pool) => {
        const conTabla = `
            ${BASE_CTE}
            SELECT ${GRUPO_NORM} AS Val,
                   MAX(LTRIM(RTRIM(ISNULL(PG.[Description], '')))) AS Descr,
                   COUNT(*) AS N
            FROM D
            LEFT JOIN [${EMPRESA}$Product Group] PG WITH (NOLOCK)
                   ON PG.[Code] = D.[Product Group Code] AND PG.[Item Category Code] = D.[Item Category Code]
            WHERE ${GRUPO_NORM} <> ''
            GROUP BY ${GRUPO_NORM}`;
        const sinTabla = `
            ${BASE_CTE}
            SELECT ${GRUPO_NORM} AS Val, '' AS Descr, COUNT(*) AS N
            FROM D
            WHERE ${GRUPO_NORM} <> ''
            GROUP BY ${GRUPO_NORM}`;

        if (usarTablaGrupo) {
            try {
                return (await pool.request().query(conTabla)).recordset;
            } catch (e) {
                console.warn('[catalogo-publico] Tabla Product Group no disponible, se usan los códigos:', e.message);
                usarTablaGrupo = false;
            }
        }
        return (await pool.request().query(sinTabla)).recordset;
    };

    const obtenerFiltros = () =>
        desdeCache('__filtros__', async () => {
            const pool = await sql.connect(dbConfig);
            const [marcasRs, gruposRs] = await Promise.all([
                pool.request().query(`
                    ${BASE_CTE}
                    SELECT ${MARCA_NORM} AS Val, COUNT(*) AS N
                    FROM D
                    GROUP BY ${MARCA_NORM}`).then((r) => r.recordset),
                consultarGrupos(pool),
            ]);

            const marcas = marcasRs
                .filter((r) => esMarcaValida(r.Val, r.N))
                .sort((a, b) => b.N - a.N || a.Val.localeCompare(b.Val))
                .map((r) => ({ valor: r.Val, cantidad: r.N }));

            const grupos = gruposRs
                .filter((r) => r.N >= grupoMinimo)
                .map((r) => ({ valor: r.Val, label: titulo(r.Descr || r.Val), cantidad: r.N }))
                .sort((a, b) => a.label.localeCompare(b.label, 'es'));

            return { success: true, mostrarPrecios, marcas, grupos, _marcasSet: new Set(marcas.map((m) => m.valor)) };
        });

    // "ABANICOS DE PARED" → "Abanicos de pared"
    function titulo(s) {
        s = String(s || '').trim();
        if (!s) return '';
        const l = s.toLocaleLowerCase('es');
        return l.charAt(0).toLocaleUpperCase('es') + l.slice(1);
    }

    // Quita comillas sobrantes al inicio/fin de la descripción
    // (las comillas de pulgadas, ej. 1/2", se conservan)
    const limpiarDescripcion = (s) => {
        s = String(s || '').trim();
        if (/^".+"$/.test(s)) s = s.slice(1, -1);
        else s = s.replace(/^["']+(?=[A-Za-zÁÉÍÓÚÑ0-9])/, '');
        return s.trim();
    };

    // ----------------------------------------------------------------------
    // GET /api/public/catalogo?buscar=&marca=&grupo=&page=1&limit=24
    // ----------------------------------------------------------------------
    app.get('/api/public/catalogo', async (req, res) => {
        const buscar = String(req.query.buscar || '').trim().slice(0, 80);
        const marca = String(req.query.marca || '').trim().toUpperCase().slice(0, 60);
        const grupo = String(req.query.grupo || '').trim().toUpperCase().slice(0, 40);
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 24, 1), MAX_LIMIT);

        const clave = JSON.stringify({ buscar, marca, grupo, page, limit });

        try {
            const filtros = await obtenerFiltros();
            const payload = await desdeCache(clave, async () => {
                const pool = await sql.connect(dbConfig);
                const request = pool.request();
                request.input('offset', sql.Int, (page - 1) * limit);
                request.input('limit', sql.Int, limit);

                let where = '1=1';
                if (marca && marca !== 'TODOS') {
                    where += ` AND ${MARCA_NORM} = @marca`;
                    request.input('marca', sql.VarChar, marca);
                }
                if (grupo && grupo !== 'TODOS') {
                    where += ` AND ${GRUPO_NORM} = @grupo`;
                    request.input('grupo', sql.VarChar, grupo);
                }
                if (buscar) {
                    buscar.split(/\s+/).slice(0, 5).forEach((palabra, i) => {
                        where += ` AND (D.[No_] LIKE @b${i} OR D.[Description] LIKE @b${i} OR D.[Referencia] LIKE @b${i} OR D.[Marca] LIKE @b${i})`;
                        request.input(`b${i}`, sql.VarChar, `%${palabra}%`);
                    });
                }

                const query = `
                    ${BASE_CTE}
                    SELECT
                        RTRIM(D.[No_]) AS Codigo,
                        RTRIM(D.[Description]) AS Descripcion,
                        ISNULL(RTRIM(D.[Referencia]), '') AS Referencia,
                        ${GRUPO_NORM} AS Grupo,
                        ${MARCA_NORM} AS Marca,
                        ISNULL(RTRIM(D.[Base Unit of Measure]), 'UD') AS Unidad,
                        CAST(D.[Unit Price] AS FLOAT) AS Precio,
                        COUNT(*) OVER () AS Total
                    FROM D
                    WHERE ${where}
                    ORDER BY LTRIM(REPLACE(REPLACE(D.[Description], '"', ''), '''', '')) ASC
                    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
                `;

                const result = await request.query(query);
                const total = result.recordset.length ? result.recordset[0].Total : 0;
                const etiquetasGrupo = new Map(filtros.grupos.map((g) => [g.valor, g.label]));

                return {
                    success: true,
                    page,
                    limit,
                    total,
                    pages: Math.max(Math.ceil(total / limit), 1),
                    data: result.recordset.map((r) => {
                        const item = {
                            codigo: r.Codigo,
                            descripcion: limpiarDescripcion(r.Descripcion),
                            referencia: r.Referencia === 'N/A' ? '' : r.Referencia,
                            grupo: etiquetasGrupo.get(r.Grupo) || '',
                            // Solo se muestra la marca si es una marca "válida"
                            marca: filtros._marcasSet.has(r.Marca) ? r.Marca : '',
                            unidad: r.Unidad,
                            imagen: obtenerRutaImagen(r.Codigo)
                                ? `/api/productos/imagen/${encodeURIComponent(r.Codigo)}`
                                : null,
                        };
                        if (mostrarPrecios) item.precio = r.Precio;
                        return item;
                    }),
                };
            });

            res.set('Cache-Control', 'public, max-age=120');
            res.json(payload);
        } catch (error) {
            console.error('[catalogo-publico]', error.message);
            res.status(500).json({ success: false, message: 'No se pudo cargar el catálogo.' });
        }
    });

    // ----------------------------------------------------------------------
    // GET /api/public/catalogo/filtros
    // ----------------------------------------------------------------------
    app.get('/api/public/catalogo/filtros', async (req, res) => {
        try {
            const { _marcasSet, ...payload } = await obtenerFiltros();
            res.set('Cache-Control', 'public, max-age=300');
            res.json(payload);
        } catch (error) {
            console.error('[catalogo-publico]', error.message);
            res.status(500).json({ success: false, message: 'No se pudieron cargar los filtros.' });
        }
    });

    console.log('Catálogo público (/api/public/catalogo) registrado.');
};
