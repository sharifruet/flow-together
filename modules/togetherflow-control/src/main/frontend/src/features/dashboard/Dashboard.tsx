/**
 * Control's overview (W2.1, ENTERPRISE_PARITY_PLAN E2: "Dashboard tiles built from
 * `total` on existing paged queries").
 *
 * **What these numbers are, stated plainly, because the plan asks for exactly that:**
 * each tile is the `total` field of a `size=1` query against a list resource Control
 * already uses. They are counts of rows matching a filter, taken when the screen loaded.
 * They are not aggregates, not a time series, and not derived from any analytics store —
 * REQUIREMENTS §9 rules out an aggregation API for this fork, and reconstructing one by
 * paging through results would be slow *and* a lie about consistency: each count is its
 * own query, so two tiles can disagree by a few rows on a busy engine.
 *
 * Every tile links to the list it counts, with the same filter applied. A number an
 * operator cannot click through to is a number they have to go and re-find.
 */

import {
  AsyncBoundary,
  Badge,
  Icon,
  Link,
  PageHeader,
  useAsync,
  useI18n,
  type CaseApi,
  type IconName,
  type InstanceApi,
  type JobApi,
  type RepositoryApi,
} from "@togetherflow/common";

export interface DashboardProps {
  instanceApi: InstanceApi;
  caseApi: CaseApi;
  jobApi: JobApi;
  repositoryApi: RepositoryApi;
}

interface Tile {
  id: string;
  label: string;
  count: number | undefined;
  to: string;
  icon: IconName;
  /** Danger for a queue that means work has stopped; neutral for a plain population. */
  tone: "neutral" | "warning" | "danger";
}

export function Dashboard({ instanceApi, caseApi, jobApi, repositoryApi }: DashboardProps) {
  const { t } = useI18n();

  const counts = useAsync(
    async (signal) => {
      /*
       * One `size=1` query per tile, in parallel. A failed count resolves to undefined
       * rather than rejecting the whole screen: an unreachable CMMN engine should cost
       * the case tile, not the dashboard.
       */
      const total = (promise: Promise<{ total: number }>) =>
        promise.then((page) => page.total).catch(() => undefined);

      const [running, suspended, cases, deadLetter, failedJobs, definitions] = await Promise.all([
        total(instanceApi.query({ size: 1 }, signal)),
        total(instanceApi.query({ size: 1, suspended: true }, signal)),
        total(caseApi.query({ size: 1 }, signal)),
        total(jobApi.list("deadletter", { size: 1 }, signal)),
        total(jobApi.list("async", { size: 1, withException: true }, signal)),
        total(repositoryApi.listProcessDefinitions({ size: 1 }, signal)),
      ]);
      return { running, suspended, cases, deadLetter, failedJobs, definitions };
    },
    [instanceApi, caseApi, jobApi, repositoryApi],
  );

  return (
    <section className="tf-panel" aria-label={t("dashboard.label")}>
      <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} />

      <div className="tf-screen__body">
        <AsyncBoundary
          loading={counts.loading}
          error={counts.error}
          data={counts.data}
          onRetry={counts.refetch}
          skeletonRows={4}
        >
          {(data) => {
            const tiles: Tile[] = [
              {
                id: "running",
                label: t("dashboard.running"),
                count: data.running,
                to: "/instances",
                icon: "instances",
                tone: "neutral",
              },
              {
                id: "suspended",
                label: t("dashboard.suspended"),
                count: data.suspended,
                to: "/instances?suspendedOnly=true",
                icon: "clock",
                tone: data.suspended ? "warning" : "neutral",
              },
              {
                id: "cases",
                label: t("dashboard.cases"),
                count: data.cases,
                to: "/cases",
                icon: "cases",
                tone: "neutral",
              },
              {
                id: "deadLetter",
                label: t("dashboard.deadLetter"),
                count: data.deadLetter,
                to: "/jobs?queue=deadletter",
                icon: "error",
                tone: data.deadLetter ? "danger" : "neutral",
              },
              {
                id: "failedJobs",
                label: t("dashboard.failedJobs"),
                count: data.failedJobs,
                to: "/jobs?failedOnly=true",
                icon: "warning",
                tone: data.failedJobs ? "warning" : "neutral",
              },
              {
                id: "definitions",
                label: t("dashboard.definitions"),
                count: data.definitions,
                to: "/definitions",
                icon: "definitions",
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
                            // Unknown is not zero, and showing "0" for a count that failed
                            // is the kind of quiet wrong answer an operator acts on.
                            <span className="tf-muted" title={t("dashboard.unavailable")}>
                              —
                            </span>
                          ) : (
                            tile.count
                          )}
                        </span>
                        <span className="tf-tile__label">{tile.label}</span>
                        {tile.count !== undefined && tile.count > 0 && tile.tone !== "neutral" ? (
                          <Badge tone={tile.tone} subtle>
                            {t("dashboard.needsAttention")}
                          </Badge>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>

                <p className="tf-muted tf-dashboard__note">{t("dashboard.note")}</p>
              </>
            );
          }}
        </AsyncBoundary>
      </div>
    </section>
  );
}
