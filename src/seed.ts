import type { AppState } from "./types";

// 示例登记数据：6 条早班线路、9 辆车（含 3 辆备车）、9 名司机
export function seedState(): AppState {
  return {
    version: 1,
    routes: [
      {
        id: "R01",
        name: "城东河畔线",
        students: 42,
        areas: ["城东", "河畔"],
        departAt: "06:50",
        arriveBy: "07:40",
        regularVehicleId: "苏A·1001"
      },
      {
        id: "R02",
        name: "城西工业园线",
        students: 38,
        areas: ["城西", "工业园"],
        departAt: "06:55",
        arriveBy: "07:45",
        regularVehicleId: "苏A·1002"
      },
      {
        id: "R03",
        name: "城南大学城线",
        students: 28,
        areas: ["城南", "大学城"],
        departAt: "07:00",
        arriveBy: "07:50",
        regularVehicleId: "苏A·1003"
      },
      {
        id: "R04",
        name: "城北老城线",
        students: 40,
        areas: ["城北", "老城区"],
        departAt: "06:50",
        arriveBy: "07:35",
        regularVehicleId: "苏A·1004"
      },
      {
        id: "R05",
        name: "科技园线",
        students: 33,
        areas: ["城东", "科技园"],
        departAt: "07:05",
        arriveBy: "07:50",
        regularVehicleId: "苏A·1005"
      },
      {
        id: "R06",
        name: "西坝小班线",
        students: 18,
        areas: ["城西", "西坝"],
        departAt: "07:10",
        arriveBy: "07:55",
        regularVehicleId: "苏A·1006"
      }
    ],
    vehicles: [
      { plate: "苏A·1001", seats: 45, hasAttendant: true, areas: ["城东", "河畔"], homeArea: "城东", requiredPermit: "A1" },
      { plate: "苏A·1002", seats: 40, hasAttendant: true, areas: ["城西", "工业园"], homeArea: "城西", requiredPermit: "A1" },
      { plate: "苏A·1003", seats: 30, hasAttendant: true, areas: ["城南", "大学城"], homeArea: "城南", requiredPermit: "A3" },
      { plate: "苏A·1004", seats: 45, hasAttendant: true, areas: ["城北", "老城区"], homeArea: "城北", requiredPermit: "A1" },
      { plate: "苏A·1005", seats: 35, hasAttendant: true, areas: ["城东", "河畔", "科技园"], homeArea: "城东", requiredPermit: "A3" },
      { plate: "苏A·1006", seats: 20, hasAttendant: true, areas: ["城西", "工业园", "西坝"], homeArea: "城西", requiredPermit: "B1" },
      // 备车
      { plate: "苏A·1007", seats: 48, hasAttendant: false, areas: ["城南", "大学城", "南湖"], homeArea: "城南", requiredPermit: "A1" },
      { plate: "苏A·1008", seats: 42, hasAttendant: true, areas: ["城北", "老城区", "城东"], homeArea: "城北", requiredPermit: "A1" },
      { plate: "苏A·1009", seats: 25, hasAttendant: true, areas: ["城东", "河畔", "科技园", "西坝", "城西"], homeArea: "城东", requiredPermit: "A3" }
    ],
    drivers: [
      { id: "D01", name: "赵强", permit: "A1", shiftStart: "06:00", shiftEnd: "10:00", maxWorkMinutes: 300, regularVehiclePlate: "苏A·1001" },
      { id: "D02", name: "钱进", permit: "A1", shiftStart: "06:00", shiftEnd: "10:00", maxWorkMinutes: 300, regularVehiclePlate: "苏A·1002" },
      { id: "D03", name: "孙磊", permit: "A3", shiftStart: "06:10", shiftEnd: "09:30", maxWorkMinutes: 240, regularVehiclePlate: "苏A·1003" },
      { id: "D04", name: "李刚", permit: "A1", shiftStart: "06:00", shiftEnd: "10:00", maxWorkMinutes: 300, regularVehiclePlate: "苏A·1004" },
      { id: "D05", name: "周敏", permit: "A3", shiftStart: "06:20", shiftEnd: "09:30", maxWorkMinutes: 240, regularVehiclePlate: "苏A·1005" },
      { id: "D06", name: "吴芳", permit: "B1", shiftStart: "06:30", shiftEnd: "09:00", maxWorkMinutes: 200, regularVehiclePlate: "苏A·1006" },
      { id: "D07", name: "郑虎", permit: "A1", shiftStart: "06:00", shiftEnd: "10:00", maxWorkMinutes: 300, regularVehiclePlate: "苏A·1007" },
      { id: "D08", name: "冯丽", permit: "A1", shiftStart: "06:00", shiftEnd: "10:00", maxWorkMinutes: 300, regularVehiclePlate: "苏A·1008" },
      { id: "D09", name: "陈静", permit: "A3", shiftStart: "06:00", shiftEnd: "09:30", maxWorkMinutes: 240, regularVehiclePlate: "苏A·1009" }
    ],
    assignments: [],
    adjustments: [],
    events: [],
    plannedDates: []
  };
}
