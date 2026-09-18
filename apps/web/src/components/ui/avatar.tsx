import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn, colorForLabel, contrastText, initials } from '@/lib/utils';

const avatarVariants = cva(
  'relative flex shrink-0 select-none overflow-hidden rounded-full',
  {
    variants: {
      size: {
        sm: 'size-8 text-xs',
        default: 'size-10 text-sm',
        lg: 'size-12 text-base',
        xl: 'size-16 text-xl',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

export interface AvatarProps
  extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>,
    VariantProps<typeof avatarVariants> {}

export const Avatar = React.forwardRef<React.ElementRef<typeof AvatarPrimitive.Root>, AvatarProps>(
  function Avatar({ className, size, ...props }, ref) {
    return <AvatarPrimitive.Root ref={ref} className={cn(avatarVariants({ size }), className)} {...props} />;
  },
);

export const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(function AvatarImage({ className, ...props }, ref) {
  return <AvatarPrimitive.Image ref={ref} className={cn('aspect-square size-full object-cover', className)} {...props} />;
});

export const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(function AvatarFallback({ className, ...props }, ref) {
  return (
    <AvatarPrimitive.Fallback
      ref={ref}
      className={cn('flex size-full items-center justify-center bg-muted font-semibold text-muted-foreground', className)}
      {...props}
    />
  );
});

export interface UserAvatarProps extends AvatarProps {
  name: string;
  src?: string | null;
  /** Tints the fallback with the stable colour for this name. */
  colored?: boolean;
}

/** The one screens actually use: a name in, initials or a photo out. */
export const UserAvatar = React.forwardRef<React.ElementRef<typeof AvatarPrimitive.Root>, UserAvatarProps>(
  function UserAvatar({ name, src, size, colored = true, className, ...props }, ref) {
    const background = colorForLabel(name || '?');
    return (
      <Avatar ref={ref} size={size} className={className} {...props}>
        {src && <AvatarImage src={src} alt={name} />}
        <AvatarFallback
          delayMs={src ? 300 : 0}
          style={colored ? { backgroundColor: background, color: contrastText(background) } : undefined}
        >
          {initials(name || '?') || '?'}
        </AvatarFallback>
      </Avatar>
    );
  },
);

export { avatarVariants };
export default Avatar;
