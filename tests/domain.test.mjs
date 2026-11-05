import test from "node:test";
import assert from "node:assert/strict";
import {
  checkVersion,
  summaryPoints,
  transition,
  users,
  validateDocument,
  workingDays,
} from "../lib/domain.ts";

const [clerk, otherClerk, officer, senior] = users;
const document = (status = "Pending Officer") => ({
  ownerId: clerk.id,
  status,
  version: 2,
});
test("Officer advances first approval to Senior Officer", () =>
  assert.equal(
    transition(officer, document(), "approve"),
    "Pending Senior Officer",
  ));
test("Senior Officer final approval locks the document", () =>
  assert.equal(
    transition(senior, document("Pending Senior Officer"), "approve"),
    "Approved",
  ));
test("wrong role cannot approve", () =>
  assert.throws(() => transition(clerk, document(), "approve"), {
    status: 403,
  }));
test("another Clerk cannot resubmit a returned document", () =>
  assert.throws(
    () => transition(otherClerk, document("Returned"), "resubmit"),
    { status: 403 },
  ));
test("returned document restarts at Officer", () =>
  assert.equal(
    transition(clerk, document("Returned"), "resubmit"),
    "Pending Officer",
  ));
test("rejection requires a reason", () =>
  assert.throws(() => transition(officer, document(), "reject", "  "), {
    status: 400,
  }));
test("stale version conflicts", () =>
  assert.throws(() => checkVersion(document(), 1), { status: 409 }));
test("approved document cannot be changed", () =>
  assert.throws(() => transition(senior, document("Approved"), "approve"), {
    status: 409,
  }));
test("title limit is enforced", () =>
  assert.throws(() => validateDocument("a".repeat(201), "Body", "Policy"), {
    status: 400,
  }));
test("summary points retain source paragraph indices", () =>
  assert.deepEqual(
    summaryPoints(
      "Overview\n\nThe first claim has useful context. More.\n\nThe second claim has useful context.",
    ),
    [
      { paragraph: 1, text: "The first claim has useful context" },
      { paragraph: 2, text: "The second claim has useful context" },
    ],
  ));
test("working days skip weekends", () =>
  assert.equal(
    workingDays("2026-11-06T12:00:00Z", new Date("2026-11-09T12:00:00Z")),
    1,
  ));
