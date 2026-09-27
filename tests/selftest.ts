// 自测：匹配规则、两阶段接管、候车区缺额、台账与重开持久化。
// 运行：npm run selftest

// ---- 最小 localStorage shim（需在实例化 store 前安装） ----
const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear()
};

import { createPinia, setActivePinia } from "pinia";
import { MAX_WORK_MINUTES, planReassignment } from "../src/engine/dispatch";
import { useBusStore } from "../src/store/bus";
import type { Driver, Route, TriggerInfo, Vehicle } from "../src/types";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function freshStore() {
  mem.clear();
  setActivePinia(createPinia());
  return useBusStore();
}

const flood = (zones: string[]): TriggerInfo => ({
  kind: "flood",
  detail: `道路积水：${zones.join("、")}`,
  at: new Date().toISOString(),
  floodedZones: zones
});
const leave = (): TriggerInfo => ({
  kind: "driver_leave",
  detail: "司机请假",
  at: new Date().toISOString()
});

// ================= 1. 引擎规则（构造数据） =================
console.log("引擎规则：");

{
  // A1 车 + 只有 A3 空闲司机 → 缺准驾
  const vehicle: Vehicle = {
    id: "x1", plate: "沪A·X0001", seats: 30, attendants: 1,
    zones: ["甲区"], requiredLicense: "A1", waterSafe: true
  };
  const driver: Driver = {
    id: "p1", name: "张三", license: "A3", shiftMorning: true, onLeave: false, workedMinutes: 0
  };
  const route: Route = {
    id: "rt", code: "测1", students: 20, zones: ["甲区"], deadline: "08:00",
    durationMinutes: 30, requireAttendant: true, vehicleId: "x1", driverId: "p1"
  };
  const r = planReassignment({
    route, vehicles: [vehicle], drivers: [driver], runs: [], allRoutes: [route],
    trigger: leave(), now: "07:00"
  });
  check("准驾证不足时不匹配并说明", r.candidates.length === 0 && r.reasons.some((s) => s.includes("A1")));
}

{
  // 工时超限司机被排除
  const vehicle: Vehicle = {
    id: "x2", plate: "沪A·X0002", seats: 30, attendants: 1,
    zones: ["甲区"], requiredLicense: "A3", waterSafe: true
  };
  const driver: Driver = {
    id: "p2", name: "李四", license: "A3", shiftMorning: true, onLeave: false,
    workedMinutes: MAX_WORK_MINUTES - 20
  };
  const route: Route = {
    id: "rt2", code: "测2", students: 20, zones: ["甲区"], deadline: "08:00",
    durationMinutes: 30, requireAttendant: true, vehicleId: "x2", driverId: "p2"
  };
  const r = planReassignment({
    route, vehicles: [vehicle], drivers: [driver], runs: [], allRoutes: [route],
    trigger: leave(), releasedDriverId: "p2", now: "07:00"
  });
  check("工时会超限的司机不派", r.candidates.length === 0 && r.reasons.join("").includes("工时"));
}

{
  // 候选按余座从紧到松、车牌排序
  const big: Vehicle = { id: "vb", plate: "沪A·B0002", seats: 40, attendants: 1, zones: ["甲"], requiredLicense: "A3", waterSafe: true };
  const tight: Vehicle = { id: "vt", plate: "沪A·A0001", seats: 22, attendants: 1, zones: ["甲"], requiredLicense: "A3", waterSafe: true };
  const d1: Driver = { id: "d1", name: "甲", license: "A3", shiftMorning: true, onLeave: false, workedMinutes: 0 };
  const d2: Driver = { id: "d2", name: "乙", license: "A3", shiftMorning: true, onLeave: false, workedMinutes: 10 };
  const route: Route = {
    id: "rt3", code: "测3", students: 20, zones: ["甲"], deadline: "08:00",
    durationMinutes: 30, requireAttendant: true, vehicleId: "vb", driverId: "d1"
  };
  const r = planReassignment({
    route, vehicles: [big, tight], drivers: [d1, d2], runs: [], allRoutes: [route],
    trigger: leave(), releasedDriverId: "d1", now: "07:00"
  });
  check("余座从紧的组合排前面", r.candidates[0]?.vehicleId === "vt", JSON.stringify(r.candidates));
}

{
  // 片区不覆盖
  const vehicle: Vehicle = { id: "v", plate: "沪A·V0001", seats: 30, attendants: 1, zones: ["乙"], requiredLicense: "A3", waterSafe: true };
  const driver: Driver = { id: "d", name: "丁", license: "A3", shiftMorning: true, onLeave: false, workedMinutes: 0 };
  const route: Route = { id: "rt4", code: "测4", students: 20, zones: ["甲"], deadline: "08:00", durationMinutes: 20, requireAttendant: true, vehicleId: "v", driverId: "d" };
  const r = planReassignment({
    route, vehicles: [vehicle], drivers: [driver], runs: [], allRoutes: [route], trigger: flood(["甲"]), now: "07:00"
  });
  check("不通行片区被拦截", r.candidates.length === 0 && r.reasons.join("").includes("片区"));

  // 到校时限不可达
  const r2 = planReassignment({
    route, vehicles: [{ ...vehicle, zones: ["甲"], waterSafe: true }], drivers: [driver],
    runs: [], allRoutes: [route], trigger: flood(["甲"]), now: "07:50"
  });
  check("赶不上到校时限时直接候车", r2.candidates.length === 0 && r2.reasons.join("").includes("到校时限不可达"));
}

