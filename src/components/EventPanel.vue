<script setup lang="ts">
import { computed } from "vue";
import { useDispatchStore } from "../store";
import { fmtTime } from "../ui";

const props = defineProps<{ date: string }>();
const store = useDispatchStore();

const actionText: Record<string, string> = {
  PLAN: "排班",
  PLAN_SKIP: "跳过",
  PROPOSE: "提出替换",
  WAIT: "进入候车区",
  RECHOOSE: "改选",
  CONFIRM: "接管确认",
  CANCEL: "撤销"
};

const events = computed(() => store.dayEvents(props.date));
</script>

<template>
  <section class="panel">
    <h2>当天事件流水（重开可核对）</h2>
    <div v-if="events.length === 0" class="empty">暂无事件</div>
    <ol v-else class="event-list">
      <li v-for="e in events" :key="e.seq">
        <span class="seq">#{{ e.seq }}</span>
        <span class="ev-time">{{ fmtTime(e.ts) }}</span>
        <span class="ev-action" :class="e.action">{{ actionText[e.action] || e.action }}</span>
        <span class="ev-detail">{{ e.detail }}</span>
      </li>
    </ol>
  </section>
</template>
