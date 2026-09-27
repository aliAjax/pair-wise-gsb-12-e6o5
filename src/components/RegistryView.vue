<script setup lang="ts">
import { computed, ref } from "vue";
import { useBusStore } from "../store/bus";
import type { Driver, LicenseType, Route, Vehicle } from "../types";

const store = useBusStore();
const kind = ref<"vehicles" | "drivers" | "routes">("vehicles");
const error = ref("");

const allZones = computed(() =>
  [...new Set([...store.vehicles.flatMap((v) => v.zones), ...store.routes.flatMap((r) => r.zones)])].sort()
);
function zoneText(list: string[]): string {
  return list.join("、");
}
function parseZones(text: string): string[] {
  return text.split(/[、,，\s]+/).map((s) => s.trim()).filter(Boolean);
}

// ---------- 车辆 ----------
function blankVehicle(): Vehicle {
  return {
    id: crypto.randomUUID(),
    plate: "",
    seats: 20,
    attendants: 0,
    zones: [],
    requiredLicense: "A3",
    waterSafe: false
  };
}
const newVehicle = ref<Vehicle>(blankVehicle());
function saveVehicle(v: Vehicle) {
  if (!v.plate.trim()) return (error.value = "车牌号必填");
  error.value = "";
  store.upsertVehicle(v);
}
function addVehicle() {
  if (!newVehicle.value.plate.trim()) return (error.value = "车牌号必填");
  store.upsertVehicle(newVehicle.value);
  newVehicle.value = blankVehicle();
  error.value = "";
}
function removeVehicle(v: Vehicle) {
  const msg = store.deleteVehicle(v.id);
  if (msg) error.value = msg;
}

// ---------- 司机 ----------
function blankDriver(): Driver {
  return { id: crypto.randomUUID(), name: "", license: "A3", shiftMorning: true, onLeave: false, workedMinutes: 0 };
}
const newDriver = ref<Driver>(blankDriver());
function addDriver() {
  if (!newDriver.value.name.trim()) return (error.value = "司机姓名必填");
  store.upsertDriver(newDriver.value);
  newDriver.value = blankDriver();
  error.value = "";
}
function removeDriver(d: Driver) {
  const msg = store.deleteDriver(d.id);
  if (msg) error.value = msg;
}

// ---------- 线路 ----------
function blankRoute(): Route {
  return {
    id: crypto.randomUUID(),
    code: "",
    students: 20,
    zones: [],
    deadline: "07:30",
    durationMinutes: 30,
    requireAttendant: true,
    vehicleId: store.vehicles[0]?.id ?? "",
    driverId: store.drivers[0]?.id ?? ""
  };
}
const newRoute = ref<Route>(blankRoute());
function addRoute() {
  if (!newRoute.value.code.trim()) return (error.value = "班次号必填");
  if (!newRoute.value.vehicleId || !newRoute.value.driverId) return (error.value = "请选择原配车辆与司机");
  store.upsertRoute(newRoute.value);
  newRoute.value = blankRoute();
  error.value = "";
}
function removeRoute(r: Route) {
  const msg = store.deleteRoute(r.id);
  if (msg) error.value = msg;
}

