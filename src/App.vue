<script setup lang="ts">
import { computed, ref } from "vue";
import { useDispatchStore } from "./store";
import BoardPanel from "./components/BoardPanel.vue";
import AdjustmentsPanel from "./components/AdjustmentsPanel.vue";
import EventPanel from "./components/EventPanel.vue";
import RegistryPanel from "./components/RegistryPanel.vue";
import TriggerDialog from "./components/TriggerDialog.vue";
import CandidateDialog from "./components/CandidateDialog.vue";
import type { Route } from "./types";

const store = useDispatchStore();

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const date = ref(today());
const tab = ref<"board" | "adjust" | "events" | "registry">("board");

const triggerRoute = ref<Route | null>(null);
const choosingId = ref<string | null>(null);
const choosingAdjustment = computed(
  () => store.state.adjustments.find((a) => a.id === choosingId.value) ?? null
);

const metrics = computed(() => store.metrics(date.value));

function plan() {
  store.plan(date.value);
  tab.value = "board";
}

function reset() {
  if (confirm("恢复示例登记数据？当天安排与事件流水将被清空。")) {
    store.resetAll();
  }
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">校车早班班次调配</p>
          <h1>按车牌排队 · 异常接管调度台</h1>
          <p class="subtitle">
            司机请假或道路积水时锁定原车，按"座位 ≥ 学生数、覆盖途经片区、配照管员、准驾与班次工时相符"
            匹配新车；新车接管确认后原车才释放；无合适组合则进入候车区并写清缺口。
          </p>
        </div>
        <div class="date-box">
          <label>排班日期
            <input type="date" v-model="date" />
          </label>
          <div class="top-actions">
            <button @click="plan">排出当天基准计划</button>
            <button class="secondary" @click="reset">恢复示例数据</button>
          </div>
        </div>
      </header>

      <section class="metrics">
        <article class="metric"><span>当天在跑线路</span><strong>{{ metrics.routes }}</strong></article>
        <article class="metric"><span>占用车辆</span><strong>{{ metrics.activeVehicles }}</strong></article>
        <article class="metric"><span>已接管替换</span><strong>{{ metrics.replaced }}</strong></article>
        <article class="metric" :class="{ alert: metrics.waiting > 0 }">
          <span>候车区等待</span><strong>{{ metrics.waiting }}</strong>
        </article>
      </section>

      <nav class="tabs">
        <button :class="{ active: tab === 'board' }" @click="tab = 'board'">派位看板</button>
        <button :class="{ active: tab === 'adjust' }" @click="tab = 'adjust'">
          调整单<span v-if="metrics.replaced + metrics.waiting" class="tab-dot">{{ metrics.replaced + metrics.waiting }}</span>
        </button>
        <button :class="{ active: tab === 'events' }" @click="tab = 'events'">事件流水</button>
        <button :class="{ active: tab === 'registry' }" @click="tab = 'registry'">登记台账</button>
      </nav>

      <BoardPanel v-show="tab === 'board'" :date="date" :on-trigger="(r: Route) => (triggerRoute = r)" />
      <AdjustmentsPanel
        v-show="tab === 'adjust'"
        :date="date"
        @choose="(id: string) => (choosingId = id)"
      />
      <EventPanel v-show="tab === 'events'" :date="date" />
      <RegistryPanel v-show="tab === 'registry'" />
    </div>

    <TriggerDialog :date="date" :route="triggerRoute" @close="triggerRoute = null" />
    <CandidateDialog
      :adjustment="choosingAdjustment"
      @close="choosingId = null"
    />
  </main>
</template>
