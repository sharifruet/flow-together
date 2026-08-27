/**
 * Work's overview (W2.2, ENTERPRISE_PARITY_PLAN E3: "A Reports/overview screen, built
 * from paged-query counts, matching §9's constraint").
 *
 * **What these numbers are:** each is the `total` of a `size=1` query — five against the
 * runtime task resource, one against the historic one. They are counts of rows matching a
 * filter at the moment the screen loaded. REQUIREMENTS §9 rules out an analytics API for
 * this fork, so there is no trend, no average cycle time and no chart: those would need
 * data this engine does not expose, and drawing them from a sample of the first page would
 * be a confident-looking guess.
 *
 * Each tile links to the inbox filter behind it, so a number is a starting point rather
 * than a dead end.
 */

import {
  AsyncBoundary,
  Badge,
  Icon,
  Link,
  PageHeader,
  useAsync,
  useI18n,
  type HistoryApi,
  type IconName,
  type TaskApi,
} from "@togetherflow/common";

export interface ReportsProps {
  taskApi: TaskApi;
  historyApi: HistoryApi;
  userId: string;
}

export function Reports({ taskApi, historyApi, userId }: ReportsProps) {
  const { t } = useI18n();

  const counts = useAsync(
    async (signal) => {
      const total = (promise: Promise<{ total: number }>) =>
        promise.then((page) => page.total).catch(() => undefined);

      // Midnight tonight, so "overdue" and "due today" do not overlap — an overdue task
      // is already its own band and double-counting it is the classic dashboard lie.
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      const now = new Date().toISOString();

      const [mine, overdue, dueToday, claimable, completed] = await Promise.all([
        total(taskApi.query({ assignee: userId, size: 1, active: true }, signal)),
        total(taskApi.query({ assignee: userId, size: 1, active: true, dueBefore: now }, signal)),
        total(
          taskApi.query(
            { assignee: userId, size: 1, active: true, dueAfter: now, dueBefore: endOfToday.toISOString() },
            signal,
          ),
        ),
        total(taskApi.query({ candidateUser: userId, unassigned: true, size: 1, active: true }, signal)),
        total(historyApi.queryTasks({ taskAssignee: userId, finished: true, size: 1 }, signal)),
      ]);
      return { mine, overdue, dueToday, claimable, completed };
    },
    [taskApi, historyApi, userId],
  );

  return (
    <section className="tf-reports" aria-label={t("reports.label")}>
      <PageHeader title={t("reports.title")} description={t("reports.description")} />

      <div className="tf-screen__body">
        <AsyncBoundary
          loading={counts.loading}
          error={counts.error}
          data={counts.data}
          onRetry={counts.refetch}
          skeletonRows={3}
        >
          {(data) => {
            const tiles: {
              id: string;
              label: string;
              count: number | undefined;
              to: string;
              icon: IconName;
              tone: "neutral" | "warning" | "danger";
            }[] = [
              { id: "mine", label: t("reports.mine"), count: data.mine, to: "/inbox", icon: "inbox", tone: "neutral" },
              {
                id: "overdue",
                label: t("reports.overdue"),
                count: data.overdue,
                to: "/inbox?due=overdue",
                icon: "warning",
                tone: data.overdue ? "danger" : "neutral",
              },
              {
                id: "dueToday",
                label: t("reports.dueToday"),
                count: data.dueToday,
                to: "/inbox?due=today",
                icon: "clock",
                tone: data.dueToday ? "warning" : "neutral",
              },
              {
                id: "claimable",
                label: t("reports.claimable"),
                count: data.claimable,
                to: "/inbox?filter=claimable",
                icon: "user",
                tone: "neutral",
              },
              {
                id: "completed",
                label: t("reports.completed"),
                count: data.completed,
                to: "/inbox?filter=completed",
                icon: "check",
                tone: "neutral",
              },
            ];

            return (
              <>
                <ul className="tf-cards">
                  {tiles.map((tile) => (
                    <li key={tile.id}>
                      <Link to={tile.to} className="tf-tile">
                        <span className="tf-tile__icon">
                          <Icon name={tile.icon} size={20} />
                        </span>
                        <span className="tf-tile__count">
                          {tile.count === undefined ? (
                            // Unknown is not zero.
                            <span className="tf-muted" title={t("reports.unavailable")}>
                              —
                            </span>
                          ) : (
                            tile.count
                          )}
                        </span>
                        <span className="tf-tile__label">{tile.label}</span>
                        {tile.count !== undefined && tile.count > 0 && tile.tone !== "neutral" ? (
                          <Badge tone={tile.tone} subtle>
                            {t("reports.needsAttention")}
                          </Badge>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="tf-muted tf-reports__note">{t("reports.note")}</p>
              </>
            );
          }}
        </AsyncBoundary>
      </div>
    </section>
  );
}
