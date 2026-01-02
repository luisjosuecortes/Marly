# Marly escritorio

Base mínima en Español para crear aplicaciones de escritorio con **Electron + Vite + React + TypeScript**.

## Scripts disponibles

- `npm run dev`: inicia Vite con recarga en caliente para el renderer.
- `npm run build`: compila TypeScript, genera el `dist` web y empaqueta Electron con `electron-builder`.
- `npm run lint`: ejecuta ESLint usando la configuración incluida.
- `npm run preview`: sirve el build de Vite para verificar el renderer sin empaquetar.

## Estructura principal

- `electron/`: proceso principal y preload (contextBridge expuesto como `window.ipcRenderer`).
- `src/`: interfaz React limpia, escrita completamente en Español.
- `public/`: recursos estáticos que se copian tal cual al build.

## Personalización sugerida

1. Actualiza `electron/main.ts` con la lógica de tus ventanas, menús y manejo de eventos.
2. Expande `electron/preload.ts` exponiendo los canales que tu renderer necesite.
3. Sustituye la vista en `src/App.tsx` por tus propios componentes y estilos.

## Requerimientos

- Node.js 18 o superior.
- NPM (incluido con Node) o el gestor de paquetes de tu preferencia.

## Flujo recomendado

1. Instala dependencias con `npm install`.
2. Ejecuta `npm run dev` para iniciar Vite y abrir la ventana de Electron de forma automática.
3. Añade pruebas/linter en CI antes de distribuir con `npm run build`.
