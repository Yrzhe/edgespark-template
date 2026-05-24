import { Camera, KeyRound, LayoutGrid, LockKeyhole, LogOut, Sparkles, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import type { AuthUser } from "@edgespark/web";

import { Field, MonoModal, inputClass } from "@/components/MonoModal";
import { clearManagementToken, perchApi } from "@/lib/api";
import { client } from "@/lib/edgespark";

const nav = [
  { to: "/pages", label: "Pages", icon: LayoutGrid },
  { to: "/connect", label: "Connect AI", icon: Sparkles },
  { to: "/keys", label: "API Keys", icon: KeyRound },
];

export function Layout({ user }: { user: AuthUser }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"password" | "name" | "avatar" | null>(null);
  const [displayName, setDisplayName] = useState(user.name || "Owner");
  const [avatarUrl, setAvatarUrl] = useState(user.image ?? "");
  const [accountError, setAccountError] = useState<string | null>(null);
  const initials = initialsFor(displayName);

  useEffect(() => {
    let cancelled = false;
    perchApi.me.get()
      .then((me) => {
        if (!cancelled) setAvatarUrl(me.avatarUrl ?? "");
      })
      .catch((err) => {
        if (!cancelled) setAccountError(err instanceof Error ? err.message : "Failed to load account avatar.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    clearManagementToken();
    await client.auth.signOut();
    window.location.reload();
  }

  return (
    <div className="flex min-h-screen w-full bg-zinc-50 text-zinc-900 antialiased">
      <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-zinc-200 bg-white px-4 py-5 md:flex">
        <div>
          <div className="flex items-center gap-2 px-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-zinc-900 text-[13px] font-bold text-white">P</span>
            <span className="text-[15px] font-semibold tracking-tight">Perch</span>
          </div>
          <nav className="mt-7 flex flex-col gap-1">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] transition-colors ${
                      isActive ? "bg-zinc-900 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    }`
                  }
                >
                  <Icon className="h-[17px] w-[17px]" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
        <div className="relative">
          <button className="flex w-full items-center gap-2.5 rounded-lg border border-zinc-200 px-2.5 py-2 text-left transition-colors hover:border-zinc-900" onClick={() => setMenuOpen((open) => !open)}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <span className="grid h-7 w-7 place-items-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-600">{initials}</span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium text-zinc-800">{displayName}</span>
            <span className="block truncate text-[11px] text-zinc-400">Owner</span>
          </span>
          </button>
          {accountError && <p className="mt-2 px-2 text-[11px] text-rose-600">{accountError}</p>}
          {menuOpen && (
            <div className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl">
              <MenuButton icon={<LockKeyhole className="h-4 w-4" />} label="Change password" onClick={() => { setModal("password"); setMenuOpen(false); }} />
              <MenuButton icon={<UserRound className="h-4 w-4" />} label="Set display name" onClick={() => { setModal("name"); setMenuOpen(false); }} />
              <MenuButton icon={<Camera className="h-4 w-4" />} label="Set avatar" onClick={() => { setModal("avatar"); setMenuOpen(false); }} />
              <button className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900" onClick={() => void signOut()}>
                <LogOut className="h-4 w-4" /> Log out
              </button>
            </div>
          )}
        </div>
      </aside>
      <Outlet />
      {modal === "password" && <PasswordModal onClose={() => setModal(null)} />}
      {modal === "name" && (
        <NameModal
          initialName={displayName}
          onClose={() => setModal(null)}
          onSaved={(name) => {
            setDisplayName(name);
            setModal(null);
          }}
        />
      )}
      {modal === "avatar" && (
        <AvatarModal
          onClose={() => setModal(null)}
          onSaved={(image) => {
            setAvatarUrl(image ?? "");
            setAccountError(null);
            setModal(null);
          }}
          onError={setAccountError}
        />
      )}
    </div>
  );
}

function MenuButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function PasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    try {
      await client.auth.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password.");
    }
  }

  return (
    <MonoModal title="Change password" onClose={onClose}>
      <form className="space-y-4 p-5" onSubmit={submit}>
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</div>}
        {done && <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] text-zinc-700">Password updated.</div>}
        <Field label="Current password"><input className={inputClass} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></Field>
        <Field label="New password"><input className={inputClass} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} /></Field>
        <Field label="Confirm new password"><input className={inputClass} type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required minLength={8} /></Field>
        <ModalActions onCancel={onClose} submitLabel="Update password" />
      </form>
    </MonoModal>
  );
}

function NameModal({ initialName, onClose, onSaved }: { initialName: string; onClose: () => void; onSaved: (name: string) => void }) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextName = name.trim() || "Owner";
    setError(null);
    try {
      await updateAuthUser({ name: nextName });
      onSaved(nextName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update display name.");
    }
  }

  return (
    <MonoModal title="Set display name" onClose={onClose}>
      <form className="space-y-4 p-5" onSubmit={submit}>
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</div>}
        <Field label="Display name"><input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <ModalActions onCancel={onClose} submitLabel="Save name" />
      </form>
    </MonoModal>
  );
}

function AvatarModal({
  onClose,
  onSaved,
  onError,
}: {
  onClose: () => void;
  onSaved: (image: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    onError(null);
    if (!file) {
      setError("Choose an image file first.");
      return;
    }
    try {
      setUploading(true);
      const signed = await perchApi.me.presignAvatar(file.type);
      const upload = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: signed.requiredHeaders,
        body: file,
      });
      if (!upload.ok) throw new Error(`Upload failed with status ${upload.status}.`);
      await perchApi.me.confirmAvatar(signed.key);
      const me = await perchApi.me.get();
      onSaved(me.avatarUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload avatar.";
      setError(message);
      onError(message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <MonoModal title="Set avatar" onClose={onClose}>
      <form className="space-y-4 p-5" onSubmit={submit}>
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</div>}
        <Field label="Image file">
          <input
            className={inputClass}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            required
          />
        </Field>
        {file && <p className="text-[12px] text-zinc-500">{file.name} · {Math.round(file.size / 1024)} KB</p>}
        <ModalActions onCancel={onClose} submitLabel={uploading ? "Uploading..." : "Upload avatar"} disabled={uploading} />
      </form>
    </MonoModal>
  );
}

function ModalActions({ onCancel, submitLabel, disabled = false }: { onCancel: () => void; submitLabel: string; disabled?: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-700" onClick={onCancel} disabled={disabled}>Cancel</button>
      <button className="rounded-lg bg-zinc-900 px-3.5 py-2 text-[13px] font-medium text-white disabled:opacity-50" disabled={disabled}>{submitLabel}</button>
    </div>
  );
}

async function updateAuthUser(input: { name?: string; image?: string | null }) {
  const auth = client.auth as typeof client.auth & {
    updateUser?: (input: { name?: string; image?: string | null }) => Promise<unknown>;
  };
  if (!auth.updateUser) throw new Error("Profile updates are not available in this EdgeSpark auth SDK.");
  await auth.updateUser(input);
}

function initialsFor(value: string): string {
  return value
    .split(/\s|@|-|\./)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "OW";
}
