/*
 * Work's inbox under load (REQUIREMENTS.md §7.1, §13.5).
 *
 * The requests here are the ones TaskInbox.tsx actually issues, copied from its
 * `useMemo<TaskQueryRequest>` rather than invented — same sort, same page size, same filter
 * shapes. A load test that measures a query the UI never sends measures nothing.
 *
 * The three filter views are separated because they are not the same query. `involvedUser`
 * (the default) joins the identity-link table; `assignee` is an indexed column on the task
 * row; `candidateUser` + `unassigned` goes through the candidate resolution path. On an
 * empty database they cost the same, which is the whole reason the seed exists.
 *
 * Run: see qa/load/README.md.
 */

import http from "k6/http";
import encoding from "k6/encoding";
import { check, group } from "k6";
import { Trend } from "k6/metrics";

const BASE = __ENV.TF_API_BASE || "http://localhost:8080/flowable-rest/service";
const USER = __ENV.TF_USER || "rest-admin";
const PASSWORD = __ENV.TF_PASSWORD || "test";

/** Matches PAGE_SIZE in TaskInbox.tsx. Paging cost is what a user actually feels. */
const PAGE_SIZE = 25;
const USERS = ["kermit", "fozzie", "gonzo", "rowlf", "scooter"];

/** Per-view latency, so a regression can be attributed rather than just observed. */
const involved = new Trend("inbox_involved_ms", true);
const mine = new Trend("inbox_mine_ms", true);
const claimable = new Trend("inbox_claimable_ms", true);
const filtered = new Trend("inbox_filtered_ms", true);
const history = new Trend("my_history_ms", true);

/**
 * Stage profile. `full` is the real run; `smoke` exists so the harness itself can be
 * verified in under a minute — an unrun load harness is worth about as much as an unbuilt
 * container image. A smoke run's numbers are not a result; its exit code is.
 */
const STAGES = __ENV.TF_LOAD_PROFILE === "smoke"
  ? [{ duration: "10s", target: 3 }, { duration: "10s", target: 0 }]
  : [
      { duration: "30s", target: 10 },
      { duration: "2m", target: 10 },
      { duration: "30s", target: 30 },
      { duration: "1m", target: 30 },
      { duration: "30s", target: 0 },
    ];

export const options = {
  scenarios: {
    inbox: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: STAGES,
    },
  },
  /*
   * Thresholds are what turns this from an observation into a check. 1s p95 is the point
   * at which a list stops feeling like it responded; the UI's own client gives up at 30s
   * (ADR 0014), so a p95 anywhere near that is already a broken experience.
   */
  thresholds: {
    "http_req_failed": ["rate<0.01"],
    "inbox_involved_ms": ["p(95)<1000"],
    "inbox_mine_ms": ["p(95)<1000"],
    "inbox_claimable_ms": ["p(95)<1000"],
    "my_history_ms": ["p(95)<2000"],
  },
};

const params = {
  headers: {
    Authorization: `Basic ${encoding.b64encode(`${USER}:${PASSWORD}`)}`,
    "Content-Type": "application/json",
  },
};

function post(path, body, trend) {
  const response = http.post(`${BASE}${path}`, JSON.stringify(body), params);
  if (trend) trend.add(response.timings.duration);
  check(response, {
    "status is 200": (r) => r.status === 200,
    // A 200 carrying no `data` array means the shape changed under us, which a status
    // check alone would miss.
    "body has data": (r) => {
      try {
        return Array.isArray(r.json("data"));
      } catch {
        return false;
      }
    },
  });
  return response;
}

export default function () {
  const user = USERS[__VU % USERS.length];
  // Real users are not all on page 1. Paging deep is where offset-based paging degrades.
  const start = (__ITER % 8) * PAGE_SIZE;

  const base = {
    start,
    size: PAGE_SIZE,
    sort: "dueDate",
    order: "asc",
    active: true,
  };

  group("inbox: involved (default view)", () => {
    post("/query/tasks", { ...base, involvedUser: user }, involved);
  });

  group("inbox: assigned to me", () => {
    post("/query/tasks", { ...base, assignee: user }, mine);
  });

  group("inbox: claimable", () => {
    post("/query/tasks", { ...base, candidateUser: user, unassigned: true }, claimable);
  });

  group("inbox: filtered by definition and priority", () => {
    // The filter combination §7.1 specifies, which is also the most selective and so the
    // one most likely to hide a missing index behind a small result set.
    post("/query/tasks", {
      ...base,
      involvedUser: user,
      processDefinitionKey: "loadOrder",
      minimumPriority: 50,
    }, filtered);
  });

  group("my history", () => {
    post("/query/historic-task-instances", {
      start: 0,
      size: PAGE_SIZE,
      sort: "endTime",
      order: "desc",
      finished: true,
      taskInvolvedUser: user,
    }, history);
  });
}