{
  // 原车在接管确认前不释放：用种子数据，R4 请假提案期间，其车 G7890 不能被别的线占用
  const store = freshStore();
  store.triggerLeave("r4"); // G7890 + 周晓琳 待接管
  const runR4 = store.runOf("r4");
  check("司机请假匹配到同车换司机", runR4.status === "proposed"
    && runR4.candidates[0]?.vehicleId === "v-g7890"
    && runR4.candidates[0]?.driverId === "d-zhou",
    JSON.stringify(runR4.candidates));

  // 另一线此时触发积水，G7890 因 R4 未确认仍占用，不出现在候选里
  store.triggerFlood("r1", ["老城区"]);
  const runR1 = store.runOf("r1");
  check("提案期间原车不被再分派",
    !runR1.candidates.some((c) => c.vehicleId === "v-g7890"));
  store.cancelProposal("r1");
  store.cancelProposal("r4");
}

// ================= 2. 状态机：两阶段接管 =================
console.log("状态机（种子数据）：");

{
  const store = freshStore();

  // 按车牌排队
  const plates = store.queue.map((rt) => store.currentVehicleOf(rt)?.plate);
  check(
    "早班按车牌排队",
    JSON.stringify(plates) === JSON.stringify(["沪A·B1234", "沪A·D5678", "沪A·E9012", "沪A·G7890"]),
    JSON.stringify(plates)
  );

  // 道路积水 → 候车区，缺项写清
  store.triggerFlood("r1", ["老城区"]);
  const waiting = store.runOf("r1");
  check("积水触发后进候车区", waiting.status === "waiting");
  const reasons = waiting.reasons.join("；");
  check("缺座位写清", reasons.includes("缺座位 8"));
  check("缺照管员写清", reasons.includes("缺照管员"));
  check("不能涉水写清", reasons.includes("不能涉水"));
  check("候车区计数", store.waitingRuns.length === 1);
  store.cancelProposal("r1");
  check("撤销后恢复正常", store.runOf("r1").status === "normal");

  // 司机请假 → 待接管
  store.triggerLeave("r4");
  const prop = store.runOf("r4");
  check("请假触发得到候选", prop.status === "proposed" && prop.candidates.length === 1);
  check("原车记录在案", prop.replacedVehicleId === "v-g7890" && prop.replacedDriverId === "d-qian");

  // 确认前原车未释放：R1 此时触发积水，G7890 仍被 R4 占用（不会出现在候选里）
  store.triggerFlood("r1", ["老城区"]);
  check("确认前原车不被再分派", store.runOf("r1").candidates.length === 0);
  store.cancelProposal("r1");

  // 选定 + 确认接管
  store.selectCandidate("r4", prop.candidates[0]);
  check("选定后仍待接管", store.runOf("r4").status === "proposed");
  store.confirmTakeover("r4");
  check("确认后已接管", store.runOf("r4").status === "takenover");
  check("执行车/司机切换",
    store.currentVehicleOf(store.routeById("r4")!)?.id === "v-g7890"
    && store.currentDriverOf(store.routeById("r4")!)?.id === "d-zhou");

  // 台账可追溯：原车、新车、触发条件
  const confirmLog = store.logs.find((l) => l.action === "确认接管");
  check("台账记录原车/原司机",
    confirmLog?.originalVehiclePlate === "沪A·G7890" && confirmLog.originalDriverName === "钱卫东");
  check("台账记录新车/新司机",
    confirmLog?.newVehiclePlate === "沪A·G7890" && confirmLog.newDriverName === "周晓琳");
  check("台账记录触发条件", confirmLog?.trigger === "司机钱卫东请假");
  check("台账记录释放说明", (confirmLog?.detail ?? "").includes("原车与原司机释放"));

  // 请假登记落到司机档案
  check("请假状态已登记", store.drivers.find((d) => d.id === "d-qian")?.onLeave === true);

  // 接管完成后 G7890 已被新线占用：再为 R1 匹配也不能抢
  store.triggerFlood("r1", ["老城区"]);
  const r1after = store.runOf("r1");
  check("接管后新车不被其他线抢用",
    !r1after.candidates.some((c) => c.vehicleId === "v-g7890"));
  store.cancelProposal("r1");
}

// ================= 3. 重开仍可核对 =================
console.log("持久化：");

{
  // 用已有 localStorage 再实例化（模拟刷新/重开）
  setActivePinia(createPinia());
  const reopened = useBusStore();
  check("重开后接管状态保留", reopened.runOf("r4").status === "takenover");
  check("重开后新司机保留", reopened.currentDriverOf(reopened.routeById("r4")!)?.id === "d-zhou");
  check("重开后台账仍在", reopened.logs.length >= 5);
  const exported = JSON.parse(reopened.exportJson());
  check("导出包含登记与当天安排", !!exported.masters && !!exported.day && exported.day.logs.length >= 5);
}

// ================= 4. 时限场景 =================
console.log("到校时限：");
{
  const store = freshStore();
  store.setNow("07:10"); // R3 时限 07:20，全程 25 分钟
  store.triggerFlood("r3", ["高新区"]);
  check("现在出发也迟到 → 候车并说明",
    store.runOf("r3").status === "waiting" && store.runOf("r3").reasons.join("").includes("07:35"));
}

// ================= 汇总 =================
console.log(`\n通过 ${passed} 项，失败 ${failed} 项`);
if (failed > 0) process.exit(1);
