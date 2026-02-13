import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// import MapView from './App.tsx'
import App2 from './App2.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App2 />
  </StrictMode>,
)
