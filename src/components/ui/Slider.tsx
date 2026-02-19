import { forwardRef } from 'react'
import * as RadixSlider from '@radix-ui/react-slider'
import { cn } from '@/components/common/uiClassTokens'
import type { NativeInputChangeEvent, SliderAdapterProps } from './types'

export const Slider = forwardRef<HTMLInputElement, SliderAdapterProps>(function Slider(
  { className, disabled, id, max, min, name, onChange, step, value, ...ariaProps },
  ref
) {
  const minValue = typeof min === 'number' ? min : Number(min ?? 0)
  const maxValue = typeof max === 'number' ? max : Number(max ?? 100)
  const stepValue = typeof step === 'number' ? step : step ? Number(step) : 1

  const createSyntheticRangeEvent = (nextValue: number): NativeInputChangeEvent => {
    const target = {
      value: String(nextValue),
      name: name ?? '',
      id: id ?? '',
    } as HTMLInputElement

    return {
      target,
      currentTarget: target,
    } as NativeInputChangeEvent
  }

  return (
    <>
      <input
        ref={ref}
        aria-hidden="true"
        className="sr-only"
        disabled={disabled}
        max={max}
        min={min}
        name={name}
        step={step}
        tabIndex={-1}
        type="range"
        value={value}
        onChange={() => {
          // Hidden sync element for form/ref compatibility.
        }}
      />
      <RadixSlider.Root
        aria-describedby={ariaProps['aria-describedby']}
        aria-invalid={ariaProps['aria-invalid']}
        aria-label={ariaProps['aria-label']}
        aria-labelledby={ariaProps['aria-labelledby']}
        id={id}
        disabled={disabled}
        max={maxValue}
        min={minValue}
        step={stepValue}
        value={[value]}
        onValueChange={(nextValue) => onChange?.(createSyntheticRangeEvent(nextValue[0] ?? value))}
        className={cn('relative flex h-8 w-full touch-none select-none items-center', className)}
      >
        <RadixSlider.Track className="relative h-2.5 w-full grow overflow-hidden rounded-full bg-slate-800">
          <RadixSlider.Range className="absolute h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          className="block h-5 w-5 rounded-full border-2 border-emerald-100 bg-emerald-50 shadow-[0_0_0_3px_rgba(16,185,129,0.35)] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-emerald-300)] disabled:pointer-events-none disabled:opacity-50"
          aria-label={ariaProps['aria-label'] ?? 'slider thumb'}
        />
      </RadixSlider.Root>
    </>
  )
})

Slider.displayName = 'Slider'
