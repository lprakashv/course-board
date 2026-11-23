import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, exportToSvg, loadFromBlob, serializeAsJSON } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

export function mountBoard(container, onReady) {
  const root = createRoot(container);
  let api;
  let version = 0;
  let closed = false;

  async function load(file) {
    const initialData = file ? { ...await loadFromBlob(file, null, null), scrollToContent: true } : undefined;
    if (closed) return;
    api = undefined;
    root.render(createElement(Excalidraw, {
      key: ++version,
      initialData,
      excalidrawAPI(value) {
        api = value;
        onReady();
      },
      UIOptions: { canvasActions: { loadScene: false, saveAsImage: false, export: false } },
    }));
  }

  async function exportBoard() {
    const elements = api.getSceneElements();
    if (!elements.length) throw new Error('Draw or import at least one element.');
    const appState = api.getAppState();
    const files = api.getFiles();
    const scene = serializeAsJSON(elements, appState, files, 'local');
    const svg = await exportToSvg({ elements, files, appState: { ...appState, exportEmbedScene: false } });
    return {
      scene: new Blob([scene], { type: 'application/json' }),
      svg: new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }),
    };
  }

  return { load, exportBoard, close() { closed = true; root.unmount(); } };
}
