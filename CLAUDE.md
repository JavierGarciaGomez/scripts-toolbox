# Documentación para Claude - Proyecto Scripts

## Contexto del Proyecto

Este es un **proyecto misceláneo** (misc) que contiene scripts específicos y puntuales para diferentes necesidades. No es un proyecto con un propósito único, sino una colección de utilidades diversas.

## Estructura del Proyecto

```
scripts/
├── src/
│   └── scripts/
│       ├── metacritic-to-excel.ts          # Scraper de Metacritic a Excel
│       ├── metacritic-to-excel-original.ts # Versión original del scraper
│       ├── json-to-excel.ts                # Convertidor JSON a Excel
│       ├── hltb-search.ts                  # Búsqueda de tiempos en HowLongToBeat
│       ├── types.ts                        # Tipos compartidos
│       └── payroll-summary/
│           └── process-payroll-summary.ts  # Procesamiento de nóminas
├── data/                                   # Carpeta para datos de entrada/salida
├── dist/                                   # Archivos compilados
├── package.json                            # Dependencias y scripts npm
└── README.md                               # Documentación del scraper de Metacritic
```

## Scripts Disponibles

### 1. Metacritic Scraper (`metacritic-to-excel.ts`)

- **Propósito**: Obtener datos de juegos desde la API de Metacritic
- **Output**: Archivos Excel (.xlsx) y JSON con información de juegos
- **Características**:
  - Rate limiting y retry logic
  - Funcionalidad de resume
  - Soporte para rangos de años
  - Modo slow para evitar bloqueos
- **Comando**: `npm run scrape [year1] [year2] [--options]`

### 2. HowLongToBeat Scripts

#### 2a. HowLongToBeat Puppeteer (`hltb-puppeteer.ts`) - **✅ RECOMENDADO - FUNCIONA**

- **Propósito**: Búsqueda automática usando navegador Chrome real (Puppeteer)
- **Output**: Excel y JSON con tiempos (Main, Main+Extra, Completionist)
- **Características**:
  - Usa navegador real para evitar detección
  - Cierra automáticamente popup de cookies
  - Delays aleatorios para simular humano
  - Procesa múltiples juegos en una ejecución
- **Uso**:
  - Un juego: `npm run hltb-auto "Hades"`
  - Múltiples juegos: `npm run hltb-auto "Hades" "Celeste" "Portal"`
  - Desde archivo: `npm run hltb-auto --file games.txt`
- **Tasa de éxito**: ~80% (algunos juegos pueden dar timeout)
- **Velocidad**: ~10-15 segundos por juego

#### 2b. HowLongToBeat CSV Import (`hltb-from-csv.ts`) - **ALTERNATIVA MANUAL**

- **Propósito**: Importar datos desde CSV cuando la automatización falla
- **Uso**:
  - Crear ejemplo: `npm run hltb-csv --example`
  - Importar: `npm run hltb-csv data/hltb-example.csv`
- **Formato CSV**:
  ```csv
  name,main,main_extra,completionist,platforms
  "Game Name",25,50,100,"PC, Switch"
  ```

#### 2c. Otros Scripts (No Recomendados)

- **`hltb-search.ts`**: Librería howlongtobeat - Bloqueado (403)
- **`hltb-direct.ts`**: API directa - Bloqueado (403)

**Resumen**: Usa `npm run hltb-auto` para automatización completa. Si algún juego falla, usa el script CSV para esos casos específicos.

### 3. Payroll Summary (`process-payroll-summary.ts`)

- **Propósito**: Procesar resúmenes de nóminas
- **Comando**: `npm run payroll-summary`

### 4. JSON to Excel (`json-to-excel.ts`)

- **Propósito**: Convertir archivos JSON a Excel

## Dependencias Principales

- **axios**: Cliente HTTP para hacer requests a APIs
- **xlsx**: Generación y manipulación de archivos Excel
- **howlongtobeat**: API para buscar tiempos de juegos
- **TypeScript**: Lenguaje de desarrollo
- **ts-node**: Ejecución de TypeScript sin compilar

## Patrones y Convenciones

### Estructura de Scripts

Los scripts siguen este patrón general:

1. **Imports**: Librerías necesarias (axios, xlsx, fs, path)
2. **Tipos**: Interfaces TypeScript para datos estructurados
3. **Configuración**: Constantes (URLs, delays, headers, etc.)
4. **Funciones auxiliares**: fetch, transform, export
5. **Función main()**: Punto de entrada con manejo de argumentos
6. **Error handling**: Try-catch y logging apropiado

### Export de Datos

- Todos los scripts exportan tanto **Excel** como **JSON**
- Los archivos se guardan en la carpeta `data/`
- Nomenclatura: `{script-name}-{timestamp}.{xlsx|json}`

### Rate Limiting

Para scripts que hacen web scraping:
- Usar delays entre requests
- Implementar retry logic
- Configuración adjustable (modo --slow)
- Respetar límites de APIs externas

## Cómo Agregar Nuevos Scripts

1. Crear archivo en `src/scripts/{nombre-script}.ts`
2. Seguir la estructura estándar (ver patrones arriba)
3. Agregar comando en `package.json` sección `scripts`:
   ```json
   "nombre-script": "ts-node src/scripts/nombre-script.ts"
   ```
4. Instalar dependencias necesarias: `yarn add {paquete}`
5. Documentar uso básico en este archivo si es relevante

## Notas Importantes

- **No sobre-engineerizar**: Scripts deben ser directos y específicos
- **Carpeta data**: Gitignoreada, archivos temporales van aquí
- **TypeScript**: Preferir tipado fuerte para evitar errores
- **Logging**: Usar console.log para feedback al usuario
- **Errores**: Manejar apropiadamente y dar mensajes claros

## Referencias Útiles

- Metacritic API: `https://backend.metacritic.com/`
- HowLongToBeat: https://www.npmjs.com/package/howlongtobeat
- XLSX: https://docs.sheetjs.com/
