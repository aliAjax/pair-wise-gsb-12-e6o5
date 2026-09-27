<script setup lang="ts">
import { useBusStore } from "../store/bus";

const store = useBusStore();
</script>

<template>
  <section class="waiting-view">
    <div class="board-head">
      <h2>候车区</h2>
      <span class="muted">没有合适组合的班次留在这里，孩子暂不上车，缺项写清后等待补充车辆/照管员再匹配</span>
    </div>

    <div v-if="!store.waitingRuns.length" class="empty">候车区为空，所有班次均已安排。</div>

    <article v-for="route in store.waitingRuns" :key="route.id" class="run-card waiting standalone">
      <div class="run-info">
        <div class="run-title">
          <strong>{{ route.code }}</strong>
          <span class="muted">
            原车 {{ store.vehicleById(store.runOf(route.id).replacedVehicleId)?.plate }}
            / {{ store.driverById(store.runOf(route.id).replacedDriverId)?.name }}
          </span>
        </div>
        <p class="meta">
          学生 {{ route.students }} 人 · 片区 {{ route.zones.join("、") }} · 到校时限 {{ route.deadline }}
        </p>
        <div class="trigger-box">触发条件：{{ store.runOf(route.id).trigger?.detail }}</div>
        <div class="waiting-box">
          <p class="waiting-title">缺的座位 / 照管员 / 司机 / 时限：</p>
          <ul>
            <li v-for="(r, i) in store.runOf(route.id).reasons" :key="i">{{ r }}</li>
            <li v-if="!store.runOf(route.id).reasons.length">无可用车辆</li>
          </ul>
        </div>
      </div>
      <div class="run-actions vertical">
        <button class="primary" @click="store.rematch(route.id)">重新匹配</button>
        <button class="ghost" @click="store.cancelProposal(route.id)">撤销，原车继续</button>
      </div>
    </article>
  </section>
</template>
