"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

type ActionItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
};

type ValueItem = {
  label: string;
  value: string;
  disabled?: boolean;
};

export type KebabItem = ActionItem;

type Props =
  | { items: ActionItem[]; trigger?: ReactNode; label?: string; triggerLabel?: string }
  | {
      items: ValueItem[];
      onSelect: (value: string) => void;
      label?: string;
      triggerLabel?: string;
      trigger?: ReactNode;
    };

export default function KebabMenu(props: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const triggerNode = props.trigger ?? (
    <span className="text-xs px-2 py-1 inline-flex items-center gap-1 text-slate-700">
      {props.triggerLabel ?? props.label ?? "More"}
      <span className="text-base leading-none">⋮</span>
    </span>
  );

  function pick(item: ActionItem | ValueItem) {
    setOpen(false);
    if ("onSelect" in item) {
      (item as ActionItem).onSelect();
    } else if ("onSelect" in props) {
      props.onSelect((item as ValueItem).value);
    }
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md hover:bg-slate-100 text-slate-500 px-2 py-1"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {triggerNode}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 min-w-44 rounded-md border border-slate-200 bg-white shadow-lg z-20 py-1">
          {(props.items as Array<ActionItem | ValueItem>).map((it, i) => (
            <button
              key={i}
              disabled={it.disabled}
              onClick={() => pick(it)}
              className={`w-full text-left px-3 py-1.5 text-sm ${
                "danger" in it && it.danger ? "text-rose-600" : "text-slate-700"
              } hover:bg-slate-50 disabled:opacity-50`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
