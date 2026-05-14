import { ReactNode, isValidElement } from "react";

type ActionConfig = { label: string; onClick: () => void };

export default function EmptyState({
  title,
  description,
  body,
  action,
  icon,
}: {
  title: string;
  description?: string;
  /** Legacy alias for `description` — keep for back-compat with older callers. */
  body?: string;
  action?: ReactNode | ActionConfig;
  icon?: ReactNode;
}) {
  const desc = description ?? body;
  const renderedAction =
    action && typeof action === "object" && !isValidElement(action) && "label" in (action as ActionConfig) ? (
      <button
        type="button"
        onClick={(action as ActionConfig).onClick}
        className="btn-secondary"
      >
        {(action as ActionConfig).label}
      </button>
    ) : (
      (action as ReactNode | undefined)
    );
  return (
    <div className="border border-dashed border-slate-200 rounded-2xl bg-white px-6 py-12 sm:py-14 text-center fade-up">
      {icon ? (
        <div className="mx-auto mb-4 text-slate-400 inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-50">
          {icon}
        </div>
      ) : (
        // Default illustration: a calm "empty" glyph so the box never looks
        // accidentally blank when callers omit the icon.
        <div className="mx-auto mb-4 text-slate-300 inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-50">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 10h18" />
          </svg>
        </div>
      )}
      <div className="text-[15px] font-bold text-slate-900 tracking-tight">{title}</div>
      {desc && (
        <div className="mt-1.5 text-[13px] text-slate-500 max-w-md mx-auto leading-relaxed">{desc}</div>
      )}
      {renderedAction && <div className="mt-5">{renderedAction}</div>}
    </div>
  );
}
