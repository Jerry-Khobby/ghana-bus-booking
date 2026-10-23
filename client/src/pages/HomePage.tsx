import { Hero, HowItWorks, LoadingNow, SearchForm } from '@/components/organisms'
import { PublicTemplate } from '@/components/templates'
import { loadingNow } from '@/data/mock'

export function HomePage() {
  return (
    <PublicTemplate banner={<Hero />}>
      <SearchForm />
      <LoadingNow trips={loadingNow} />
      <HowItWorks />
    </PublicTemplate>
  )
}
