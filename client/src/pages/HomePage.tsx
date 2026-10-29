import { useLoadingNow } from '@/api/catalog'
import { Hero, HowItWorks, LoadingNow, SearchForm } from '@/components/organisms'
import { PublicTemplate } from '@/components/templates'

export function HomePage() {
  const loading = useLoadingNow()

  return (
    <PublicTemplate banner={<Hero />}>
      <SearchForm />
      <LoadingNow trips={loading.data ?? []} pending={loading.isPending} failed={loading.isError} />
      <HowItWorks />
    </PublicTemplate>
  )
}
