import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      richColors
      position="top-right"
      toastOptions={{
        classNames: {
          toast: "!border-border !bg-popover !text-popover-foreground",
        },
      }}
    />
  );
}
