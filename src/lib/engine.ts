// 校车早班调配核心引擎（纯函数式，输入 state draft，返回事件与结果）
import type {
  Adjustment,
  AppState,
  Assignment,
  Deficit,
  Driver,
  EventLog,
  Route,
  Trigger,
  Vehicle
} from "../types";
import { overlaps, permitCovers, sortByPlate, toMinutes, tripWindow, withinShift } from "./time";

let seqCounter = 0;
export function uid(prefix: string): string {
  seqCounter += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${Date.now().toString(36)}${seqCounter.toString(36)}${rand}`;
}

function nowStamp(): string {
  return new Date().toISOString();
}

export interface LogInput {
  events: EventLog[];
  date: string;
}

function log(io: LogInput, action: string, detail: string) {
  io.events.push({
    seq: io.events.length + 1,
    ts: nowStamp(),
    date: io.date,
    action,
    detail
  });
}

// ---------- 基础查询 ----------

export function getRoute(state: AppState, id: string): Route | undefined {
  return state.routes.find((r) => r.id === id);
}

export function getVehicle(state: AppState, plate: string): Vehicle | undefined {
  return state.vehicles.find((v) => v.plate === plate);
}

export function getDriver(state: AppState, id: string): Driver | undefined {
  return state.drivers.find((d) => d.id === id);
}

/** 当天占用该车辆、且仍有效（planned/held/proposed/confirmed）的派位 */
function vehicleBusy(state: AppState, plate: string, date: string, except?: string): Assignment[] {
  return state.assignments.filter(
    (a) =>
      a.date === date &&
      a.vehiclePlate === plate &&
      a.status !== "released" &&
      a.id !== except
  );
}

/** 当天占用该司机、且仍有效的派位（held 的请假司机也算被占用，不能再派别处） */
function driverBusy(state: AppState, driverId: string, date: string, except?: string): Assignment[] {
  return state.assignments.filter(
    (a) =>
      a.date === date &&
      a.driverId === driverId &&
      a.status !== "released" &&
      a.id !== except
  );
}

function driverOnLeave(state: AppState, driverId: string, date: string): boolean {
  return state.adjustments.some(
    (adj) =>
      adj.date === date &&
      adj.trigger.type === "driver_leave" &&
      adj.trigger.payload.includes(driverId) &&
      ["open", "proposed"].includes(adj.status)
  );
}

// ---------- 候选评估 ----------

export interface Candidate {
  vehicle: Vehicle;
  driver: Driver;
  seatsMargin: number; // 座位余量（正：够；负：缺多少）
  areaGaps: string[]; // 未覆盖的途经片区
  attendantOk: boolean;
  permitOk: boolean;
  shiftOk: boolean;
  timeOk: boolean; // 车辆和司机在该时间窗均空闲
  feasible: boolean; // 全部硬性条件满足
  score: number; // 越小越优先
  reasons: string[];
}

export interface EvalContext {
  date: string;
  route: Route;
  winStart: string;
  winEnd: string;
  floodedAreas: string[];
  excludeAssignmentId?: string;
  /** 锁定中的原车（接管确认前不得参与任何组合） */
  excludeVehiclePlate?: string;
  /** 锁定原车的原司机（随原车一起锁定） */
  excludeDriverId?: string;
}

/** 单车 + 单司机是否能接管某线路趟次 */
export function evaluatePair(
  state: AppState,
  vehicle: Vehicle,
  driver: Driver,
  ctx: EvalContext
): Candidate {
  const { route, winStart, winEnd, date } = ctx;
  const reasons: string[] = [];

  // 原车锁定：接管确认前不得释放、不得被再次选用
  const vehicleLocked = ctx.excludeVehiclePlate === vehicle.plate;
  const driverLocked = ctx.excludeDriverId === driver.id;
  if (vehicleLocked) reasons.push("原车已锁定，等待接管确认");
  if (driverLocked) reasons.push("该司机随原车锁定中");

  // 座位
  const seatsMargin = vehicle.seats - route.students;
  if (seatsMargin < 0) reasons.push(`座位缺 ${-seatsMargin} 个`);

  // 片区：积水站点当日取消接人；车辆停靠片区积水则不能出场
  const routeAllFlooded =
    route.areas.length > 0 && route.areas.every((a) => ctx.floodedAreas.includes(a));
  const blockedByFlood = ctx.floodedAreas.includes(vehicle.homeArea);
  const neededAreas = route.areas.filter((a) => !ctx.floodedAreas.includes(a));
  const areaGaps = neededAreas.filter((a) => !vehicle.areas.includes(a));
  if (blockedByFlood) reasons.push("车辆停靠片区积水，无法出场");
  if (routeAllFlooded) reasons.push("线路途经片区全部积水，全线停驶");
  if (areaGaps.length) reasons.push(`不能覆盖片区：${areaGaps.join("、")}`);

  // 照管员
  const attendantOk = vehicle.hasAttendant;
  if (!attendantOk) reasons.push("缺随车照管员");

  // 准驾证
  const permitOk = permitCovers(driver.permit, vehicle.requiredPermit);
  if (!permitOk)
    reasons.push(`准驾不符（持 ${driver.permit}，车需 ${vehicle.requiredPermit}）`);

  // 班次窗口
  const shiftOk = withinShift(winStart, winEnd, driver.shiftStart, driver.shiftEnd);
  if (!shiftOk) reasons.push(`趟次 ${winStart}-${winEnd} 超出司机班次 ${driver.shiftStart}-${driver.shiftEnd}`);

  // 工时
  const usedMinutes = driverBusy(state, driver.id, date, ctx.excludeAssignmentId)
    .filter((a) => withinShift(a.windowStart, a.windowEnd, driver.shiftStart, driver.shiftEnd))
    .reduce((sum, a) => sum + (toMinutes(a.windowEnd) - toMinutes(a.windowStart)), 0);
  const tripMinutes = toMinutes(winEnd) - toMinutes(winStart);
  const workOk = usedMinutes + tripMinutes <= driver.maxWorkMinutes;
  if (!workOk)
    reasons.push(`超当日工时（已排 ${usedMinutes} 分，本趟 ${tripMinutes} 分，上限 ${driver.maxWorkMinutes} 分）`);

  // 请假
  const leaveBlocked = driverOnLeave(state, driver.id, date);
  if (leaveBlocked) reasons.push("司机当日请假");

  // 时间冲突
  const vehicleClash = vehicleBusy(state, vehicle.plate, date, ctx.excludeAssignmentId).some((a) =>
    overlaps(winStart, winEnd, a.windowStart, a.windowEnd)
  );
  const driverClash = driverBusy(state, driver.id, date, ctx.excludeAssignmentId).some((a) =>
    overlaps(winStart, winEnd, a.windowStart, a.windowEnd)
  );
  const timeOk = !vehicleClash && !driverClash;
  if (vehicleClash) reasons.push("车辆该时段已有班次");
  if (driverClash) reasons.push("司机该时段已有班次");

  const feasible =
    !vehicleLocked &&
    !driverLocked &&
    !routeAllFlooded &&
    seatsMargin >= 0 &&
    !blockedByFlood &&
    areaGaps.length === 0 &&
    attendantOk &&
    permitOk &&
    shiftOk &&
    workOk &&
    !leaveBlocked &&
    timeOk;

  // 优先级：车牌排队 → 座位浪费少 → 优先备车绑定司机 → 工时余量大
  const boundBonus = driver.regularVehiclePlate === vehicle.plate ? 0 : 1000;
  const score =
    (blockedByFlood ? 100000 : 0) +
    boundBonus +
    Math.max(0, seatsMargin) * 10 +
    (driver.maxWorkMinutes - usedMinutes - tripMinutes) / 100;

  return {
    vehicle,
    driver,
    seatsMargin,
    areaGaps,
    attendantOk,
    permitOk,
    shiftOk: shiftOk && workOk,
    timeOk,
    feasible,
    score,
    reasons
  };
}

/** 枚举所有可接管组合，按"车牌排队"顺序返回 */
export function findCandidates(state: AppState, ctx: EvalContext): Candidate[] {
  const results: Candidate[] = [];
  for (const vehicle of sortByPlate(state.vehicles)) {
    if (ctx.excludeVehiclePlate === vehicle.plate) continue;
    for (const driver of state.drivers) {
      if (ctx.excludeDriverId === driver.id) continue;
      results.push(evaluatePair(state, vehicle, driver, ctx));
    }
  }
  return results
    .filter((c) => c.feasible)
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.vehicle.plate.localeCompare(b.vehicle.plate, "zh-Hans-CN") ||
        a.driver.id.localeCompare(b.driver.id)
    );
}

/** 无组合时汇总候车区缺什么 */
export function buildDeficit(state: AppState, ctx: EvalContext): Deficit {
  const { route, date, winStart, winEnd } = ctx;
  const flooded = ctx.floodedAreas;

  // 第一层：线路是否全线积水；车辆停靠片区积水不能出场（锁定原车同样不可用）
  const routeAllFlooded =
    route.areas.length > 0 && route.areas.every((a) => flooded.includes(a));
  const usableVehicles = state.vehicles.filter(
    (v) => v.plate !== ctx.excludeVehiclePlate && !flooded.includes(v.homeArea)
  );
  const availableDrivers = state.drivers.filter((d) => d.id !== ctx.excludeDriverId);
  // 第二层：能不能覆盖所有未积水的途经片区
  const neededAreas = route.areas.filter((a) => !flooded.includes(a));
  const areaOkVehicles = usableVehicles.filter((v) => neededAreas.every((a) => v.areas.includes(a)));
  const areaGapsUnique = [...new Set(state.vehicles.flatMap((v) =>
    neededAreas.filter((a) => !v.areas.includes(a))
  ))];

  const parts: string[] = [];
  let seatsShort = 0;
  let attendantSeatsShort = 0;
  let missingAttendant = false;
  let permitBlocked = false;
  let shiftBlocked = false;

  if (flooded.length) parts.push(`片区积水：${flooded.join("、")}`);
  if (routeAllFlooded) {
    parts.push("线路途经片区全部积水，全线停驶，学生全部留在候车区");
    return {
      seatsShort: route.students,
      attendantSeatsShort: route.students,
      missingAttendant: false,
      areaGaps: [],
      permitBlocked: false,
      shiftBlocked: false,
      summary: parts.join("；")
    };
  }

  if (areaOkVehicles.length === 0) {
    if (areaGapsUnique.length) parts.push(`无车覆盖片区：${areaGapsUnique.join("、")}`);
    else parts.push("可出场车辆均无法覆盖线路片区");
  } else {
    // 第三层：座位（两个口径都报：全体可覆盖车辆的最大缺口、照管员合格车辆的缺口）
    seatsShort = Math.max(0, route.students - Math.max(...areaOkVehicles.map((v) => v.seats)));
    if (seatsShort > 0) parts.push(`缺 ${seatsShort} 个学生座位（可覆盖片区车辆最多 ${Math.max(...areaOkVehicles.map((v) => v.seats))} 座）`);
    const seatOkVehicles = areaOkVehicles.filter((v) => v.seats >= route.students);

    // 第四层：照管员
    const attendantVehicles = seatOkVehicles.filter((v) => v.hasAttendant);
    const attendantInArea = areaOkVehicles.filter((v) => v.hasAttendant);
    if (seatOkVehicles.length > 0 && attendantVehicles.length === 0) {
      missingAttendant = true;
      if (attendantInArea.length === 0) {
        parts.push(
          `能覆盖片区的车辆（最多 ${Math.max(...seatOkVehicles.map((v) => v.seats))} 座）缺随车照管员；带照管员的车辆又不覆盖 ${neededAreas.join("、")}`
        );
      } else {
        parts.push("座位够的车辆缺随车照管员");
        // 有照管员的车都偏小：补充其座位缺口
        attendantSeatsShort = Math.max(
          0,
          route.students - Math.max(...attendantInArea.map((v) => v.seats))
        );
        if (attendantSeatsShort > 0) {
          parts.push(
            `带照管员的车辆最大仅 ${route.students - attendantSeatsShort} 座，还差 ${attendantSeatsShort} 座`
          );
        }
      }
    }

    // 第五层：有没有任何司机能开这些"座位+照管员"都合格的车
    const goodPlates = new Set(attendantVehicles.map((v) => v.plate));
    const goodPairs = sortByPlate(state.vehicles)
      .filter((v) => goodPlates.has(v.plate))
      .flatMap((v) => availableDrivers.map((d) => evaluatePair(state, v, d, ctx)));

    if (goodPairs.length > 0) {
      const permitOkPairs = goodPairs.filter((c) => c.permitOk);
      if (permitOkPairs.length === 0) {
        permitBlocked = true;
        parts.push("无司机准驾证符合合格车辆");
      } else {
        const shiftOkPairs = permitOkPairs.filter((c) => c.shiftOk);
        const leaveBlocked = permitOkPairs.every((c) => driverOnLeave(state, c.driver.id, date));
        if (shiftOkPairs.length === 0) {
          shiftBlocked = true;
          parts.push("准驾符合的司机班次窗口/当日工时均不符");
        } else if (leaveBlocked) {
          parts.push("可匹配司机当日均请假");
        } else {
          // 班次够但时间冲突（车辆/司机该时段已排）
          const free = shiftOkPairs.filter(
            (c) => c.timeOk && !c.reasons.some((r) => r.includes("请假"))
          );
          if (free.length === 0) {
            parts.push(`该时段（${winStart}-${winEnd}）车驾组合均有班次冲突`);
          }
        }
      }
    }
  }

  if (parts.length === 0) parts.push("该时段无空闲车驾组合");

  return {
    seatsShort,
    attendantSeatsShort,
    missingAttendant,
    areaGaps: areaGapsUnique,
    permitBlocked,
    shiftBlocked,
    summary: parts.join("；")
  };
}

// ---------- 排班 ----------

/** 按车牌排出当天基准计划 */
export function planDay(state: AppState, date: string): EventLog[] {
  const io: LogInput = { events: [], date };
  // 同日只允许排一次：清除当日草稿派位（不含已确认调整产生的派位）
  state.assignments = state.assignments.filter((a) => a.date !== date);
  state.adjustments = state.adjustments.filter((a) => a.date !== date);
  state.events = state.events.filter((e) => e.date !== date);
  if (!state.plannedDates.includes(date)) state.plannedDates.push(date);

  for (const route of [...state.routes].sort((a, b) =>
    a.regularVehicleId.localeCompare(b.regularVehicleId, "zh-Hans-CN")
  )) {
    const r = getRoute(state, route.id)!;
    const vehicle = getVehicle(state, r.regularVehicleId);
    const driver = state.drivers.find((d) => d.regularVehiclePlate === r.regularVehicleId);
    if (!vehicle || !driver) {
      log(io, "PLAN_SKIP", `线路 ${r.id} 缺默认车辆或司机，跳过`);
      continue;
    }
    const win = tripWindow(r.departAt, r.arriveBy);
    state.assignments.push({
      id: uid("A"),
      date,
      routeId: r.id,
      kind: "regular",
      vehiclePlate: vehicle.plate,
      driverId: driver.id,
      status: "planned",
      windowStart: win.start,
      windowEnd: win.end,
      createdAt: nowStamp(),
      updatedAt: nowStamp()
    });
    log(io, "PLAN", `线路 ${r.id} 排入 ${vehicle.plate}/${driver.name}`);
  }
  state.events.push(...io.events);
  return io.events;
}

// ---------- 触发异常并提出方案 ----------

export interface TriggerResult {
  adjustment: Adjustment;
  candidates: Candidate[];
}

/** 登记触发条件（司机请假 / 片区积水），锁定原车，并尝试给出替换组合 */
export function raiseTrigger(
  state: AppState,
  date: string,
  routeId: string,
  trigger: Trigger
): TriggerResult {
  const io: LogInput = { events: [], date };
  const route = getRoute(state, routeId);
  if (!route) throw new Error(`线路 ${routeId} 不存在`);

  const regular = state.assignments.find(
    (a) => a.date === date && a.routeId === routeId && a.kind === "regular"
  );
  if (!regular) throw new Error(`线路 ${routeId} 当天尚未排班`);
  if (regular.status === "released") throw new Error(`线路 ${routeId} 原车已释放`);

  // 已存在未闭环的调整单则直接复用
  const existing = state.adjustments.find(
    (a) => a.date === date && a.routeId === routeId && ["open", "proposed", "waiting"].includes(a.status)
  );

  const win = tripWindow(route.departAt, route.arriveBy);
  const floodedAreas = trigger.type === "flood" ? trigger.payload : collectFloodAreas(state, date);

  const ctx: EvalContext = {
    date,
    route,
    winStart: win.start,
    winEnd: win.end,
    floodedAreas,
    excludeAssignmentId: regular.id,
    excludeVehiclePlate: regular.vehiclePlate,
    excludeDriverId: regular.driverId
  };
  const candidates = findCandidates(state, ctx);

  let adjustment: Adjustment;
  if (existing) {
    existing.trigger = trigger;
    existing.updatedAt = nowStamp();
    existing.newVehiclePlate = undefined;
    existing.newDriverId = undefined;
    existing.replacementAssignmentId = undefined;
    adjustment = existing;
  } else {
    adjustment = {
      id: uid("ADJ"),
      date,
      routeId,
      trigger,
      originalVehiclePlate: regular.vehiclePlate,
      originalDriverId: regular.driverId,
      regularAssignmentId: regular.id,
      status: "open",
      createdAt: nowStamp(),
      updatedAt: nowStamp()
    };
    state.adjustments.push(adjustment);
  }

  // 锁定原车原司机派位
  regular.status = "held";
  regular.updatedAt = nowStamp();

  if (candidates.length > 0) {
    const pick = candidates[0];
    adjustment.newVehiclePlate = pick.vehicle.plate;
    adjustment.newDriverId = pick.driver.id;
    adjustment.status = "proposed";
    adjustment.deficit = undefined;

    const replacement: Assignment = {
      id: uid("A"),
      date,
      routeId,
      kind: "replacement",
      vehiclePlate: pick.vehicle.plate,
      driverId: pick.driver.id,
      status: "proposed",
      windowStart: win.start,
      windowEnd: win.end,
      adjustmentId: adjustment.id,
      createdAt: nowStamp(),
      updatedAt: nowStamp()
    };
    // 同一调整单重新提方案：移除旧的 proposed 替换派位
    state.assignments = state.assignments.filter(
      (a) => a.adjustmentId !== adjustment.id || a.status === "confirmed"
    );
    state.assignments.push(replacement);
    adjustment.replacementAssignmentId = replacement.id;

    log(
      io,
      "PROPOSE",
      `${trigger.reason}：线路 ${routeId} 原车 ${adjustment.originalVehiclePlate} 锁定，拟换 ${pick.vehicle.plate}/${pick.driver.name}`
    );
  } else {
    adjustment.status = "waiting";
    adjustment.deficit = buildDeficit(state, ctx);
    state.assignments = state.assignments.filter(
      (a) => a.adjustmentId !== adjustment.id
    );
    adjustment.replacementAssignmentId = undefined;
    log(
      io,
      "WAIT",
      `${trigger.reason}：线路 ${routeId} 无合适组合，留在候车区（${adjustment.deficit.summary}）`
    );
  }

  state.events.push(...io.events);
  return { adjustment, candidates };
}

/** 汇总当天所有积水触发的片区 */
function collectFloodAreas(state: AppState, date: string): string[] {
  return [
    ...new Set(
      state.adjustments
        .filter((a) => a.date === date && a.trigger.type === "flood")
        .flatMap((a) => a.trigger.payload)
    )
  ];
}

/** 人工改选候选组合 */
export function chooseCandidate(
  state: AppState,
  adjustmentId: string,
  vehiclePlate: string,
  driverId: string
): EventLog[] {
  const adj = state.adjustments.find((a) => a.id === adjustmentId);
  if (!adj) throw new Error("调整单不存在");
  const io: LogInput = { events: [], date: adj.date };
  const route = getRoute(state, adj.routeId)!;
  const win = tripWindow(route.departAt, route.arriveBy);
  const floodedAreas = adj.trigger.type === "flood" ? adj.trigger.payload : collectFloodAreas(state, adj.date);

  const vehicle = getVehicle(state, vehiclePlate)!;
  const driver = getDriver(state, driverId)!;
  const c = evaluatePair(state, vehicle, driver, {
    date: adj.date,
    route,
    winStart: win.start,
    winEnd: win.end,
    floodedAreas,
    excludeAssignmentId: adj.regularAssignmentId,
    excludeVehiclePlate: adj.originalVehiclePlate,
    excludeDriverId: adj.originalDriverId
  });
  if (!c.feasible) throw new Error(`组合不可用：${c.reasons.join("；")}`);

  state.assignments = state.assignments.filter((a) => a.adjustmentId !== adj.id);

  const replacement: Assignment = {
    id: uid("A"),
    date: adj.date,
    routeId: adj.routeId,
    kind: "replacement",
    vehiclePlate,
    driverId,
    status: "proposed",
    windowStart: win.start,
    windowEnd: win.end,
    adjustmentId: adj.id,
    createdAt: nowStamp(),
    updatedAt: nowStamp()
  };
  state.assignments.push(replacement);
  adj.newVehiclePlate = vehiclePlate;
  adj.newDriverId = driverId;
  adj.replacementAssignmentId = replacement.id;
  adj.status = "proposed";
  adj.deficit = undefined;
  adj.updatedAt = nowStamp();

  log(io, "RECHOOSE", `线路 ${adj.routeId} 改选 ${vehiclePlate}/${driver.name}`);
  state.events.push(...io.events);
  return io.events;
}

/** 接管确认：替换派位生效，原车此时才释放 */
export function confirmTakeover(state: AppState, adjustmentId: string): EventLog[] {
  const adj = state.adjustments.find((a) => a.id === adjustmentId);
  if (!adj) throw new Error("调整单不存在");
  if (adj.status !== "proposed" || !adj.replacementAssignmentId)
    throw new Error("调整单尚无待确认的替换组合");

  const io: LogInput = { events: [], date: adj.date };
  const replacement = state.assignments.find((a) => a.id === adj.replacementAssignmentId)!;
  const regular = state.assignments.find((a) => a.id === adj.regularAssignmentId)!;

  replacement.status = "confirmed";
  replacement.updatedAt = nowStamp();
  regular.status = "released"; // 原车在接管确认后才释放
  regular.updatedAt = nowStamp();
  adj.status = "confirmed";
  adj.updatedAt = nowStamp();

  const nv = getVehicle(state, adj.newVehiclePlate!)!;
  const nd = getDriver(state, adj.newDriverId!)!;
  log(
    io,
    "CONFIRM",
    `线路 ${adj.routeId} 由 ${nv.plate}/${nd.name} 接管确认，原车 ${adj.originalVehiclePlate} 释放`
  );
  state.events.push(...io.events);
  return io.events;
}

/** 取消调整单（误触发），恢复原车计划 */
export function cancelAdjustment(state: AppState, adjustmentId: string): EventLog[] {
  const adj = state.adjustments.find((a) => a.id === adjustmentId);
  if (!adj) throw new Error("调整单不存在");
  const io: LogInput = { events: [], date: adj.date };
  state.assignments = state.assignments.filter((a) => a.adjustmentId !== adj.id);
  const regular = state.assignments.find((a) => a.id === adj.regularAssignmentId);
  if (regular && regular.status === "held") {
    regular.status = "planned";
    regular.updatedAt = nowStamp();
  }
  adj.status = "cancelled";
  adj.updatedAt = nowStamp();
  log(io, "CANCEL", `线路 ${adj.routeId} 调整单撤销，原车 ${adj.originalVehiclePlate} 恢复排班`);
  state.events.push(...io.events);
  return io.events;
}
