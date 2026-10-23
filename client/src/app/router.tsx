import { useEffect } from 'react'
import { createBrowserRouter, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { AgentConsolePage } from '@/pages/AgentConsolePage'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OperatorOverviewPage } from '@/pages/OperatorOverviewPage'
import { PaymentPage } from '@/pages/PaymentPage'
import { ResultsPage } from '@/pages/ResultsPage'
import { ScanPage } from '@/pages/ScanPage'
import { SeatLayoutPage } from '@/pages/SeatLayoutPage'
import { SeatPage } from '@/pages/SeatPage'
import { TicketPage } from '@/pages/TicketPage'

function Root() {
  const { hash, pathname } = useLocation()

  // Scroll to in-page anchors such as "/#how" after navigation.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }, [hash, pathname])

  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}

const comingSoon = <NotFoundPage title="Coming soon" body="This screen is planned but not designed yet." />

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      // Passenger
      { path: '/', element: <HomePage /> },
      { path: '/trips', element: <ResultsPage /> },
      { path: '/trips/:tripId/seat', element: <SeatPage /> },
      { path: '/trips/:tripId/pay', element: <PaymentPage /> },
      { path: '/ticket', element: <TicketPage /> },
      { path: '/signin', element: comingSoon },

      // Station agent
      { path: '/agent', element: <AgentConsolePage /> },
      { path: '/agent/scan', element: <ScanPage /> },

      // Operator
      { path: '/operator', element: <OperatorOverviewPage /> },
      { path: '/operator/layouts', element: <SeatLayoutPage /> },
      { path: '/operator/*', element: comingSoon },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
