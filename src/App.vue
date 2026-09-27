<script setup lang="ts">
import { ref } from "vue";
import { useBusStore } from "./store/bus";
import BoardView from "./components/BoardView.vue";
import WaitingView from "./components/WaitingView.vue";
import RegistryView from "./components/RegistryView.vue";
import AuditView from "./components/AuditView.vue";

const store = useBusStore();
const tab = ref<"board" | "waiting" | "registry" | "audit">("board");

const tabs = [
  { key: "board", label: "当班看板" },
  { key: "waiting", label: "候车区" },
  { key: "registry", label: "登记管理" },
  { key: "audit", label: "调配台账" }
] as const;
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">早班校车 · 班次调配</p>
          <h1>校车早班调配台</h1>
          <p class="subtitle">
            按车牌排队；司机请假或道路积水时重排车辆与司机，原车接管确认后才释放，无合适组合留候车区并写明缺额。
          </p>
        </div>
        <div class="day-controls">
          <label>
            日期
            <input type="date" :value="store.date" @change="store.setDate(($event.target as HTMLInputElement).value)" />
          </label>
          <label>
            当前时间
            <input type="time" :value="store.now" @change="store.setNow(($event.target as HTMLInputElement).value)" />
          </label>
          <div v-if="store.floodedZones.length" class="flood-banner">
            积水片区：{{ store.floodedZones.join("、") }}
          </div>
        </div>
      </header>

      <nav class="tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          :class="{ active: tab === t.key }"
          @click="tab = t.key"
        >
          {{ t.label }}
          <span v-if="t.key === 'waiting' && store.waitingRuns.length" class="badge">
            {{ store.waitingRuns.length }}
          </span>
        </button>
      </nav>

      <BoardView v-if="tab === 'board'" />
      <WaitingView v-else-if="tab === 'waiting'" />
      <RegistryView v-else-if="tab === 'registry'" />
      <AuditView v-else />
    </div>
  </main>
</template>
