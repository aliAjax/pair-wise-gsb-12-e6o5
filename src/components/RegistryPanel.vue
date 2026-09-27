<script setup lang="ts">
import { ref } from "vue";
import { useDispatchStore } from "../store";

const store = useDispatchStore();
const tab = ref<"routes" | "vehicles" | "drivers">("routes");
</script>

<template>
  <section class="panel">
    <div class="sub-tabs">
      <button :class="{ active: tab === 'routes' }" @click="tab = 'routes'">线路登记</button>
      <button :class="{ active: tab === 'vehicles' }" @click="tab = 'vehicles'">车辆登记</button>
      <button :class="{ active: tab === 'drivers' }" @click="tab = 'drivers'">司机登记</button>
    </div>

    <div v-if="tab === 'routes'" class="table-wrap">
      <table>
        <thead>
          <tr><th>线路</th><th>名称</th><th>学生数</th><th>途经片区</th><th>发车</th><th>到校时限</th><th>默认车辆</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in store.routes" :key="r.id">
            <td>{{ r.id }}</td><td>{{ r.name }}</td><td>{{ r.students }}</td>
            <td>{{ r.areas.join("、") }}</td><td>{{ r.departAt }}</td><td>{{ r.arriveBy }}</td>
            <td>{{ r.regularVehicleId }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="tab === 'vehicles'" class="table-wrap">
      <table>
        <thead>
          <tr><th>车牌</th><th>座位</th><th>照管员</th><th>服务片区</th><th>停靠片区</th><th>准驾要求</th></tr>
        </thead>
        <tbody>
          <tr v-for="v in store.vehicles" :key="v.plate">
            <td>{{ v.plate }}</td><td>{{ v.seats }}</td>
            <td><span :class="v.hasAttendant ? 'ok' : 'warn'">{{ v.hasAttendant ? "有" : "缺" }}</span></td>
            <td>{{ v.areas.join("、") }}</td><td>{{ v.homeArea }}</td><td>{{ v.requiredPermit }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr><th>工号</th><th>姓名</th><th>准驾证</th><th>班次</th><th>工时上限</th><th>绑定车辆</th></tr>
        </thead>
        <tbody>
          <tr v-for="d in store.drivers" :key="d.id">
            <td>{{ d.id }}</td><td>{{ d.name }}</td><td>{{ d.permit }}</td>
            <td>{{ d.shiftStart }}–{{ d.shiftEnd }}</td>
            <td>{{ d.maxWorkMinutes }} 分钟</td><td>{{ d.regularVehiclePlate }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
