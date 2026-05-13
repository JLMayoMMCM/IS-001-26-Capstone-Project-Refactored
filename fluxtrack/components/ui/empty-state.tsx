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
  body?: string; // legacy alias for description
  action?: ReactNode | ActionConfig;
  icon?: ReactNode;
}) {
  const desc = description ?? body;
  const renderedAction =
    action && typeof action === "object" && !isValidElement(action) && "label" in (action as ActionConfig) ? (
      <button
        type="button"
        onClick={(action as ActionConfig).onClick}
        className="inline-flex items-center px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
      >
        {(action as ActionConfig).label}
      </button>
    ) : (
      (action as ReactNode | undefined)
    );
  return (
    <div className="border border-dashed border-slate-200 rounded-xl bg-white p-10 text-center">
      {icon && <div className="mx-auto mb-3 text-slate-400">{icon}</div>}
      <div className="text-sm font-medium text-slate-900">{title}</div>
      {desc && (
        <div className="mt-1 text-xs text-slate-500 max-w-md mx-auto">{desc}</div>
      )}
      {renderedAction && <div className="mt-4">{renderedAction}</div>}
    </div>
  );
}
