import { ButtonLink, Heading } from '@/components/atoms'
import { PublicTemplate } from '@/components/templates'

interface NotFoundPageProps {
  title?: string
  body?: string
}

/** Also used for screens that are planned but not designed yet. */
export function NotFoundPage({
  title = 'We could not find that page',
  body = 'The bus or page you were looking for is not here. It may have departed.',
}: NotFoundPageProps) {
  return (
    <PublicTemplate>
      <div className="flex max-w-xl flex-col items-start gap-4 py-16">
        <Heading as="h1" size="xl">
          {title}
        </Heading>
        <p className="m-0 text-muted">{body}</p>
        <ButtonLink to="/">Back to home</ButtonLink>
      </div>
    </PublicTemplate>
  )
}
