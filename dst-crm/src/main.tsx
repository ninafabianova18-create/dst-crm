import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// createRoot is the React 18/19 concurrent root API (replaces the older ReactDOM.render).
createRoot(document.getElementById('root')!).render(
  // StrictMode helps detect side-effect issues during development
  // (for example unsafe mutations or impure useEffect callbacks).
  <StrictMode>
    <App />
    
  </StrictMode>,
)
