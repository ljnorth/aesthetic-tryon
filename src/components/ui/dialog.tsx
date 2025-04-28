'use client';

import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...props }) => (
  <DialogPrimitive.Overlay
    {...props}
    className={`fixed inset-0 bg-black bg-opacity-50 ${className}`}
  />
);

export const DialogContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', children, ...props }) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      {...props}
      className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg shadow-lg focus:outline-none ${className}`}
    >
      {children}
      <DialogPrimitive.Close asChild>
        <button className="absolute top-2 right-2 p-1 text-gray-600 hover:text-gray-900 focus:outline-none">
          <X />
        </button>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
);

DialogContent.displayName = 'DialogContent';
