import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, type = 'text', ...props }, ref) => {
		return (
			<input
				ref={ref}
				type={type}
				className={cn(
					'h-9 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm placeholder:text-muted-foreground',
					'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
					'disabled:cursor-not-allowed disabled:opacity-50',
					className,
				)}
				{...props}
			/>
		)
	},
)
Input.displayName = 'Input'


