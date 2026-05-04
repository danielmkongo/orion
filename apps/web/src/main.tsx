import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import './styles/globals.css';

// Register service worker for PWA
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'hsl(var(--surface))',
                color: 'hsl(var(--fg))',
                border: '1px solid hsl(var(--rule))',
                borderRadius: '0',
                fontSize: '14px',
                boxShadow: '0 4px 16px rgb(0 0 0/0.08)',
              },
              success: {
                iconTheme: { primary: 'hsl(var(--good))', secondary: 'hsl(var(--fg))' },
              },
              error: {
                iconTheme: { primary: 'hsl(var(--bad))', secondary: 'hsl(var(--fg))' },
              },
            }}
          />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
