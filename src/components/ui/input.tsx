import * as React from 'react'
import { cn } from '@/lib/utils'
export const Input = React.forwardRef<HTMLInputElement,React.ComponentProps<'input'>>(function Input({className,...props},ref){
 return <input ref={ref} className={cn('w-full min-h-12 rounded-md border border-ink/25 bg-transparent px-4 py-3 text-ink placeholder:text-ink/45 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brass',className)} {...props}/>
})
export const Textarea = React.forwardRef<HTMLTextAreaElement,React.ComponentProps<'textarea'>>(function Textarea({className,...props},ref){
 return <textarea ref={ref} className={cn('w-full min-h-28 rounded-md border border-ink/25 bg-transparent px-4 py-3 text-ink placeholder:text-ink/45 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brass',className)} {...props}/>
})
