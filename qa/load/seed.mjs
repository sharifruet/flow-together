#!/usr/bin/env node
/**
 * Seeds a Flowable engine with enough history for the load scenarios to mean something
 * (IMPLEMENTATION_PLAN.md Phase 7: "load testing at realistic history volume").
 *
 * Why seeding is the hard part. Every query the UI issues is cheap against an empty
 * database and the interesting ones are not cheap against a full one — `POST /query/tasks`
 * with `involvedUser` joins the identity-link table, and the historic queries scan history
 * tables that only exist once instances have completed. A load test against a fresh engine
 * measures almost nothing, which is why this exists rather than the scenarios pointing at
 * whatever engine is to hand.
 *
 * It deliberately does not use the engine's Java API or a SQL fixture: it drives the same
 * public REST surface the apps use, so it works against any deployment you can reach and
 * cannot drift from the engine's own schema.
 *
 * Usage:
 *   node qa/load/seed.mjs --base http://localhost:8080/flowable-rest/service \
 *     --user rest-admin --password test --instances 5000 --completed 3000
 *
 * Runtime is dominated by the completion pass; ~5000 instances takes a few minutes against
 * a local H2 engine and rather longer against a real database, which is itself a finding
 * worth writing down.
 */

const args = parseArgs(process.argv.slice(2));
const BASE = args.base ?? "http://localhost:8080/flowable-rest/service";
const USER = args.user ?? "rest-admin";
const PASSWORD = args.password ?? "test";
/** Instances left running — these are what Work's inbox and Control's instance list page. */
const RUNNING = Number(args.instances ?? 2000);
/** Instances driven to completion — these are what the historic queries scan. */
const COMPLETED = Number(args.completed ?? 2000);
/** How many requests are in flight at once. Higher is faster, and less kind to a laptop. */
const CONCURRENCY = Number(args.concurrency ?? 16);

/** Spread across these so `assignee`/`candidateGroup` filters select a subset, not everything. */
const USERS = ["kermit", "fozzie", "gonzo", "rowlf", "scooter"];
const GROUPS = ["sales", "finance", "legal"];

const AUTH = "Basic " + Buffer.from(`${USER}:${PASSWORD}`).toString("base64");

/**
 * Three definitions rather than one, because `processDefinitionKey` is a filter the inbox
 * offers: with a single definition that filter is a no-op and its cost is never measured.
 */
const DEFINITIONS = ["loadOrder", "loadInvoice", "loadOnboarding"];

function definitionXml(key, index) {
  const group = GROUPS[index % GROUPS.length];
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:flowable="http://flowable.org/bpmn"
             targetNamespace="http://flowable.org/loadtest">
  <process id="${key}" name="Load test ${key}" isExecutable="true">
    <startEvent id="start"/>
    <sequenceFlow id="f1" sourceRef="start" targetRef="review"/>
    <userTask id="review" name="Review ${key}"
              flowable:candidateGroups="${group}"/>
    <sequenceFlow id="f2" sourceRef="review" targetRef="approve"/>
    <userTask id="approve" name="Approve ${key}"
              flowable:candidateGroups="${group}"/>
    <sequenceFlow id="f3" sourceRef="approve" targetRef="end"/>
    <endEvent id="end"/>
  </process>
</definitions>`;
}

async function api(path, { method = "GET", body, raw } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      ...(raw ? {} : body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status} ${await response.text()}`);
  }
  /*
   * Read as text and parse only if there is something to parse. A 204 is not the only
   * empty response the engine sends: completing a task answers 200 with no body at all,
   * and `response.json()` on that throws "Unexpected end of JSON input" — which reads like
   * a malformed payload rather than an absent one.
   */
  const text = await response.text();
  return text.length === 0 ? null : JSON.parse(text);
}

/**
 * Runs `worker` over `count` items with a fixed number in flight.
 *
 * Not `Promise.all` over the whole range: 5000 simultaneous sockets is a different test
 * from the one intended, and it is usually the seeder that falls over rather than the
 * engine.
 */