// ---------- 导入导出 / 当天重置 ----------
function doExport() {
  const blob = new Blob([store.exportJson()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `校车调配-${store.date}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
const fileInput = ref<HTMLInputElement | null>(null);
function doImport(file: File | undefined) {
  if (!file) return;
  file.text().then((text) => {
    const msg = store.importJson(text);
    error.value = msg ?? "";
  });
}
function resetToday() {
  if (confirm("清空当天的调配记录与台账？登记数据保留。")) {
    store.resetDay();
    error.value = "";
  }
}

const licenses: LicenseType[] = ["A1", "A3"];
</script>

<template>
  <section class="registry">
    <div class="board-head">
      <h2>登记管理</h2>
      <div class="head-actions">
        <button class="ghost" @click="doExport">导出当天 JSON（核对/备份）</button>
        <button class="ghost" @click="fileInput?.click()">导入 JSON</button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json"
          style="display: none"
          @change="doImport(($event.target as HTMLInputElement).files?.[0])"
        />
        <button class="danger" @click="resetToday">重开当天</button>
      </div>
    </div>

    <p v-if="error" class="form-error">{{ error }}</p>

    <nav class="subtabs">
      <button :class="{ active: kind === 'vehicles' }" @click="kind = 'vehicles'">车辆登记</button>
      <button :class="{ active: kind === 'drivers' }" @click="kind = 'drivers'">司机登记</button>
      <button :class="{ active: kind === 'routes' }" @click="kind = 'routes'">线路登记</button>
    </nav>

    <!-- 车辆 -->
    <table v-if="kind === 'vehicles'" class="reg-table">
      <thead>
        <tr>
          <th>车牌号</th><th>座位数</th><th>照管员</th><th>可通行片区（顿号分隔）</th>
          <th>所需准驾证</th><th>可涉水</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="v in store.vehicles" :key="v.id">
          <td><input v-model="v.plate" @change="saveVehicle(v)" /></td>
          <td><input type="number" min="0" v-model.number="v.seats" @change="saveVehicle(v)" /></td>
          <td><input type="number" min="0" v-model.number="v.attendants" @change="saveVehicle(v)" /></td>
          <td><input :value="zoneText(v.zones)" @change="v.zones = parseZones(($event.target as HTMLInputElement).value); saveVehicle(v)" /></td>
          <td>
            <select v-model="v.requiredLicense" @change="saveVehicle(v)">
              <option v-for="l in licenses" :key="l" :value="l">{{ l }}</option>
            </select>
          </td>
          <td><input type="checkbox" v-model="v.waterSafe" @change="saveVehicle(v)" /></td>
          <td><button class="danger small" @click="removeVehicle(v)">删除</button></td>
        </tr>
        <tr class="new-row">
          <td><input v-model="newVehicle.plate" placeholder="沪A·X0000" /></td>
          <td><input type="number" min="0" v-model.number="newVehicle.seats" /></td>
          <td><input type="number" min="0" v-model.number="newVehicle.attendants" /></td>
          <td><input :value="zoneText(newVehicle.zones)" @change="newVehicle.zones = parseZones(($event.target as HTMLInputElement).value)" :placeholder="(allZones.join('、') || '如：老城区')" /></td>
          <td>
            <select v-model="newVehicle.requiredLicense">
              <option v-for="l in licenses" :key="l" :value="l">{{ l }}</option>
            </select>
          </td>
          <td><input type="checkbox" v-model="newVehicle.waterSafe" /></td>
          <td><button class="primary small" @click="addVehicle">新增</button></td>
        </tr>
      </tbody>
    </table>

    <!-- 司机 -->
    <table v-if="kind === 'drivers'" class="reg-table">
      <thead>
        <tr>
          <th>姓名</th><th>准驾证</th><th>当日早班</th><th>当日请假</th><th>已排工时（分钟）</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="d in store.drivers" :key="d.id">
          <td><input v-model="d.name" @change="store.upsertDriver(d)" /></td>
          <td>
            <select v-model="d.license" @change="store.upsertDriver(d)">
              <option v-for="l in licenses" :key="l" :value="l">{{ l }}</option>
            </select>
          </td>
          <td><input type="checkbox" v-model="d.shiftMorning" @change="store.upsertDriver(d)" /></td>
          <td><input type="checkbox" v-model="d.onLeave" @change="store.upsertDriver(d)" /></td>
          <td><input type="number" min="0" v-model.number="d.workedMinutes" @change="store.upsertDriver(d)" /></td>
          <td><button class="danger small" @click="removeDriver(d)">删除</button></td>
        </tr>
        <tr class="new-row">
          <td><input v-model="newDriver.name" placeholder="姓名" /></td>
          <td>
            <select v-model="newDriver.license">
              <option v-for="l in licenses" :key="l" :value="l">{{ l }}</option>
            </select>
          </td>
          <td><input type="checkbox" v-model="newDriver.shiftMorning" /></td>
          <td><input type="checkbox" v-model="newDriver.onLeave" /></td>
          <td><input type="number" min="0" v-model.number="newDriver.workedMinutes" /></td>
          <td><button class="primary small" @click="addDriver">新增</button></td>
        </tr>
      </tbody>
    </table>

    <!-- 线路 -->
    <table v-if="kind === 'routes'" class="reg-table">
      <thead>
        <tr>
          <th>班次号</th><th>学生数</th><th>途经片区</th><th>到校时限</th><th>全程分钟</th>
          <th>需照管员</th><th>原配车辆</th><th>原配司机</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in store.routes" :key="r.id">
          <td><input v-model="r.code" @change="store.upsertRoute(r)" /></td>
          <td><input type="number" min="0" v-model.number="r.students" @change="store.upsertRoute(r)" /></td>
          <td><input :value="zoneText(r.zones)" @change="r.zones = parseZones(($event.target as HTMLInputElement).value); store.upsertRoute(r)" /></td>
          <td><input type="time" v-model="r.deadline" @change="store.upsertRoute(r)" /></td>
          <td><input type="number" min="1" v-model.number="r.durationMinutes" @change="store.upsertRoute(r)" /></td>
          <td><input type="checkbox" v-model="r.requireAttendant" @change="store.upsertRoute(r)" /></td>
          <td>
            <select v-model="r.vehicleId" @change="store.upsertRoute(r)">
              <option v-for="v in store.vehicles" :key="v.id" :value="v.id">
                {{ v.plate }}（{{ v.seats }}座）
              </option>
            </select>
          </td>
          <td>
            <select v-model="r.driverId" @change="store.upsertRoute(r)">
              <option v-for="d in store.drivers" :key="d.id" :value="d.id">
                {{ d.name }}（{{ d.license }}）
              </option>
            </select>
          </td>
          <td><button class="danger small" @click="removeRoute(r)">删除</button></td>
        </tr>
        <tr class="new-row">
          <td><input v-model="newRoute.code" placeholder="早5线" /></td>
          <td><input type="number" min="0" v-model.number="newRoute.students" /></td>
          <td><input :value="zoneText(newRoute.zones)" @change="newRoute.zones = parseZones(($event.target as HTMLInputElement).value)" :placeholder="allZones.join('、')" /></td>
          <td><input type="time" v-model="newRoute.deadline" /></td>
          <td><input type="number" min="1" v-model.number="newRoute.durationMinutes" /></td>
          <td><input type="checkbox" v-model="newRoute.requireAttendant" /></td>
          <td>
            <select v-model="newRoute.vehicleId">
              <option v-for="v in store.vehicles" :key="v.id" :value="v.id">
                {{ v.plate }}（{{ v.seats }}座）
              </option>
            </select>
          </td>
          <td>
            <select v-model="newRoute.driverId">
              <option v-for="d in store.drivers" :key="d.id" :value="d.id">
                {{ d.name }}（{{ d.license }}）
              </option>
            </select>
          </td>
          <td><button class="primary small" @click="addRoute">新增</button></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
