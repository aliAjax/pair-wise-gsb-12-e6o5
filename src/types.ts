// 早班校车班次调配：领域模型

/** 准驾车型：A1 可覆盖 A3（大客车需 A1） */
export type LicenseType = "A1" | "A3";

/** 司机登记：准驾证、当日班次、请假与工时 */
export interface Driver {
  id: string;
  name: string;
  /** 准驾证类型 */
  license: LicenseType;
  /** 是否排了当日早班 */
  shiftMorning: boolean;
  /** 当日请假（含临时请假，由看板"司机请假"触发置位） */
  onLeave: boolean;
  /** 当日已发生工时（分钟，含前序班次） */
  workedMinutes: number;
}

/** 车辆登记：座位、照管员、可通行片区 */
export interface Vehicle {
  id: string;
  /** 车牌号 */
  plate: string;
  /** 学生座位数 */
  seats: number;
  /** 在车照管员人数 */
  attendants: number;
  /** 可通行片区 */
  zones: string[];
  /** 本车所需准驾证 */
  requiredLicense: LicenseType;
  /** 是否可涉水通行（道路积水时需要） */
  waterSafe: boolean;
}

/** 线路（班次）登记：学生数、途经片区、到校时限 */
export interface Route {
  id: string;
  /** 班次号，如 早1线 */
  code: string;
  /** 登记学生数 */
  students: number;
  /** 途经片区 */
  zones: string[];
  /** 到校时限 HH:MM */
  deadline: string;
  /** 全程行车分钟数 */
  durationMinutes: number;
  /** 是否必须配备照管员 */
  requireAttendant: boolean;
  /** 原配车辆 */
  vehicleId: string;
  /** 原配司机 */
  driverId: string;
}

export type TriggerKind = "driver_leave" | "flood";
export type RunStatus = "normal" | "proposed" | "takenover" | "waiting";

export interface TriggerInfo {
  kind: TriggerKind;
  /** 触发条件说明，如 "司机孙志强请假" / "道路积水：老城区" */
  detail: string;
  /** 触发时间 ISO */
  at: string;
  /** 积水涉及的本线片区 */
  floodedZones?: string[];
}

/** 一个可接管组合（车 + 司机） */
export interface Candidate {
  vehicleId: string;
  driverId: string;
  /** 余座 */
  spareSeats: number;
  /** 预计到校 HH:MM */
  finishTime: string;
}

/** 当日某班次的运行状态（两阶段调配） */
export interface RunState {
  routeId: string;
  status: RunStatus;
  trigger: TriggerInfo | null;
  /** 触发时的原车快照 */
  replacedVehicleId: string | null;
  replacedDriverId: string | null;
  /** 匹配到的候选组合 */
  candidates: Candidate[];
  /** 当前选定的接管组合（待确认/已确认） */
  selected: { vehicleId: string; driverId: string } | null;
  /** 候车区缺额说明（缺座位/缺照管员等） */
  reasons: string[];
  /** 接管确认时间 ISO */
  takenAt: string | null;
}

/** 调配台账记录：每笔调整可追溯原车、新车、触发条件 */
export interface LogEntry {
  id: string;
  at: string;
  date: string;
  routeId: string;
  routeCode: string;
  /** 触发调配 / 选定组合 / 确认接管 / 撤销 / 重新匹配 / 留候 */
  action: string;
  trigger: string;
  originalVehiclePlate: string;
  originalDriverName: string;
  newVehiclePlate: string;
  newDriverName: string;
  detail: string;
}

export interface DayData {
  /** routeId -> RunState（normal 懒初始化） */
  runs: Record<string, RunState>;
  logs: LogEntry[];
  /** 调度当前时间 HH:MM */
  now: string;
  /** 当日积水片区 */
  floodedZones: string[];
}
