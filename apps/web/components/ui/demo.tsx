"use client";

import { ThemeToggle } from "./curtain-theme-toggle";

export default function Demo() {
  return <div className="flex min-h-[400px] w-full flex-col items-center justify-center gap-4">
    <p className="text-sm opacity-60">Click the button to see the animation.</p>
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-black">
      <ThemeToggle variant="icon" duration={600} />
    </div>
  </div>;
}
