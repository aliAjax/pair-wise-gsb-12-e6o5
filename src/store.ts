import { defineStore } from "pinia";
import type { AppState, EventLog, Trigger } from "./types";
import { seedState } from "./seed";
import {
  cancelAdjustment,
  chooseCandidate,
  confirmTakeover,
  findCandidates,
  planDay,
  raiseTrigger,
  type Candidate
} from "./lib/engine";
import { tripWindow } from "./lib/time";

const STORAGE_KEY = "school-bus-dispatch-v1";

function loadState(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as AppState;
    } catch {
      // 损坏数据回退到示例数据
    }
  }
  return seedState();
}

export const useDispatchStore = defineStore("dispatch", {
  state: () => ({
    state: loadState() as AppState
  }),

  getters: {
    routes: (s) => s.state.routes,
    vehicles: (s) => s.state.vehicles,
    drivers: (s) => s.state.drivers,

    vehicleMap: (s) => new Map(s.state.vehicles.map((v) => [v.plate, v])),
    driverMap: (s) => new Map(s.state.drivers.map((d) => [d.id, d])),
    routeMap: (s) => new Map(s.state.routes.map((r) => [r.id, r])),

    dayAssignments: (s) => (date: string) =>
      s.state.assignments
        .filter((a) => a.date === date)
        .sort((a, b) => a.windowStart.localeCompare(b.windowStart)),

    dayAdjustments: (s) => (date: string) =>
      s.state.adjustments
        .filter((a) => a.date === date)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),

    dayEvents: (s) => (date: string) =>
      s.state.events
        .filter((e) => e.date === date)
        .sort((a, b) => a.seq - b.seq),

    isPlanned: (s) => (date: string) =>
      s.state.assignments.some((a) => a.date === date)
  },

  actions: {
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    },

    resetAll() {
      this.state = seedState();
      this.persist();
    },

    plan(date: string): EventLog[] {
      const events = planDay(this.state, date);
      this.persist();
      return events;
    },

    raise(date: string, routeId: string, trigger: Trigger) {
      const result = raiseTrigger(this.state, date, routeId, trigger);
      this.persist();
      return result;
    },

    choose(adjustmentId: string, vehiclePlate: string, driverId: string) {
      chooseCandidate(this.state, adjustmentId, vehiclePlate, driverId);
      this.persist();
    },

    confirm(adjustmentId: string) {
      confirmTakeover(this.state, adjustmentId);
      this.persist();
    },

    cancel(adjustmentId: string) {
      cancelAdjustment(this.state, adjustmentId);
      this.persist();
    },

    /** 某调整单当前可选的全部可行组合（用于改选） */
    candidatesFor(adjustmentId: string): Candidate[] {
      const adj = this.state.adjustments.find((a) => a.id === adjustmentId);
      if (!adj) return [];
      const route = this.routeMap.get(adj.routeId)!;
      const win = tripWindow(route.departAt, route.arriveBy);
      const floodedAreas =
        adj.trigger.type === "flood"
          ? adj.trigger.payload
          : [
              ...new Set(
                this.state.adjustments
                  .filter((a) => a.date === adj.date && a.trigger.type === "flood")
                  .flatMap((a) => a.trigger.payload)
              )
            ];
      return findCandidates(this.state, {
        date: adj.date,
        route,
        winStart: win.start,
        winEnd: win.end,
        floodedAreas,
        excludeAssignmentId: adj.regularAssignmentId,
        excludeVehiclePlate: adj.originalVehiclePlate,
        excludeDriverId: adj.originalDriverId
      });
    },

    /** 当天汇总指标 */
    metrics(date: string) {
      const assignments = this.state.assignments.filter((a) => a.date === date);
      const active = assignments.filter((a) => a.status !== "released");
      const confirmed = this.state.adjustments.filter(
        (a) => a.date === date && a.status === "confirmed"
      );
      const waiting = this.state.adjustments.filter(
        (a) => a.date === date && a.status === "waiting"
      );
      return {
        routes: active.filter((a) => a.kind === "regular" || a.status === "confirmed").length,
        activeVehicles: new Set(active.map((a) => a.vehiclePlate)).size,
        replaced: confirmed.length,
        waiting: waiting.length
      };
    }
  }
});
