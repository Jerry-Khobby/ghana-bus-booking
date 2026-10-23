import { Checkbox, Eyebrow } from '@/components/atoms'

interface CheckboxGroupProps {
  legend: string
  options: readonly string[]
  checked: readonly string[]
  onToggle: (option: string) => void
}

export function CheckboxGroup({ legend, options, checked, onToggle }: CheckboxGroupProps) {
  return (
    <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
      <Eyebrow as="legend" className="pb-2.5">
        {legend}
      </Eyebrow>
      {options.map((o) => (
        <label key={o} className="flex min-h-8 cursor-pointer items-center gap-2.5">
          <Checkbox checked={checked.includes(o)} onChange={() => onToggle(o)} />
          {o}
        </label>
      ))}
    </fieldset>
  )
}
