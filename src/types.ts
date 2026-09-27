// 校车早班班次调配：领域模型
// 所有时间统一用 "HH:MM" 24 小时制字符串，按分钟比较。

/** 准驾证类型，A1 可驾驶要求 A1/A3/B1 的车，以此类推 */
export type Permit = "A1" | "A3" | "B1";

/** 线路：登记学生数、途经片区和到校时限 */
export interface Route {
  id: string; // 线路编号，如 R01
  name: string; // 线路名称
  students: number; // 登记学生数
  areas: string[]; // 途经片区（含上车点）
  departAt: string; // 首班发车时间 HH:MM
  arriveBy: string; // 到校时限 HH:MM（必须在此之前到校）
  regularVehicleId: string; // 按车牌排队时的默认车辆
}

/** 车辆：登记座位、照管员、服务片区和准驾要求 */
export interface Vehicle {
  plate: string; // 车牌号（排队主键）
  seats: number; // 核定学生座位
  hasAttendant: boolean; // 是否配备随车照管员
  areas: string[]; // 可服务片区（积水片区所在车辆不能出场）
  requiredPermit: Permit; // 驾驶本车所需准驾证
  homeArea: string; // 车辆停靠片区
}

/** 司机：登记准驾证、班次窗口和当日工时上限 */
export interface Driver {
  id: string;
  name: string;
  permit: Permit; // 持有准驾证
  shiftStart: string; // 当日班次开始
  shiftEnd: string; // 当日班次结束
  maxWorkMinutes: number; // 当日最长工时（分钟）
  regularVehiclePlate: string; // 绑定车辆（早班按车牌排队的原司机）
}

/** 派位状态 */
export type AssignmentStatus =
  | "planned" // 已按车牌排入计划
  | "held" // 原车锁定，等待替换接管确认
  | "proposed" // 替换组合已提出，待确认
  | "confirmed" // 接管已确认，正式执行
  | "released"; // 原车已释放（接管完成）

export interface Assignment {
  id: string; // A-xxx
  date: string; // YYYY-MM-DD
  routeId: string;
  kind: "regular" | "replacement";
  vehiclePlate: string;
  driverId: string;
  status: AssignmentStatus;
  /** 该趟占用车辆/司机的时间窗（用于班次与工时重叠校验） */
  windowStart: string;
  windowEnd: string;
  /** 替换派位关联的调整单 */
  adjustmentId?: string;
  /** 候车区缺什么（blocked 时填写） */
  deficit?: Deficit;
  createdAt: string;
  updatedAt: string;
}

/** 触发条件 */
export type TriggerType = "driver_leave" | "flood";

export interface Trigger {
  type: TriggerType;
  /** driver_leave: 请假司机 id；flood: 积水片区列表 */
  payload: string[];
  reason: string; // 可读说明
}

/** 调整单：每笔调整都能追到原车、新车和触发条件 */
export type AdjustmentStatus = "open" | "proposed" | "confirmed" | "waiting" | "cancelled";

export interface Adjustment {
  id: string; // ADJ-xxx
  date: string;
  routeId: string;
  trigger: Trigger;
  /** 原车（锁定，接管确认后释放） */
  originalVehiclePlate: string;
  originalDriverId: string;
  /** 新车/新司机（提出或确认后填入） */
  newVehiclePlate?: string;
  newDriverId?: string;
  regularAssignmentId: string; // 被锁定的原派位
  replacementAssignmentId?: string; // 替换派位
  status: AdjustmentStatus;
  /** 留在候车区时，写清缺的座位或照管员等 */
  deficit?: Deficit;
  createdAt: string;
  updatedAt: string;
}

/** 不满足条件的明细 */
export interface Deficit {
  seatsShort: number; // 还缺多少学生座位（可覆盖片区车辆口径，0 表示座位够）
  attendantSeatsShort: number; // 带照管员车辆口径的座位缺口（0 表示带照管员车辆座位够）
  missingAttendant: boolean; // 是否存在"座位够但缺照管员"的车
  areaGaps: string[]; // 车辆不能覆盖的途经片区
  permitBlocked: boolean; // 是否所有可用司机准驾不符
  shiftBlocked: boolean; // 是否所有可用司机班次/工时不符
  summary: string; // 一句话说明，写清缺的座位或照管员
}

/** 事件日志（append-only，重开仍能核对当天安排） */
export interface EventLog {
  seq: number;
  ts: string;
  date: string;
  action: string;
  detail: string;
}

export interface AppState {
  version: number;
  routes: Route[];
  vehicles: Vehicle[];
  drivers: Driver[];
  assignments: Assignment[];
  adjustments: Adjustment[];
  events: EventLog[];
  /** 已排班的日期 */
  plannedDates: string[];
}
