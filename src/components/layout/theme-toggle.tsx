"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

// The server doesn't know the saved theme, so the check mark only appears
// after hydration. This avoids a hydration mismatch.
const subscribe = () => () => {};
const useIsMounted = () =>
  useSyncExternalStore(subscribe, () => true, () => false);

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useIsMounted();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Change theme"
        className={cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "relative"
        )}
      >
        {/* Icons swap with CSS (dark: variant), so there is no flash. */}
        <Sun className="size-4 scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
        <Moon className="absolute size-4 scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-36">
        {options.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
            <Icon className="size-4" />
            <span className="flex-1">{label}</span>
            {mounted && theme === value && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}