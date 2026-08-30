import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('index.html is missing its #root element');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
