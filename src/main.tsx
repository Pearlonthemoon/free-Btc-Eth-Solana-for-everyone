import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      const filename = event.filename || '';
      const message = event.message || '';
      if (
        filename.startsWith('chrome-extension://') ||
        (message.includes('SecurityError') && message.includes('cross-origin frame'))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}

createRoot(document.getElementById('root')!).render(<App />);
