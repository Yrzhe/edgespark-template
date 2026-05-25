export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-100 p-3">
      <div className="text-xs font-black text-zinc-500">{label}</div>
      <div className="text-lg font-black">{value}</div>
    </div>
  );
}
