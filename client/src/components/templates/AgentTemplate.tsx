import type { ReactNode } from 'react'
import { AgentHeader } from '@/components/organisms'

interface AgentTemplateProps {
  bays: number[]
  bay: number
  onBayChange: (bay: number) => void
  children: ReactNode
}

export function AgentTemplate({ bays, bay, onBayChange, children }: AgentTemplateProps) {
  return (
    <div className="min-h-screen">
      <AgentHeader station="Accra — Circle station" agent="Kofi A." bays={bays} bay={bay} onBayChange={onBayChange} />
      <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 pb-16 pt-4 sm:px-6 md:gap-[18px] md:pt-5 lg:flex-row lg:items-start lg:gap-6 lg:pt-7">
        {children}
      </main>
    </div>
  )
}
