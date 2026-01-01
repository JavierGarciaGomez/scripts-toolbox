# CeX API Research

## Resumen

Se investigaron múltiples formas de obtener precios de juegos en CeX (es.webuy.com).

**Mejor opción: Algolia API** - Rápida, pública, tiene todos los precios.

---

## APIs Probadas

### 1. Algolia Search API (RECOMENDADA)

**Endpoint:**
```
POST https://search.webuy.io/1/indexes/prod_cex_es/query
```

**Headers:**
```
x-algolia-api-key: bf79f2b6699e60a18ae330a1248b452c
x-algolia-application-id: LNNFEEWZVA
Content-Type: application/json
```

**Body ejemplo:**
```json
{
  "query": "Elden Ring",
  "hitsPerPage": 5,
  "attributesToRetrieve": [
    "boxId",
    "boxName",
    "categoryName",
    "sellPrice",
    "cashPriceCalculated",
    "exchangePriceCalculated"
  ]
}
```

**Velocidad:**
- Individual: ~150-200ms por búsqueda
- Paralelo (5 juegos): ~220ms total
- Secuencial (5 juegos): ~1000ms total

**Índices disponibles:**
- `prod_cex_es` - España (€)
- `prod_cex_uk` - Reino Unido (£)

---

### 2. API Directa CeX (detalle)

**Endpoint:**
```
GET https://wss2.cex.es.webuy.io/v3/boxes/{boxId}/detail
```

**Notas:**
- Requiere boxId (obtenerlo primero de Algolia)
- Puede requerir cookies/headers específicos
- Más lenta, requiere 2 llamadas

**NO RECOMENDADA** - Algolia ya tiene todos los campos necesarios.

---

## Campos de Precio en Algolia

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `sellPrice` | Precio de venta al público | 25€ |
| `cashPriceCalculated` | Te pagan en efectivo | 11€ |
| `exchangePriceCalculated` | Te pagan en voucher/crédito | 15€ |
| `firstPrice` | Precio original/inicial | 68€ |
| `previousPrice` | Precio anterior | 28€ |

**Nota:** `cashBuyPrice` y `exchangePrice` existen pero a veces están en 0. Usar los campos `*Calculated` en su lugar.

---

## Otros Campos Útiles

| Campo | Descripción |
|-------|-------------|
| `boxId` | ID único del producto |
| `boxName` | Nombre del producto |
| `categoryName` | Categoría (PS5 Juegos, Xbox, etc) |
| `categoryFriendlyName` | Categoría legible |
| `availability` | Disponibilidad |
| `ecomQuantity` | Cantidad en stock online |
| `stores` | Array de tiendas con stock |
| `rating` | Valoración |
| `imageUrls` | URLs de imágenes |

---

## Ejemplo de Uso (curl)

```bash
curl -s 'https://search.webuy.io/1/indexes/prod_cex_es/query?x-algolia-api-key=bf79f2b6699e60a18ae330a1248b452c&x-algolia-application-id=LNNFEEWZVA' \
  -H 'content-type: application/json' \
  --data-raw '{
    "query":"Elden Ring",
    "hitsPerPage":3,
    "attributesToRetrieve":["boxName","sellPrice","cashPriceCalculated","exchangePriceCalculated","categoryName"]
  }'
```

---

## Ejemplo de Uso (TypeScript)

```typescript
interface CexSearchResult {
  boxId: string;
  boxName: string;
  categoryName: string;
  sellPrice: number;
  cashPriceCalculated: number;
  exchangePriceCalculated: number;
}

async function searchCex(query: string): Promise<CexSearchResult[]> {
  const response = await fetch(
    'https://search.webuy.io/1/indexes/prod_cex_es/query?' +
    'x-algolia-api-key=bf79f2b6699e60a18ae330a1248b452c&' +
    'x-algolia-application-id=LNNFEEWZVA',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        hitsPerPage: 5,
        attributesToRetrieve: [
          'boxId', 'boxName', 'categoryName',
          'sellPrice', 'cashPriceCalculated', 'exchangePriceCalculated'
        ]
      })
    }
  );

  const data = await response.json();
  return data.hits;
}
```

---

## Búsqueda en Paralelo (Recomendado para listas grandes)

Para buscar múltiples juegos, ejecutar en paralelo reduce el tiempo significativamente:

- 5 juegos secuencial: ~1000ms
- 5 juegos paralelo: ~220ms (4.5x más rápido)

```typescript
async function searchMultiple(games: string[]): Promise<Map<string, CexSearchResult>> {
  const results = new Map();

  await Promise.all(
    games.map(async (game) => {
      const hits = await searchCex(game);
      if (hits.length > 0) {
        results.set(game, hits[0]);
      }
    })
  );

  return results;
}
```

---

## Limitaciones

1. **Rate limiting**: No detectado, pero usar con moderación
2. **API key pública**: Puede cambiar en el futuro
3. **Matching de nombres**: El primer resultado puede no ser exacto (ej: "Zelda" → "Legend of Zelda: Breath of the Wild")

---

## Plan de Implementación

1. Crear `cex-search.ts` con función de búsqueda
2. Integrar con Excel existente de juegos
3. Agregar columnas: `cex_sell_price`, `cex_cash_price`, `cex_exchange_price`
4. Ejecutar en paralelo para velocidad óptima
