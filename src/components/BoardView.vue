<script setup lang="ts">
import { ref } from "vue";
import { useBusStore } from "../store/bus";
import type { Route } from "../types";

const store = useBusStore();
const floodPickerFor = ref<string | null>(null);
const floodZonesPicked = ref<string[]>([]);

function openFloodPicker(route: Route) {
  floodPickerFor.value = route.id;
  floodZonesPicked.value = [...route.zones];
}
function confirmFlood(routeId: string) {
  store.triggerFlood(routeId, floodZonesPicked.value);
  floodPickerFor.value = null;
}
function toggleZone(z: string) {
  floodZonesPicked.value = floodZonesPicked.value.includes(z)
    ? floodZonesPicked.value.filter((x) => x !== z)
    : [...floodZonesPicked.value, z];
}

const statusLabel: Record<string, string> = {
  normal: "正常",
  proposed: "待接管",
  waiting: "候车区",
  takenover: "已接管"
};

function atClock(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("zh-CN", { hour12: false });
}
</script>

<template>
  <section class="board">
    <div class="board-head">
      <h2>早班排队（按当前车辆车牌）</h2>
      <span class="muted">共 {{ store.queue.length }} 个班次 · 待接管 {{ store.proposedRuns.length }} · 候车 {{ store.waitingRuns.length }}</span>
    </div>

    <div class="queue">
      <article
        v-for="(route, index) in store.queue"
        :key="route.id"
        class="run-card"
        :class="store.runOf(route.id).status"
      >
        <div class="run-main">
          <div class="rank">{{ index + 1 }}</div>
          <div class="run-info">
            <div class="run-title">
              <strong>{{ store.currentVehicleOf(route)?.plate ?? "未派车" }}</strong>
              <span class="route-code">{{ route.code }}</span>
              <span class="status-pill" :class="store.runOf(route.id).status">
                {{ statusLabel[store.runOf(route.id).status] }}
              </span>
            </div>
            <p class="meta">
              学生 {{ route.students }} 人 · 片区 {{ route.zones.join("、") }}
              · 到校时限 {{ route.deadline }}（全程 {{ route.durationMinutes }} 分钟）
              {{ route.requireAttendant ? " · 需照管员" : "" }}
            </p>
            <p class="meta">
              车辆 {{ store.currentVehicleOf(route)?.seats }} 座 / 照管员
              {{ store.currentVehicleOf(route)?.attendants ?? 0 }} 人
              <span v-if="store.currentVehicleOf(route)?.waterSafe" class="tag water">可涉水</span>
              · 司机 {{ store.currentDriverOf(route)?.name }}
              <span v-if="store.currentDriverOf(route)?.onLeave" class="tag leave">已请假</span>
              （{{ store.currentDriverOf(route)?.license }} · 当日工时
              {{ store.currentDriverOf(route)?.workedMinutes }} 分钟）
            </p>

            <!-- 触发记录 -->
            <div v-if="store.runOf(route.id).trigger" class="trigger-box">
              触发条件：{{ store.runOf(route.id).trigger?.detail }}
              <span v-if="store.runOf(route.id).status === 'takenover' && store.runOf(route.id).takenAt">
                · {{ atClock(store.runOf(route.id).takenAt) }} 完成接管
              </span>
            </div>

            <!-- 已接管：新旧对照 -->
            <div v-if="store.runOf(route.id).status === 'takenover'" class="handover">
              <span class="from">
                原车 {{ store.vehicleById(store.runOf(route.id).replacedVehicleId)?.plate }}
                / {{ store.driverById(store.runOf(route.id).replacedDriverId)?.name }}
              </span>
              <span class="arrow">→</span>
              <span class="to">
                新车 {{ store.vehicleById(store.runOf(route.id).selected?.vehicleId)?.plate }}
                / {{ store.driverById(store.runOf(route.id).selected?.driverId)?.name }}
              </span>
            </div>

            <!-- 候选组合 -->
            <div v-if="store.runOf(route.id).status === 'proposed'" class="candidates">
              <p class="muted small">
                原车 <strong>{{ store.vehicleById(store.runOf(route.id).replacedVehicleId)?.plate }}</strong>
                仍占用，选定组合并确认接管后才释放。
              </p>
              <table>
                <thead>
                  <tr>
                    <th>选择</th><th>替换车辆</th><th>余座</th><th>照管员</th><th>替换司机</th><th>预计到校</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="c in store.runOf(route.id).candidates"
                    :key="c.vehicleId + c.driverId"
                    :class="{ chosen: store.runOf(route.id).selected?.vehicleId === c.vehicleId }"
                    @click="store.selectCandidate(route.id, c)"
                  >
                    <td>
                      <input
                        type="radio"
                        :name="'cand-' + route.id"
                        :checked="store.runOf(route.id).selected?.vehicleId === c.vehicleId"
                        @change="store.selectCandidate(route.id, c)"
                      />
                    </td>
                    <td>{{ store.vehicleById(c.vehicleId)?.plate }}</td>
                    <td :class="c.spareSeats >= 0 ? 'ok' : 'bad'">{{ c.spareSeats }}</td>
                    <td>{{ store.vehicleById(c.vehicleId)?.attendants }} 人</td>
                    <td>
                      {{ store.driverById(c.driverId)?.name }}
                      （{{ store.driverById(c.driverId)?.license }}，工时
                      {{ store.driverById(c.driverId)?.workedMinutes }} 分钟）
                    </td>
                    <td>{{ c.finishTime }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="row-actions">
                <button
                  class="primary"
                  :disabled="!store.runOf(route.id).selected"
                  @click="store.confirmTakeover(route.id)"
                >
                  确认接管（释放原车）
                </button>
                <button class="ghost" @click="store.cancelProposal(route.id)">撤销，原车继续</button>
              </div>
            </div>

            <!-- 候车区缺额 -->
            <div v-if="store.runOf(route.id).status === 'waiting'" class="waiting-box">
              <p class="waiting-title">已留候车区，孩子暂未上车，缺项：</p>
              <ul>
                <li v-for="(r, i) in store.runOf(route.id).reasons" :key="i">{{ r }}</li>
                <li v-if="!store.runOf(route.id).reasons.length">无可用车辆</li>
              </ul>
              <div class="row-actions">
                <button class="primary" @click="store.rematch(route.id)">重新匹配</button>
                <button class="ghost" @click="store.cancelProposal(route.id)">撤销，原车继续</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 正常班次操作 -->
        <div v-if="store.runOf(route.id).status === 'normal'" class="run-actions">
          <button class="primary" @click="store.triggerLeave(route.id)">司机请假</button>
          <button v-if="floodPickerFor !== route.id" class="ghost" @click="openFloodPicker(route)">
            道路积水
          </button>
          <div v-else class="flood-pick">
            <p class="small">勾选积水片区：</p>
            <label v-for="z in route.zones" :key="z" class="check">
              <input type="checkbox" :checked="floodZonesPicked.includes(z)" @change="toggleZone(z)" />
              {{ z }}
            </label>
            <div class="row-actions">
              <button class="primary" :disabled="!floodZonesPicked.length" @click="confirmFlood(route.id)">
                触发调配
              </button>
              <button class="ghost" @click="floodPickerFor = null">取消</button>
            </div>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
