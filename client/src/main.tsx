import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { queryClient } from '@/api/query'
import { AuthProvider } from '@/app/AuthContext'
import { BookingProvider } from '@/app/BookingContext'
import { StationProvider } from '@/app/StationContext'
import { routes } from '@/app/router'
import './index.css'

const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BookingProvider>
          <StationProvider>
            <RouterProvider router={router} />
          </StationProvider>
        </BookingProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
