// 当日登记的基础数据（线路 / 车辆 / 司机）。首次打开时载入，之后保存在 localStorage。
import type { Driver, Route, Vehicle } from "../types";

export const SEED_VEHICLES: Vehicle[] = [
  // 备用大客车（可涉水），其 A1 司机当日请假，积水时会暴露"缺 A1 司机"
  {
    id: "v-b1234",
    plate: "沪A·B1234",
    seats: 45,
    attendants: 1,
    zones: ["滨河", "老城区", "高新区", "大学城"],
    requiredLicense: "A1",
    waterSafe: true
  },
  {
    id: "v-d5678",
    plate: "沪A·D5678",
    seats: 30,
    attendants: 1,
    zones: ["滨河", "老城区", "大学城"],
    requiredLicense: "A3",
    waterSafe: true
  },
  {
    id: "v-e9012",
    plate: "沪A·E9012",
    seats: 24,
    attendants: 1,
    zones: ["高新区", "大学城"],
    requiredLicense: "A3",
    waterSafe: false
  },
  {
    id: "v-f3456",
    plate: "沪A·F3456",
    seats: 36,
    attendants: 1,
    zones: ["滨河", "高新区", "大学城"],
    requiredLicense: "A1",
    waterSafe: true
  },
  {
    id: "v-g7890",
    plate: "沪A·G7890",
    seats: 20,
    attendants: 0,
    zones: ["老城区", "滨河"],
    requiredLicense: "A3",
    waterSafe: false
  }
];

export const SEED_DRIVERS: Driver[] = [
  { id: "d-wang", name: "王建国", license: "A1", shiftMorning: true, onLeave: false, workedMinutes: 60 },
  { id: "d-li", name: "李茂才", license: "A1", shiftMorning: true, onLeave: true, workedMinutes: 90 },
  { id: "d-zhao", name: "赵勇", license: "A3", shiftMorning: true, onLeave: false, workedMinutes: 60 },
  { id: "d-sun", name: "孙志强", license: "A3", shiftMorning: true, onLeave: false, workedMinutes: 40 },
  { id: "d-zhou", name: "周晓琳", license: "A3", shiftMorning: true, onLeave: false, workedMinutes: 100 },
  { id: "d-qian", name: "钱卫东", license: "A3", shiftMorning: true, onLeave: false, workedMinutes: 60 }
];

export const SEED_ROUTES: Route[] = [
  {
    id: "r1",
    code: "早1线",
    students: 28,
    zones: ["滨河", "老城区"],
    deadline: "07:30",
    durationMinutes: 35,
    requireAttendant: true,
    vehicleId: "v-d5678",
    driverId: "d-zhao"
  },
  {
    id: "r2",
    code: "早2线",
    students: 40,
    zones: ["高新区", "大学城"],
    deadline: "07:40",
    durationMinutes: 50,
    requireAttendant: true,
    vehicleId: "v-b1234",
    driverId: "d-wang"
  },
  {
    id: "r3",
    code: "早3线",
    students: 22,
    zones: ["高新区"],
    deadline: "07:20",
    durationMinutes: 25,
    requireAttendant: true,
    vehicleId: "v-e9012",
    driverId: "d-sun"
  },
  {
    id: "r4",
    code: "早4线",
    students: 18,
    zones: ["滨河", "老城区"],
    deadline: "07:30",
    durationMinutes: 35,
    requireAttendant: false,
    vehicleId: "v-g7890",
    driverId: "d-qian"
  }
];

export const DEFAULT_NOW = "06:30";
