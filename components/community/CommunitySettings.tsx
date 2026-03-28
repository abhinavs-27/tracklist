"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { CommunityRow } from "@/types";

export type CommunitySettingsRenderProps = {
  /** Edit + join/leave — place inside `CommunityHero` actions. */
  heroActions: ReactNode;
  /** Warning line for non-editors — below the hero (edit opens in a modal). */
  settingsBody: ReactNode;
};

type Props = {
  communityId: string;
  community: CommunityRow;
  memberCount: number;
  canEdit: boolean;
  /** Join / leave / invite — stacked under Edit in the hero when using `children`. */
  headerActions?: ReactNode;
  /** When true, hide title/description/member line (legacy layout without hero). */
  suppressBranding?: boolean;
  /**
   * Hero layout: receive `heroActions` and `settingsBody` to place the hero and
   * settings in one flow (Edit lives in the hero).
   */
  children?: (props: CommunitySettingsRenderProps) => ReactNode;
};

export function CommunitySettings({
  communityId,
  community,
  memberCount,
  canEdit,
  headerActions,
  suppressBranding = false,
  children,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description ?? "");
  const [isPrivate, setIsPrivate] = useState(community.is_private);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setName(community.name);
    setDescription(community.description ?? "");
    setIsPrivate(community.is_private);
  }, [
    community.id,
    community.name,
    community.description,
    community.is_private,
  ]);

  /** Hero layout: edit opens a modal (not a block below the hero). */
  useEffect(() => {
    if (!children || !editing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [children, editing]);

  useEffect(() => {
    if (!children || !editing) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) cancelEdit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [children, editing, saving]);

  function cancelEdit() {
    setEditing(false);
    setError(null);
    setName(community.name);
    setDescription(community.description ?? "");
    setIsPrivate(community.is_private);
  }

  async function save() {
    if (!canEdit || saving) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() === "" ? null : description.trim(),
          is_private: isPrivate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Could not save");
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const publicCommunityWarning = !canEdit ? (
    <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-200/90">
      This is a public community. Only admins can change name, description, and
      privacy.
    </p>
  ) : null;

  const editFormInner = (
    <div className="space-y-4">
      <label className="block">
        <span className="text-xs font-medium text-zinc-400">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-lg font-bold text-white placeholder:text-zinc-600"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-zinc-400">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={2000}
          className="mt-1 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
        />
      </label>
      <div className="space-y-2">
        <span className="text-xs font-medium text-zinc-400">Privacy</span>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="h-4 w-4 rounded border border-zinc-600 bg-zinc-900 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm text-zinc-200">
            Private community (invite-only)
          </span>
        </label>
        <p className="text-xs text-zinc-500">
          Making a public community private promotes every member to admin. Making it
          public again does not demote anyone.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || name.trim().length < 2}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          disabled={saving}
          className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          Cancel
        </button>
        {error ? (
          <span className="text-sm text-red-400">{error}</span>
        ) : null}
      </div>
    </div>
  );

  const editForm = editing ? editFormInner : null;

  if (children) {
    const heroActions = (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canEdit && !editing ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setEditing(true);
            }}
            className="rounded-full border border-white/[0.12] bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-zinc-200 backdrop-blur-sm transition hover:bg-white/[0.1] sm:text-[0.8125rem]"
          >
            Edit
          </button>
        ) : null}
        {headerActions}
      </div>
    );

    const settingsBody = (
      <div className="min-w-0 flex-1 space-y-4">
        {publicCommunityWarning}
      </div>
    );

    return (
      <>
        {children({ heroActions, settingsBody })}
        {editing && canEdit ? (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={() => !saving && cancelEdit()}
            role="presentation"
          >
            <div
              className="max-h-[min(92vh,640px)] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-zinc-800 border-b-0 bg-zinc-950 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl ring-1 ring-white/[0.04] sm:rounded-2xl sm:border-b sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-community-modal-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="edit-community-modal-title"
                className="text-lg font-semibold tracking-tight text-white"
              >
                Edit community
              </h2>
              <div className="mt-4">{editFormInner}</div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="min-w-0 flex-1 space-y-4">
      {publicCommunityWarning}

      {editForm ? (
        editForm
      ) : suppressBranding ? (
        canEdit || headerActions ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canEdit ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setEditing(true);
                }}
                className="rounded-xl border border-white/12 bg-white/[0.06] px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-white/[0.1]"
              >
                Edit community
              </button>
            ) : null}
            {headerActions}
          </div>
        ) : null
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="min-w-0 text-2xl font-bold leading-tight text-white">
              {community.name}
            </h1>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setEditing(true);
                  }}
                  className="rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-1.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800"
                >
                  Edit
                </button>
              ) : null}
              {headerActions}
            </div>
          </div>
          {community.description ? (
            <p className="text-zinc-400">{community.description}</p>
          ) : null}
          <p className="text-sm text-zinc-500">
            {memberCount} member{memberCount !== 1 ? "s" : ""}
            {community.is_private ? (
              <span className="ml-2 rounded bg-zinc-800 px-2 py-0.5 text-xs">
                Private
              </span>
            ) : null}
          </p>
        </>
      )}

    </div>
  );
}
