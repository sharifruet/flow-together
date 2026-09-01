# Resignation (Sales) — user manual

How a resignation travels from the Area Sales Executive who logs it to the HR officer who
closes the file: fifteen steps, nine departments, seven documents. Written for the people who
hold a task in it, not for whoever built it — [README.md](README.md) is the developer-facing
companion, covering why the models are shaped as they are and how to deploy them.

Task names, form fields, group names and routing below are read from the deployed models
rather than restated from `docs/Resignation_Process.xlsx`. Where the two differ, this manual
follows what the system actually does and says so.

| | |
|---|---|
| Case key | `salesResignation` |
| Who can start it | `sales-ase` |
| Stages | 4 |
| Steps | 15 |
| Documents | 7 |

## Contents

- [Starting a resignation](#starting-a-resignation)
- [How the case is shaped](#how-the-case-is-shaped)
- [The fifteen steps](#the-fifteen-steps) — [A](#stage-a--sales-approval-and-clearance-steps-13)
  · [B](#stage-b--departmental-clearances-steps-46)
  · [C](#stage-c--hr-acceptance-steps-78)
  · [D](#stage-d--final-settlement-and-preservation-steps-915)
- [Sending something back](#sending-something-back)
- [Who does what](#who-does-what)
- [The seven documents](#the-seven-documents)
- [Who gets notified](#who-gets-notified)
- [Signing in](#signing-in)
- [What this build cannot do](#what-this-build-cannot-do)

## Starting a resignation

Only a member of `sales-ase` can open a case. The employee does not start it themselves — the
spreadsheet's first row is explicit that the ASE logs the resignation on behalf of the MPE or
Sr. MPE who resigned, and attaches the scan of their letter.

Start a case of `salesResignation` and fill in the resignation record. Everything on this form
travels with the case for the rest of its life, so it is worth getting right at the outset:
several later steps read from it and none of them re-ask.

**Form `resignationSubmissionForm`**

| Field | Name | Type | |
|---|---|---|---|
| `employeeId` | Employee ID | text | required |
| `employeeName` | Employee name | text | required |
| `employeeUserId` | Employee sign-in id | text | required |
| `employeeDesignation` | Designation | MPE · Sr. MPE | required |
| `employeeTerritory` | Territory / region | text | required |
| `resignationDate` | Date of resignation letter | date | required |
| `lastWorkingDay` | Proposed last working day | date | required |
| `resignationReason` | Reason given | long text | optional |
| `resignationLetterRef` | Resignation letter (scan reference) | text | required |

**Two fields decide where things go later.**

`employeeUserId` is who the acceptance of resignation is eventually sent to. Leave it out and
the case falls back to `employeeId`, which means the letter is recorded as going to an employee
number rather than to a person — better than notifying nobody, but not what you want.

**You** become the case's ASE. Your user id is stored as `aseUserId`, which is who the sales
clearance is assigned to and who any returned record comes back to. Nobody else in `sales-ase`
picks it up on your behalf.

## How the case is shaped

A resignation is a **folder**, not a queue. Seven documents are collected from nine departments
and the last thing that happens is that somebody files them. The four stages run strictly in
order — each opens only when the one before it has finished completely — but inside a stage,
work can run side by side.

The part that is hard to see from the step list is what happens at SSR: the two documents
**separate**, travel independently, and rejoin at HRM's five-document check.

```
                            stage A                        │  stage B
                                                           │
        ┌── the resignation letter ──→ Director Marketing ─┼─── signed ───┐
        │                                                  │              │
 SSR ───┤                                                  │              ├──→ HRM
        │                                                  │              │    checks the
        └── the sales clearance ──→ SIMU + IB ─────────────┼─→ SBM ───────┤    five documents
                                                           │   (+ the SBM clearance)
                                                           │   GAD ───────┤
                                                           │   FCA ───────┘
```

The resignation letter goes to Director Marketing for signature and then straight to HRM. The
sales clearance goes through SIMU and IB to SBM, who adds a clearance of their own. GAD and FCA
open at the stage boundary and owe nothing to SSR. All five documents arrive independently.

## The fifteen steps

### Stage A — sales approval and clearance (steps 1–3)

Opens as soon as the case is started. Everything here is sequential: one person at a time, each
waiting on the one before.

#### 1. Area Sales Executive — raise and approve the sales clearance

The moment you log the resignation, three things happen: HRM, Accounts and SSR are notified so
that EBS action can begin, and the sales clearance form appears in your own list — already
assigned to you, not to the ASE queue. Complete it and approve, and both documents move
together to the RSE.

- **Task** — `aseClearance`
- **Assigned to** — you personally, the ASE who logged the resignation
- **Form** — `salesClearanceForm`
- **You fill in** — outstanding collection · stock returned in full · samples and POS material
  returned · secondary dues with dealers · remarks · decision
- **On approve** — both documents go to the RSE
- **Notifies** — `hrm`, `acc-officer`, `sales-ssr`

#### 2. RSE → ZSI → SM → GM — the sales line approves, one level at a time

Four approvals in sequence, each on the same form and each seeing both the resignation and the
sales clearance. A level cannot be skipped and two cannot run together. When the RSE approves,
the same three recipients are notified a second time — that is the spreadsheet's "RSE entry in
mSales generates notification mail".

- **Tasks** — `rseApproval` · `zsiApproval` · `smApproval` · `gmApproval`
- **Goes to** — `sales-rse`, then `sales-zsi`, `sales-sm`, `sales-gm`; a team queue at each
  level, so anyone in the group can claim it
- **Form** — `approvalDecisionForm`
- **You fill in** — decision (approve or return) · comment
- **On approve** — the next level up; after the GM, on to SSR
- **On return** — straight back to the ASE, see [Sending something back](#sending-something-back)

#### 3. SSR (Sales Admin) — route the two documents on separate paths

The busiest step and the one most often misread. Record that both documents arrived, and the
case splits in two: the resignation letter needs Director Marketing's signature, while the
sales clearance needs SIMU and IB to clear it before SBM will touch it. All three run at the
same time, and the stage is not finished until every one of them is.

- **Tasks** — `ssrReceiveDocuments`, then `directorMarketingSignature` · `simuClearance` ·
  `ibClearance` in parallel
- **Goes to** — `sales-ssr`, then `director-mkt`, `sales-simu`, `sales-ib`
- **Forms** — `documentReceiptForm` · `signatureForm` · `departmentClearanceForm`
- **SIMU and IB fill in** — dues outstanding · company items returned · remarks
- **Then** — the signed letter goes to HRM; the cleared sales clearance goes to SBM

### Stage B — departmental clearances (steps 4–6)

Opens only when the whole of stage A has finished — including Director Marketing's signature,
not merely SIMU and IB. All three clearances then run **in parallel** and in any order. Each
notifies HRM the moment it is issued.

> **One form, three departments.** These three tasks all come from the same underlying process,
> started three times. That is why they may look alike in a list: the department, the task name
> and the form are supplied by the case, not baked into three separate diagrams. Read the task
> *name* to know which one is yours.

#### 4. SBM — generate the SBM clearance

You receive the sales clearance that SSR forwarded, and you issue a second document of your
own. Both then go to HRM.

- **Task name** — SBM — generate the SBM clearance
- **Goes to** — `sbm`
- **Form** — `sbmClearanceForm`
- **You fill in** — branch stock adjusted · dues outstanding with the branch · remarks
- **Produces** — `sbmClearanceRef`

#### 5. FCA — generate the FCA clearance

Independent of SBM and GAD. Record what the employee still owes against advances and loans; the
clearance is filed and HRM is told.

- **Task name** — FCA — generate the FCA clearance
- **Goes to** — `fca`
- **Form** — `fcaClearanceForm`
- **You fill in** — advance outstanding · loan outstanding · remarks
- **Produces** — `fcaClearanceRef`

#### 6. GAD — generate the motorcycle clearance

If no company motorcycle was ever issued, say so and the remaining fields can stay empty. If
one was, this is where its return, its condition and anything recoverable are recorded.

- **Task name** — GAD — generate the motorcycle clearance
- **Goes to** — `gad`
- **Form** — `motorcycleClearanceForm`
- **You fill in** — company motorcycle issued (required) · registration number · date returned ·
  condition on return (Good · Repairable · Damaged · Not applicable) · recoverable amount ·
  remarks
- **Produces** — `motorcycleClearanceRef`

### Stage C — HR acceptance (steps 7–8)

Opens when all three departmental clearances are in. This is where the case reaches its first
milestone, **Resignation accepted**.

#### 7. HRM — check that all five documents arrived

A checklist, not a decision. Tick off each of the five documents you now hold. Completing it is
what asks the Head of HR to sign, so the system remembers that *you* made the request — if the
letter comes back, it comes back to you rather than to the HRM queue.

- **Task** — `hrmVerifyDocuments`
- **Goes to** — `hrm`, a queue; claim it to become the requester
- **Form** — `documentChecklistForm`
- **You confirm** — resignation letter (from SSR Admin) · sales clearance (from SBM) · SBM
  clearance (from SBM) · motorcycle clearance (from GAD) · FCA clearance (from FCA)

#### 8. HRM and Head of HR — issue, sign and circulate the acceptance

The acceptance letter is generated automatically and goes to the Head of HR for signature. Once
signed it is sent to the employee, left at reception for collection, and copied to SSR Admin.
HRM then updates the clearance status record, and all six documents are shared with Accounts so
the settlement can be calculated.

- **Tasks** — `headOfHrSignature`, then `updateClearanceStatusRecord`
- **Goes to** — `head-of-hr`, then `hrm`
- **Forms** — `signatureForm` · `clearanceStatusForm`
- **HRM fills in** — clearance status (Cleared · Cleared with recovery · Pending) · total
  recoverable amount · remarks
- **On return** — `reviseAcceptanceLetter` goes back to the HRM officer from step 7
- **Milestone** — Resignation accepted

### Stage D — final settlement and preservation (steps 9–15)

Opens when the acceptance has been issued. One statement is drafted and then signed four times;
the case ends when the file is preserved.

#### 9. Accounts officer — prepare the final settlement statement

The first draft sits in the Accounts queue, because nobody has requested anything yet. Whoever
claims it becomes the statement's author — and every later return comes back to that person by
name, not to the queue.

- **Task** — `prepareFinalSettlement`
- **Goes to** — `acc-officer`; a queue on the first pass, then to you by name
- **Form** — `finalSettlementForm`
- **You fill in** — salary due (required) · leave encashment · provident fund · gratuity ·
  total recoveries · net payable (required) · remarks

#### 10. Accounts manager — sign the final settlement

- **Task** — `accManagerApproval`
- **Goes to** — `acc-manager`
- **Form** — `signatureForm` (decision · remarks)
- **On approve** — the ACC director
- **On return** — back to the officer who drafted it

#### 11. Accounts director — sign the final settlement

- **Task** — `accDirectorApproval`
- **Goes to** — `acc-director`
- **Form** — `signatureForm` (decision · remarks)
- **On approve** — HRM, for the EBS update
- **On return** — back to the officer who drafted it, skipping the manager who has already signed

#### 12. HRM — check and update the settlement status in EBS

The spreadsheet writes this row and step 15 as "HRM (ISJ)". Both tasks go to the whole HRM group
rather than to one person, so either officer can take them.

- **Task** — `hrmUpdateEbsRecord`
- **Goes to** — `hrm`
- **Form** — `ebsUpdateForm`
- **You fill in** — EBS reference · final settlement status updated in EBS · remarks

#### 13. Head of HR — sign the final settlement and return it to Accounts

- **Task** — `headOfHrSettlementSignature`
- **Goes to** — `head-of-hr`
- **Form** — `signatureForm` (decision · remarks)
- **Then** — Accounts, to complete the settlement

> **A quirk worth knowing.** This form offers a decision, but the process does not branch on it:
> `headOfHrSettlementSignature` flows unconditionally to `completeFinalSettlement`, unlike the
> two ACC signatures, which have gateways. The settlement moves on to Accounts whichever option
> is chosen. If you need to send this one back, use the remarks and raise it outside the system
> — a "return" here will not route anywhere.

#### 14. Accounts — complete the final settlement

Finalise the figures on the signed statement. The statement is filed under its own reference and
a copy goes to HRM.

- **Task** — `completeFinalSettlement`
- **Goes to** — `acc-officer`
- **Form** — `finalSettlementForm`
- **Produces** — `finalSettlementRef`
- **Notifies** — `hrm`

#### 15. HRM — preserve the employee file

The last row of the spreadsheet, and the reason this is a case rather than a process: attach the
settlement copy to the other six documents and file the complete folder. All seven can be
shared, printed or extracted from here. Completing this closes the case.

- **Task** — `preserveEmployeeFile`
- **Goes to** — `hrm`
- **Form** — `preservationForm`
- **You fill in** — employee file / folder reference · number of documents preserved · remarks
- **Milestone** — Employee file closed; the case ends

## Sending something back

The spreadsheet describes only the happy path. In practice four approvals in a row with no way
back is unusable, so most decision points can **return** an item. A return is not a rejection of
the resignation — it sends the paperwork back to be corrected.

> **Silence is not consent.** Every decision point treats *return* as its default. A task
> completed without an explicit approval goes back rather than forward. If you meant to approve,
> choose approve.

| Returned by | Goes back to | And then |
|---|---|---|
| RSE, ZSI, SM or GM | the ASE who logged the resignation, by name | once amended, the chain restarts at the **RSE** — not at the level that returned it |
| Head of HR, on the acceptance letter | the HRM officer who completed the five-document check | the revised letter goes back for signature |
| ACC manager | the ACC officer who drafted the statement | re-signed by the manager, then the director |
| ACC director | the ACC officer who drafted the statement | re-signed by the manager, then the director |
| Head of HR, on the final settlement | *no return path* — see [step 13](#13-head-of-hr--sign-the-final-settlement-and-return-it-to-accounts) | the settlement proceeds to Accounts regardless |

**If nobody had claimed the task.** Returns go to a *person*, which only works if there was one.
Where the upstream task was never claimed — it was completed straight out of the queue — the
returned item lands back in that team's queue instead of with nobody. You will not lose an item
this way.

## Who does what

Nineteen positions. Tasks are offered to a *group*, so anyone in it can claim the work, with two
exceptions marked below where the task goes to one named person.

| Group | Position | Holds | Sample people |
|---|---|---|---|
| `sales-field` | MPE / Sr. MPE | no task — the resigning employee | Rakib Hasan · Nusrat Jahan |
| `sales-ase` | Area Sales Executive | step 1, and any return — *by name* | Imran Kabir |
| `sales-rse` | Regional Sales Executive | step 2 | Shakil Ahmed |
| `sales-zsi` | Zonal Sales In-charge | step 2 | Tanvir Alam |
| `sales-sm` | Sales Manager | step 2 | Mahmud Hossain |
| `sales-gm` | General Manager | step 2 | Farhana Akter |
| `sales-ssr` | SSR (Sales Admin) | step 3 | Sabbir Rahman |
| `director-mkt` | Director, Marketing | step 3 — signs the letter | Kamrul Islam |
| `sales-simu` | SIMU | step 3 | Nazmul Haque |
| `sales-ib` | IB | step 3 | Rumana Parvin |
| `sbm` | SBM | step 4 | Jahid Hasan |
| `fca` | FCA | step 5 | Arif Mahmud |
| `gad` | GAD (Motorcycle) | step 6 | Moinul Chowdhury |
| `hrm` | HR Management | steps 7, 8, 12, 15 | Shirin Akhter · Ismail Jamil |
| `head-of-hr` | Head of HR | steps 8 and 13 | Rezaul Karim |
| `acc-officer` | Accounts — Officer | steps 9 and 14 — *returns by name* | Pritam Saha · Tanjila Rahman |
| `acc-manager` | Accounts — Manager | step 10 | Habibur Rahman |
| `acc-director` | Accounts — Director | step 11 | Shamima Nasrin |
| `reception` | Reception desk | no task — receives the signed letter for collection | Reception Desk |

## The seven documents

The spreadsheet counts seven documents in a closed file. One is uploaded, three are filled in by
a department, and three are generated by the system. Step 15 files all of them together.

| Document | Comes from | At | Filed as |
|---|---|---|---|
| Resignation letter | the employee, scanned and attached by the ASE | step 1 | `resignationLetterRef` |
| Sales clearance | the ASE, cleared by SIMU, IB and SBM | steps 1–4 | case variables |
| SBM clearance | SBM | step 4 | `sbmClearanceRef` |
| FCA clearance | FCA | step 5 | `fcaClearanceRef` |
| Motorcycle clearance | GAD | step 6 | `motorcycleClearanceRef` |
| Acceptance of resignation | generated, signed by the Head of HR | step 8 | `acceptanceLetterRef` |
| Final settlement statement | Accounts, signed four times | steps 9–14 | `finalSettlementRef` |

## Who gets notified

Ten notification points. Every one goes to a group, except the acceptance letter, which goes to
the resigning employee as a person.

| At | When | Goes to |
|---|---|---|
| step 1 | the resignation is logged | `hrm` · `acc-officer` · `sales-ssr` |
| step 2 | the RSE approves | `hrm` · `acc-officer` · `sales-ssr` |
| step 2 | the GM approves and the chain is done | `sales-ssr` |
| step 3 | Director Marketing has signed the letter | `hrm` |
| step 3 | the sales clearance is forwarded | `sbm` |
| steps 4–6 | each departmental clearance is issued | `hrm` |
| step 8 | the acceptance letter is sent | the employee, personally |
| step 8 | the acceptance letter is circulated | `sales-ssr` · `reception` |
| step 8 | the six documents go for settlement | `acc-officer` · `acc-manager` |
| step 14 | the settlement is complete | `hrm` |

## Signing in

The twenty-two sample people exist in two places that have to agree: the workflow engine, which
decides whose queue a task lands in, and the identity provider, which decides who can sign in at
all.

- Your sign-in name is your engine id — `imran.kabir`, `shirin.akhter`, `pritam.saha`. Not an
  email address.
- All sample accounts share one password, `demo`. They exist so a walkthrough has somebody to
  be, and are not intended for anything else.
- The sample people are not created until somebody asks. An administrator runs
  [`deploy.sh`](deploy.sh), which posts them to the IDM API and never overwrites an account
  that already exists.
- If you can sign in but your task list is empty, you are almost certainly in the right identity
  provider and the wrong group — check [Who does what](#who-does-what).

## What this build cannot do

Three things behave differently from what the spreadsheet implies. None is a defect in the
model; all three are worth knowing before you go looking for a feature that is not there.

**The forms do not render as forms.** Every task carries the form named in this manual, and all
fourteen form definitions exist. But this build ships no form *engine*, so there is nowhere to
deploy them to and no way to fetch one by key. In practice you will see a plain grid of
variables rather than a laid-out form. The field names are the ones listed here.

**Mail is written to the log, not sent.** Every notification in
[Who gets notified](#who-gets-notified) fires at the right moment and records who it was for,
but it writes a log line rather than sending a message. Nobody at bpl.net receives anything.
Connecting real mail is a configuration change and needs no change to the process.

**Documents are references, not files.** The three generated documents — the acceptance of
resignation, each clearance and the final settlement statement — are recorded as references
rather than rendered as PDFs. The folder names all seven documents correctly; it does not yet
produce them. Step 15's "share, print and extract" is therefore not available in this build.
