import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

const nodoRaiz = document.getElementById('root')

if (!nodoRaiz) {
  throw new Error('No se encontró el nodo raíz #root.')
}

ReactDOM.createRoot(nodoRaiz).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
