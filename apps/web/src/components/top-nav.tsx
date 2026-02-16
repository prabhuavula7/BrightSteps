import { BookOpen, BookText, Image as ImageIcon, Settings } from "lucide-react";
import Link from "next/link";

export function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="container-page flex items-center justify-between py-3">
        <Link className="flex items-center gap-2" href="/">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 shadow-sm">
            <BookOpen className="h-5 w-5 text-[#2badee]" strokeWidth={2.25} />
          </div>
          <span className="text-lg font-bold text-slate-800">BrightSteps</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-600">
          <Link className="inline-flex items-center gap-1.5 hover:text-[#2badee]" href="/factcards">
            <BookText className="h-4 w-4" />
            FactCards
          </Link>
          <Link className="inline-flex items-center gap-1.5 hover:text-[#2badee]" href="/picturephrases">
            <ImageIcon className="h-4 w-4" />
            PicturePhrases
          </Link>
          <Link className="inline-flex items-center gap-1.5 hover:text-[#2badee]" href="/settings">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </nav>
      </div>
    </header>
  );
}
