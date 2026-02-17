import { BookOpen, BookText, Image as ImageIcon, Settings } from "lucide-react";
import Link from "next/link";

export function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="container-page flex items-center justify-between py-2.5 md:py-3">
        <Link className="flex items-center gap-2" href="/">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 shadow-sm">
            <BookOpen className="h-5 w-5 text-brand" strokeWidth={2.25} />
          </div>
          <span className="text-base font-bold text-slate-800 sm:text-lg">BrightSteps</span>
        </Link>
        <nav className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 text-sm text-slate-600 sm:gap-3">
          <Link className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 hover:bg-slate-100 hover:text-brand" href="/factcards">
            <BookText className="h-4 w-4" />
            <span className="hidden sm:inline">FactCards</span>
          </Link>
          <Link className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 hover:bg-slate-100 hover:text-brand" href="/picturephrases">
            <ImageIcon className="h-4 w-4" />
            <span className="hidden sm:inline">PicturePhrases</span>
          </Link>
          <Link className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 hover:bg-slate-100 hover:text-brand" href="/settings">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
