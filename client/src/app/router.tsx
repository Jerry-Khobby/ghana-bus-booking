import { useEffect } from 'react'
import { createBrowserRouter, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { AgentConsolePage } from '@/pages/AgentConsolePage'
import { HomePage } from '@/pages/HomePage'
import { MyTicketsPage } from '@/pages/MyTicketsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OperatorOverviewPage } from '@/pages/OperatorOverviewPage'
import { PayFailedPage } from '@/pages/PayFailedPage'
import { PayPendingPage } from '@/pages/PayPendingPage'
import { PaymentPage } from '@/pages/PaymentPage'
import { ResultsPage } from '@/pages/ResultsPage'
import { ScanPage } from '@/pages/ScanPage'
import { SeatLayoutPage } from '@/pages/SeatLayoutPage'
import { SeatPage } from '@/pages/SeatPage'
import { SignInPage } from '@/pages/SignInPage'
import { StaffSignInPage } from '@/pages/StaffSignInPage'
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
      { path: '/trips/:tripId/pay/pending', element: <PayPendingPage /> },
      { path: '/trips/:tripId/pay/failed', element: <PayFailedPage /> },
      { path: '/ticket', element: <TicketPage /> },
      { path: '/ticket/:code', element: <TicketPage /> },
      { path: '/tickets', element: <MyTicketsPage /> },
      { path: '/signin', element: <SignInPage /> },
      { path: '/staff/signin', element: <StaffSignInPage /> },

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
