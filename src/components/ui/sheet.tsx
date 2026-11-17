import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
export const Sheet = Dialog.Root
export const SheetTrigger = Dialog.Trigger
export const SheetTitle = Dialog.Title
export const SheetDescription = Dialog.Description
export const SheetClose = Dialog.Close
export function SheetContent({children,className,...props}: React.ComponentPropsWithoutRef<typeof Dialog.Content>) {
  return <Dialog.Portal>
    <Dialog.Overlay className="sheet-overlay fixed inset-0 z-[90] bg-ink/55 backdrop-blur-[3px]"/>
    <Dialog.Content className={cn('sheet-content fixed inset-y-0 right-0 z-[100] flex h-full w-full max-w-[460px] flex-col overflow-y-auto bg-ivory p-6 shadow-2xl sm:p-8',className)} {...props}>
      <Dialog.Close className="absolute right-5 top-5 inline-flex size-10 items-center justify-center rounded-full border border-ink/20 text-ink" aria-label="Tutup"><X size={20}/></Dialog.Close>
      {children}
    </Dialog.Content>
  </Dialog.Portal>
}
