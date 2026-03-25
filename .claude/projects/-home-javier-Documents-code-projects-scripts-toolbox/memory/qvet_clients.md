---
name: qvet-clients-editor
description: QVET client editor patterns - navigation, fields, and gotchas for editing clients (Propietarios)
type: feedback
---

## QVET Client Editor

### Navigation
- Sidebar menu: click "Inicio" to expand, then click "Clientes / Mascotas"
- Menu items are `<a>` tags with `<span>` children; spans report as 0x0 but clicking the parent `<a>` by textContent works
- Select "Todos" radio (`Activo_Basica` value="on") to include inactive clients
- Search by typing ID in `input[name="Id"]` (campo "Código") and pressing Enter
- Grid has `tipoobjeto="Cliente"` attribute — use this to verify we're on the right page
- Double-click row in grid `#{prefix}_Grid` to open client modal

### Fields that work (pestaña "Cliente")
- Nom, Cognom1, Cognom2, NIF, Adreca1, CP, Telefon1, Telefon2, Fax (=Tel3), TelefonoSMS, Email, Actiu (checkbox)
- Selectors use `[id$="_FieldName"]` pattern (same as articles)

### Fields to AVOID
- **Población (IdPoblacion_aux)**: triggers a special autocomplete popup that breaks the flow. Do NOT try to edit this field programmatically.
- **Provincia (NomProvincia)**: likely read-only, derived from Población

**Why:** User reported a popup issue when the location field was triggered during editing. The field uses a Kendo autocomplete with a lookup dialog, not a simple text input.

**How to apply:** Never include Población/Provincia in the client column map. If the user asks to edit location data, warn them about this limitation.
