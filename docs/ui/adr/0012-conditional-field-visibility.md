# ADR 0012 — Conditional field visibility as a params convention

**Status**: Accepted
**Relates to**: REQUIREMENTS.md §7.4.6 (Form builder), §7.1 (Forms)

## Context

The form builder needed conditional visibility — show a field only when another field has
a particular answer. Flowable's own form model has no such property: `FormField` in
`flowable-form-model` carries `id`, `name`, `type`, `value`, `required`, `readOnly`,
`overrideId`, `placeholder`, `params` and `layout`, and nothing else.

Three options:

1. Add a first-class property to the engine's form model.
2. Keep the rule outside the form, in TogetherFlow's own storage.
3. Carry it inside the form, in the free-form `params` map the engine already round-trips.

## Decision

Option 3. The rule lives at `params.tfVisibleWhen`, as
`{ field, operator, value }` with operators `equals`, `notEquals`, `isSet`, `isEmpty`.

Option 1 means an engine change for a presentation concern, and ADR 0010 already
established that this work carries no engine-side scope. Option 2 splits one form across
two stores, so exporting or deploying a form would silently lose its behaviour.

`params` is a `Map<String, Object>` the engine stores and returns untouched, so a form
using this stays a perfectly valid Flowable form. Another consumer simply sees an extra
params entry and shows the field unconditionally — degrading to "show everything", which
is the safe direction.

## Consequences

- **This is presentation only, and must never be treated as security.** A hidden field is
  absent from the rendered form, not protected. Anything that actually matters has to be
  enforced by the process, not by whether an input was drawn.
- **Validation skips hidden fields**, deliberately: requiring an answer to a question
  nobody can see makes a form unsubmittable with no visible cause. `validateForm` asks
  `hiddenFieldIds` first.
- **Hiding is not clearing.** A value entered before a condition turned is still
  submitted. Clearing it would silently discard data the user typed; the process can
  decide what to do with a value whose question is no longer shown.
- **A rule pointing at a field that does not exist shows the field.** A typo in a
  condition must not silently remove an input someone needs to fill in — the safe failure
  is visible, not invisible.
- If Flowable ever gains a real visibility property, migrating is a read of one params key
  and a write of the new one; nothing else in the renderer or builder depends on where the
  rule is stored.

## Related

Outcomes — named submit buttons — needed none of this: `FormModelResponse` already has
`outcomes` and `outcomeVariableName`, so the builder edits them directly and Work renders
one button per outcome, recording the choice as a variable.
