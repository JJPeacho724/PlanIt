import * as React from 'react'
import { cn } from '@/lib/utils'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
	checked?: boolean
	onCheckedChange?: (checked: boolean) => void
}

export function Checkbox({
	checked,
	onCheckedChange,
	className,
	...props
}: CheckboxProps) {
	return (
		<label className={cn('inline-flex items-center', className)}>
			<input
				type="checkbox"
				className={cn(
					'h-4 w-4 rounded border border-border text-primary',
					'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
				)}
				checked={!!checked}
				onChange={(e) => onCheckedChange?.(e.target.checked)}
				{...props}
			/>
		</label>
	)
}


