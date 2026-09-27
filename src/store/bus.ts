// 早班校车调配状态机：触发 → 候选 → 接管确认（原车才释放）→ 候车区，全程台账可追溯
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { planReassignment } from "../engine/dispatch";
import { DEFAULT_NOW, SEED_DRIVERS, SEED_ROUTES, SEED_VEHICLES } from "../data/seed";
import type {
  Candidate,
  DayData,
  Driver,
  LogEntry,
  Route,
  RunState,
  TriggerInfo,
  Vehicle
} from "../types";

const MASTER_KEY = "schoolbus:masters";
const dayKey = (date: string) => `schoolbus:day:${date}`;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadMasters(): { routes: Route[]; vehicles: Vehicle[]; drivers: Driver[] } {
  try {
    const raw = localStorage.getItem(MASTER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.routes && parsed.vehicles && parsed.drivers) return parsed;
    }
  } catch {
    /* 数据损坏时回落到种子 */
  }
  return {
    routes: structuredClone(SEED_ROUTES),
    vehicles: structuredClone(SEED_VEHICLES),
    drivers: structuredClone(SEED_DRIVERS)
  };
}

function blankDay(): DayData {
  return { runs: {}, logs: [], now: DEFAULT_NOW, floodedZones: [] };
}

function loadDay(date: string): DayData {
  try {
    const raw = localStorage.getItem(dayKey(date));
    if (raw) return { ...blankDay(), ...(JSON.parse(raw) as DayData) };
  } catch {
    /* 忽略损坏数据 */
  }
  return blankDay();
}

