import { Receipt } from "lucide-react";
import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Receipt className="size-5" />
      </span>
      <span className="text-lg font-semibold leading-none">FairShare</span>
    </Link>
  );
}
