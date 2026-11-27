// Consistent data tables: horizontal scroll on small screens, sticky header row.
export function Table({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto">
      <table aria-label={label} className="w-full min-w-[640px] border-collapse text-sm">
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={`border-b border-border bg-muted px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`border-b border-border px-4 py-3 align-middle ${className}`}>{children}</td>;
}
