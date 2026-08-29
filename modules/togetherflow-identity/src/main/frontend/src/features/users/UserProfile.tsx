/**
 * A user's picture and custom info (REQUIREMENTS.md §7.3).
 *
 * **These endpoints are not on the IDM servlet**, despite being an identity concern.
 * Both `UserPictureResource` and `UserInfoCollectionResource` live in `flowable-rest`
 * under `/identity/users/{id}/…` — the process API. Verified against a running engine:
 * the same paths on `/idm-api` answer "No endpoint". Hence the separate API object.
 *
 * The picture is fetched by URL rather than as data, so a 404 (the normal state for a
 * user who has never uploaded one) is handled by the `<img>` element's own error path
 * instead of a failed request the panel has to reason about.
 */

import { useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  Modal,
  ConfirmDialog,
  TextInput,
  useAsync,
  useT,
  useToast,
  type IdmUser,
  type UserInfoEntry,
  type UserProfileApi,
} from "@togetherflow/common";

export interface UserProfileProps {
  profileApi: UserProfileApi;
  user: IdmUser;
  readOnly: boolean;
  onClose: () => void;
}

export function UserProfile({ profileApi, user, readOnly, onClose }: UserProfileProps) {
  const t = useT();
  const { push } = useToast();
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<UserInfoEntry | null>(null);
  const [pictureFailed, setPictureFailed] = useState(false);

  const info = useAsync((signal) => profileApi.listInfo(user.id, signal), [profileApi, user.id, refresh]);

  const run = async (message: string, action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      push({ tone: "success", message });
      setRefresh((n) => n + 1);
      return true;
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("profile.failed"),
        reference: apiError?.correlationId,
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open
      title={[user.firstName, user.lastName].filter(Boolean).join(" ") || user.id}
      description={user.id}
      size="lg"
      onClose={onClose}
      actions={
        <Button variant="secondary" onClick={onClose}>
          {t("action.close")}
        </Button>
      }
    >

        <section className="tf-profile">
          <div className="tf-profile__picture">
            {pictureFailed ? (
              <div className="tf-profile__placeholder" aria-hidden="true">
                {(user.id || "?").slice(0, 2).toUpperCase()}
              </div>
            ) : (
              <img
                className="tf-profile__image"
                src={`${profileApi.pictureUrl(user.id)}?v=${refresh}`}
                alt={`Profile picture for ${user.id}`}
                onError={() => setPictureFailed(true)}
              />
            )}
            {pictureFailed ? <p className="tf-muted">No picture uploaded.</p> : null}

            {!readOnly ? (
              <label className="tf-profile__upload">
                <span className="tf-field__label">Upload a picture</span>
                <input
                  type="file"
                  className="tf-input"
                  accept="image/*"
                  disabled={busy}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const ok = await run(t("profile.picture.updated"), () =>
                      profileApi.uploadPicture(user.id, file),
                    );
                    if (ok) setPictureFailed(false);
                  }}
                />
              </label>
            ) : null}
          </div>

          <div className="tf-profile__info">
            <h3 className="tf-detail__section-title">{t("profile.info.title")}</h3>
            <AsyncBoundary
              loading={info.loading}
              error={info.error}
              data={info.data}
              onRetry={info.refetch}
              isEmpty={(rows) => rows.length === 0}
              empty={<p className="tf-muted">{t("profile.info.none")}</p>}
            >
              {(rows) => (
                <ul className="tf-starters">
                  {rows.map((entry) => (
                    <li className="tf-starters__item" key={entry.key}>
                      <span className="tf-starters__name">{entry.key}</span>
                      <span className="tf-profile__value">{entry.value ?? "—"}</span>
                      {!readOnly ? (
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setPendingDelete(entry)}
                        >
                          {t("action.remove")}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </AsyncBoundary>

            {!readOnly ? (
              <div className="tf-starters__add">
                <TextInput
                  label={t("profile.info.key")}
                  value={newKey}
                  disabled={busy}
                  onChange={(event) => setNewKey(event.target.value)}
                />
                <TextInput
                  label={t("profile.info.value")}
                  value={newValue}
                  disabled={busy}
                  onChange={(event) => setNewValue(event.target.value)}
                />
                <Button
                  loading={busy}
                  disabled={!newKey.trim()}
                  onClick={async () => {
                    const key = newKey.trim();
                    const ok = await run(t("profile.info.saved", { key }), () =>
                      profileApi.setInfo(user.id, key, newValue),
                    );
                    if (ok) {
                      setNewKey("");
                      setNewValue("");
                    }
                  }}
                >
                  {t("action.save")}
                </Button>
              </div>
            ) : null}
          </div>
        </section>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("profile.info.delete.title")}
        description={t("profile.info.delete.description", {
          key: pendingDelete?.key ?? "",
          id: user.id,
        })}
        confirmLabel={t("profile.info.delete.confirm")}
        destructive
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) {
            void run(t("profile.info.removed", { key: target.key }), () =>
              profileApi.deleteInfo(user.id, target.key),
            );
          }
        }}
      />
    </>
  );
}
