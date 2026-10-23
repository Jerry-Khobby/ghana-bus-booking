import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { AuthProvider } from '@/app/AuthContext'
import { BookingProvider } from '@/app/BookingContext'
import { OperatorProvider } from '@/app/OperatorContext'
import { StationProvider } from '@/app/StationContext'
import { router } from '@/app/router'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BookingProvider>
        <StationProvider>
          <OperatorProvider>
            <RouterProvider router={router} />
          </OperatorProvider>
        </StationProvider>
      </BookingProvider>
    </AuthProvider>
  </StrictMode>,
)
