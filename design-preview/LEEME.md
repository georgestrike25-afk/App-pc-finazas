# Forest Finance — propuesta visual (Etapa 1)

Prototipo aislado del rediseño. **No modifica la app**: no toca `src/`, estilos de producción, rutas, datos ni almacenamiento.

- `index.html`: galería para recorrer las capturas (escritorio/celular, claro/oscuro) y compararlas con el diseño actual.
- `prototype/`: prototipo navegable (HTML + CSS + JS, sin servidor). Abrir `prototype/index.html`; `?tema=dark` o `?tema=light` fuerza el tema.
- `capturas/`: propuesta. Nombre: `{desktop|mobile}-{pantalla}-{claro|oscuro}.png` (y `-completa` en el celular, la pantalla entera).
- `actual/`: el diseño anterior con los mismos datos de prueba, para comparar.
- `implementado/`: la app real con el diseño aprobado (Etapa 2), con los mismos datos de prueba.

Todos los datos son ficticios. Se generaron en navegadores limpios; ningún dato real fue leído ni modificado.

## Volver a generar las capturas

```bash
npm run build && npx vite preview --port 4173 &      # solo para las capturas del diseño actual
cd design-preview/prototype && npm install && cd ../..  # tipografía Inter local
npx playwright test -c design-preview/capture.config.ts
```
