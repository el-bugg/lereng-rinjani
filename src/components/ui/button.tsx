import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva('ui-button inline-flex items-center justify-center gap-2 rounded-full whitespace-nowrap font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current', {
  variants: {
    variant: {
      default: 'bg-ink text-ivory hover:bg-brass hover:text-ink',
      outline: 'border border-ink bg-transparent text-ink hover:bg-ink hover:text-ivory',
      ghost: 'text-ink hover:bg-ink/7',
      accent: 'bg-brass text-ink hover:bg-ivory'
    },
    size: { default: 'min-h-12 px-6 py-3', sm: 'min-h-10 px-4 py-2 text-sm', lg: 'min-h-14 px-7 py-3.5', icon: 'size-11 p-0' }
  }, defaultVariants: { variant: 'default', size: 'default' }
})
export type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({className, variant, size, type='button', ...props}, ref) {
  return <button ref={ref} type={type} className={cn(buttonVariants({variant,size}),className)} {...props}/>
})
