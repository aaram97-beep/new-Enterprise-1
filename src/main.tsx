import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prevent mouse wheel scrolling from accidentally changing focused <input type="number"> values
if (typeof document !== 'undefined') {
  document.addEventListener(
    'wheel',
    () => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && active.type === 'number') {
        active.blur();
      }
    },
    { passive: true, capture: true }
  );
}

createRoot(document.getElementById('root')!).render(<App />);
