import { UserMenu } from "@/components/UserMenu";

export function PageHeader({ overline, title, children }) {
  return (
    <header className="lg:sticky lg:top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 shadow-[0_2px_14px_rgba(15,23,42,0.06)] px-4 sm:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div>
        {overline && <div className="overline mb-1">{overline}</div>}
        <h1 className="font-display font-bold text-xl sm:text-2xl tracking-tight text-gray-900" data-testid="page-title">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {children}
        <UserMenu />
      </div>
    </header>
  );
}
