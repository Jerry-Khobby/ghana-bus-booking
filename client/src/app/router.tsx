import { useEffect, type ComponentType } from 'react'
import { Outlet, ScrollRestoration, useLocation, type RouteObject } from 'react-router'
import { ErrorPage } from '@/pages/ErrorPage'
import { HomePage } from '@/pages/HomePage'
import { MyTicketsPage } from '@/pages/MyTicketsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PayFailedPage } from '@/pages/PayFailedPage'
import { PayPendingPage } from '@/pages/PayPendingPage'
import { PaymentPage } from '@/pages/PaymentPage'
import { PaymentReturnPage } from '@/pages/PaymentReturnPage'
import { ResultsPage } from '@/pages/ResultsPage'
import { SeatPage } from '@/pages/SeatPage'
import { SignInPage } from '@/pages/SignInPage'
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

/**
 * Staff pages load on demand, so passengers on mobile data never download
 * the agent console or operator dashboard.
 */
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M) {
  return async () => ({ Component: (await load())[name] as ComponentType })
}

/** Every page in the app. main.tsx turns this into the browser router. */
export const routes: RouteObject[] = [
  {
    element: <Root />,
    errorElement: <ErrorPage />,
    children: [
      // Passenger
      { path: '/', element: <HomePage /> },
      { path: '/trips', element: <ResultsPage /> },
      { path: '/trips/:tripId/seat', element: <SeatPage /> },
      { path: '/trips/:tripId/pay', element: <PaymentPage /> },
      { path: '/trips/:tripId/pay/pending', element: <PayPendingPage /> },
      { path: '/trips/:tripId/pay/failed', element: <PayFailedPage /> },
      { path: '/payment/return', element: <PaymentReturnPage /> },
      { path: '/ticket', element: <TicketPage /> },
      { path: '/ticket/:code', element: <TicketPage /> },
      { path: '/tickets', element: <MyTicketsPage /> },
      { path: '/signin', element: <SignInPage /> },
      { path: '/staff/signin', lazy: page(() => import('@/pages/StaffSignInPage'), 'StaffSignInPage') },

      // Station agent
      { path: '/agent', lazy: page(() => import('@/pages/AgentConsolePage'), 'AgentConsolePage') },
      { path: '/agent/scan', lazy: page(() => import('@/pages/ScanPage'), 'ScanPage') },
      { path: '/agent/walk-in', lazy: page(() => import('@/pages/WalkInPage'), 'WalkInPage') },

      // Operator
      { path: '/operator', lazy: page(() => import('@/pages/OperatorOverviewPage'), 'OperatorOverviewPage') },
      { path: '/operator/trips', lazy: page(() => import('@/pages/operator/TripsPage'), 'TripsPage') },
      { path: '/operator/trips/new', lazy: page(() => import('@/pages/operator/TripEditorPage'), 'TripEditorPage') },
      { path: '/operator/trips/:tripId/edit', lazy: page(() => import('@/pages/operator/TripEditorPage'), 'TripEditorPage') },
      { path: '/operator/buses', lazy: page(() => import('@/pages/operator/BusesPage'), 'BusesPage') },
      { path: '/operator/layouts', lazy: page(() => import('@/pages/operator/LayoutsPage'), 'LayoutsPage') },
      { path: '/operator/layouts/:layoutId', lazy: page(() => import('@/pages/SeatLayoutPage'), 'SeatLayoutPage') },
      { path: '/operator/routes', lazy: page(() => import('@/pages/operator/RoutesPage'), 'RoutesPage') },
      { path: '/operator/agents', lazy: page(() => import('@/pages/operator/AgentsPage'), 'AgentsPage') },
      { path: '/operator/reports', lazy: page(() => import('@/pages/operator/ReportsPage'), 'ReportsPage') },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