async function pooled(count, worker, label) {
  let next = 0;
  let done = 0;
  let lastReport = 0;
  const runner = async () => {
    for (let index = next++; index < count; index = next++) {
      await worker(index);
      done++;
      if (done - lastReport >= 250 || done === count) {
        lastReport = done;
        process.stdout.write(`\r  ${label}: ${done}/${count}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, runner));
  process.stdout.write("\n");
}

async function deploy() {
  console.log("Deploying definitions…");
  for (const [index, key] of DEFINITIONS.entries()) {
    const form = new FormData();
    form.append("file", new Blob([definitionXml(key, index)], { type: "application/xml" }),
        `${key}.bpmn20.xml`);
    await api("/repository/deployments", { method: "POST", raw: form });
  }
  console.log(`  ${DEFINITIONS.length} definitions deployed.`);
}

async function startInstances(count, label) {
  const ids = [];
  await pooled(count, async (index) => {
    const instance = await api("/runtime/process-instances", {
      method: "POST",
      body: {
        processDefinitionKey: DEFINITIONS[index % DEFINITIONS.length],
        businessKey: `${label}-${index}`,
        name: `${label} instance ${index}`,
        variables: [
          { name: "amount", type: "integer", value: (index % 900) + 100 },
          { name: "customer", type: "string", value: `Customer ${index % 500}` },
          { name: "priorityBand", type: "string", value: index % 3 === 0 ? "high" : "normal" },
        ],
      },
    });
    ids.push(instance.id);
  }, label);
  return ids;
}

/**
 * Claims and completes both user tasks so the instance ends and lands in history.
 *
 * Assigning before completing matters: an unassigned completed task leaves no identity
 * link, and `involvedUser` — the inbox's default filter — is exactly the join that gets
 * expensive. History with no identity links would understate it.
 */
async function completeInstances(instanceIds) {
  await pooled(instanceIds.length, async (index) => {
    const instanceId = instanceIds[index];
    const assignee = USERS[index % USERS.length];
    for (let step = 0; step < 2; step++) {
      const tasks = await api(`/runtime/tasks?processInstanceId=${encodeURIComponent(instanceId)}&size=1`);
      const task = tasks.data?.[0];
      if (!task) return;
      await api(`/runtime/tasks/${task.id}`, {
        method: "POST",
        body: { action: "claim", assignee },
      });
      await api(`/runtime/tasks/${task.id}`, {
        method: "POST",
        body: {
          action: "complete",
          variables: [{ name: "decision", type: "string", value: index % 4 === 0 ? "reject" : "approve" }],
        },
      });
    }
  }, "completing");
}

/** Assigns a share of the still-running tasks, so "mine" and "claimable" both return rows. */
async function assignSomeRunningTasks(instanceIds) {
  await pooled(instanceIds.length, async (index) => {
    // Two thirds stay unassigned so the claimable view has something to page through.
    if (index % 3 !== 0) return;
    const instanceId = instanceIds[index];
    const tasks = await api(`/runtime/tasks?processInstanceId=${encodeURIComponent(instanceId)}&size=1`);
    const task = tasks.data?.[0];
    if (!task) return;
    await api(`/runtime/tasks/${task.id}`, {
      method: "POST",
      body: { action: "claim", assignee: USERS[index % USERS.length] },
    });
  }, "assigning");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index++) {
    if (argv[index].startsWith("--")) {
      parsed[argv[index].slice(2)] = argv[index + 1];
      index++;
    }
  }
  return parsed;
}

async function main() {
  const startedAt = Date.now();
  console.log(`Seeding ${BASE}`);
  console.log(`  ${RUNNING} running + ${COMPLETED} completed instances, concurrency ${CONCURRENCY}\n`);

  await deploy();

  const toComplete = await startInstances(COMPLETED, "starting (for history)");
  await completeInstances(toComplete);

  const running = await startInstances(RUNNING, "starting (running)");
  await assignSomeRunningTasks(running);

  const openTasks = await api("/query/tasks", { method: "POST", body: { size: 1 } });
  const historic = await api("/query/historic-process-instances", {
    method: "POST",
    body: { size: 1, finished: true },
  });

  console.log(`\nDone in ${Math.round((Date.now() - startedAt) / 1000)}s.`);
  console.log(`  open tasks:            ${openTasks.total}`);
  console.log(`  finished instances:    ${historic.total}`);
  console.log("\nNow run the scenarios — see qa/load/README.md.");
}

main().catch((error) => {
  console.error(`\nSeeding failed: ${error.message}`);
  process.exit(1);
});
