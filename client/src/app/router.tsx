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
import { AgentsPage } from '@/pages/operator/AgentsPage'
import { BusesPage } from '@/pages/operator/BusesPage'
import { LayoutsPage } from '@/pages/operator/LayoutsPage'
import { ReportsPage } from '@/pages/operator/ReportsPage'
import { RoutesPage } from '@/pages/operator/RoutesPage'
import { TripEditorPage } from '@/pages/operator/TripEditorPage'
import { TripsPage } from '@/pages/operator/TripsPage'
import { WalkInPage } from '@/pages/WalkInPage'

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
      { path: '/agent/walk-in', element: <WalkInPage /> },

      // Operator
      { path: '/operator', element: <OperatorOverviewPage /> },
      { path: '/operator/trips', element: <TripsPage /> },
      { path: '/operator/trips/new', element: <TripEditorPage /> },
      { path: '/operator/trips/:tripId/edit', element: <TripEditorPage /> },
      { path: '/operator/buses', element: <BusesPage /> },
      { path: '/operator/layouts', element: <LayoutsPage /> },
      { path: '/operator/layouts/:layoutId', element: <SeatLayoutPage /> },
      { path: '/operator/routes', element: <RoutesPage /> },
      { path: '/operator/agents', element: <AgentsPage /> },
      { path: '/operator/reports', element: <ReportsPage /> },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
