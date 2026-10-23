import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Heading } from '@/components/atoms'
import { BackLink } from '@/components/molecules'
import { LayoutActions, LayoutPreview, LayoutSettings } from '@/components/organisms'
import { OperatorTemplate } from '@/components/templates'
import { defaultLayout } from '@/lib/seats'

export function SeatLayoutPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('AC coach — standard')
  const [layout, setLayout] = useState(defaultLayout)

  return (
    <OperatorTemplate
      title="Edit layout"
      back={{ to: '/operator', label: 'Back to seat layouts' }}
      mobileAction={<LayoutActions />}
    >
      <div className="hidden md:block">
        <BackLink to="/operator">Seat layouts</BackLink>
        <Heading as="h1" size="xl" className="mt-1.5">
          Edit layout
        </Heading>
      </div>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-[18px] lg:gap-6">
        <LayoutSettings
          name={name}
          onNameChange={setName}
          layout={layout}
          onChange={setLayout}
          onSave={() => navigate('/operator')}
        />
        <LayoutPreview layout={layout} />
      </div>
    </OperatorTemplate>
  )
}
