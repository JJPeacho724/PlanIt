"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface AccordionProps {
  type: "single" | "multiple"
  defaultValue?: string | string[]
  children: React.ReactNode
  className?: string
}

const Accordion = ({ type, defaultValue, children, className }: AccordionProps) => {
  const [openItems, setOpenItems] = React.useState<string[]>(
    Array.isArray(defaultValue) ? defaultValue : defaultValue ? [defaultValue] : []
  )

  const toggleItem = (value: string) => {
    if (type === "single") {
      setOpenItems(openItems.includes(value) ? [] : [value])
    } else {
      setOpenItems(prev => 
        prev.includes(value) 
          ? prev.filter(item => item !== value)
          : [...prev, value]
      )
    }
  }

  return (
    <div className={className}>
      {React.Children.map(children, child => 
        React.isValidElement(child) 
          ? React.cloneElement(child, { 
              ...child.props, 
              isOpen: openItems.includes(child.props.value),
              onToggle: () => toggleItem(child.props.value)
            })
          : child
      )}
    </div>
  )
}

interface AccordionItemProps {
  value: string
  children: React.ReactNode
  className?: string
  isOpen?: boolean
  onToggle?: () => void
}

const AccordionItem = ({ value, children, className, isOpen, onToggle }: AccordionItemProps) => {
  return (
    <div className={cn("border-b", className)}>
      {React.Children.map(children, child => 
        React.isValidElement(child) 
          ? React.cloneElement(child, { 
              ...child.props, 
              isOpen,
              onToggle
            })
          : child
      )}
    </div>
  )
}

interface AccordionTriggerProps {
  children: React.ReactNode
  className?: string
  isOpen?: boolean
  onToggle?: () => void
}

const AccordionTrigger = ({ children, className, isOpen, onToggle }: AccordionTriggerProps) => {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline text-left w-full",
        className
      )}
    >
      {children}
      <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
    </button>
  )
}

interface AccordionContentProps {
  children: React.ReactNode
  className?: string
  isOpen?: boolean
}

const AccordionContent = ({ children, className, isOpen }: AccordionContentProps) => {
  if (!isOpen) return null

  return (
    <div className={cn("overflow-hidden text-sm", className)}>
      <div className="pb-4 pt-0">{children}</div>
    </div>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }