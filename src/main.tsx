// import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css' // Tailwind가 포함된 메인 CSS
import App from './App.tsx'

/*
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
*/
createRoot(document.getElementById('root')!).render(
  <App />
)