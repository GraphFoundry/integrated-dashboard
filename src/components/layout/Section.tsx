interface SectionProps {
  title?: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export default function Section({
  title,
  description,
  actions,
  children,
  className = '',
}: Readonly<SectionProps>) {
  return (
    <div className={`bg-slate-800 rounded-lg border border-slate-700 ${className}`}>
      {(title || description || actions) && (
        <div className="border-b border-slate-700 p-6">
          <div className="flex items-start justify-between">
            <div>
              {title && <h2 className="text-xl font-semibold text-white">{title}</h2>}
              {description && <p className="text-sm text-slate-400 mt-1">{description}</p>}
            </div>
            {actions && <div className="flex items-center gap-3">{actions}</div>}
          </div>
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  )
}
