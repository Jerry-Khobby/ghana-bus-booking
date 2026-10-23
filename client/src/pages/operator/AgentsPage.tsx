import { useState } from 'react'
import { useOperator } from '@/app/OperatorContext'
import { Button, Dropdown, TextInput } from '@/components/atoms'
import { FormField, InlineFormCard, PageHeader } from '@/components/molecules'
import { AgentsTable } from '@/components/organisms'
import { OperatorTemplate } from '@/components/templates'
import { stations } from '@/data/operator'

const emptyInvite = { name: '', email: '', station: stations[0], bays: '' }

export function AgentsPage() {
  const { agents, inviteAgent } = useOperator()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(emptyInvite)
  const [sent, setSent] = useState<string[]>([])

  function invite() {
    const id = `${draft.email.split('@')[0]}-${Date.now().toString(36)}`
    inviteAgent({
      id,
      name: draft.name.trim(),
      email: draft.email.trim(),
      station: draft.station,
      bays: draft.bays.trim().replace('-', '–'),
      status: 'invited',
      lastActive: 'Not signed in yet',
    })
    setDraft(emptyInvite)
    setOpen(false)
  }

  return (
    <OperatorTemplate title="Agents">
      <PageHeader
        title={
          <>
            <span className="lg:hidden">Station agents</span>
            <span className="hidden lg:inline">Agents</span>
          </>
        }
        subtitle="People who sell walk-in seats and scan tickets at your bays"
        action={
          <Button aria-expanded={open} onClick={() => setOpen((o) => !o)} className="w-full md:w-auto">
            Invite agent
          </Button>
        }
      />

      {open && (
        <InlineFormCard
          title="Invite an agent"
          label="Invite agent"
          submitLabel="Send invite"
          onCancel={() => setOpen(false)}
          onSubmit={invite}
          note="They get an email to set a password, then sign in on the staff page."
        >
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-4">
            <FormField id="ag-name" label="Full name">
              <TextInput id="ag-name" required autoComplete="off" placeholder="e.g. Efua Boateng" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </FormField>
            <FormField id="ag-email" label="Work email">
              <TextInput id="ag-email" type="email" required autoComplete="off" placeholder="name@coastline.example" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </FormField>
            <FormField id="ag-station" label="Station">
              <Dropdown id="ag-station" labelledBy="ag-station-label" value={draft.station} options={stations.map((s) => ({ value: s, label: s }))} onChange={(station) => setDraft({ ...draft, station })} />
            </FormField>
            <FormField id="ag-bays" label="Bays">
              <TextInput id="ag-bays" required placeholder="e.g. 1–3" value={draft.bays} onChange={(e) => setDraft({ ...draft, bays: e.target.value })} />
            </FormField>
          </div>
        </InlineFormCard>
      )}

      <AgentsTable agents={agents} sent={sent} onSend={(id) => setSent((s) => [...s, id])} />
    </OperatorTemplate>
  )
}
