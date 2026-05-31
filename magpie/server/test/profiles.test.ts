import { describe, expect, it } from "vitest";
import { nextProfileState } from "../src/lib/profiles";
import { isOwnerEmail } from "../src/lib/ownerConfig";

describe("team profile gates", () => {
  it("enforces owner auto-approval predicate", () => {
    expect(isOwnerEmail("owner@youware.com")).toBe(true);
  });

  it("transitions pending profiles with lockVersion", () => {
    const next = nextProfileState(
      { approvalStatus: "pending", role: "member", updatedAt: 1, lockVersion: 0 },
      { approvalStatus: "approved", role: "admin", actor: "owner@youware.com", now: 10, lockVersion: 0 },
    );
    expect(next).toMatchObject({ approvalStatus: "approved", role: "admin", approvedBy: "owner@youware.com", approvedAt: 10, lockVersion: 1 });
    expect(() => nextProfileState(next, { approvalStatus: "rejected", actor: "owner@youware.com", lockVersion: 0 })).toThrow("lock_version_conflict");
  });

  it("locks the v3 approval state machine", () => {
    const pending = { approvalStatus: "pending" as const, role: "member", updatedAt: 1, lockVersion: 0 };
    const held = nextProfileState(pending, { approvalStatus: "hold", actor: "owner@youware.com", now: 2, lockVersion: 0 });
    expect(held.approvalStatus).toBe("hold");
    const rejected = nextProfileState(held, { approvalStatus: "rejected", actor: "owner@youware.com", now: 3, lockVersion: 1 });
    expect(rejected.approvalStatus).toBe("rejected");
    expect(() => nextProfileState(rejected, { approvalStatus: "approved", actor: "owner@youware.com", lockVersion: 2 })).toThrow("illegal_transition_rejected_to_approved");
    expect(() => nextProfileState({ approvalStatus: "approved", role: "member", updatedAt: 1, lockVersion: 0 }, { approvalStatus: "pending", actor: "owner@youware.com", lockVersion: 0 })).toThrow("illegal_transition_approved_to_pending");
    expect(() => nextProfileState({ approvalStatus: "suspended", role: "member", updatedAt: 1, lockVersion: 0 }, { approvalStatus: "approved", actor: "owner@youware.com", lockVersion: 0 })).toThrow("exceptional_restore_required");
  });
});
