/*
 * Control's operational screens under load (REQUIREMENTS.md §7.2, §13.5).
 *
 * Control is the app §13.5 should worry about most. Work's inbox is scoped to one person's
 * tasks, so it stays small no matter how big the deployment gets; Control queries across
 * *everything* — every instance, every job, all of history — and an admin triaging an
 * incident is the user least able to wait.
 *
 * As with the Work scenario, the request shapes come from the screens: the instance query
 * from Instances.tsx, the job queues from Jobs.tsx, the decision executions and table
 * browser from System.tsx.
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

/** Matches PAGE_SIZE in Instances.tsx. */
const PAGE_SIZE = 25;

const instances = new Trend("instances_page_ms", true);
const instancesDeep = new Trend("instances_deep_page_ms", true);
const instancesSearch = new Trend("instances_search_ms", true);
const historic = new Trend("historic_instances_ms", true);
const jobs = new Trend("job_queues_ms", true);
const tables = new Trend("table_browser_ms", true);

/**
 * Stage profile. `full` is the real run; `smoke` exists so the harness itself can be
 * verified in under a minute — an unrun load harness is worth about as much as an unbuilt
 * container image. A smoke run's numbers are not a result; its exit code is.
 */
const STAGES = __ENV.TF_LOAD_PROFILE === "smoke"
  ? [{ duration: "10s", target: 3 }, { duration: "10s", target: 0 }]
  : [
      { duration: "30s", target: 5 },
      { duration: "2m", target: 5 },
      // Control has far fewer concurrent users than Work — it is an admin console, not an
      // inbox. 15 is a busy incident, not a crowd.
      { duration: "30s", target: 15 },
      { duration: "1m", target: 15 },
      { duration: "30s", target: 0 },
    ];

export const options = {
  scenarios: {
    ops: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: STAGES,
    },
  },
  thresholds: {
    "http_req_failed": ["rate<0.01"],
    "instances_page_ms": ["p(95)<1000"],
    // Deep paging and `LIKE '%…%'` search are both expected to be slower than page 1, and
    // both are things a real operator does. Separate budgets so one does not mask the other.
    "instances_deep_page_ms": ["p(95)<2000"],
    "instances_search_ms": ["p(95)<2000"],
    "historic_instances_ms": ["p(95)<2000"],
    "job_queues_ms": ["p(95)<1000"],
  },
};

const params = {
  headers: {
    Authorization: `Basic ${encoding.b64encode(`${USER}:${PASSWORD}`)}`,
    "Content-Type": "application/json",
  },
};

function assertOk(response, expectData = true) {
  check(response, {
    "status is 200": (r) => r.status === 200,
    "body has data": (r) => {
      if (!expectData) return true;
      try {
        return Array.isArray(r.json("data"));
      } catch {
        return false;
      }
    },
  });
}

function post(path, body, trend) {
  const response = http.post(`${BASE}${path}`, JSON.stringify(body), params);
  if (trend) trend.add(response.timings.duration);
  assertOk(response);
  return response;
}

function get(path, trend, expectData = true) {
  const response = http.get(`${BASE}${path}`, params);
  if (trend) trend.add(response.timings.duration);
  assertOk(response, expectData);
  return response;
}

export default function () {
  group("instances: first page", () => {
    post("/query/process-instances", {
      start: 0,
      size: PAGE_SIZE,
      sort: "startTime",
      order: "desc",
    }, instances);
  });

  group("instances: deep page", () => {
    // Offset paging degrades with depth; an operator scrolling for a specific instance
    // gets here, and it is invisible in a page-1-only test.
    post("/query/process-instances", {
      start: (__ITER % 20) * PAGE_SIZE,
      size: PAGE_SIZE,
      sort: "startTime",
      order: "desc",
    }, instancesDeep);
  });

  group("instances: name search", () => {
    // A leading-wildcard LIKE cannot use an index. This is the query most likely to be the
    // first thing that hurts, and the UI offers it as a type-ahead (debounced, but still).
    post("/query/process-instances", {
      start: 0,
      size: PAGE_SIZE,
      processInstanceNameLikeIgnoreCase: "%instance 1%",
    }, instancesSearch);
  });

  group("history: finished instances", () => {
    post("/query/historic-process-instances", {
      start: 0,
      size: PAGE_SIZE,
      sort: "endTime",
      order: "desc",
      finished: true,
    }, historic);
  });

  group("jobs: every queue", () => {
    // Control's Jobs screen loads these queues; each is a separate resource, and a stuck
    // deployment usually means the dead-letter queue is the big one.
    for (const queue of ["jobs", "timer-jobs", "suspended-jobs", "deadletter-jobs"]) {
      get(`/management/${queue}?size=${PAGE_SIZE}`, jobs);
    }
  });

  group("system: table browser", () => {
    // Read-only and admin-only, but it pages raw rows — worth knowing what it costs before
    // someone opens ACT_HI_TASKINST on a production database.
    get(`/management/tables/ACT_RU_TASK/data?size=${PAGE_SIZE}`, tables);
  });

  group("system: engine properties", () => {
    // Cheap, and the readiness signal Control leans on. Included so a run that is failing
    // everywhere else still shows whether the engine is answering at all.
    get("/management/engine", null, false);
  });
}
