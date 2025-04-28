// File: src/components/ui/button.tsx
'use client';

import React from 'react';
import clsx from 'clsx';
import { Slot } from '@radix-ui/react-slot';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**  
   * If true, uses Radix’s <Slot> so you can pass an <a> or any other element as the rendered node.  
   */
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, ...props }, ref) => {
    // When asChild=true, render the child element; else render a <button>
    const Comp = asChild ? Slot : 'button';
    return (
      // @ts-ignore Slot typing quirk
      <Comp
        ref={ref}
        className={clsx(
          'inline-flex items-center justify-center rounded-md bg-black text-white px-4 py-2 hover:bg-gray-800 focus:ring-2 focus:ring-black focus:ring-opacity-50 disabled:opacity-50 disabled:pointer-events-none',
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
