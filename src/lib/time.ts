// 时间与排班工具：HH:MM 与分钟互转、重叠判断
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 一趟班次需要的占用时长（发车前 15 分钟点检 → 到校时限） */
export function tripWindow(departAt: string, arriveBy: string) {
  return {
    start: fromMinutes(toMinutes(departAt) - 15),
    end: arriveBy
  };
}

/** 两个时间窗是否重叠（端点相接不算重叠） */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

/** a 窗是否完全落在司机班次 [shiftStart, shiftEnd] 内（含端点） */
export function withinShift(winStart: string, winEnd: string, shiftStart: string, shiftEnd: string): boolean {
  return toMinutes(winStart) >= toMinutes(shiftStart) && toMinutes(winEnd) <= toMinutes(shiftEnd);
}

/** 准驾证是否满足车辆要求：A1 > A3 > B1（A1 可驾全部） */
const PERMIT_RANK: Record<string, number> = { B1: 1, A3: 2, A1: 3 };
export function permitCovers(held: string, required: string): boolean {
  return PERMIT_RANK[held] >= PERMIT_RANK[required];
}

/** 候选车辆按车牌排序（早班按车牌排队的稳定顺序） */
export function sortByPlate<T extends { plate: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.plate.localeCompare(b.plate, "zh-Hans-CN"));
}
