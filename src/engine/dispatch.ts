// 班次调配纯函数引擎：在不修改数据的前提下计算可行接管组合
import type {
  Candidate,
  Driver,
  Route,
  RunState,
  TriggerInfo,
  Vehicle
} from "../types";

/** 当日工时上限（早班司机，分钟） */
export const MAX_WORK_MINUTES = 240;

const LICENSE_RANK: Record<string, number> = { A1: 2, A3: 1 };

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function toHHMM(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function licenseCovers(driver: Driver, vehicle: Vehicle): boolean {
  return LICENSE_RANK[driver.license] >= LICENSE_RANK[vehicle.requiredLicense];
}

/**
 * 计算"此刻被占用"的车辆与司机。
 * 关键规则：原车在接管确认前（proposed / waiting）仍占用，不会被再次分派。
 * @param skipRouteId    正在调配的线路，其资源不占用自身候选
 * @param releasedDriver 触发请假的原司机视为已释放（原车需要换司机）
 */
export function buildOccupancy(
  runs: RunState[],
  routes: Route[],
  skipRouteId: string,
  releasedDriverId?: string | null
): { vehicles: Set<string>; drivers: Set<string> } {
  const vehicles = new Set<string>();
  const drivers = new Set<string>();
  const runByRoute = new Map(runs.map((r) => [r.routeId, r]));
  for (const base of routes) {
    if (base.id === skipRouteId) continue;
    const run = runByRoute.get(base.id);
    const status = run?.status ?? "normal";

    if (status === "normal") {
      vehicles.add(base.vehicleId);
      drivers.add(base.driverId);
    } else if (status === "waiting") {
      // 原车未释放，孩子在候车区等待
      vehicles.add(run!.replacedVehicleId ?? base.vehicleId);
      const oldDriver = run!.replacedDriverId ?? base.driverId;
      if (oldDriver !== releasedDriverId) drivers.add(oldDriver);
    } else if (status === "proposed") {
      vehicles.add(run!.replacedVehicleId ?? base.vehicleId);
      const oldDriver = run!.replacedDriverId ?? base.driverId;
      if (oldDriver !== releasedDriverId) drivers.add(oldDriver);
      if (run!.selected) {
        vehicles.add(run!.selected.vehicleId);
        drivers.add(run!.selected.driverId);
      }
    } else if (status === "takenover" && run!.selected) {
      vehicles.add(run!.selected.vehicleId);
      drivers.add(run!.selected.driverId);
    }
  }
  return { vehicles, drivers };
}

export interface PlanResult {
  candidates: Candidate[];
  /** 候车区缺额/不满足项说明（缺座位、缺照管员等） */
  reasons: string[];
}

export interface PlanInput {
  route: Route;
  vehicles: Vehicle[];
  drivers: Driver[];
  runs: RunState[];
  allRoutes: Route[];
  trigger: TriggerInfo;
  now: string;
  /** 请假而释放的原司机（接管后再触发时可能不是原配司机） */
  releasedDriverId?: string | null;
  /** 被替换的原车（无论自身是否满足条件都不能作为候选，否则等于没换车） */
  excludeVehicleId?: string | null;
}

function vehicleBlockReasons(v: Vehicle, route: Route, trigger: TriggerInfo): string[] {
  const reasons: string[] = [];
  const flooded = trigger.floodedZones ?? [];

  const spareSeats = v.seats - route.students;
  if (spareSeats < 0) {
    reasons.push(`缺座位 ${Math.abs(spareSeats)} 个（${v.plate}：${v.seats} 座，线路 ${route.students} 人）`);
  }
  const missingZones = route.zones.filter((z) => !v.zones.includes(z));
  if (missingZones.length > 0) {
    reasons.push(`不通行片区：${missingZones.join("、")}（${v.plate}）`);
  }
  if (trigger.kind === "flood") {
    const hitFlood = flooded.filter((z) => route.zones.includes(z) && v.zones.includes(z));
    if (!v.waterSafe && hitFlood.length > 0) {
      reasons.push(`不能涉水：${v.plate} 无法通过积水片区 ${hitFlood.join("、")}`);
    }
  }
  if (route.requireAttendant && v.attendants < 1) {
    reasons.push(`缺照管员（${v.plate} 无在车照管员，线路要求配备）`);
  }
  return reasons;
}

/**
 * 规划接管组合：
 * 1. 车辆：座位 ≥ 学生数、覆盖全部途经片区、积水时可涉水、按要求配照管员
 * 2. 司机：准驾证覆盖本车、有当日早班、未请假、未被占用、加工时不超限、能赶上到校时限
 * 候选按余座从紧到松、车牌排序；不可行原因汇总供候车区说明。
 */
export function planReassignment(input: PlanInput): PlanResult {
  const { route, vehicles, drivers, runs, allRoutes, trigger, now, releasedDriverId } = input;
  const { vehicles: occupiedVehicles, drivers: occupiedDrivers } = buildOccupancy(
    runs,
    allRoutes,
    route.id,
    releasedDriverId ?? (trigger.kind === "driver_leave" ? route.driverId : null)
  );

  const earliestFinish = toMinutes(now) + route.durationMinutes;
  if (earliestFinish > toMinutes(route.deadline)) {
    return {
      candidates: [],
      reasons: [
        `到校时限不可达：现在 ${now} 出发，全程 ${route.durationMinutes} 分钟，预计 ${toHHMM(
          earliestFinish
        )} 到校，晚于 ${route.deadline}`
      ]
    };
  }

  const candidates: Candidate[] = [];
  const blockers: string[] = [];

  for (const v of vehicles) {
    if (input.excludeVehicleId && v.id === input.excludeVehicleId) continue;
    const reasons = vehicleBlockReasons(v, route, trigger);
    if (reasons.length > 0) blockers.push(...reasons);

    // 占用车辆（含未释放原车）不能选；本身条件都满足时也要说明"有车但被占用"
    if (occupiedVehicles.has(v.id)) {
      if (reasons.length === 0) blockers.push(`有可行组合但车辆已被占用：${v.plate}`);
      continue;
    }
    if (reasons.length > 0) continue;

    const eligible = drivers.filter(
      (d) =>
        licenseCovers(d, v) &&
        !d.onLeave &&
        d.shiftMorning &&
        !occupiedDrivers.has(d.id) &&
        d.workedMinutes + route.durationMinutes <= MAX_WORK_MINUTES
    );
    // 准驾证就低不就高（A3 车不占用 A1 司机），同档则既有工时少者优先
    eligible.sort((a, b) => {
      const rank = LICENSE_RANK[a.license] - LICENSE_RANK[b.license];
      return rank !== 0 ? rank : a.workedMinutes - b.workedMinutes;
    });
    const driver = eligible[0];
    if (!driver) {
      const hasLicense = drivers.some((d) => licenseCovers(d, v));
      const hasShift = drivers.some((d) => licenseCovers(d, v) && d.shiftMorning && !d.onLeave);
      blockers.push(
        !hasLicense
          ? `缺司机：无人持 ${v.requiredLicense} 及以上准驾证驾驶 ${v.plate}`
          : !hasShift
            ? `缺司机：持 ${v.requiredLicense} 准驾证者无当日早班或已请假（${v.plate}）`
            : `缺可用司机：${v.plate} 对应的合格司机均被占用或工时已近上限`
      );
      continue;
    }

    candidates.push({
      vehicleId: v.id,
      driverId: driver.id,
      spareSeats: v.seats - route.students,
      finishTime: toHHMM(earliestFinish)
    });
  }

  candidates.sort((a, b) => {
    if (a.spareSeats !== b.spareSeats) return a.spareSeats - b.spareSeats;
    const va = vehicles.find((x) => x.id === a.vehicleId)!.plate;
    const vb = vehicles.find((x) => x.id === b.vehicleId)!.plate;
    return va.localeCompare(vb, "zh-Hans-CN");
  });

  return { candidates, reasons: [...new Set(blockers)] };
}
