import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// No StrictMode: the edit popovers rely on their mount/unmount effects running once
// (they group a whole edit into one undo step and remove words left empty on close).
createRoot(document.getElementById('root')!).render(<App />)
