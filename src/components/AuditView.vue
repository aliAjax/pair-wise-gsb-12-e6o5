<script setup lang="ts">
import { ref } from "vue";
import { useBusStore } from "../store/bus";

const store = useBusStore();
const filterRoute = ref("");

function atTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", { hour12: false });
}
</script>

<template>
  <section class="audit">
    <div class="board-head">
      <h2>调配台账 · {{ store.date }}</h2>
      <span class="muted">每笔调整记录触发条件、原车、新车（含司机），重开页面仍可核对当天安排</span>
    </div>

    <!-- 当天安排核对 -->
    <h3 class="summary-title">当天最终安排</h3>
    <table class="reg-table summary">
      <thead>
        <tr>
          <th>排队</th><th>班次</th><th>状态</th><th>执行车辆</th><th>执行司机</th><th>触发条件</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(route, i) in store.queue" :key="route.id" :class="store.runOf(route.id).status">
          <td>{{ i + 1 }}</td>
          <td>{{ route.code }}</td>
          <td>
            {{ { normal: "正常", proposed: "待接管", waiting: "候车区", takenover: "已接管" }[store.runOf(route.id).status] }}
          </td>
          <td>{{ store.currentVehicleOf(route)?.plate ?? "—" }}</td>
          <td>{{ store.currentDriverOf(route)?.name ?? "—" }}</td>
          <td>{{ store.runOf(route.id).trigger?.detail ?? "—" }}</td>
        </tr>
      </tbody>
    </table>

    <!-- 流水 -->
    <div class="board-head">
      <h3>调整流水（{{ store.logs.length }} 笔）</h3>
      <select v-model="filterRoute">
        <option value="">全部班次</option>
        <option v-for="r in store.routes" :key="r.id" :value="r.id">{{ r.code }}</option>
      </select>
    </div>

    <div v-if="!store.logs.length" class="empty">当天尚无调整记录。</div>
    <table v-else class="reg-table">
      <thead>
        <tr>
          <th>时间</th><th>班次</th><th>动作</th><th>触发条件</th>
          <th>原车</th><th>原司机</th><th>新车</th><th>新司机</th><th>说明</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="log in store.logs.filter((l) => !filterRoute || l.routeId === filterRoute)"
          :key="log.id"
        >
          <td>{{ atTime(log.at) }}</td>
          <td>{{ log.routeCode }}</td>
          <td>{{ log.action }}</td>
          <td>{{ log.trigger || "—" }}</td>
          <td>{{ log.originalVehiclePlate || "—" }}</td>
          <td>{{ log.originalDriverName || "—" }}</td>
          <td>{{ log.newVehiclePlate || "—" }}</td>
          <td>{{ log.newDriverName || "—" }}</td>
          <td class="detail-cell">{{ log.detail }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
