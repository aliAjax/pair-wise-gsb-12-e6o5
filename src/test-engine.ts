// 引擎端到端场景验证（node 脚本，非生产代码）
import { seedState } from "./seed";
import type { AppState } from "./types";
import {
  planDay,
  raiseTrigger,
  confirmTakeover,
  chooseCandidate,
  findCandidates,
  evaluatePair
} from "./lib/engine";
import { tripWindow } from "./lib/time";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed += 1;
    console.log(`  ✅ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ❌ ${msg}`);
  }
}

function freshDay(date = "2026-09-27"): { state: AppState; date: string } {
  const state = seedState();
  planDay(state, date);
  return { state, date };
}

function assignOf(state: AppState, date: string, routeId: string, kind: string) {
  return state.assignments.find(
    (a) => a.date === date && a.routeId === routeId && a.kind === kind
  )!;
}

// ---------- 场景 1：司机请假 → 成功替换 → 接管确认后原车才释放 ----------
{
  console.log("场景1：R04 城北老城线司机李刚请假，备车 1008 接管，确认后原车释放");
  const { state, date } = freshDay();
  const regularBefore = assignOf(state, date, "R04", "regular");
  assert(regularBefore.status === "planned", "原派位初始为 planned");

  const { adjustment, candidates } = raiseTrigger(state, date, "R04", {
    type: "driver_leave",
    payload: ["D04"],
    reason: "司机请假：李刚"
  });
  assert(candidates.length > 0, "存在可行替换组合");
  assert(candidates[0].vehicle.plate === "苏A·1008", "首选为按车牌排队最靠前的合格备车 1008");
  assert(candidates[0].driver.id === "D08", "新司机为 D08 冯丽（A1 匹配）");

  const held = assignOf(state, date, "R04", "regular");
  assert(held.status === "held", "登记异常后原车立即锁定（held）");

  const repl = assignOf(state, date, "R04", "replacement");
  assert(repl.status === "proposed", "替换派位为 proposed，待接管确认");
  assert(adjustment.status === "proposed", "调整单为 proposed");

  // 原车在确认前不可被任何组合选用
  const ctxCandidates = findCandidates(state, {
    date,
    route: state.routes.find((r) => r.id === "R04")!,
    winStart: repl.windowStart,
    winEnd: repl.windowEnd,
    floodedAreas: [],
    excludeAssignmentId: held.id,
    excludeVehiclePlate: held.vehiclePlate,
    excludeDriverId: held.driverId
  });
  assert(
    ctxCandidates.every((c) => c.vehicle.plate !== "苏A·1004"),
    "确认前候选组合不含锁定中的原车 1004"
  );

  confirmTakeover(state, adjustment.id);
  assert(assignOf(state, date, "R04", "regular").status === "released", "接管确认后原车才释放（released）");
  assert(assignOf(state, date, "R04", "replacement").status === "confirmed", "新车状态为 confirmed");
  assert(state.adjustments.find((a) => a.id === adjustment.id)!.status === "confirmed", "调整单已闭环");
}

// ---------- 场景 2：道路积水 → 车辆不能覆盖片区，进候车区并写清缺口 ----------
{
  console.log("场景2：R01 城东河畔线，城东+河畔片区积水，全线无车可进场，进入候车区");
  const { state, date } = freshDay();
  const { adjustment, candidates } = raiseTrigger(state, date, "R01", {
    type: "flood",
    payload: ["河畔", "城东"],
    reason: "道路积水：河畔、城东"
  });
  assert(candidates.length === 0, "无可行组合（所有能跑 R01 的车都停靠/服务积水片区）");
  assert(adjustment.status === "waiting", "调整单进入 waiting");
  assert(!!adjustment.deficit, "已记录缺口");
  assert(adjustment.deficit!.summary.includes("河畔") && adjustment.deficit!.summary.includes("城东"),
    `缺口说明包含积水片区：${adjustment.deficit!.summary}`);
  assert(
    state.assignments.find((a) => a.routeId === "R01" && a.kind === "replacement") === undefined,
    "候车区不产生替换派位"
  );

  // 只淹"河畔"时：河畔站点当日取消，仍跑城东段，1008 可接管
  const s2 = freshDay();
  const partial = raiseTrigger(s2.state, s2.date, "R01", {
    type: "flood",
    payload: ["河畔"],
    reason: "道路积水：河畔"
  });
  assert(partial.candidates.some((c) => c.vehicle.plate === "苏A·1008"),
    "仅河畔积水时 1008 可接管城东段（不要求车辆进入积水片区）");
}

