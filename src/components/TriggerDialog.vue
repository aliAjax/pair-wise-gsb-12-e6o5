<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useDispatchStore } from "../store";
import { TRIGGER_TEXT } from "../ui";
import type { Route, Trigger, TriggerType } from "../types";

const props = defineProps<{ date: string; route?: Route | null }>();
const emit = defineEmits<{
  (e: "raised"): void;
  (e: "close"): void;
}>();

const store = useDispatchStore();
const type = ref<TriggerType>("driver_leave");
const driverId = ref("");
const areas = ref<string[]>([]);
const error = ref("");

watch(
  () => props.route,
  () => {
    driverId.value = "";
    areas.value = [];
    error.value = "";
  }
);

const regularDriver = computed(() => {
  if (!props.route) return undefined;
  const a = store.state.assignments.find(
    (x) => x.date === props.date && x.routeId === props.route!.id && x.kind === "regular"
  );
  return a ? store.driverMap.get(a.driverId) : undefined;
});

const allAreas = computed(() => [...new Set(store.vehicles.flatMap((v) => v.areas))]);

function toggleArea(area: string) {
  if (areas.value.includes(area)) areas.value = areas.value.filter((a) => a !== area);
  else areas.value.push(area);
}

function submit() {
  if (!props.route) return;
  let trigger: Trigger;
  if (type.value === "driver_leave") {
    if (!driverId.value) {
      error.value = "请选择请假司机";
      return;
    }
    const d = store.driverMap.get(driverId.value)!;
    trigger = {
      type: "driver_leave",
      payload: [driverId.value],
      reason: `司机请假：${d.name}（${driverId.value}）`
    };
  } else {
    if (areas.value.length === 0) {
      error.value = "请勾选积水片区";
      return;
    }
    trigger = {
      type: "flood",
      payload: [...areas.value],
      reason: `道路积水：${areas.value.join("、")}`
    };
  }
  store.raise(props.date, props.route.id, trigger);
  emit("raised");
  emit("close");
}
</script>

<template>
  <div v-if="route" class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <header>
        <h3>登记异常 · {{ route.id }} {{ route.name }}</h3>
        <button class="icon-btn" @click="emit('close')">×</button>
      </header>

      <div class="seg">
        <button
          v-for="(text, key) in TRIGGER_TEXT"
          :key="key"
          type="button"
          :class="{ active: type === key }"
          @click="type = key as TriggerType"
        >
          {{ text }}
        </button>
      </div>

      <div v-if="type === 'driver_leave'" class="field">
        <label>请假司机（默认本线原司机）</label>
        <select v-model="driverId">
          <option value="">请选择</option>
          <option v-if="regularDriver" :value="regularDriver.id">
            {{ regularDriver.name }}（{{ regularDriver.id }}，本线原车司机）
          </option>
          <option
            v-for="d in store.drivers.filter((x) => x.id !== regularDriver?.id)"
            :key="d.id"
            :value="d.id"
          >
            {{ d.name }}（{{ d.id }}，{{ d.permit }}）
          </option>
        </select>
      </div>

      <div v-else class="field">
        <label>积水片区（勾选当日积水、车辆不可通过的片区）</label>
        <div class="check-row">
          <button
            v-for="area in allAreas"
            :key="area"
            type="button"
            class="chip"
            :class="{ on: areas.includes(area) }"
            @click="toggleArea(area)"
          >
            {{ area }}
          </button>
        </div>
        <p class="hint">积水站点当日取消接人；停靠片区积水的车辆不能出场；线路片区全部积水则全线停驶。</p>
      </div>

      <p v-if="error" class="err">{{ error }}</p>

      <footer>
        <button class="secondary" type="button" @click="emit('close')">取消</button>
        <button type="button" @click="submit">登记并测算替换方案</button>
      </footer>
    </div>
  </div>
</template>
