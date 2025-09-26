import React from 'react'
import { cn } from '@/lib/utils'

interface SegmentedControlOption {
  value: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
}

interface SegmentedControlProps {
  options: SegmentedControlOption[]
  value: string
  onChange: (value: string) => void
  className?: string
  size?: 'sm' | 'md'
}

export function SegmentedControl({ 
  options, 
  value, 
  onChange, 
  className,
  size = 'md'
}: SegmentedControlProps) {
  const sizeClasses = {
    sm: 'text-sm px-2 py-1',
    md: 'text-sm px-3 py-2'
  }
  
  return (
    <div 
      className={cn(
        'inline-flex bg-surface border border-border rounded-md p-1',
        className
      )}
      role="group"
      aria-label="Segmented control"
    >
      {options.map((option) => {
        const isSelected = value === option.value
        const Icon = option.icon
        
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center justify-center rounded font-medium transition-all',
              sizeClasses[size],
              isSelected
                ? 'bg-bg text-text shadow-sm'
                : 'text-text-muted hover:text-text hover:bg-bg/50'
            )}
            aria-pressed={isSelected}
            data-state={isSelected ? 'active' : 'inactive'}
          >
            {Icon && <Icon className="w-4 h-4 mr-1.5" />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