// ---------- 场景 3：座位不够 / 座位够但缺照管员 → 候车区写清缺口 ----------
{
  console.log("场景3：R03 城南大学城线司机请假，缺口按座位/照管员分层说明");
  // 3a：28 人时 1007 座位够但无照管员 → 明确报缺照管员
  const s3a = freshDay();
  const r3a = raiseTrigger(s3a.state, s3a.date, "R03", {
    type: "driver_leave",
    payload: ["D03"],
    reason: "司机请假：孙磊"
  });
  assert(r3a.candidates.length === 0, "28 人：无可行组合（1007 无照管员，1009 只有 25 座）");
  assert(r3a.adjustment.deficit!.missingAttendant, "缺口标记 missingAttendant");
  assert(r3a.adjustment.deficit!.summary.includes("缺随车照管员"),
    `说明写明缺照管员：${r3a.adjustment.deficit!.summary}`);

  // 3b：临时把登记学生数调成 46 → 最大车 48 座无照管员；带照管员车最大 25 座，缺 21 座
  const state3b = seedState();
  state3b.routes.find((r) => r.id === "R03")!.students = 46;
  planDay(state3b, "2026-09-27");
  const s3b = { state: state3b, date: "2026-09-27" };
  const r3b = raiseTrigger(s3b.state, s3b.date, "R03", {
    type: "driver_leave",
    payload: ["D03"],
    reason: "司机请假：孙磊"
  });
  assert(r3b.candidates.length === 0, "46 人：仍无可行组合");
  assert(r3b.adjustment.deficit!.seatsShort === 0, "覆盖片区最大车 48 座，座位总缺口为 0");
  assert(r3b.adjustment.deficit!.missingAttendant, "核心卡点：48 座备车缺照管员");
  assert(r3b.adjustment.deficit!.summary.includes("缺随车照管员"), "说明写清缺照管员");
  assert(r3b.adjustment.deficit!.summary.includes("带照管员的车辆又不覆盖"),
    `说明写清带照管员车不覆盖片区：${r3b.adjustment.deficit!.summary}`);
}

// ---------- 场景 4：座位够但缺照管员 ----------
{
  console.log("场景4：R05 科技园线司机请假，唯一覆盖片区的 1009 座位不够，明确缺座说明");
  const { state, date } = freshDay();
  const { adjustment, candidates } = raiseTrigger(state, date, "R05", {
    type: "driver_leave",
    payload: ["D05"],
    reason: "司机请假：周敏"
  });
  assert(candidates.length === 0, "无可行组合");
  assert(adjustment.deficit!.seatsShort === 8, "缺 8 个座位（1009 只有 25 座）");
}

// ---------- 场景 5：小线成功替换（照管员/准驾/工时全满足） ----------
{
  console.log("场景5：R06 西坝小班线司机请假，1009/陈静 可接管");
  const { state, date } = freshDay();
  const { candidates } = raiseTrigger(state, date, "R06", {
    type: "driver_leave",
    payload: ["D06"],
    reason: "司机请假：吴芳"
  });
  const pick = candidates.find((c) => c.vehicle.plate === "苏A·1009" && c.driver.id === "D09");
  assert(!!pick, "候选包含 1009/D09");
  assert(pick!.feasible, "25 座 ≥ 18 人、有照管员、A3 开 A3 车、班次工时均满足");
  assert(candidates[0].vehicle.plate === "苏A·1009", "1009 为首选（车牌排序且无更小合格车）");
}

