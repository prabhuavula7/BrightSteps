"use client";

import Image from "next/image";
import {
  BookOpenText,
  Calculator,
  Flag,
  FlaskConical,
  Globe2,
  HeartHandshake,
  Leaf,
  PawPrint,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

type Props = {
  title: string;
  topics: string[];
  thumbnailSrc?: string;
  thumbnailAlt?: string;
};

type TopicVisual = {
  icon: LucideIcon;
  label: string;
  classes: string;
};

function getTopicVisual(title: string, topics: string[]): TopicVisual {
  const haystack = `${title} ${topics.join(" ")}`.toLowerCase();

  if (/(flag|flags|banner)/.test(haystack)) {
    return {
      icon: Flag,
      label: "Flags",
      classes: "from-rose-50 to-orange-50 text-rose-700 border-rose-100",
    };
  }

  if (/(science|chem|bio|physics|space|lab|experiment)/.test(haystack)) {
    return {
      icon: FlaskConical,
      label: "Science",
      classes: "from-violet-50 to-indigo-50 text-violet-700 border-violet-100",
    };
  }

  if (/(geography|globe|map|country|countries|capital|world)/.test(haystack)) {
    return {
      icon: Globe2,
      label: "Geography",
      classes: "from-sky-50 to-cyan-50 text-sky-700 border-sky-100",
    };
  }

  if (/(math|numbers|count|arithmetic|addition|subtraction)/.test(haystack)) {
    return {
      icon: Calculator,
      label: "Math",
      classes: "from-amber-50 to-yellow-50 text-amber-700 border-amber-100",
    };
  }

  if (/(animal|animals|pet|wildlife|zoo)/.test(haystack)) {
    return {
      icon: PawPrint,
      label: "Animals",
      classes: "from-emerald-50 to-lime-50 text-emerald-700 border-emerald-100",
    };
  }

  if (/(emotion|social|friend|kindness|care)/.test(haystack)) {
    return {
      icon: HeartHandshake,
      label: "Social",
      classes: "from-pink-50 to-rose-50 text-pink-700 border-pink-100",
    };
  }

  if (/(reading|language|words|vocab|spelling|grammar|phonics)/.test(haystack)) {
    return {
      icon: BookOpenText,
      label: "Language",
      classes: "from-blue-50 to-indigo-50 text-blue-700 border-blue-100",
    };
  }

  if (/(nature|plant|plants|weather|earth|tree)/.test(haystack)) {
    return {
      icon: Leaf,
      label: "Nature",
      classes: "from-green-50 to-emerald-50 text-green-700 border-green-100",
    };
  }

  return {
    icon: Sparkles,
    label: "General",
    classes: "from-slate-50 to-zinc-50 text-slate-700 border-slate-200",
  };
}

export function FactCardsPackThumb({ title, topics, thumbnailSrc, thumbnailAlt }: Props) {
  const visual = getTopicVisual(title, topics);
  const Icon = visual.icon;
  const imageAlt = thumbnailAlt?.trim() || `${title} thumbnail`;

  return (
    <div
      aria-label={`${visual.label} visual`}
      className={`mb-3 flex items-center justify-between rounded-lg border bg-gradient-to-r p-3 ${visual.classes}`}
    >
      {thumbnailSrc ? (
        <div className="relative h-40 w-full overflow-hidden rounded-md border border-white/70 bg-white/70 md:h-44">
          <Image
            alt={imageAlt}
            className="object-cover"
            fill
            loader={({ src }) => src}
            sizes="(max-width: 768px) 100vw, 420px"
            src={thumbnailSrc}
            unoptimized
          />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/45 px-2 py-1.5 text-white">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold">
              <Icon className="h-3.5 w-3.5" />
              {visual.label}
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="inline-flex items-center gap-2">
            <Icon className="h-4 w-4" />
            <span className="text-xs font-bold tracking-wide">{visual.label}</span>
          </div>
          <Icon aria-hidden className="h-5 w-5" />
        </>
      )}
    </div>
  );
}
