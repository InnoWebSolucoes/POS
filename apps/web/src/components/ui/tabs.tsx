import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/lib/utils';

export type TabsVariant = 'pill' | 'underline';

const TabsVariantContext = React.createContext<TabsVariant>('pill');

export const Tabs = TabsPrimitive.Root;

export interface TabsListProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  /** "pill" is the segmented control; "underline" matches the check panel. */
  variant?: TabsVariant;
  /** Stretches the triggers to fill the row. */
  stretch?: boolean;
}

export const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, TabsListProps>(
  function TabsList({ className, variant = 'pill', stretch = false, ...props }, ref) {
    return (
      <TabsVariantContext.Provider value={variant}>
        <TabsPrimitive.List
          ref={ref}
          data-variant={variant}
          className={cn(
            'no-scrollbar flex items-center overflow-x-auto',
            variant === 'pill' && 'gap-1 rounded-xl bg-muted p-1',
            variant === 'underline' && 'gap-6 border-b border-border',
            stretch && 'w-full [&>*]:flex-1',
            className,
          )}
          {...props}
        />
      </TabsVariantContext.Provider>
    );
  },
);

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex min-h-touch shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap px-4 text-sm font-semibold',
        'transition-colors outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4',
        variant === 'pill' && [
          'rounded-lg text-muted-foreground hover:text-foreground',
          'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        ],
        variant === 'underline' && [
          'relative -mb-px border-b-2 border-transparent px-1 pb-2.5 pt-2 text-muted-foreground hover:text-foreground',
          'data-[state=active]:border-primary data-[state=active]:text-foreground',
        ],
        className,
      )}
      {...props}
    />
  );
});

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        'mt-4 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    />
  );
});

export default Tabs;
