import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Eye, EyeOff, KeyRound, Play, RefreshCw, RotateCcw, Square, Trash2, Upload } from "lucide-react";

import { ContestantAvatar } from "@/components/ContestantAvatar";
import { CodeBlock, Field, Toggle } from "@/components/ui";
import { arenaApi } from "@/lib/api";
import { GREEN, NAVY, ORANGE, RED } from "@/lib/constants";
import { dateInput, formatDate, msInput } from "@/lib/format";
import type { ApiKey, Comment, ManagedCompetitionResponse, ManagedContestant, SummaryEquityResponse, SummaryVotesResponse } from "@/lib/types";

export function CompetitionAdmin({ competition, lastSyncAt, onPatch, onStart, onEnd, onReset, onClear, onSyncNow }: { competition: ManagedCompetitionResponse["competition"]; lastSyncAt: number | null; onPatch: (patch: Record<string, unknown>) => void; onStart: () => void; onEnd: () => void; onReset: () => void; onClear: () => void; onSyncNow: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ title: competition.title, startsAt: dateInput(competition.startsAt), endsAt: dateInput(competition.endsAt), upstreamBaseUrl: competition.upstreamBaseUrl, votingEnabled: competition.votingEnabled === 1, commentsEnabled: competition.commentsEnabled === 1 });
  const [clearOpen, setClearOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const statusColor = competition.status === "live" ? GREEN : competition.status === "ended" ? RED : ORANGE;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-xl font-black">{t("admin.competition")}</h2>
        <span className="flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-black" style={{ borderColor: statusColor, color: statusColor }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusColor }} />
          {t("admin.currentStatus")} · {t(`app.${competition.status}`)}
        </span>
        <button disabled={competition.status === "live"} onClick={onStart} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-black text-white disabled:opacity-45" style={{ background: GREEN }}><Play size={15} />{t("admin.start")}</button>
        <button disabled={competition.status === "ended"} onClick={onEnd} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-black text-white disabled:opacity-45" style={{ background: RED }}><Square size={15} />{t("admin.end")}</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{ borderColor: "#0C0A0F14" }}>
        <button onClick={onSyncNow} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-black text-white" style={{ background: NAVY }}><RefreshCw size={15} />{t("admin.syncNow")}</button>
        <span className="text-xs font-bold text-zinc-500">{t("admin.lastSync")} {lastSyncAt ? formatDate(lastSyncAt) : t("admin.never")}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t("admin.titleField")} value={form.title} onChange={(title) => setForm({ ...form, title })} />
        <Field label={t("admin.upstreamBaseUrl")} value={form.upstreamBaseUrl} onChange={(upstreamBaseUrl) => setForm({ ...form, upstreamBaseUrl })} />
        <Field label={t("admin.startsAt")} type="datetime-local" value={form.startsAt} onChange={(startsAt) => setForm({ ...form, startsAt })} />
        <Field label={t("admin.endsAt")} type="datetime-local" value={form.endsAt} onChange={(endsAt) => setForm({ ...form, endsAt })} />
      </div>
      <div className="flex flex-wrap gap-3">
        <Toggle label={t("admin.votingEnabled")} checked={form.votingEnabled} onChange={(votingEnabled) => setForm({ ...form, votingEnabled })} />
        <Toggle label={t("admin.commentsEnabled")} checked={form.commentsEnabled} onChange={(commentsEnabled) => setForm({ ...form, commentsEnabled })} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="rounded-lg px-4 py-2 text-sm font-black text-white" style={{ background: NAVY }} onClick={() => onPatch({ ...form, startsAt: msInput(form.startsAt), endsAt: msInput(form.endsAt) })}>{t("app.save")}</button>
        <button className="flex items-center gap-1 rounded-lg border-2 px-4 py-2 text-sm font-black" style={{ borderColor: RED, color: RED }} onClick={onReset}><RotateCcw size={15} />{t("admin.resetVotes")}</button>
        <button className="flex items-center gap-1 rounded-lg border-2 px-4 py-2 text-sm font-black" style={{ borderColor: RED, color: RED }} onClick={() => setClearOpen(true)}><Trash2 size={15} />{t("admin.clearData")}</button>
      </div>
      {clearOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"><div className="w-full max-w-md rounded-2xl border-2 bg-white p-5" style={{ borderColor: RED }}><h3 className="text-lg font-black" style={{ color: RED }}>{t("admin.clearData")}</h3><p className="mt-2 text-sm font-semibold text-zinc-600">{t("admin.clearWarning")}</p><Field label={t("admin.typeClear")} value={confirm} onChange={setConfirm} /><div className="mt-4 flex justify-end gap-2"><button className="rounded-lg border px-4 py-2 text-sm font-black" onClick={() => { setClearOpen(false); setConfirm(""); }}>{t("app.cancel")}</button><button disabled={confirm !== "CLEAR"} className="rounded-lg px-4 py-2 text-sm font-black text-white disabled:opacity-40" style={{ background: RED }} onClick={() => { onClear(); setClearOpen(false); setConfirm(""); }}>{t("admin.clearData")}</button></div></div></div>}
    </div>
  );
}

