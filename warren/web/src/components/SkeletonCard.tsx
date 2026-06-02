type SkeletonCardProps = {
  className?: string;
};

function SkeletonLine({ className }: { className: string }) {
  return <span className={["warren-skeleton block rounded", className].join(" ")} />;
}

export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <article
      aria-busy="true"
      aria-label="Loading post"
      className={["warren-card flex min-h-[148px] gap-3 p-3.5", className].filter(Boolean).join(" ")}
    >
      <span className="warren-skeleton h-[54px] w-12 shrink-0 rounded-lg" />
      <span className="min-w-0 flex-1 space-y-2">
        <SkeletonLine className="h-3.5 w-16" />
        <SkeletonLine className="h-4 w-11/12" />
        <SkeletonLine className="h-4 w-2/3" />
        <span className="flex gap-1.5 pt-1">
          <SkeletonLine className="h-5 w-16 rounded-full" />
          <SkeletonLine className="h-5 w-20 rounded-full" />
          <SkeletonLine className="h-5 w-14 rounded-full" />
        </span>
        <span className="flex items-center gap-2 pt-1">
          <span className="warren-skeleton h-6 w-6 rounded-full" />
          <SkeletonLine className="h-3 w-28" />
          <SkeletonLine className="h-4 w-20 rounded-full" />
        </span>
      </span>
    </article>
  );
}
