<script setup lang="ts">
import { useDispatchStore } from "../store";
import { ADJUSTMENT_STATUS, TRIGGER_TEXT, fmtTime } from "../ui";

defineProps<{
  date: string;
  onChoose: (id: string) => void;
}>();

const store = useDispatchStore();

function confirm(id: string) {
  store.confirm(id);
}
function cancel(id: string) {
  store.cancel(id);
}
</script>

<template>
  <section class="panel">
    <h2>调整单（原车 / 新车 / 触发条件全程可追溯）</h2>
    <div v-if="store.dayAdjustments(date).length === 0" class="empty">暂无调整记录</div>
    <div v-else class="adj-list">
      <article v-for="adj in store.dayAdjustments(date)" :key="adj.id" class="adj" :class="adj.status">
        <div class="adj-head">
          <div>
            <span class="route-id">{{ adj.routeId }}</span>
            <strong>{{ store.routeMap.get(adj.routeId)?.name }}</strong>
            <span class="muted">{{ adj.id }} · {{ fmtTime(adj.updatedAt) }}</span>
          </div>
          <span class="badge" :class="ADJUSTMENT_STATUS[adj.status].cls">
            {{ ADJUSTMENT_STATUS[adj.status].text }}
          </span>
        </div>

        <div class="trace">
          <div class="trace-item">
            <span class="trace-label">触发条件</span>
            <span>{{ TRIGGER_TEXT[adj.trigger.type] }} · {{ adj.trigger.reason }}</span>
          </div>
          <div class="trace-item">
            <span class="trace-label">原车（确认前锁定）</span>
            <span :class="{ struck: adj.status === 'confirmed' }">
              {{ adj.originalVehiclePlate }} / {{ store.driverMap.get(adj.originalDriverId)?.name }}
            </span>
          </div>
          <div class="trace-item">
            <span class="trace-label">新车</span>
            <span v-if="adj.newVehiclePlate">
              {{ adj.newVehiclePlate }} / {{ store.driverMap.get(adj.newDriverId!)?.name }}
            </span>
            <span v-else class="muted">暂无可用组合</span>
          </div>
          <div v-if="adj.deficit" class="trace-item deficit">
            <span class="trace-label">候车区缺口</span>
            <span>{{ adj.deficit.summary }}</span>
          </div>
        </div>

        <div class="card-actions">
          <button
            v-if="adj.status === 'proposed'"
            type="button"
            @click="confirm(adj.id)"
          >
            接管确认（原车此时释放）
          </button>
          <button
            v-if="['proposed', 'waiting'].includes(adj.status)"
            type="button"
            class="secondary"
            @click="$emit('choose', adj.id)"
          >
            查看/改选候选组合
          </button>
          <button
            v-if="['proposed', 'waiting', 'open'].includes(adj.status)"
            type="button"
            class="danger"
            @click="cancel(adj.id)"
          >
            撤销
          </button>
        </div>
      </article>
    </div>
  </section>
</template>