// ---------- 场景 6：人工改选不可行组合时被拒绝 ----------
{
  console.log("场景6：改选时硬性校验，缺照管员的 1007 不允许接管任何线路");
  const { state, date } = freshDay();
  const { adjustment } = raiseTrigger(state, date, "R06", {
    type: "driver_leave",
    payload: ["D06"],
    reason: "司机请假：吴芳"
  });
  let rejected = false;
  try {
    chooseCandidate(state, adjustment.id, "苏A·1007", "D07");
  } catch (e) {
    rejected = true;
    console.log(`     拦截原因：${(e as Error).message}`);
  }
  assert(rejected, "缺照管员组合被拒绝");
}

// ---------- 场景 7：准驾证等级校验（A1 可开 A3 车，A3 不能开 A1 车） ----------
{
  console.log("场景7：准驾证高低准驾校验");
  const { state, date } = freshDay();
  const route = state.routes.find((r) => r.id === "R04")!;
  const win = tripWindow(route.departAt, route.arriveBy);
  const base = { date, route, winStart: win.start, winEnd: win.end, floodedAreas: [] };
  const v1004 = state.vehicles.find((v) => v.plate === "苏A·1004")!;
  const d03 = state.drivers.find((d) => d.id === "D03")!; // A3
  const d01 = state.drivers.find((d) => d.id === "D01")!; // A1
  const a3onA1 = evaluatePair(state, v1004, d03, { ...base, excludeVehiclePlate: "苏A·0000" });
  assert(!a3onA1.permitOk, "A3 司机不能开需 A1 的 1004");
  const v1003 = state.vehicles.find((v) => v.plate === "苏A·1003")!; // A3 车
  const a1onA3 = evaluatePair(state, v1003, d01, { ...base, excludeVehiclePlate: "苏A·0000" });
  assert(a1onA3.permitOk, "A1 司机可以开需 A3 的 1003");
}

// ---------- 场景 8：工时上限拦截 ----------
{
  console.log("场景8：同一时段重复派单导致车辆/司机时间冲突");
  const { state, date } = freshDay();
  // R04 用 1008 接管确认后，R01 再触发（同窗），1008 已不可用
  const r1 = raiseTrigger(state, date, "R04", {
    type: "driver_leave",
    payload: ["D04"],
    reason: "李刚请假"
  });
  confirmTakeover(state, r1.adjustment.id);
  const r2 = raiseTrigger(state, date, "R01", {
    type: "driver_leave",
    payload: ["D01"],
    reason: "赵强请假"
  });
  assert(
    r2.candidates.every((c) => !(c.vehicle.plate === "苏A·1008" && c.driver.id === "D08")),
    "已执行趟次的 1008/D08 在重叠时段不再出现"
  );
}

// ---------- 场景 9：流水与持久化数据可重开核对 ----------
{
  console.log("场景9：事件流水完整，且状态可序列化重开核对");
  const { state, date } = freshDay();
  const { adjustment } = raiseTrigger(state, date, "R04", {
    type: "driver_leave",
    payload: ["D04"],
    reason: "李刚请假"
  });
  confirmTakeover(state, adjustment.id);
  const dayEvents = state.events.filter((e) => e.date === date);
  const actions = dayEvents.map((e) => e.action);
  assert(actions.includes("PROPOSE"), "流水含 PROPOSE");
  assert(actions.includes("CONFIRM"), "流水含 CONFIRM");
  const confirmEvent = dayEvents.find((e) => e.action === "CONFIRM")!;
  assert(confirmEvent.detail.includes("苏A·1004") && confirmEvent.detail.includes("苏A·1008"),
    "CONFIRM 流水同时写明原车与新车");
  const json = JSON.stringify(state);
  const reopened = JSON.parse(json) as AppState;
  const adj = reopened.adjustments.find((a) => a.id === adjustment.id)!;
  assert(adj.originalVehiclePlate === "苏A·1004", "重开后仍可核对原车");
  assert(adj.newVehiclePlate === "苏A·1008", "重开后仍可核对新车");
  assert(adj.trigger.payload[0] === "D04", "重开后仍可核对触发条件");
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
