import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { queryClient } from './lib/query';
import { initTheme } from './lib/theme';
import { unlockAudio } from './lib/sound';
import './lib/i18n';
import './index.css';

// Paint the right palette before React's first render, so a dark POS terminal
// never flashes white at a cashier in a dim shop.
initTheme();

// Browsers block audio until the first gesture; arm it on the earliest one so
// the very first barcode scan already beeps.
const arm = () => {
  unlockAudio();
  window.removeEventListener('pointerdown', arm);
  window.removeEventListener('keydown', arm);
};
window.addEventListener('pointerdown', arm);
window.addEventListener('keydown', arm);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
