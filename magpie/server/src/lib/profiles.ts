export type ApprovalStatus = "pending" | "approved" | "rejected" | "hold" | "suspended";
export type ProfileRole = "owner" | "admin" | "member";

export interface TeamProfileState {
  approvalStatus: ApprovalStatus;
  role: ProfileRole | string;
  rejectionReason?: string | null;
  approvedBy?: string | null;
  approvedAt?: number | null;
  rejectedBy?: string | null;
  rejectedAt?: number | null;
  suspendedBy?: string | null;
  suspendedAt?: number | null;
  updatedAt: number;
  lockVersion: number;
}

const ALLOWED: Record<ApprovalStatus, ApprovalStatus[]> = {
  pending: ["approved", "rejected", "hold"],
  hold: ["approved", "rejected"],
  approved: ["suspended"],
  suspended: ["approved"],
  rejected: [],
};

export function nextProfileState(
  current: TeamProfileState,
  action: { approvalStatus?: ApprovalStatus; role?: ProfileRole; reason?: string | null; actor: string; now?: number; lockVersion: number; exceptionalRestore?: boolean },
): TeamProfileState {
  if (action.lockVersion !== current.lockVersion) throw new Error("lock_version_conflict");
  const requested = action.approvalStatus ?? current.approvalStatus;
  if (!isStatus(requested)) throw new Error("invalid_status");
  if (requested !== current.approvalStatus) {
    const allowed = ALLOWED[current.approvalStatus] ?? [];
    if (!allowed.includes(requested)) throw new Error(`illegal_transition_${current.approvalStatus}_to_${requested}`);
    if (current.approvalStatus === "suspended" && requested === "approved" && !action.exceptionalRestore) {
      throw new Error("exceptional_restore_required");
    }
  }

  const now = action.now ?? Date.now();
  const next: TeamProfileState = { ...current, approvalStatus: requested, role: action.role ?? current.role, updatedAt: now, lockVersion: current.lockVersion + 1 };
  if (requested === "approved") {
    next.approvedBy = action.actor;
    next.approvedAt = now;
    next.rejectionReason = null;
  }
  if (requested === "rejected") {
    next.rejectedBy = action.actor;
    next.rejectedAt = now;
    next.rejectionReason = action.reason ?? "Rejected by owner.";
  }
  if (requested === "hold") {
    next.rejectionReason = action.reason ?? "Held for owner review.";
  }
  if (requested === "suspended") {
    next.suspendedBy = action.actor;
    next.suspendedAt = now;
    next.rejectionReason = action.reason ?? current.rejectionReason ?? "Suspended by owner.";
  }
  return next;
}

function isStatus(value: string): value is ApprovalStatus {
  return ["pending", "approved", "rejected", "hold", "suspended"].includes(value);
}
