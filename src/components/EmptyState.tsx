interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="mb-4 text-slate-300 dark:text-slate-600">{icon}</div>}
      <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
