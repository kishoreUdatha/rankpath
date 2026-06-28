import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="text-center py-20">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="text-ink-500 mt-2">That route doesn't exist.</p>
      <Button asChild className="mt-6"><Link href="/">Back home</Link></Button>
    </div>
  );
}
