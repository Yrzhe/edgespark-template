import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Bot, Copy, FileText, KeyRound, Terminal } from "lucide-react";

import { useShellContext } from "@/components/Shell";
import { Gate, Loading } from "@/components/ui";
import { arenaApi, ApiError, setManagementBearer } from "@/lib/api";
import { CREAM, INK, NAVY, ORANGE, RED } from "@/lib/constants";

export default function ConnectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { onLogin, isAuthenticated, isOwner, ownerChecked } = useShellContext();
  const [keyName, setKeyName] = useState("arena-agent");
  const [plainKey, setPlainKey] = useState<string | null>(null);
  const [llms, setLlms] = useState("");
  const [error, setError] = useState<string | null>(null);
  const origin = window.location.origin;

  useEffect(() => {
    if (!isOwner) return;
    void arenaApi.llms().then(setLlms).catch((err) => setError(errorText(err)));
  }, [isOwner]);

  if (isAuthenticated && !ownerChecked) return <Loading />;
  if (!isOwner) return <Gate title={t("app.ownerOnly")} body={t("app.loginHint")} action={isAuthenticated ? t("app.back") : t("app.signIn")} onAction={isAuthenticated ? () => navigate("/") : onLogin} />;

  async function createKey() {
    try {
      const created = await arenaApi.manage.createKey(keyName);
      setPlainKey(created.plaintext);
      setManagementBearer(created.plaintext);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="min-h-screen w-full font-sans" style={{ background: CREAM, color: INK }}>
      <header className="flex min-h-14 items-center gap-3 border-b-2 bg-white px-7 py-3" style={{ borderColor: INK }}>
        <h1 className="text-lg font-extrabold">{t("connect.title")}</h1>
        <span className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: NAVY }}><Bot size={12} />{t("connect.agentNative")}</span>
      </header>

      <main className="mx-auto flex max-w-[820px] flex-col gap-5 p-6">
        <p className="text-sm" style={{ color: "#4A4A4F" }}>{t("connect.intro")}</p>
        {error && <p className="text-sm font-bold" style={{ color: RED }}>{error}</p>}

        <section className="rounded-2xl border-2 bg-white p-5" style={{ borderColor: INK }}>
          <div className="mb-3 flex items-center gap-2"><KeyRound size={16} color={NAVY} /><h2 className="font-extrabold">{t("connect.yourKey")}</h2></div>
          <div className="mb-3 flex flex-wrap gap-2">
            <input className="min-w-[220px] flex-1 rounded-lg border-2 px-3 py-2 text-sm font-semibold outline-none" style={{ borderColor: INK }} value={keyName} onChange={(e) => setKeyName(e.target.value)} aria-label={t("connect.keyName")} />
            <button className="rounded-lg px-4 py-2 text-sm font-black text-white" style={{ background: ORANGE }} onClick={() => void createKey()}>{t("connect.createKey")}</button>
          </div>
          <div className="flex items-center gap-2 rounded-lg border-2 px-3 py-2.5" style={{ borderColor: INK, background: CREAM }}>
            <span className="min-w-0 flex-1 truncate font-mono text-sm">{plainKey ?? t("connect.noKey")}</span>
            <button className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white" style={{ background: NAVY }} onClick={() => plainKey && void navigator.clipboard.writeText(plainKey)}><Copy size={13} />{t("app.copy")}</button>
          </div>
          <p className="mt-2 text-[11px]" style={{ color: "#4A4A4F" }}>{t("connect.once")}</p>
        </section>

        <section className="rounded-2xl border-2 bg-white p-5" style={{ borderColor: INK }}>
          <div className="mb-3 flex items-center gap-2"><FileText size={16} color={ORANGE} /><h2 className="font-extrabold">{t("connect.llms")}</h2><span className="text-[11px]" style={{ color: "#4A4A4F" }}>{t("connect.agentGuide")}</span></div>
          <Code title={`${origin}/api/public/llms.txt`} text={llms || t("app.loading")} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 font-extrabold"><Terminal size={16} />{t("connect.examples")}</h2>
          <Code title={t("connect.syncRoster")} text={`curl -X POST ${origin}/api/public/manage/contestants/sync \\\n  -H "Authorization: Bearer $ARENA_KEY"`} />
          <Code title={t("connect.updateContestant")} text={`curl -X PATCH ${origin}/api/public/manage/contestants/claude \\\n  -H "Authorization: Bearer $ARENA_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"displayName":"Claude","tagline":"steady trader"}'`} />
          <Code title={t("connect.startEnd")} text={`curl -X POST ${origin}/api/public/manage/competition/start \\\n  -H "Authorization: Bearer $ARENA_KEY"`} />
          <Code title={t("connect.readLeaderboard")} text={`curl ${origin}/api/public/contestants`} />
        </section>
      </main>
    </div>
  );
}

function Code({ title, text }: { title: string; text: string }) {
  const { t } = useTranslation();
  return <div className="overflow-hidden rounded-xl border-2" style={{ borderColor: INK }}><div className="flex items-center gap-2 border-b-2 px-3 py-2" style={{ borderColor: INK, background: CREAM }}><Terminal size={13} /><span className="text-xs font-bold">{title}</span><button className="ml-auto flex items-center gap-1 text-[11px] font-semibold" onClick={() => void navigator.clipboard.writeText(text)}><Copy size={12} />{t("app.copy")}</button></div><pre className="overflow-x-auto px-3 py-3 font-mono text-[12px] leading-relaxed" style={{ background: INK, color: "#E8E6E1" }}>{text}</pre></div>;
}

function errorText(err: unknown) {
  if (err instanceof ApiError) return `${err.status}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}