export const useBusStore = defineStore("bus", () => {
  const masters = loadMasters();
  const routes = ref<Route[]>(masters.routes);
  const vehicles = ref<Vehicle[]>(masters.vehicles);
  const drivers = ref<Driver[]>(masters.drivers);

  const date = ref(today());
  const day = ref<DayData>(loadDay(date.value));

  // ---------- 持久化 ----------
  function persistMasters() {
    localStorage.setItem(
      MASTER_KEY,
      JSON.stringify({ routes: routes.value, vehicles: vehicles.value, drivers: drivers.value })
    );
  }
  function persistDay() {
    localStorage.setItem(dayKey(date.value), JSON.stringify(day.value));
  }
  function persistAll() {
    persistMasters();
    persistDay();
  }

  // ---------- 查询 ----------
  const vehicleById = (id: string | null | undefined) =>
    vehicles.value.find((v) => v.id === id) ?? null;
  const driverById = (id: string | null | undefined) =>
    drivers.value.find((d) => d.id === id) ?? null;
  const routeById = (id: string) => routes.value.find((r) => r.id === id) ?? null;

  function runOf(routeId: string): RunState {
    return (
      day.value.runs[routeId] ?? {
        routeId,
        status: "normal",
        trigger: null,
        replacedVehicleId: null,
        replacedDriverId: null,
        candidates: [],
        selected: null,
        reasons: [],
        takenAt: null
      }
    );
  }

  /** 班次当前实际执行的车辆（接管后 = 新车，否则 = 原车） */
  function currentVehicleOf(route: Route): Vehicle | null {
    const run = runOf(route.id);
    if (run.status === "takenover" && run.selected) return vehicleById(run.selected.vehicleId);
    return vehicleById(route.vehicleId);
  }
  function currentDriverOf(route: Route): Driver | null {
    const run = runOf(route.id);
    if (run.status === "takenover" && run.selected) return driverById(run.selected.driverId);
    return driverById(route.driverId);
  }
  function effectivePlate(route: Route): string {
    return currentVehicleOf(route)?.plate ?? "ZZZ";
  }

  /** 早班校车按车牌排队 */
  const queue = computed(() =>
    [...routes.value].sort((a, b) =>
      effectivePlate(a).localeCompare(effectivePlate(b), "zh-Hans-CN")
    )
  );
  const waitingRuns = computed(() =>
    routes.value.filter((r) => runOf(r.id).status === "waiting")
  );
  const proposedRuns = computed(() =>
    routes.value.filter((r) => runOf(r.id).status === "proposed")
  );

  // ---------- 台账 ----------
  function pushLog(
    route: Route,
    action: string,
    opts: {
      trigger?: string;
      originalVehicleId?: string | null;
      originalDriverId?: string | null;
      newVehicleId?: string | null;
      newDriverId?: string | null;
      detail?: string;
    } = {}
  ) {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      date: date.value,
      routeId: route.id,
      routeCode: route.code,
      action,
      trigger: opts.trigger ?? "",
      originalVehiclePlate: vehicleById(opts.originalVehicleId)?.plate ?? "",
      originalDriverName: driverById(opts.originalDriverId)?.name ?? "",
      newVehiclePlate: vehicleById(opts.newVehicleId)?.plate ?? "",
      newDriverName: driverById(opts.newDriverId)?.name ?? "",
      detail: opts.detail ?? ""
    };
    day.value.logs = [entry, ...day.value.logs];
  }

  // ---------- 触发调配 ----------
  function applyTrigger(route: Route, trigger: TriggerInfo) {
    const prev = runOf(route.id);
    // 原车/原司机快照：接管过的班次以当前执行组合为准
    const replacedVehicleId =
      prev.status === "takenover" && prev.selected ? prev.selected.vehicleId : route.vehicleId;
    const replacedDriverId =
      prev.status === "takenover" && prev.selected ? prev.selected.driverId : route.driverId;

    const result = planReassignment({
      route,
      vehicles: vehicles.value,
      drivers: drivers.value,
      runs: Object.values(day.value.runs),
      allRoutes: routes.value,
      trigger,
      now: day.value.now,
      releasedDriverId: trigger.kind === "driver_leave" ? replacedDriverId : null,
      excludeVehicleId: trigger.kind === "flood" ? replacedVehicleId : null
    });

    const status = result.candidates.length > 0 ? "proposed" : "waiting";
    day.value.runs[route.id] = {
      routeId: route.id,
      status,
      trigger,
      replacedVehicleId,
      replacedDriverId,
      candidates: result.candidates,
      selected: null,
      reasons: result.reasons,
      takenAt: null
    };

    pushLog(route, status === "proposed" ? "触发调配" : "留候车区", {
      trigger: trigger.detail,
      originalVehicleId: replacedVehicleId,
      originalDriverId: replacedDriverId,
      detail:
        status === "proposed"
          ? `匹配到 ${result.candidates.length} 个接管组合，原车未释放，等待选定与接管确认`
          : `无合适组合：${result.reasons.join("；") || "无可用车辆"}`
    });
    persistDay();
  }

  /** 司机请假 */
  function triggerLeave(routeId: string) {
    const route = routeById(routeId);
    if (!route) return;
    const driver = currentDriverOf(route);
    if (!driver) return;
    driver.onLeave = true; // 当日请假登记，持久化到司机档案
    applyTrigger(route, {
      kind: "driver_leave",
      detail: `司机${driver.name}请假`,
      at: new Date().toISOString()
    });
    persistMasters();
  }

  /** 道路积水 */
  function triggerFlood(routeId: string, zones: string[]) {
    const route = routeById(routeId);
    if (!route || zones.length === 0) return;
    day.value.floodedZones = [...new Set([...day.value.floodedZones, ...zones])];
    applyTrigger(route, {
      kind: "flood",
      detail: `道路积水：${zones.join("、")}`,
      at: new Date().toISOString(),
      floodedZones: zones
    });
  }

  // ---------- 两阶段接管 ----------
  function selectCandidate(routeId: string, candidate: Candidate) {
    const run = day.value.runs[routeId];
    const route = routeById(routeId);
    if (!run || !route || run.status !== "proposed") return;
    run.selected = { vehicleId: candidate.vehicleId, driverId: candidate.driverId };
    pushLog(route, "选定组合", {
      trigger: run.trigger?.detail,
      originalVehicleId: run.replacedVehicleId,
      originalDriverId: run.replacedDriverId,
      newVehicleId: candidate.vehicleId,
      newDriverId: candidate.driverId,
      detail: "已选定接管组合，原车仍占用，等待接管确认"
    });
    persistDay();
  }

  /** 接管确认：确认后原车/原司机才释放 */
  function confirmTakeover(routeId: string) {
    const run = day.value.runs[routeId];
    const route = routeById(routeId);
    if (!run || !route || run.status !== "proposed" || !run.selected) return;
    run.status = "takenover";
    run.takenAt = new Date().toISOString();
    pushLog(route, "确认接管", {
      trigger: run.trigger?.detail,
      originalVehicleId: run.replacedVehicleId,
      originalDriverId: run.replacedDriverId,
      newVehicleId: run.selected.vehicleId,
      newDriverId: run.selected.driverId,
      detail: "新组合已接管，原车与原司机释放"
    });
    persistDay();
  }

  /** 撤销调配：回到原车执行 */
  function cancelProposal(routeId: string) {
    const run = day.value.runs[routeId];
    const route = routeById(routeId);
    if (!run || !route || (run.status !== "proposed" && run.status !== "waiting")) return;
    pushLog(route, "撤销调配", {
      trigger: run.trigger?.detail,
      originalVehicleId: run.replacedVehicleId,
      originalDriverId: run.replacedDriverId,
      detail: "恢复原车执行"
    });
    delete day.value.runs[routeId];
    persistDay();
  }

  /** 候车区重新匹配（登记数据可能已更新） */
  function rematch(routeId: string) {
    const run = day.value.runs[routeId];
    const route = routeById(routeId);
    if (!run || !route || !run.trigger) return;
    const result = planReassignment({
      route,
      vehicles: vehicles.value,
      drivers: drivers.value,
      runs: Object.values(day.value.runs),
      allRoutes: routes.value,
      trigger: run.trigger,
      now: day.value.now,
      releasedDriverId:
        run.trigger.kind === "driver_leave" ? run.replacedDriverId : null,
      excludeVehicleId: run.trigger.kind === "flood" ? run.replacedVehicleId : null
    });
    run.candidates = result.candidates;
    run.reasons = result.reasons;
    run.status = result.candidates.length > 0 ? "proposed" : "waiting";
    run.selected = null;
    pushLog(route, "重新匹配", {
      trigger: run.trigger.detail,
      originalVehicleId: run.replacedVehicleId,
      originalDriverId: run.replacedDriverId,
      detail:
        result.candidates.length > 0
          ? `匹配到 ${result.candidates.length} 个接管组合`
          : `仍无合适组合：${result.reasons.join("；") || "无可用车辆"}`
    });
    persistDay();
  }

  // ---------- 当日控制 ----------
  function setNow(now: string) {
    day.value.now = now;
    persistDay();
  }
  function setDate(next: string) {
    persistDay();
    date.value = next;
    day.value = loadDay(next);
  }
  function resetDay() {
    // 重开当天：清空调配与台账，登记数据保留；当日请假标记一并复位
    drivers.value.forEach((d) => (d.onLeave = false));
    day.value = blankDay();
    persistAll();
  }

  // ---------- 登记管理 ----------
  function upsertRoute(route: Route) {
    const i = routes.value.findIndex((r) => r.id === route.id);
    if (i >= 0) routes.value[i] = route;
    else routes.value.push(route);
    persistMasters();
  }
  function deleteRoute(id: string): string | null {
    const run = runOf(id);
    if (run.status !== "normal") return "该班次正在调配中，请先撤销或完成接管";
    routes.value = routes.value.filter((r) => r.id !== id);
    persistMasters();
    return null;
  }
  function upsertVehicle(vehicle: Vehicle) {
    const i = vehicles.value.findIndex((v) => v.id === vehicle.id);
    if (i >= 0) vehicles.value[i] = vehicle;
    else vehicles.value.push(vehicle);
    persistMasters();
  }
  function deleteVehicle(id: string): string | null {
    if (routes.value.some((r) => r.vehicleId === id)) return "该车辆已排定班次，不能删除";
    if (Object.values(day.value.runs).some((r) => r.selected?.vehicleId === id || r.replacedVehicleId === id))
      return "该车辆涉及当日调配，不能删除";
    vehicles.value = vehicles.value.filter((v) => v.id !== id);
    persistMasters();
    return null;
  }
  function upsertDriver(driver: Driver) {
    const i = drivers.value.findIndex((d) => d.id === driver.id);
    if (i >= 0) drivers.value[i] = driver;
    else drivers.value.push(driver);
    persistMasters();
  }
  function deleteDriver(id: string): string | null {
    if (routes.value.some((r) => r.driverId === id)) return "该司机已排定班次，不能删除";
    if (Object.values(day.value.runs).some((r) => r.selected?.driverId === id || r.replacedDriverId === id))
      return "该司机涉及当日调配，不能删除";
    drivers.value = drivers.value.filter((d) => d.id !== id);
    persistMasters();
    return null;
  }

  // ---------- 导出 / 导入（重开核对） ----------
  function exportJson(): string {
    return JSON.stringify(
      {
        date: date.value,
        masters: { routes: routes.value, vehicles: vehicles.value, drivers: drivers.value },
        day: day.value
      },
      null,
      2
    );
  }
  function importJson(text: string): string | null {
    try {
      const parsed = JSON.parse(text);
      if (!parsed.masters || !parsed.day || !parsed.date) return "文件格式不正确";
      routes.value = parsed.masters.routes;
      vehicles.value = parsed.masters.vehicles;
      drivers.value = parsed.masters.drivers;
      date.value = parsed.date;
      day.value = parsed.day;
      persistAll();
      return null;
    } catch {
      return "无法解析 JSON 文件";
    }
  }

  return {
    // state
    date,
    routes,
    vehicles,
    drivers,
    // getters
    queue,
    waitingRuns,
    proposedRuns,
    runOf,
    currentVehicleOf,
    currentDriverOf,
    vehicleById,
    driverById,
    routeById,
    logs: computed(() => day.value.logs),
    now: computed(() => day.value.now),
    floodedZones: computed(() => day.value.floodedZones),
    // actions
    triggerLeave,
    triggerFlood,
    selectCandidate,
    confirmTakeover,
    cancelProposal,
    rematch,
    setNow,
    setDate,
    resetDay,
    upsertRoute,
    deleteRoute,
    upsertVehicle,
    deleteVehicle,
    upsertDriver,
    deleteDriver,
    exportJson,
    importJson
  };
});
