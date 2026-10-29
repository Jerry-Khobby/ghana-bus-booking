import { isRouteErrorResponse, useRouteError } from 'react-router'
import { ButtonLink, Heading } from '@/components/atoms'

/**
 * When a page throws while drawing: a calm message and a way back, instead
 * of a blank screen. The details go to the console for whoever is debugging.
 */
export function ErrorPage() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  if (!notFound) console.error(error)

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex max-w-lg flex-col items-start gap-4">
        <Heading as="h1" size="xl">
          {notFound ? 'We could not find that page' : 'Something went wrong on this page'}
        </Heading>
        <p className="m-0 text-muted">
          {notFound ? 'It may have moved.' : 'Reload to try again. If it keeps happening, go back to the start.'}
        </p>
        <div className="flex flex-wrap gap-2.5">
          {!notFound && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-11 cursor-pointer rounded-[10px] border-2 border-ink bg-surface px-5 font-semibold text-ink"
            >
              Reload
            </button>
          )}
          <ButtonLink to="/">Back to home</ButtonLink>
        </div>
      </div>
    </div>
  )
}
