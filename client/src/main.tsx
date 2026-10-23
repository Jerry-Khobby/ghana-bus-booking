import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { BookingProvider } from '@/app/BookingContext'
import { router } from '@/app/router'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BookingProvider>
      <RouterProvider router={router} />
    </BookingProvider>
  </StrictMode>,
)
