<script setup lang="ts">
import { computed } from "vue";
import { useDispatchStore } from "../store";
import type { Adjustment } from "../types";

const props = defineProps<{ adjustment: Adjustment | null }>();
const emit = defineEmits<{ (e: "close"): void }>();

const store = useDispatchStore();

const candidates = computed(() =>
  props.adjustment ? store.candidatesFor(props.adjustment.id) : []
);

const route = computed(() =>
  props.adjustment ? store.routeMap.get(props.adjustment.routeId) : undefined
);

function choose(plate: string, driverId: string) {
  store.choose(props.adjustment!.id, plate, driverId);
  emit("close");
}
</script>

<template>
  <div v-if="adjustment && route" class="modal-mask" @click.self="emit('close')">
    <div class="modal wide">
      <header>
        <h3>改选接管组合 · {{ route.id }} {{ route.name }}</h3>
        <button class="icon-btn" @click="emit('close')">×</button>
      </header>
      <p class="hint">
        须同时满足：座位 ≥ {{ route.students }}、覆盖
        {{ route.areas.join("、") }}、配照管员、司机准驾符合且班次工时不冲突；原车
        {{ adjustment.originalVehiclePlate }} 已锁定，不在候选内。
      </p>

      <div v-if="candidates.length === 0" class="empty">当前无可行组合，线路留在候车区</div>
      <table v-else class="cand-table">
        <thead>
          <tr>
            <th>排队</th>
            <th>新车（车牌）</th>
            <th>座位余量</th>
            <th>新司机</th>
            <th>准驾</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(c, i) in candidates"
            :key="c.vehicle.plate + c.driver.id"
            :class="{ current: c.vehicle.plate === adjustment.newVehiclePlate && c.driver.id === adjustment.newDriverId }"
          >
            <td>{{ i + 1 }}</td>
            <td>{{ c.vehicle.plate }} <span class="muted">{{ c.vehicle.areas.join("/") }}</span></td>
            <td :class="c.seatsMargin === 0 ? 'warn' : 'ok'">
              {{ c.vehicle.seats }}（余 {{ c.seatsMargin }}）
            </td>
            <td>{{ c.driver.name }}</td>
            <td>{{ c.driver.permit }}</td>
            <td>
              <button type="button" @click="choose(c.vehicle.plate, c.driver.id)">选用</button>
            </td>
          </tr>
        </tbody>
      </table>

      <footer>
        <button class="secondary" type="button" @click="emit('close')">关闭</button>
      </footer>
    </div>
  </div>
</template>