export function RosterAdmin({ contestants, onSync, onPatch, onUpload }: { contestants: ManagedContestant[]; onSync: () => void; onPatch: (id: string, patch: Record<string, unknown>) => void; onUpload: (id: string, file: File) => void }) {
  const { t } = useTranslation();
  return <div><div className="mb-4 flex items-center gap-2"><h2 className="text-xl font-black">{t("admin.roster")}</h2><button onClick={onSync} className="ml-auto flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-black text-white" style={{ background: NAVY }}><RefreshCw size={15} />{t("admin.sync")}</button></div><div className="space-y-2">{contestants.map((c) => <RosterRow key={c.id} contestant={c} onPatch={onPatch} onUpload={onUpload} />)}</div></div>;
}

function RosterRow({ contestant, onPatch, onUpload }: { contestant: ManagedContestant; onPatch: (id: string, patch: Record<string, unknown>) => void; onUpload: (id: string, file: File) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(contestant);
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="rounded-lg border-2 p-3" style={{ borderColor: "#0C0A0F22", opacity: contestant.hidden ? 0.55 : 1 }}>
      <div className="flex items-center gap-3">
        <span className="w-8 text-center text-sm font-black">{contestant.sortOrder}</span>
        <ContestantAvatar name={contestant.displayName} company={`${contestant.tagline} ${contestant.displayName}`} avatarS3Uri={contestant.avatarS3Uri} color={contestant.accentColor} size="sm" />
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-black">{contestant.displayName}</div><div className="truncate text-xs font-semibold text-zinc-500">{contestant.id}</div></div>
        <input ref={inputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => e.target.files?.[0] && onUpload(contestant.id, e.target.files[0])} />
        <button onClick={() => inputRef.current?.click()} className="rounded-lg border px-2 py-2"><Upload size={15} /></button>
        <button onClick={() => setEditing(!editing)} className="rounded-lg border px-2 py-2"><Eye size={15} /></button>
        <button onClick={() => onPatch(contestant.id, { hidden: !contestant.hidden })} className="rounded-lg border px-2 py-2">{contestant.hidden ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      </div>
      {editing && <div className="mt-3 grid gap-2 md:grid-cols-4"><Field label={t("admin.displayName")} value={form.displayName} onChange={(displayName) => setForm({ ...form, displayName })} /><Field label={t("admin.tagline")} value={form.tagline} onChange={(tagline) => setForm({ ...form, tagline })} /><Field label={t("admin.accentColor")} value={form.accentColor} onChange={(accentColor) => setForm({ ...form, accentColor })} /><Field label={t("admin.sortOrder")} type="number" value={String(form.sortOrder)} onChange={(sortOrder) => setForm({ ...form, sortOrder: Number(sortOrder) })} /><button className="rounded-lg px-3 py-2 text-sm font-black text-white md:col-span-4" style={{ background: NAVY }} onClick={() => onPatch(contestant.id, { displayName: form.displayName, tagline: form.tagline, accentColor: form.accentColor, sortOrder: form.sortOrder })}>{t("app.save")}</button></div>}
    </div>
  );
}

export function CommentsAdmin({ comments, onHide }: { comments: Array<Comment & { hidden?: number }>; onHide: (id: number) => void }) {
  const { t } = useTranslation();
  return <div className="space-y-2">{comments.map((comment) => <div key={comment.id} className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: "#0C0A0F22", opacity: comment.hidden ? 0.55 : 1 }}><span className="w-28 truncate text-xs font-black text-zinc-500">{comment.displayName}</span><span className="min-w-0 flex-1 text-sm font-semibold">{comment.text}</span>{comment.hidden ? <span className="text-xs font-black" style={{ color: RED }}>{t("admin.hiddenComment")}</span> : <button className="rounded-lg px-3 py-1 text-xs font-black text-white" style={{ background: RED }} onClick={() => onHide(comment.id)}>{t("admin.hide")}</button>}</div>)}</div>;
}

