<script setup lang="ts">
import { computed } from "vue";
import { useDispatchStore } from "../store";
import { ASSIGNMENT_STATUS, TRIGGER_TEXT } from "../ui";
import type { Route } from "../types";

const props = defineProps<{
  date: string;
  onTrigger: (route: Route) => void;
}>();

const store = useDispatchStore();

const rows = computed(() =>
  store.routes.map((route) => {
    const assignments = store.state.assignments.filter(
      (a) => a.date === props.date && a.routeId === route.id
    );
    const regular = assignments.find((a) => a.kind === "regular");
    const active = assignments.find((a) => a.kind === "replacement" && a.status !== "released");
    const adjustment = store.state.adjustments.find(
      (a) =>
        a.date === props.date &&
        a.routeId === route.id &&
        ["open", "proposed", "waiting"].includes(a.status)
    );
    return { route, regular, active, adjustment };
  })
);

function st(status: string | undefined) {
  return status ? ASSIGNMENT_STATUS[status as keyof typeof ASSIGNMENT_STATUS] : undefined;
}
</script>

<template>
  <section class="panel">
    <h2>当天派位看板（按车牌排队）</h2>
    <div v-if="!store.isPlanned(date)" class="empty">
      当天尚未排班，请点击右上角"排出当天基准计划"
    </div>
    <div v-else class="board">
      <article v-for="row in rows" :key="row.route.id" class="route-card">
        <div class="route-head">
          <div>
            <span class="route-id">{{ row.route.id }}</span>
            <strong>{{ row.route.name }}</strong>
          </div>
          <span v-if="st(row.regular?.status)" class="badge" :class="st(row.regular?.status)?.cls">
            {{ st(row.regular?.status)?.text }}
          </span>
        </div>

        <div class="route-meta">
          <span>学生 {{ row.route.students }} 人</span>
          <span>片区 {{ row.route.areas.join("、") }}</span>
          <span>{{ row.route.departAt }} 发车 / {{ row.route.arriveBy }} 前到校</span>
        </div>

        <!-- 原车 -->
        <div v-if="row.regular" class="slot" :class="row.regular.status">
          <div class="slot-label">原车</div>
          <div class="slot-body">
            <strong>{{ row.regular.vehiclePlate }}</strong>
            <span>{{ store.driverMap.get(row.regular.driverId)?.name }}</span>
            <span class="muted">{{ row.regular.windowStart }}–{{ row.regular.windowEnd }}</span>
          </div>
        </div>

        <!-- 替换车 -->
        <template v-if="row.active">
          <div class="arrow">↓ 触发：{{ TRIGGER_TEXT[row.adjustment!.trigger.type] }}（{{ row.adjustment!.trigger.reason }}）</div>
          <div class="slot replacement" :class="row.active.status">
            <div class="slot-label">新车</div>
            <div class="slot-body">
              <strong>{{ row.active.vehiclePlate }}</strong>
              <span>{{ store.driverMap.get(row.active.driverId)?.name }}</span>
              <span class="muted">{{ row.active.windowStart }}–{{ row.active.windowEnd }}</span>
            </div>
          </div>
        </template>

        <!-- 候车区缺口 -->
        <div v-if="row.adjustment?.status === 'waiting' && row.adjustment.deficit" class="deficit">
          <strong>候车区 · 缺口：</strong>{{ row.adjustment.deficit.summary }}
        </div>

        <div class="card-actions">
          <button
            type="button"
            class="secondary"
            :disabled="!!row.adjustment || row.regular?.status === 'released'"
            @click="props.onTrigger(row.route)"
          >
            登记异常调配
          </button>
        </div>
      </article>
    </div>
  </section>
</template>
