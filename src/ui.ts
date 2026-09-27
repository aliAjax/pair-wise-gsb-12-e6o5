import type { AdjustmentStatus, AssignmentStatus, TriggerType } from "./types";

export const ASSIGNMENT_STATUS: Record<AssignmentStatus, { text: string; cls: string }> = {
  planned: { text: "已排班", cls: "st-planned" },
  held: { text: "原车锁定", cls: "st-held" },
  proposed: { text: "待接管确认", cls: "st-proposed" },
  confirmed: { text: "接管执行中", cls: "st-confirmed" },
  released: { text: "原车已释放", cls: "st-released" }
};

export const ADJUSTMENT_STATUS: Record<AdjustmentStatus, { text: string; cls: string }> = {
  open: { text: "待处理", cls: "st-held" },
  proposed: { text: "方案待确认", cls: "st-proposed" },
  confirmed: { text: "已接管", cls: "st-confirmed" },
  waiting: { text: "候车区", cls: "st-waiting" },
  cancelled: { text: "已撤销", cls: "st-released" }
};

export const TRIGGER_TEXT: Record<TriggerType, string> = {
  driver_leave: "司机请假",
  flood: "道路积水"
};

export function fmtTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("zh-CN", { hour12: false });
}