export function KeysAdmin({ keys, plainKey, onCreate, onRevoke }: { keys: ApiKey[]; plainKey: string | null; onCreate: (name: string) => void; onRevoke: (id: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("arena-agent");
  return <div><div className="mb-4 flex gap-2"><input className="flex-1 rounded-lg border-2 px-3 py-2 text-sm font-semibold outline-none" style={{ borderColor: "#0C0A0F" }} value={name} onChange={(e) => setName(e.target.value)} aria-label={t("admin.keyName")} /><button className="rounded-lg px-4 py-2 text-sm font-black text-white" style={{ background: ORANGE }} onClick={() => onCreate(name)}>{t("admin.createKey")}</button></div>{plainKey && <CodeBlock title={t("admin.plaintextOnce")} text={plainKey} />}<div className="mt-4 space-y-2">{keys.map((key) => <div key={key.id} className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: "#0C0A0F22" }}><KeyRound size={15} color={NAVY} /><span className="font-black">{key.name}</span><span className="font-mono text-sm text-zinc-500">{key.prefix}</span><span className="ml-auto text-xs font-bold text-zinc-500">{t("admin.lastUsed")} {key.lastUsedAt ? formatDate(key.lastUsedAt) : t("admin.never")}</span><button onClick={() => onRevoke(key.id)} className="rounded-lg border px-3 py-1 text-xs font-black" style={{ borderColor: RED, color: RED }}>{t("admin.revoke")}</button></div>)}</div></div>;
}

export function SummaryAdmin({ votes, equity }: { votes: SummaryVotesResponse | null; equity: SummaryEquityResponse | null }) {
  const { t } = useTranslation();
  return <div className="space-y-6"><SummaryTable title={t("admin.votesSummary")} filename="arena-votes.csv" rows={votes?.contestants ?? []} days={votes?.days} fixed={[["displayName", t("admin.displayName")], ["total", t("admin.totalVotes")]]} /><SummaryTable title={t("admin.equitySummary")} filename="arena-equity.csv" rows={equity?.contestants ?? []} days={equity?.days} fixed={[["displayName", t("admin.displayName")], ["equity", t("dashboard.equity")], ["returnPct", t("dashboard.return")]]} /></div>;
}

function SummaryTable({ title, filename, rows, days, fixed }: { title: string; filename: string; rows: Array<Record<string, unknown> & { id: string; days: Record<string, number> }>; days?: string[]; fixed: Array<[string, string]> }) {
  const { t } = useTranslation();
  const allDays = days?.length ? days : [...new Set(rows.flatMap((row) => Object.keys(row.days ?? {})))].sort();
  return <section><div className="mb-3 flex items-center gap-2"><h2 className="text-xl font-black">{title}</h2><button className="ml-auto flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-black text-white" style={{ background: NAVY }} onClick={() => downloadCsv(filename, rows, fixed, allDays)}><Download size={15} />{t("admin.exportCsv")}</button></div><div className="overflow-x-auto rounded-xl border" style={{ borderColor: "#0C0A0F14" }}><table className="min-w-full text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr>{fixed.map(([, label]) => <th key={label} className="px-3 py-2">{label}</th>)}{allDays.map((day) => <th key={day} className="px-3 py-2">{day}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id} className="border-t" style={{ borderColor: "#0C0A0F14" }}>{fixed.map(([key]) => <td key={key} className="px-3 py-2 font-bold">{String(row[key] ?? "")}</td>)}{allDays.map((day) => <td key={day} className="px-3 py-2 font-semibold">{row.days?.[day] ?? 0}</td>)}</tr>) : <tr><td className="px-3 py-6 text-center font-bold text-zinc-500" colSpan={fixed.length + allDays.length}>{t("app.empty")}</td></tr>}</tbody></table></div></section>;
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown> & { days: Record<string, number> }>, fixed: Array<[string, string]>, days: string[]) {
  const header = [...fixed.map(([, label]) => label), ...days];
  const body = rows.map((row) => [...fixed.map(([key]) => row[key] ?? ""), ...days.map((day) => row.days?.[day] ?? 0)]);
  const csv = [header, ...body].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function uploadAvatar(id: string, file: File) {
  const presigned = await arenaApi.manage.presignAvatar(id, file.type);
  await fetch(presigned.url, { method: "PUT", headers: presigned.requiredHeaders, body: file });
  await arenaApi.manage.confirmAvatar(id, presigned.key);
}
