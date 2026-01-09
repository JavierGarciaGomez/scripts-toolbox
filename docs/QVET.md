# QVET Report Downloader

Automatización para descargar reportes desde QVET usando API directa o Puppeteer.

## 📋 Tabla de Contenidos

- [Instalación](#instalación)
- [Configuración](#configuración)
- [Uso Rápido](#uso-rápido)
- [Métodos Disponibles](#métodos-disponibles)
- [Ejemplos](#ejemplos)
- [Estructura de Archivos](#estructura-de-archivos)
- [Troubleshooting](#troubleshooting)

---

## 🚀 Instalación

```bash
# Instalar dependencias
npm install

# O con yarn
yarn install
```

## ⚙️ Configuración

### 1. Crear archivo `.env`

Copia el archivo `.env.example` y configura tus credenciales:

```bash
cp .env.example .env
```

### 2. Editar `.env`

```bash
# Credenciales QVET
QVET_USER=tu_usuario
QVET_PASS=tu_contraseña
QVET_AUTO=tu_clinica
QVET_LOCATION=tu_ubicacion
```

**IMPORTANTE:** El archivo `.env` NO se sube a git (está en `.gitignore`) por seguridad.

---

## 🎯 Uso Rápido

### Descargar reporte sin parámetros

```bash
npm run qvet-api -- 508 Proveedores
```

### Descargar reporte con parámetros

```bash
npm run qvet-api -- 716 "Listado-cierre-caja" \
  --param:DESDE_FECHA=01/12/2025 \
  --param:HASTA_FECHA=31/12/2025
```

---

## 📚 Métodos Disponibles

### Método 1: API Directa (Recomendado) ⚡

**Comando:** `npm run qvet-api`

**Ventajas:**
- ⚡ **Rápido**: 10-15 segundos
- 🔧 **Inteligente**: Detecta parámetros automáticamente
- 💾 **Eficiente**: Usa menos recursos (sin navegador)
- 📝 **Completo**: Guarda logs detallados

**Cuándo usar:**
- Producción / scripts automatizados
- Cuando conoces el ID del reporte
- Necesitas velocidad

### Método 2: Puppeteer (Navegador Real) 🌐

**Comando:** `npm run qvet-auto`

**Ventajas:**
- 🛡️ **Robusto**: Usa navegador Chrome real
- 📸 **Debug**: Toma screenshots automáticos
- 🕵️ **Detallado**: Captura todo el tráfico de red

**Cuándo usar:**
- Debugging / investigación
- Reportes nuevos que no conoces
- Cuando el método API falla

---

## 💡 Ejemplos

### Ejemplo 1: Reporte simple (sin parámetros)

```bash
# Descargar reporte de Proveedores
npm run qvet-api -- 508 Proveedores
```

**Output:**
```
✅ Reporte descargado: data/qvet/reports/Proveedores-2026-01-01T13-25-22.xlsx
📊 Tamaño: 26.23 KB
```

### Ejemplo 2: Reporte con fechas

```bash
# Listado de cierre de caja del mes de diciembre
npm run qvet-api -- 716 "Listado-cierre-caja" \
  --param:DESDE_FECHA=01/12/2025 \
  --param:HASTA_FECHA=31/12/2025
```

**Output:**
```
📅 Parámetros proporcionados:
     DESDE_FECHA = 01/12/2025
     HASTA_FECHA = 31/12/2025
✅ Reporte descargado: data/qvet/reports/Listado-cierre-caja-2026-01-01T13-21-13.xlsx
📊 Tamaño: 22.08 KB
```

### Ejemplo 3: Con Puppeteer (modo visible)

```bash
# Ver el proceso en el navegador
npm run qvet-auto "Proveedores" --no-headless
```

### Ejemplo 4: Múltiples parámetros

```bash
# Reporte con todos los parámetros
npm run qvet-api -- 999 "Mi-Reporte" \
  --param:DESDE_FECHA=01/01/2025 \
  --param:HASTA_FECHA=31/01/2025 \
  --param:CAJA=Caja1 \
  --param:CLINICA=MiClinica
```

---

## 📁 Estructura de Archivos

```
data/qvet/
├── reports/                    # 📊 Reportes Excel descargados
│   ├── Proveedores-2026-01-01.xlsx
│   └── Listado-cierre-caja-2026-01-01.xlsx
│
├── logs/                       # 📝 Logs del proceso
│   ├── api-calls-latest.json          # Última ejecución (llamadas API)
│   ├── Proveedores-2026-01-01.json    # Log detallado con timestamps
│   └── Listado-cierre-2026-01-01.json
│
└── screenshots/                # 📸 Screenshots (solo Puppeteer)
    ├── 1-before-documentos.png
    ├── 2-after-documentos.png
    ├── 3-reportes-page.png
    └── 4-after-select-report.png
```

### Contenido de los logs

#### `api-calls-latest.json`
Todas las llamadas HTTP realizadas:
```json
[
  {
    "timestamp": "2026-01-01T13:25:22.348Z",
    "method": "POST",
    "url": "https://go.qvet.net/Home/EsSAML",
    "requestData": {...},
    "responseStatus": 200,
    "duration": 139
  },
  ...
]
```

#### `{Reporte}-{timestamp}.json`
Log estructurado del proceso completo:
```json
{
  "timestamp": "2026-01-01T13:25:22.764Z",
  "reportId": "508",
  "reportName": "Proveedores",
  "steps": [...],
  "session": {
    "baseUrl": "https://v116r25-...",
    "sessionId": "...",
    "idsr": "..."
  },
  "result": {
    "success": true,
    "filePath": "...",
    "fileSize": 26858
  }
}
```

---

## 🔧 Parámetros Avanzados

### Formato de parámetros

Los parámetros siguen el formato: `--param:NOMBRE=valor`

El script es **flexible** y acepta el nombre del parámetro en diferentes formatos:

```bash
# Todos estos funcionan igual:
--param:DESDE_FECHA=01/12/2025
--param:DESDE-FECHA=01/12/2025
--param:DESDEFECHA=01/12/2025
--param:desde_fecha=01/12/2025  # Case insensitive
```

### Valores por defecto

Si un parámetro de fecha no tiene valor, usa **la fecha actual**:

```bash
# Sin especificar fechas → usa hoy
npm run qvet-api -- 716 "Listado-cierre-caja"
```

### Parámetros opcionales

Los parámetros marcados como opcionales pueden omitirse:

```bash
# Solo fechas obligatorias, CAJA y CLINICA quedan vacíos
npm run qvet-api -- 716 "Listado-cierre-caja" \
  --param:DESDE_FECHA=01/12/2025 \
  --param:HASTA_FECHA=31/12/2025
```

---

## 🆔 Obtener ID de Reportes

Si no conoces el ID de un reporte, hay dos formas:

### Opción 1: Usar Puppeteer en modo visible

```bash
npm run qvet-auto "Nombre-Aproximado" --no-headless
```

Busca en el screenshot `3-reportes-page.png` el HTML del reporte y encuentra su `data-id`.

### Opción 2: Script de listado (WIP)

```bash
npm run qvet-list
```

Mostrará todos los reportes disponibles con sus IDs.

---

## 🐛 Troubleshooting

### Error: "Usuario o contraseña incorrecto"

**Solución:** Verifica tu archivo `.env`:
```bash
cat .env
```

### Error: "No se pudo descargar el archivo"

**Causas comunes:**
1. El reporte requiere parámetros que no proporcionaste
2. Los parámetros son inválidos
3. No hay datos para el rango de fechas especificado

**Solución:** Revisa el log detallado en `data/qvet/logs/`

### Error: "No se encontró el reporte"

**Solución:** El nombre debe coincidir exactamente. Usa Puppeteer para verificar:
```bash
npm run qvet-auto "Nombre" --no-headless
```

### El script se cuelga

**Solución:**
1. Verifica tu conexión a internet
2. Revisa si QVET está disponible
3. Aumenta el timeout en el código si es necesario

### Parámetros no se aplican

**Importante:** Usa `--` antes de los parámetros con npm:

❌ **Incorrecto:**
```bash
npm run qvet-api 716 "Report" --param:FECHA=01/12/2025
```

✅ **Correcto:**
```bash
npm run qvet-api -- 716 "Report" --param:FECHA=01/12/2025
```

---

## 📖 Logs y Debugging

### Ver última ejecución

```bash
# Ver log completo de última ejecución
cat data/qvet/logs/api-calls-latest.json | jq '.'

# Ver solo errores
cat data/qvet/logs/api-calls-latest.json | jq '.[] | select(.error)'
```

### Analizar tiempos

```bash
# Ver duración de cada llamada
cat data/qvet/logs/api-calls-latest.json | jq '.[] | {url, duration}'
```

### Screenshots de debugging

Cuando usas Puppeteer, revisa los screenshots en orden:

1. `1-before-documentos.png` - Estado inicial
2. `2-after-documentos.png` - Después de abrir Documentos
3. `3-reportes-page.png` - Lista de reportes
4. `4-after-select-report.png` - Reporte seleccionado con parámetros

---

## 🎓 Tips y Mejores Prácticas

### 1. Usa nombres descriptivos

```bash
# ❌ Malo
npm run qvet-api -- 508 Report

# ✅ Bueno
npm run qvet-api -- 508 Proveedores
```

### 2. Guarda los IDs de reportes frecuentes

Crea aliases en tu `.bashrc` o `.zshrc`:

```bash
alias qvet-proveedores='npm run qvet-api -- 508 Proveedores'
alias qvet-cierre='npm run qvet-api -- 716 "Listado-cierre-caja"'
```

### 3. Automatiza con cron

```bash
# Descargar reportes diarios a las 8 AM
0 8 * * * cd /path/to/project && npm run qvet-api -- 508 Proveedores
```

### 4. Integra con scripts

```javascript
const { exec } = require('child_process');

function downloadReport(id, name, params = {}) {
  const paramStr = Object.entries(params)
    .map(([k, v]) => `--param:${k}=${v}`)
    .join(' ');

  exec(`npm run qvet-api -- ${id} "${name}" ${paramStr}`, (err, stdout) => {
    console.log(stdout);
  });
}

downloadReport(716, 'Listado-cierre-caja', {
  DESDE_FECHA: '01/12/2025',
  HASTA_FECHA: '31/12/2025'
});
```

---

## 📚 Recursos Adicionales

- **Código fuente:** `src/scripts/qvet-api.ts` (API) y `src/scripts/qvet-puppeteer.ts` (Puppeteer)
- **Network logs:** Revisa `data/qvet/logs/` para análisis detallado
- **Issues:** Reporta problemas en el repositorio

---

## 🔐 Seguridad

- ✅ `.env` está en `.gitignore` - nunca se sube a git
- ✅ Las credenciales se cargan desde variables de entorno
- ✅ Los logs NO incluyen contraseñas
- ⚠️ Ten cuidado al compartir screenshots (pueden mostrar datos sensibles)

---

## 📝 Changelog

### v2.0.0 (2026-01-01)
- ✨ Soporte completo para reportes con parámetros
- 🎯 Detección automática de parámetros del reporte
- 📁 Estructura de carpetas organizada
- 📝 Logs mejorados con timestamps y detalles
- ⚡ Optimizaciones de velocidad

### v1.0.0 (2025-12-XX)
- 🎉 Primera versión funcional
- ✅ Soporte para reportes sin parámetros
- 🌐 Método Puppeteer implementado

---

¿Preguntas? Revisa el [README principal](../README.md) o contacta al equipo.
