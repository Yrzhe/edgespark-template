import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { KeyRound, MessageSquare, Settings, Trophy, Users } from "lucide-react";

import { CommentsAdmin, CompetitionAdmin, KeysAdmin, RosterAdmin, uploadAvatar } from "@/components/AdminSections";
import { useShellContext } from "@/components/Shell";
import { Gate, Loading } from "@/components/ui";
import { arenaApi, ApiError } from "@/lib/api";
import { CREAM, INK, NAVY, ORANGE, RED } from "@/lib/constants";
import type { ApiKey, Comment, ManagedCompetitionResponse, ManagedContestant } from "@/lib/types";

export default function AdminPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { onLogin, isAuthenticated, isOwner, ownerChecked } = useShellContext();
  const [tab, setTab] = useState("competition");
  const [error, setError] = useState<string | null>(null);
  const [competition, setCompetition] = useState<ManagedCompetitionResponse["competition"] | null>(null);
  const [contestants, setContestants] = useState<ManagedContestant[]>([]);
  const [comments, setComments] = useState<Array<Comment & { hidden?: number }>>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [plainKey, setPlainKey] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const [comp, roster, moderated, apiKeys] = await Promise.all([
        arenaApi.manage.competition(),
        arenaApi.manage.contestants(),
        arenaApi.manage.comments(),
        arenaApi.manage.keys(),
      ]);
      setCompetition(comp.competition);
      setContestants(roster.contestants);
      setComments(moderated.comments);
      setKeys(apiKeys.keys);
    } catch (err) {
      setError(errorText(err));
    }
  }

  useEffect(() => { if (isAuthenticated && isOwner) void load(); }, [isAuthenticated, isOwner]);

  if (isAuthenticated && !ownerChecked) return <Loading />;
  if (!isOwner) return <Gate title={t("app.ownerOnly")} body={t("app.loginHint")} action={isAuthenticated ? t("app.back") : t("app.signIn")} onAction={isAuthenticated ? () => navigate("/") : onLogin} />;
  if (error && !competition) return <Gate title={t("app.ownerOnly")} body={error} action={t("app.retry")} onAction={() => void load()} />;
  if (!competition) return <Loading />;

  async function mutate(fn: () => Promise<unknown>) {
    try {
      setError(null);
      await fn();
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function mutateCompetition(fn: () => Promise<unknown>) {
    try {
      setError(null);
      await fn();
      const refreshed = await arenaApi.manage.competition();
      setCompetition(refreshed.competition);
    } catch (err) {
      setError(errorText(err));
    }
  }

  const tabs = [
    ["competition", t("admin.competition"), Settings],
    ["roster", t("admin.roster"), Users],
    ["comments", t("admin.comments"), MessageSquare],
    ["keys", t("admin.keys"), KeyRound],
  ] as const;

  return (
    <div className="min-h-screen w-full font-sans lg:flex" style={{ background: CREAM, color: INK }}>
      <aside className="flex border-r-2 bg-white p-4 lg:min-h-screen lg:w-56 lg:flex-col" style={{ borderColor: INK }}>
        <div className="mb-4 flex items-center gap-2 px-1 max-lg:mr-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: INK }}><Trophy size={16} color={ORANGE} /></div>
          <div><div className="font-extrabold leading-none">{t("app.name")}</div><div className="text-[10px]" style={{ color: "#4A4A4F" }}>{t("admin.title")}</div></div>
        </div>
        <div className="flex gap-1 overflow-x-auto lg:flex-col">
          {tabs.map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold" style={{ background: tab === id ? INK : "transparent", color: tab === id ? "#fff" : INK }}><Icon size={16} />{label}</button>)}
        </div>
        <div className="mt-auto hidden items-center gap-2 rounded-lg px-2 py-2 lg:flex" style={{ background: CREAM }}><span className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: NAVY }}>O</span><span className="text-xs font-semibold">{t("admin.owner")}</span></div>
      </aside>
      <main className="flex-1 overflow-auto p-7">
        <div className="max-w-[920px]">
          {error && <div className="mb-4 rounded-lg border-2 px-3 py-2 text-sm font-bold" style={{ borderColor: RED, color: RED }}>{error}</div>}
          <section className="rounded-2xl border-2 bg-white p-5" style={{ borderColor: INK }}>
            {tab === "competition" && <CompetitionAdmin competition={competition} onPatch={(patch) => mutateCompetition(() => arenaApi.manage.patchCompetition(patch))} onStart={() => mutateCompetition(arenaApi.manage.start)} onEnd={() => mutateCompetition(arenaApi.manage.end)} onReset={() => mutateCompetition(arenaApi.manage.resetVotes)} />}
            {tab === "roster" && <RosterAdmin contestants={contestants} onSync={() => mutate(arenaApi.manage.syncContestants)} onPatch={(id, patch) => mutate(() => arenaApi.manage.patchContestant(id, patch))} onUpload={(id, file) => mutate(() => uploadAvatar(id, file))} />}
            {tab === "comments" && <CommentsAdmin comments={comments} onHide={(id) => mutate(() => arenaApi.manage.hideComment(id))} />}
            {tab === "keys" && <KeysAdmin keys={keys} plainKey={plainKey} onCreate={(name) => mutate(async () => { const created = await arenaApi.manage.createKey(name); setPlainKey(created.plaintext); })} onRevoke={(id) => mutate(() => arenaApi.manage.revokeKey(id))} />}
          </section>
        </div>
      </main>
    </div>
  );
}

function errorText(err: unknown) {
  if (err instanceof ApiError) return `${err.status}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}
