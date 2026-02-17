"use client";

import { BookOpen, BookText, House, Image as ImageIcon, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type AppShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: House },
  { href: "/factcards", label: "FactCards", icon: BookText },
  { href: "/picturephrases", label: "PicturePhrases", icon: ImageIcon },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ title, subtitle, children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex w-full max-w-[2200px]">
        <aside className="sticky top-0 hidden h-dvh w-72 flex-col border-r border-slate-200 bg-white p-5 lg:flex 2xl:w-80 2xl:p-6">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 shadow-sm 2xl:h-14 2xl:w-14">
              <BookOpen className="h-6 w-6 text-[#2badee] 2xl:h-7 2xl:w-7" strokeWidth={2.25} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500 2xl:text-base">BrightSteps</p>
              <p className="text-xs text-slate-400 2xl:text-sm">Calm Learning Console</p>
            </div>
          </div>

          <nav className="space-y-2">
            {NAV_ITEMS.map((item) => {
              const active = isNavActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition 2xl:text-[15px] ${
                    active
                      ? "bg-[#2badee]/10 text-[#2badee]"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                  href={item.href}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 2xl:text-sm">
            Phase 1 local-first mode. No cloud sync.
          </div>
        </aside>

        <main className="min-h-dvh flex-1 px-3 py-3 sm:px-4 md:px-6 md:py-5 xl:px-8 2xl:px-10">
          <header className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:mb-6 md:p-5 xl:p-6">
            <h1 className="text-2xl font-black text-slate-900 md:text-3xl xl:text-4xl">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold ${
                    isNavActive(pathname, item.href)
                      ? "bg-[#2badee]/10 text-[#2badee]"
                      : "bg-slate-100 text-slate-700"
                  }`}
                  href={item.href}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              ))}
            </div>
          </header>

          <div className="mx-auto w-full max-w-[1700px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
